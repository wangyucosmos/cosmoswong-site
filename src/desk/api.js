// /api/desk/* 路由。除登录外全部要登录；写操作还要过 csrfOk。数据全在 D1（binding DESK_DB）。
// 结构照 src/kol/api.js：通用增改删 + 几个带业务逻辑的动作（一键排期、催办、答复、收集箱转换与拆解、回填、初始化包、备份恢复）。
// v2（2026-10-04）：时间表节点分三种（我做的 / 要交的 / 等别人给）、待确认有「最晚哪天要」、交付不再被检查清单拦、已拍板的口径（decisions）。
// v3（2026-10-04）：资源表（本机文件夹 / 小工具 / 文档）、快捷入口可钉到今天页、初始化包可带历史项目。
// 数据库只加不删，旧版代码（git 标签 desk-v1 / desk-v2）照样能用这份数据。
import { json } from '../shared.js';
import { isAuthed, login, logout, csrfOk, changePassword } from './auth.js';
import { TABLES, JSON_COLS, Invalid, clean } from './schema.js';

const MAX_BODY = 4 * 1024 * 1024;   // 恢复备份、导入初始化包最大 4MB，其余请求远小于此
const UNDO_HOURS = 24;              // 软删除保留 24 小时后清理（页面上的撤销窗口是 5 秒）
// 地址里的资源名 → 表名
const RES = {
  projects: 'projects', deliverables: 'deliverables', tasks: 'tasks', pendings: 'pendings', activities: 'activities',
  ideas: 'ideas', wins: 'wins', inbox: 'inbox', timelines: 'timelines', checklists: 'checklists',
  prompts: 'prompt_templates', links: 'links', views: 'saved_views', decisions: 'decisions', resources: 'resources'
};
const CHILDREN = ['deliverables', 'tasks', 'pendings', 'activities', 'decisions'];   // 跟着项目一起软删除 / 恢复
const REORDERABLE = ['deliverables', 'tasks', 'links', 'timelines', 'resources'];
// 选项清单类设置（初始化包只往里「新增」）+ 其他偏好
const OPTION_KEYS = ['kinds', 'provinces', 'deliverable_types', 'ask_whom', 'ai_tools', 'win_task_types', 'inbox_sources'];
const SETTING_KEYS = [...OPTION_KEYS, 'statuses', 'nudge_days', 'view_order', 'welcome_done', 'wrapup_nag', 'baselines'];
const BACKUP_TABLES = ['projects', 'deliverables', 'tasks', 'pendings', 'activities', 'decisions', 'ideas', 'wins', 'inbox',
  'timelines', 'checklists', 'prompt_templates', 'links', 'resources', 'saved_views', 'settings'];

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
    const empty = c === 'checklist_state' ? {} : c === 'compare' ? null : [];
    try { r[c] = r[c] ? JSON.parse(r[c]) : empty; } catch { r[c] = empty; }
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
  // v2：交付前检查只做提醒（页面上一句确认），不再拦着标「已交付」
  if (table === 'deliverables' && 'status' in data) {
    if (data.status === 'done' && cur?.status !== 'done' && !data.delivered_at && !cur?.delivered_at) data.delivered_at = shToday();
    if (data.status !== 'done' && cur?.status === 'done' && !('delivered_at' in data)) data.delivered_at = null;
  }
}
// 交付物标成已交付时，旧版时间表留下的同名待办（挂在它上面的）一起勾掉，回退到旧版时也是一致的
const doneLinkedTasks = (db, deliverableId, date) =>
  db.prepare('UPDATE tasks SET done = 1, done_at = ?, updated_at = ? WHERE deliverable_id = ? AND done = 0 AND deleted_at IS NULL').bind(date, now(), deliverableId);

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
  if (table === 'deliverables' && row.status === 'done' && cur.status !== 'done') {
    out.activity = await logDelivery(db, row);
    await doneLinkedTasks(db, row.id, row.delivered_at || shToday()).run();
  }
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
    const [tasks, delivs, pends] = await Promise.all([
      db.prepare('SELECT id, offset_days FROM tasks WHERE project_id = ? AND deleted_at IS NULL AND done = 0 AND offset_days IS NOT NULL').bind(id).all(),
      db.prepare("SELECT id, offset_days FROM deliverables WHERE project_id = ? AND deleted_at IS NULL AND status != 'done' AND offset_days IS NOT NULL").bind(id).all(),
      db.prepare("SELECT id, offset_days, remind_offset FROM pendings WHERE project_id = ? AND deleted_at IS NULL AND status = 'waiting' AND offset_days IS NOT NULL").bind(id).all()
    ]);
    for (const r of tasks.results) stmts.push(db.prepare('UPDATE tasks SET due_at = ?, updated_at = ? WHERE id = ?').bind(nodeDate(T, r.offset_days, weekend), t, r.id));
    for (const r of delivs.results) stmts.push(db.prepare('UPDATE deliverables SET due_at = ?, updated_at = ? WHERE id = ?').bind(nodeDate(T, r.offset_days, weekend), t, r.id));
    for (const r of pends.results) stmts.push(db.prepare('UPDATE pendings SET need_by = ?, remind_from = ?, updated_at = ? WHERE id = ?')
      .bind(nodeDate(T, r.offset_days, weekend), r.remind_offset == null ? null : nodeDate(T, r.remind_offset, weekend), t, r.id));
    await db.batch(stmts);
    return scheduleResult(db, id, { shifted: tasks.results.length + delivs.results.length + pends.results.length });
  }

  // apply：节点由页面传来（数据库里的模板或内置的通用示例都走这一条），这里重新校验一遍
  const items = JSON.parse(clean('timelines', { name: 'x', items: input.items }).items);
  const maxSort = (await db.prepare('SELECT MAX(sort_order) AS m FROM tasks WHERE project_id = ?').bind(id).first())?.m ?? -1;
  // 三种节点：我要做的 → 待办；要交的 → 交付物（不再另生成一条同名待办）；等别人给的 → 待确认（带最晚日期和开始催的日期）
  items.forEach((n, i) => {
    const due = nodeDate(T, n.offset_days, weekend);
    if (n.kind === 'deliverable') {
      stmts.push(db.prepare(`INSERT INTO deliverables (project_id, name, type, status, due_at, offset_days, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, 'todo', ?, ?, ?, ?, ?)`).bind(id, n.deliverable_name || null, n.deliverable_type, due, n.offset_days, i, t, t));
    } else if (n.kind === 'wait') {
      const from = n.remind_offset == null ? null : nodeDate(T, n.remind_offset, weekend);
      stmts.push(db.prepare(`INSERT INTO pendings (project_id, question, ask_whom, status, blocking, need_by, remind_from, offset_days, remind_offset, source, nudge_count, created_at, updated_at)
        VALUES (?, ?, ?, 'waiting', ?, ?, ?, ?, ?, 'timeline', 0, ?, ?)`).bind(id, n.title, n.ask_whom || null, n.blocking ? 1 : 0, due, from, n.offset_days, n.remind_offset ?? null, t, t));
    } else {
      stmts.push(db.prepare(`INSERT INTO tasks (project_id, title, due_at, done, sort_order, source, offset_days, milestone, created_at, updated_at)
        VALUES (?, ?, ?, 0, ?, 'timeline', ?, ?, ?, ?)`).bind(id, n.title, due, maxSort + 1 + i, n.offset_days, n.is_milestone ? 1 : 0, t, t));
    }
  });
  await db.batch(stmts);   // 一个事务：任何一条失败整批回滚
  return scheduleResult(db, id, { created: items.length });
}
// 一个项目的全部子记录（排期、回填、拆解之后页面整体替换这个项目的数据）
async function subtree(db, id) {
  const [p, tasks, delivs, pends, decs, wins] = await db.batch([
    db.prepare('SELECT * FROM projects WHERE id = ?').bind(id),
    db.prepare('SELECT * FROM tasks WHERE project_id = ? AND deleted_at IS NULL ORDER BY IFNULL(sort_order, 1e18), id').bind(id),
    db.prepare('SELECT * FROM deliverables WHERE project_id = ? AND deleted_at IS NULL ORDER BY IFNULL(sort_order, 1e18), id').bind(id),
    db.prepare('SELECT * FROM pendings WHERE project_id = ? AND deleted_at IS NULL ORDER BY id').bind(id),
    db.prepare('SELECT * FROM decisions WHERE project_id = ? AND deleted_at IS NULL ORDER BY id').bind(id),
    db.prepare('SELECT * FROM wins WHERE project_id = ? AND deleted_at IS NULL ORDER BY id').bind(id)
  ]);
  return { project: parseRow('projects', p.results[0]), tasks: tasks.results.map(r => parseRow('tasks', r)),
    deliverables: delivs.results.map(r => parseRow('deliverables', r)), pendings: pends.results, decisions: decs.results, wins: wins.results.map(r => parseRow('wins', r)) };
}
async function scheduleResult(db, id, extra) {
  return json({ ...(await subtree(db, id)), ...extra });
}

