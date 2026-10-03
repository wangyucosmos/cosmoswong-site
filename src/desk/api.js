// /api/desk/* 路由。除登录外全部要登录；写操作还要过 csrfOk。数据全在 D1（binding DESK_DB）。
// 结构照 src/kol/api.js：通用增改删 + 几个带业务逻辑的动作（一键排期、催办、答复、收集箱转换、交付前检查、初始化包、备份恢复）。
import { json } from '../shared.js';
import { isAuthed, login, logout, csrfOk, changePassword } from './auth.js';
import { TABLES, JSON_COLS, Invalid, clean } from './schema.js';

const MAX_BODY = 4 * 1024 * 1024;   // 恢复备份、导入初始化包最大 4MB，其余请求远小于此
const UNDO_HOURS = 24;              // 软删除保留 24 小时后清理（页面上的撤销窗口是 5 秒）
// 地址里的资源名 → 表名
const RES = {
  projects: 'projects', deliverables: 'deliverables', tasks: 'tasks', pendings: 'pendings', activities: 'activities',
  ideas: 'ideas', wins: 'wins', inbox: 'inbox', timelines: 'timelines', checklists: 'checklists',
  prompts: 'prompt_templates', links: 'links', views: 'saved_views'
};
const CHILDREN = ['deliverables', 'tasks', 'pendings', 'activities'];   // 跟着项目一起软删除 / 恢复
const REORDERABLE = ['deliverables', 'tasks', 'links', 'timelines'];
// 选项清单类设置（初始化包只往里「新增」）+ 其他偏好
const OPTION_KEYS = ['kinds', 'provinces', 'deliverable_types', 'ask_whom', 'ai_tools', 'win_task_types', 'inbox_sources'];
const SETTING_KEYS = [...OPTION_KEYS, 'statuses', 'nudge_days', 'view_order', 'welcome_done', 'wrapup_nag'];
const BACKUP_TABLES = ['projects', 'deliverables', 'tasks', 'pendings', 'activities', 'ideas', 'wins', 'inbox',
  'timelines', 'checklists', 'prompt_templates', 'links', 'saved_views', 'settings'];

const now = () => new Date().toISOString();
// 「今天」一律按 Asia/Shanghai（UTC+8，没有夏令时）算；Worker 跑在 UTC，直接取 UTC 日期会在早上 8 点前差一天
const shToday = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
// 遇到周末提前到周五（周六 −1，周日 −2）
const toWeekday = s => { const [y, m, d] = s.split('-').map(Number); const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return w === 6 ? addDays(s, -1) : w === 0 ? addDays(s, -2) : s; };
// 节点日期 = 上线日 T + 偏移；上线日本身（偏移 0）不挪
const nodeDate = (T, off, weekend) => { const d = addDays(T, off); return weekend && off !== 0 ? toWeekday(d) : d; };

async function body(req) {
  const text = await req.text();
  if (text.length > MAX_BODY) throw new Invalid('数据太大了');
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new Invalid('数据格式不对'); }
}

const parseRow = (table, r) => {
  if (!r) return r;
  delete r.deleted_at;
  for (const c of JSON_COLS[table] || []) {
    if (!(c in r)) continue;
    try { r[c] = r[c] ? JSON.parse(r[c]) : (c === 'checklist_state' ? {} : []); } catch { r[c] = c === 'checklist_state' ? {} : []; }
  }
  return r;
};