/* ---------- 回填：AI 收工汇报里的【回填工作台】，页面解析好、你确认过的一组更新，一次性写进去（一个事务） ---------- */
async function applyOps(db, pid, input) {
  const p = await getRow(db, 'projects', pid);
  if (!p) return json({ error: '这个项目不存在或已删除' }, 404);
  const ops = Array.isArray(input.ops) ? input.ops.slice(0, 100) : [];
  if (!ops.length) throw new Invalid('没有要更新的内容');
  const t = now(), today = shToday(), stmts = [];
  const add = (table, data) => { const cols = Object.keys(data); stmts.push(db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(...cols.map(c => data[c]))); };
  const set = (table, id, data) => { const cols = Object.keys(data); if (cols.length) stmts.push(db.prepare(`UPDATE ${table} SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`).bind(...cols.map(c => data[c]), id)); };
  let lastAi = (() => { try { return JSON.parse(p.last_ai || '[]'); } catch { return []; } })();
  for (const [i, o] of ops.entries()) {
    try {
      switch (o?.op) {
        case 'project': {
          const d = clean('projects', o.data || {}, true); delete d.archived_at;
          set('projects', pid, { ...d, updated_at: t }); break;
        }
        case 'deliverable': {
          if (o.id) {
            const cur = await getRow(db, 'deliverables', Number(o.id));
            if (!cur || cur.project_id !== pid) throw new Invalid('这件交付物不在这个项目里');
            const d = clean('deliverables', o.data || {}, true); delete d.project_id;
            if (d.status === 'done' && cur.status !== 'done') {
              d.delivered_at = d.delivered_at || cur.delivered_at || today;
              stmts.push(doneLinkedTasks(db, cur.id, d.delivered_at));
              add('activities', { project_id: pid, type: 'deliver', summary: `交付：${[d.name || cur.name || cur.type, d.version || cur.version].filter(Boolean).join(' ')}`.slice(0, 500), happened_at: d.delivered_at, created_at: t, updated_at: t });
            }
            set('deliverables', cur.id, { ...d, updated_at: t });
          } else {
            const d = clean('deliverables', { ...(o.data || {}), project_id: pid });
            if (d.status === 'done') d.delivered_at = d.delivered_at || today;
            add('deliverables', { ...d, created_at: t, updated_at: t });
          }
          break;
        }
        case 'pending': {
          const d = clean('pendings', { ...(o.data || {}), project_id: pid });
          add('pendings', { ...d, asked_at: d.asked_at || today, source: d.source || 'backfill', created_at: t, updated_at: t }); break;
        }
        case 'answer': {
          const cur = await getRow(db, 'pendings', Number(o.id));
          if (!cur || cur.project_id !== pid) throw new Invalid('这条待确认不在这个项目里');
          const d = clean('pendings', { answer: o.answer, answered_at: o.date || today }, true);
          if (!d.answer) throw new Invalid('答复内容不能空');
          set('pendings', cur.id, { ...d, status: 'answered', updated_at: t });
          add('activities', { project_id: pid, type: 'feedback', summary: `已答复：${cur.question}`.slice(0, 500), content: `问：${cur.question}\n答：${d.answer}`, happened_at: d.answered_at, created_at: t, updated_at: t });
          break;
        }
        case 'decision': {
          const d = clean('decisions', { ...(o.data || {}), project_id: pid, decided_at: o.data?.decided_at || today });
          add('decisions', { ...d, created_at: t, updated_at: t }); break;
        }
        case 'win': {
          const d = clean('wins', { ...(o.data || {}), project_id: pid, happened_at: o.data?.happened_at || today });
          if (d.deliverable_id) { const dv = await getRow(db, 'deliverables', d.deliverable_id); if (!dv || dv.project_id !== pid) d.deliverable_id = null; }
          add('wins', { ...d, created_at: t, updated_at: t }); break;
        }
        case 'activity': {
          const d = clean('activities', { ...(o.data || {}), project_id: pid, happened_at: o.data?.happened_at || today });
          add('activities', { ...d, created_at: t, updated_at: t });
          if (d.type === 'ai' && d.tool && !lastAi.includes(d.tool)) lastAi = [d.tool, ...lastAi].slice(0, 10);
          break;
        }
        default: throw new Invalid('不认识的更新');
      }
    } catch (e) {
      if (e instanceof Invalid) throw new Invalid(`第 ${i + 1} 项：${e.message}`);
      throw e;
    }
  }
  if (JSON.stringify(lastAi) !== (p.last_ai || '[]')) set('projects', pid, { last_ai: JSON.stringify(lastAi), updated_at: t });
  await db.batch(stmts);   // 一个事务：任何一条失败整批回滚
  return json({ ...(await subtree(db, pid)), applied: ops.length });
}