/* ---------- 通用增改删 ---------- */
async function insert(db, table, data) {
  const cols = Object.keys(data);
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) RETURNING *`;
  return parseRow(table, await db.prepare(sql).bind(...cols.map(c => data[c])).first());
}
async function update(db, table, id, data) {
  const cols = Object.keys(data);
  if (!cols.length) return parseRow(table, await db.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first());
  const sql = `UPDATE ${table} SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ? RETURNING *`;
  return parseRow(table, await db.prepare(sql).bind(...cols.map(c => data[c]), id).first());
}
const getRow = (db, table, id) => db.prepare(`SELECT * FROM ${table} WHERE id = ? AND deleted_at IS NULL`).bind(id).first();
const stamp = (table, data, isNew) => {
  const t = now();
  if (isNew) data.created_at = t;
  if (table !== 'settings') data.updated_at = t;
  return data;
};

async function checkProject(db, id, required) {
  if (id == null) { if (required) throw new Invalid('要先选一个项目'); return; }
  if (!(await getRow(db, 'projects', id))) throw new Invalid('这个项目不存在或已删除');
}

// 各表新增 / 修改时的附带规则
async function beforeWrite(db, table, data, cur, input) {
  if ('project_id' in data && (!cur || data.project_id !== cur.project_id)) {
    await checkProject(db, data.project_id, ['deliverables', 'activities'].includes(table));
  }
  if (table === 'tasks' && 'done' in data) {
    // 勾完成那天：页面传了就用页面的（按上海时间算好的），没传就用服务端的上海日期
    const given = /^\d{4}-\d{2}-\d{2}$/.test(input.done_at || '') ? input.done_at : null;
    data.done_at = data.done ? (cur?.done ? cur.done_at : given || shToday()) : null;
  }
  if (table === 'pendings' && !cur && !data.asked_at) data.asked_at = shToday();
  if (table === 'pendings' && 'status' in data && data.status === 'answered' && !(cur?.answered_at) && !data.answered_at) data.answered_at = shToday();
  if (table === 'deliverables' && 'status' in data) {
    if (data.status === 'done' && cur?.status !== 'done') {
      if (!input.force) {
        const missing = await checklistMissing(db, data.type || cur?.type, 'checklist_state' in data ? data.checklist_state : cur?.checklist_state);
        if (missing.length) { const e = new Invalid(`交付前检查还有 ${missing.length} 项没勾`); e.status = 409; e.missing = missing; throw e; }
      }
      if (!data.delivered_at && !cur?.delivered_at) data.delivered_at = shToday();
    }
    if (data.status !== 'done' && cur?.status === 'done' && !('delivered_at' in data)) data.delivered_at = null;
  }
}

// 交付前检查：按交付物类型匹配清单（清单的 applies_to 为空 = 所有类型），返回还没勾的项
async function checklistMissing(db, type, stateRaw) {
  const { results } = await db.prepare('SELECT id, name, applies_to, items FROM checklists WHERE deleted_at IS NULL').all();
  let state = {};
  try { state = typeof stateRaw === 'string' ? JSON.parse(stateRaw || '{}') : (stateRaw || {}); } catch { state = {}; }
  const missing = [];
  for (const cl of results.map(r => parseRow('checklists', r))) {
    if (cl.applies_to.length && !cl.applies_to.includes(type)) continue;
    for (const item of cl.items) if (!state?.[cl.id]?.[item]) missing.push(`${cl.name}：${item}`);
  }
  return missing;
}

async function create(db, table, input) {
  const data = clean(table, input);
  await beforeWrite(db, table, data, null, input);
  const row = await insert(db, table, stamp(table, data, true));
  const out = { item: row };
  if (table === 'activities') out.project = await afterActivity(db, row);
  if (table === 'deliverables' && row.status === 'done') out.activity = await logDelivery(db, row);
  return json(out);
}

async function patch(db, table, id, input) {
  const cur = await getRow(db, table, id);
  if (!cur) return json({ error: '这条记录不存在或已删除' }, 404);
  const data = clean(table, input, true);
  if (['deliverables', 'activities'].includes(table)) delete data.project_id;   // 交付物、时间线不能挪到别的项目
  await beforeWrite(db, table, data, cur, input);
  const row = await update(db, table, id, stamp(table, data, false));
  const out = { item: row };
  if (table === 'activities') out.project = await afterActivity(db, row);
  if (table === 'deliverables' && row.status === 'done' && cur.status !== 'done') out.activity = await logDelivery(db, row);
  return json(out);
}

// AI 经手的记录：把工具加进项目的「最近经手」
async function afterActivity(db, act) {
  if (act.type !== 'ai' || !act.tool) return null;
  const p = await getRow(db, 'projects', act.project_id);
  if (!p) return null;
  let list = []; try { list = JSON.parse(p.last_ai || '[]'); } catch { /* 坏值按空 */ }
  if (list.includes(act.tool)) return null;
  list = [act.tool, ...list].slice(0, 10);
  return update(db, 'projects', p.id, { last_ai: JSON.stringify(list), updated_at: now() });
}

// 交付物标成「已交付」时，在项目时间线上记一笔
async function logDelivery(db, d) {
  const label = [d.name || d.type, d.version].filter(Boolean).join(' ');
  return insert(db, 'activities', stamp('activities', { project_id: d.project_id, type: 'deliver', summary: `交付：${label}`.slice(0, 500), happened_at: d.delivered_at || shToday() }, true));
}

/* ---------- 删除（软删除）与撤销 ---------- */
async function remove(db, table, id) {
  const t = now();
  const stmts = [db.prepare(`UPDATE ${table} SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`).bind(t, id)];
  if (table === 'projects') for (const c of CHILDREN) stmts.push(db.prepare(`UPDATE ${c} SET deleted_at = ? WHERE project_id = ? AND deleted_at IS NULL`).bind(t, id));
  await db.batch(stmts);
  return json({ ok: true });
}
async function restore(db, table, id) {
  const cur = await db.prepare(`SELECT deleted_at FROM ${table} WHERE id = ?`).bind(id).first();
  if (!cur || !cur.deleted_at) return json({ error: '已经无法撤销' }, 404);
  const stmts = [db.prepare(`UPDATE ${table} SET deleted_at = NULL WHERE id = ?`).bind(id)];
  // 项目：只恢复和它同一时刻被删的子记录（之前单独删掉的不会被带回来）
  if (table === 'projects') for (const c of CHILDREN) stmts.push(db.prepare(`UPDATE ${c} SET deleted_at = NULL WHERE project_id = ? AND deleted_at = ?`).bind(id, cur.deleted_at));
  await db.batch(stmts);
  return json({ item: parseRow(table, await db.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first()) });
}

async function batchPatch(db, table, input) {
  const ids = (Array.isArray(input.ids) ? input.ids : []).map(Number).filter(Number.isInteger).slice(0, 2000);
  if (!ids.length) throw new Invalid('没有选中任何一条');
  const data = stamp(table, clean(table, input.patch || {}, true), false);
  delete data.project_id;
  const cols = Object.keys(data);
  await db.batch(ids.map(id => db.prepare(`UPDATE ${table} SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ? AND deleted_at IS NULL`)
    .bind(...cols.map(c => data[c]), id)));
  const { results } = await db.prepare(`SELECT * FROM ${table} WHERE id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ids)).all();
  return json({ items: results.map(r => parseRow(table, r)) });
}

async function reorder(db, table, input) {
  const ids = (Array.isArray(input.ids) ? input.ids : []).map(Number).filter(Number.isInteger).slice(0, 2000);
  if (!ids.length) throw new Invalid('没有要排序的内容');
  const t = now();
  await db.batch(ids.map((id, i) => db.prepare(`UPDATE ${table} SET sort_order = ?, updated_at = ? WHERE id = ?`).bind(i, t, id)));
  return json({ ok: true });
}

/* ---------- 一键排期：按时间表模板生成待办 + 交付物；改上线日时整体顺移未完成的节点 ---------- */
async function schedule(db, id, input) {
  const p = await getRow(db, 'projects', id);
  if (!p) return json({ error: '这个项目不存在或已删除' }, 404);
  const T = clean('projects', { launch_at: input.launch_at }, true).launch_at;
  if (!T) throw new Invalid('要先填上线日');
  const weekend = input.weekend !== false;
  const t = now();
  const stmts = [db.prepare('UPDATE projects SET launch_at = ?, updated_at = ? WHERE id = ?').bind(T, t, id)];

  if (input.mode === 'shift') {
    const [tasks, delivs] = await Promise.all([
      db.prepare('SELECT id, offset_days FROM tasks WHERE project_id = ? AND deleted_at IS NULL AND done = 0 AND offset_days IS NOT NULL').bind(id).all(),
      db.prepare("SELECT id, offset_days FROM deliverables WHERE project_id = ? AND deleted_at IS NULL AND status != 'done' AND offset_days IS NOT NULL").bind(id).all()
    ]);
    for (const r of tasks.results) stmts.push(db.prepare('UPDATE tasks SET due_at = ?, updated_at = ? WHERE id = ?').bind(nodeDate(T, r.offset_days, weekend), t, r.id));
    for (const r of delivs.results) stmts.push(db.prepare('UPDATE deliverables SET due_at = ?, updated_at = ? WHERE id = ?').bind(nodeDate(T, r.offset_days, weekend), t, r.id));
    await db.batch(stmts);
    return scheduleResult(db, id, { shifted: tasks.results.length + delivs.results.length });
  }

  // apply：节点由页面传来（数据库里的模板或内置的通用示例都走这一条），这里重新校验一遍
  const items = JSON.parse(clean('timelines', { name: 'x', items: input.items }).items);
  const maxSort = (await db.prepare('SELECT MAX(sort_order) AS m FROM tasks WHERE project_id = ?').bind(id).first())?.m ?? -1;
  items.forEach((n, i) => {
    const due = nodeDate(T, n.offset_days, weekend);
    stmts.push(db.prepare(`INSERT INTO tasks (project_id, title, due_at, done, sort_order, source, offset_days, milestone, created_at, updated_at)
      VALUES (?, ?, ?, 0, ?, 'timeline', ?, ?, ?, ?)`).bind(id, n.title, due, maxSort + 1 + i, n.offset_days, n.is_milestone ? 1 : 0, t, t));
    if (n.deliverable_type) stmts.push(db.prepare(`INSERT INTO deliverables (project_id, name, type, status, due_at, offset_days, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, 'todo', ?, ?, ?, ?, ?)`).bind(id, n.deliverable_name || null, n.deliverable_type, due, n.offset_days, i, t, t));
  });
  await db.batch(stmts);   // 一个事务：任何一条失败整批回滚
  return scheduleResult(db, id, { created: items.length });
}
async function scheduleResult(db, id, extra) {
  const [p, tasks, delivs] = await db.batch([
    db.prepare('SELECT * FROM projects WHERE id = ?').bind(id),
    db.prepare('SELECT * FROM tasks WHERE project_id = ? AND deleted_at IS NULL').bind(id),
    db.prepare('SELECT * FROM deliverables WHERE project_id = ? AND deleted_at IS NULL').bind(id)
  ]);
  return json({ project: parseRow('projects', p.results[0]), tasks: tasks.results.map(r => parseRow('tasks', r)),
    deliverables: delivs.results.map(r => parseRow('deliverables', r)), ...extra });
}