/* ---------- 收集箱「AI 拆完贴回来」：一次建好项目、交付物、待确认，并把这条收集标成已处理 ---------- */
async function intake(db, inboxId, input) {
  const item = await getRow(db, 'inbox', inboxId);
  if (!item) return json({ error: '这条收集不存在或已删除' }, 404);
  const pdata = clean('projects', input.project || {});
  // 先全部校验一遍，再写
  const delivs = (Array.isArray(input.deliverables) ? input.deliverables : []).slice(0, 30).map(d => clean('deliverables', { ...d, project_id: 1 }));
  const pends = (Array.isArray(input.pendings) ? input.pendings : []).slice(0, 60).map(x => clean('pendings', { ...x, project_id: 1 }));
  const p = await insert(db, 'projects', stamp('projects', pdata, true));
  const t = now(), today = shToday();
  try {
    const stmts = [];
    const add = (table, data) => { const cols = Object.keys(data); stmts.push(db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(...cols.map(c => data[c]))); };
    delivs.forEach((d, i) => add('deliverables', { ...d, project_id: p.id, sort_order: i, created_at: t, updated_at: t }));
    pends.forEach(x => add('pendings', { ...x, project_id: p.id, asked_at: x.asked_at || today, source: 'inbox', created_at: t, updated_at: t }));
    stmts.push(db.prepare('UPDATE inbox SET processed_at = ?, converted_to = ?, updated_at = ? WHERE id = ?').bind(t, `project:${p.id}`, t, inboxId));
    await db.batch(stmts);
  } catch (e) {
    await db.prepare('DELETE FROM projects WHERE id = ?').bind(p.id).run();   // 子记录没写进去：把刚建的项目也撤掉，不留半截
    throw e;
  }
  return json({ ...(await subtree(db, p.id)), item: parseRow('inbox', await db.prepare('SELECT * FROM inbox WHERE id = ?').bind(inboxId).first()) });
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

/* ---------- 初始化包：只新增选项、模板、清单、链接；先预览再导入。
   已有同名模板 / 清单但内容不同的（包更新过，或你自己改过）列进 plan.changed，只有页面勾选了才覆盖 ---------- */
const REPLACEABLE = { timelines: ['kind', 'items'], checklists: ['applies_to', 'items'], prompt_templates: ['tool', 'scene', 'body'] };
const REPLACE_LABEL = { timelines: '时间表模板', checklists: '检查清单', prompt_templates: '提示词模板' };
async function initPack(db, input) {
  const pack = input.pack;
  if (!pack || pack.app !== 'cosmoswong-desk-init') throw new Invalid('这不是工作台的初始化包（文件里 app 应该是 cosmoswong-desk-init）');
  const plan = { options: {}, timelines: [], checklists: [], prompt_templates: [], links: [], resources: [], projects: [], changed: [] };
  const stmts = [];
  const t = now();
  const replace = new Set(Array.isArray(input.replace) ? input.replace.map(String) : []);
  let replaced = 0;

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

  // 数据库里的 JSON 列是字符串，先还原成数组再过一遍 clean，和包里的按同一种写法比
  const unjson = (table, c, v) => (JSON_COLS[table] || []).includes(c) && typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return v; } })() : v;
  const addRows = async (table, key, list, col, label) => {
    const rows = (await db.prepare(`SELECT * FROM ${table} WHERE deleted_at IS NULL`).all()).results;
    const have = new Map(rows.map(r => [String(r[col]).trim().toLowerCase(), r]));
    const cmp = REPLACEABLE[table];
    for (const [i, raw] of (Array.isArray(list) ? list : []).entries()) {
      let data;
      try { data = clean(table, raw); } catch (e) { throw new Invalid(`初始化包里「${key}」第 ${i + 1} 条：${e.message}`); }
      const k = String(data[col]).trim().toLowerCase();
      if (have.has(k)) {
        const old = have.get(k);
        have.set(k, null);   // 包里同名的再出现一次：不再处理
        if (!old || !cmp) continue;
        let before = {};
        try { before = clean(table, Object.fromEntries([col, ...cmp].map(c => [c, unjson(table, c, old[c])]))); } catch { /* 旧数据过不了现在的校验：当作内容不同 */ }
        if (cmp.every(c => (before[c] ?? null) === (data[c] ?? null))) continue;
        const id = `${table}:${old[col]}`;
        plan.changed.push({ id, kind: REPLACE_LABEL[table], name: old[col] });
        if (replace.has(id)) {
          stmts.push(db.prepare(`UPDATE ${table} SET ${cmp.map(c => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).bind(...cmp.map(c => data[c] ?? null), t, old.id));
          replaced++;
        }
        continue;
      }
      have.set(k, null);
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
  await addRows('resources', 'resources', (pack.resources || []).map((r, i) => ({ ...r, sort_order: r.sort_order ?? i })), 'path', d => `${d.group_name ? d.group_name + ' · ' : ''}${d.label}`);

  // 历史项目（v3）：按项目名去重，已有同名的不动；交付物跟着项目一起建
  const haveTitles = new Set((await db.prepare('SELECT title FROM projects WHERE deleted_at IS NULL').all()).results.map(r => String(r.title).trim().toLowerCase()));
  for (const [i, raw] of (Array.isArray(pack.projects) ? pack.projects : []).entries()) {
    let p, ds;
    try {
      p = clean('projects', { ...raw, deliverables: undefined });
      ds = (Array.isArray(raw.deliverables) ? raw.deliverables : []).map(d => { const x = clean('deliverables', { ...d, project_id: 1 }); delete x.project_id; return x; });
    } catch (e) { throw new Invalid(`初始化包里「历史项目」第 ${i + 1} 个：${e.message}`); }
    const k = p.title.trim().toLowerCase();
    if (haveTitles.has(k)) continue;
    haveTitles.add(k);
    plan.projects.push(p.title);
    stamp('projects', p, true);
    const cols = Object.keys(p);
    stmts.push(db.prepare(`INSERT INTO projects (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(...cols.map(c => p[c])));
    for (const d of ds) {
      stamp('deliverables', d, true);
      const dc = Object.keys(d);
      stmts.push(db.prepare(`INSERT INTO deliverables (project_id, ${dc.join(', ')}) VALUES ((SELECT MAX(id) FROM projects WHERE title = ? AND deleted_at IS NULL), ${dc.map(() => '?').join(', ')})`).bind(p.title, ...dc.map(c => d[c])));
    }
  }

  const count = Object.values(plan.options).reduce((a, v) => a + v.length, 0) + plan.timelines.length + plan.checklists.length + plan.prompt_templates.length + plan.links.length + plan.resources.length + plan.projects.length;
  if (input.apply && stmts.length) await db.batch(stmts);
  return json({ plan, count, replaced: input.apply ? replaced : 0, applied: !!input.apply && stmts.length > 0 });
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
const LOAD = ['projects', 'deliverables', 'tasks', 'pendings', 'decisions', 'ideas', 'wins', 'inbox', 'timelines', 'checklists', 'prompt_templates', 'links', 'resources', 'saved_views'];
async function bootstrap(db) {
  // 顺手清理超过撤销期的软删除（项目的子记录靠外键级联一起删）
  const cutoff = new Date(Date.now() - UNDO_HOURS * 3600e3).toISOString();
  await db.batch([...CHILDREN, ...LOAD.filter(t => !CHILDREN.includes(t) && t !== 'projects'), 'projects']
    .map(t => db.prepare(`DELETE FROM ${t} WHERE deleted_at IS NOT NULL AND deleted_at < ?`).bind(cutoff)));
  const res = await db.batch([
    ...LOAD.map(t => db.prepare(`SELECT * FROM ${t} WHERE deleted_at IS NULL ORDER BY ${['tasks', 'deliverables', 'links', 'timelines', 'resources'].includes(t) ? 'IFNULL(sort_order, 1e18), id' : 'id'}`)),
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
  if (res === 'inbox' && id && action === 'intake' && m === 'POST') return intake(db, id, await body(req));
  if (res === 'projects' && id && action === 'apply' && m === 'POST') return applyOps(db, id, await body(req));

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