/* ---------- 待确认：催一下 / 已答复（同时写进项目时间线） ---------- */
async function nudge(db, id, input) {
  const cur = await getRow(db, 'pendings', id);
  if (!cur) return json({ error: '这条待确认不存在或已删除' }, 404);
  const date = clean('activities', { happened_at: input.date || shToday() }, true).happened_at;
  const item = await update(db, 'pendings', id, { nudge_count: (cur.nudge_count || 0) + 1, last_nudged_at: date, updated_at: now() });
  let activity = null;
  if (cur.project_id && await getRow(db, 'projects', cur.project_id)) {
    const text = String(input.text || '').slice(0, 5000) || null;
    activity = await insert(db, 'activities', stamp('activities', { project_id: cur.project_id, type: 'nudge',
      summary: `催了一次：${cur.question}`.slice(0, 500), content: text, happened_at: date }, true));
  }
  return json({ item, activity });
}
async function answer(db, id, input) {
  const cur = await getRow(db, 'pendings', id);
  if (!cur) return json({ error: '这条待确认不存在或已删除' }, 404);
  const d = clean('pendings', { answer: input.answer, answered_at: input.date || shToday() }, true);
  if (!d.answer) throw new Invalid('先写一下对方是怎么答复的');
  const item = await update(db, 'pendings', id, { ...d, status: 'answered', updated_at: now() });
  let activity = null;
  if (cur.project_id && await getRow(db, 'projects', cur.project_id)) {
    activity = await insert(db, 'activities', stamp('activities', { project_id: cur.project_id, type: 'feedback',
      summary: `已答复：${cur.question}`.slice(0, 500), content: `问：${cur.question}\n答：${d.answer}`, happened_at: d.answered_at }, true));
  }
  return json({ item, activity });
}

/* ---------- 收集箱：转成项目 / 待办 / 待确认 ---------- */
async function convertInbox(db, id, input) {
  const cur = await getRow(db, 'inbox', id);
  if (!cur) return json({ error: '这条收集不存在或已删除' }, 404);
  const to = input.to;
  const table = { project: 'projects', task: 'tasks', pending: 'pendings' }[to];
  if (!table) throw new Invalid('不知道要转成什么');
  const src = { ...(input.data || {}) };
  if (to === 'task') src.source = 'inbox';
  const data = clean(table, src);
  await beforeWrite(db, table, data, null, src);
  const created = await insert(db, table, stamp(table, data, true));
  const item = await update(db, 'inbox', id, { processed_at: now(), converted_to: `${to}:${created.id}`, updated_at: now() });
  return json({ item, created, kind: table });
}

/* ---------- 初始化包：只新增选项、模板、清单、链接，不覆盖已有；先预览再导入 ---------- */
async function initPack(db, input) {
  const pack = input.pack;
  if (!pack || pack.app !== 'cosmoswong-desk-init') throw new Invalid('这不是工作台的初始化包（文件里 app 应该是 cosmoswong-desk-init）');
  const plan = { options: {}, timelines: [], checklists: [], prompt_templates: [], links: [] };
  const stmts = [];
  const t = now();

  // 选项：在「当前生效的清单」（页面传来，含没改过的默认值）后面追加没有的。
  // 类型（kinds）每项是 {name, color}，其余是文字；按名字比较
  const current = input.current || {};
  const nameOf = x => typeof x === 'string' ? x : String(x?.name ?? '');
  for (const key of OPTION_KEYS) {
    const add = Array.isArray(pack.options?.[key]) ? pack.options[key].map(x => nameOf(x).trim()).filter(Boolean) : [];
    if (!add.length) continue;
    const base = Array.isArray(current[key]) ? current[key].filter(x => nameOf(x).trim()) : [];
    const have = new Set(base.map(nameOf));
    const fresh = [...new Set(add)].filter(x => !have.has(x));
    if (fresh.some(x => x.length > 30)) throw new Invalid(`选项「${key}」里有太长的值`);
    if (!fresh.length) continue;
    plan.options[key] = fresh;
    const value = [...base, ...fresh.map(x => key === 'kinds' ? { name: x } : x)];
    if (JSON.stringify(value).length > 30000) throw new Invalid(`选项「${key}」太多了`);
    stmts.push(db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').bind(key, JSON.stringify(value), t));
  }

  const existing = async (table, col) => new Set((await db.prepare(`SELECT ${col} AS v FROM ${table} WHERE deleted_at IS NULL`).all()).results.map(r => String(r.v).trim().toLowerCase()));
  const addRows = async (table, key, list, col, label) => {
    const have = await existing(table, col);
    for (const [i, raw] of (Array.isArray(list) ? list : []).entries()) {
      let data;
      try { data = clean(table, raw); } catch (e) { throw new Invalid(`初始化包里「${key}」第 ${i + 1} 条：${e.message}`); }
      const k = String(data[col]).trim().toLowerCase();
      if (have.has(k)) continue;
      have.add(k);
      plan[key].push(label(data));
      stamp(table, data, true);
      const cols = Object.keys(data);
      stmts.push(db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(...cols.map(c => data[c])));
    }
  };
  await addRows('timelines', 'timelines', pack.timelines, 'name', d => d.name);
  await addRows('checklists', 'checklists', pack.checklists, 'name', d => d.name);
  await addRows('prompt_templates', 'prompt_templates', pack.prompt_templates, 'name', d => d.name);
  await addRows('links', 'links', (pack.links || []).map((l, i) => ({ ...l, sort_order: l.sort_order ?? i })), 'url', d => `${d.group_name ? d.group_name + ' · ' : ''}${d.label}`);

  const count = Object.values(plan.options).reduce((a, v) => a + v.length, 0) + plan.timelines.length + plan.checklists.length + plan.prompt_templates.length + plan.links.length;
  if (input.apply && stmts.length) await db.batch(stmts);
  return json({ plan, count, applied: !!input.apply && stmts.length > 0 });
}

/* ---------- 全量备份 / 恢复 ---------- */
async function backup(db) {
  const out = { app: 'cosmoswong-desk', version: 1, exported_at: now() };
  for (const t of BACKUP_TABLES) out[t] = (await db.prepare(`SELECT * FROM ${t}`).all()).results;
  return json(out, 200, { 'content-disposition': `attachment; filename="desk-backup-${shToday()}.json"` });
}

async function restoreAll(db, input) {
  if (input.confirm !== 'RESTORE') throw new Invalid('恢复需要二次确认');
  const data = input.data;
  if (!data || data.app !== 'cosmoswong-desk') throw new Invalid('这不是工作台导出的备份文件');
  const stmts = [db.prepare('PRAGMA defer_foreign_keys = on')];
  for (const t of [...BACKUP_TABLES].reverse()) stmts.push(db.prepare(`DELETE FROM ${t}`));
  const columns = {};
  for (const t of BACKUP_TABLES) columns[t] = (await db.prepare(`SELECT name FROM pragma_table_info('${t}')`).all()).results.map(r => r.name);
  let count = 0;
  for (const t of BACKUP_TABLES) {
    for (const row of Array.isArray(data[t]) ? data[t] : []) {
      const cols = columns[t].filter(c => c in row);
      if (!cols.length) continue;
      stmts.push(db.prepare(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
        .bind(...cols.map(c => row[c] === undefined ? null : row[c])));
      count++;
    }
  }
  await db.batch(stmts);   // D1 的 batch 是一个事务：任何一条失败整批回滚，不会只恢复一半
  return json({ ok: true, rows: count });
}

/* ---------- 读取 ---------- */
const LOAD = ['projects', 'deliverables', 'tasks', 'pendings', 'ideas', 'wins', 'inbox', 'timelines', 'checklists', 'prompt_templates', 'links', 'saved_views'];
async function bootstrap(db) {
  // 顺手清理超过撤销期的软删除（项目的子记录靠外键级联一起删）
  const cutoff = new Date(Date.now() - UNDO_HOURS * 3600e3).toISOString();
  await db.batch([...CHILDREN, ...LOAD.filter(t => !CHILDREN.includes(t) && t !== 'projects'), 'projects']
    .map(t => db.prepare(`DELETE FROM ${t} WHERE deleted_at IS NOT NULL AND deleted_at < ?`).bind(cutoff)));
  const res = await db.batch([
    ...LOAD.map(t => db.prepare(`SELECT * FROM ${t} WHERE deleted_at IS NULL ORDER BY ${['tasks', 'deliverables', 'links', 'timelines'].includes(t) ? 'IFNULL(sort_order, 1e18), id' : 'id'}`)),
    db.prepare('SELECT key, value FROM settings')
  ]);
  const out = {};
  LOAD.forEach((t, i) => { out[t] = res[i].results.map(r => parseRow(t, r)); });
  const set = {};
  for (const r of res[LOAD.length].results) { try { set[r.key] = JSON.parse(r.value); } catch { /* 坏值忽略，前端用默认 */ } }
  out.settings = set;
  return json(out);
}

/* ---------- 路由 ---------- */
async function route(req, env, parts) {
  const db = env.DESK_DB, m = req.method;
  const [res, idRaw, action] = parts;
  const id = idRaw && /^\d+$/.test(idRaw) ? Number(idRaw) : null;

  if (res === 'bootstrap' && m === 'GET') return bootstrap(db);
  if (res === 'password' && m === 'POST') return changePassword(req, env);
  if (res === 'backup' && m === 'GET') return backup(db);
  if (res === 'restore' && m === 'POST') return restoreAll(db, await body(req));
  if (res === 'init-pack' && m === 'POST') return initPack(db, await body(req));

  if (res === 'settings' && idRaw && m === 'PUT') {
    if (!SETTING_KEYS.includes(idRaw)) throw new Invalid('不认识的设置项');
    const b = await body(req);
    const value = JSON.stringify(b.value ?? null);
    if (value.length > 30000) throw new Invalid('设置内容太大了');
    await db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').bind(idRaw, value, now()).run();
    return json({ ok: true });
  }

  if (res === 'activities' && !idRaw && m === 'GET') {
    const pid = Number(new URL(req.url).searchParams.get('project_id'));
    if (!pid) throw new Invalid('缺少 project_id');
    const { results } = await db.prepare('SELECT * FROM activities WHERE project_id = ? AND deleted_at IS NULL ORDER BY happened_at DESC, id DESC').bind(pid).all();
    return json({ items: results });
  }
  if (res === 'projects' && id && action === 'schedule' && m === 'POST') return schedule(db, id, await body(req));
  if (res === 'pendings' && id && action === 'nudge' && m === 'POST') return nudge(db, id, await body(req));
  if (res === 'pendings' && id && action === 'answer' && m === 'POST') return answer(db, id, await body(req));
  if (res === 'inbox' && id && action === 'convert' && m === 'POST') return convertInbox(db, id, await body(req));

  const table = RES[res];
  if (!table) return json({ error: '没有这个接口' }, 404);
  if (!idRaw && m === 'POST') return create(db, table, await body(req));
  if (idRaw === 'batch' && m === 'POST' && table === 'projects') return batchPatch(db, table, await body(req));
  if (idRaw === 'reorder' && m === 'POST' && REORDERABLE.includes(table)) return reorder(db, table, await body(req));
  if (id && action === 'restore' && m === 'POST') return restore(db, table, id);
  if (id && !action && m === 'PATCH') return patch(db, table, id, await body(req));
  if (id && !action && m === 'DELETE') return remove(db, table, id);
  return json({ error: '没有这个接口' }, 404);
}

export async function deskApi(req, env, path) {
  if (!env.DESK_DB) return json({ error: '服务端还没绑定数据库' }, 500);
  if (!env.DESK_PASSWORD) return json({ error: '服务端还没设置密码' }, 500);
  const forbidden = () => json({ error: '请求来源不对' }, 403);
  if (path === '/api/desk/login' && req.method === 'POST') return csrfOk(req) ? login(req, env) : forbidden();
  if (path === '/api/desk/logout' && req.method === 'POST') return csrfOk(req) ? logout() : forbidden();
  // 页面打开时探测是否已登录：只回答是 / 否，不含任何数据（这样未登录时浏览器控制台不会出现 401 报错）
  if (path === '/api/desk/session' && req.method === 'GET') return json({ authed: await isAuthed(req, env) });
  if (!(await isAuthed(req, env))) return json({ error: '需要登录' }, 401);
  if (!csrfOk(req)) return forbidden();
  const parts = path.slice('/api/desk/'.length).split('/').filter(Boolean);
  try {
    return await route(req, env, parts);
  } catch (e) {
    if (e instanceof Invalid) return json({ error: e.message, ...(e.missing ? { missing: e.missing } : {}) }, e.status || 400);
    console.error('desk api', e);
    return json({ error: '服务器出错了，请稍后再试' }, 500);
  }
}
