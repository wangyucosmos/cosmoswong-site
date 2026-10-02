// /api/kol/* 路由。除登录外全部要登录；写操作还要过 csrfOk。数据全在 D1（binding KOL_DB）。
import { json } from '../shared.js';
import { isAuthed, login, logout, csrfOk, changePassword } from './auth.js';
import { TABLES, CONTACT_TYPES, Invalid, clean, urlKey, handleKey, emailKey } from './schema.js';

const MAX_BODY = 4 * 1024 * 1024;   // 导入与恢复备份最大 4MB，其余请求远小于此
const UNDO_HOURS = 24;              // 软删除的 KOL 保留 24 小时后清理（页面上的撤销窗口是 5 秒）
const SETTING_KEYS = ['statuses', 'platforms', 'countries', 'languages', 'categories', 'coop_types', 'sources',
  'overdue_days', 'profile', 'view_order'];
const JSON_COLS = ['category', 'tags', 'other_links'];

const now = () => new Date().toISOString();

async function body(req) {
  const text = await req.text();
  if (text.length > MAX_BODY) throw new Invalid('数据太大了');
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new Invalid('数据格式不对'); }
}

const parseRow = r => {
  if (!r) return r;
  delete r.url_key; delete r.email_key; delete r.handle_key; delete r.deleted_at;   // 内部字段不发给页面
  for (const c of JSON_COLS) if (c in r) { try { r[c] = r[c] ? JSON.parse(r[c]) : []; } catch { r[c] = []; } }
  return r;
};

/* ---------- 通用增改删 ---------- */
async function insert(db, table, data) {
  const cols = Object.keys(data);
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) RETURNING *`;
  return db.prepare(sql).bind(...cols.map(c => data[c])).first();
}
async function update(db, table, id, data) {
  const cols = Object.keys(data);
  if (!cols.length) return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
  const sql = `UPDATE ${table} SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ? RETURNING *`;
  return db.prepare(sql).bind(...cols.map(c => data[c]), id).first();
}
const stamp = (table, data, isNew) => {
  const t = now();
  if (isNew) data.created_at = t;
  if (['kols', 'deals', 'templates'].includes(table)) data.updated_at = t;
  return data;
};

/* ---------- KOL ---------- */
const withKeys = row => ({
  url_key: urlKey(row.profile_url),
  email_key: emailKey(row.email),
  handle_key: handleKey(row.platform, row.handle)
});

async function findDupes(db, keys, excludeId = 0) {
  const conds = [], args = [];
  if (keys.url_key) { conds.push('url_key = ?'); args.push(keys.url_key); }
  if (keys.email_key) { conds.push('email_key = ?'); args.push(keys.email_key); }
  if (keys.handle_key) { conds.push('handle_key = ?'); args.push(keys.handle_key); }
  if (!conds.length) return [];
  const { results } = await db.prepare(
    `SELECT id, name, platform, handle, url_key, email_key, handle_key FROM kols
     WHERE deleted_at IS NULL AND id != ? AND (${conds.join(' OR ')}) LIMIT 5`).bind(excludeId, ...args).all();
  return results.map(r => ({
    id: r.id, name: r.name, platform: r.platform, handle: r.handle,
    reason: [r.url_key && r.url_key === keys.url_key && '主页链接相同', r.email_key && r.email_key === keys.email_key && '邮箱相同',
      r.handle_key && r.handle_key === keys.handle_key && '同平台账号相同'].filter(Boolean).join('、')
  }));
}

async function createKol(db, input, force) {
  const data = clean('kols', input);
  Object.assign(data, withKeys(data));
  const dupes = await findDupes(db, data);
  if (dupes.length && !force) return json({ error: '疑似重复', dupes }, 409);
  const row = await insert(db, 'kols', stamp('kols', data, true));
  return json({ kol: parseRow(row), dupes });
}

async function patchKol(db, id, input) {
  const cur = await db.prepare('SELECT * FROM kols WHERE id = ? AND deleted_at IS NULL').bind(id).first();
  if (!cur) return json({ error: '这个 KOL 不存在或已删除' }, 404);
  const data = clean('kols', input, true);
  let dupes = [];
  if (['profile_url', 'email', 'platform', 'handle'].some(k => k in data)) {
    Object.assign(data, withKeys({ ...cur, ...data }));
    dupes = await findDupes(db, data, id);
  }
  const row = await update(db, 'kols', id, stamp('kols', data, false));
  return json({ kol: parseRow(row), dupes });
}

async function batchKols(db, input) {
  const ids = (Array.isArray(input.ids) ? input.ids : []).map(Number).filter(Number.isInteger).slice(0, 2000);
  if (!ids.length) throw new Invalid('没有选中任何 KOL');
  const data = stamp('kols', clean('kols', input.patch || {}, true), false);
  const cols = Object.keys(data);
  const stmts = ids.map(id => db.prepare(`UPDATE kols SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ? AND deleted_at IS NULL`)
    .bind(...cols.map(c => data[c]), id));
  await db.batch(stmts);
  const { results } = await db.prepare(`SELECT * FROM kols WHERE id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ids)).all();
  return json({ kols: results.map(parseRow) });
}

/* ---------- 沟通记录：写入时同步 KOL 的上次联系 / 下次跟进 / 状态 ---------- */
async function syncLastContact(db, kolId) {
  const r = await db.prepare(`SELECT MAX(happened_at) AS last, MIN(happened_at) AS first FROM activities
    WHERE kol_id = ? AND type IN (SELECT value FROM json_each(?))`).bind(kolId, JSON.stringify(CONTACT_TYPES)).first();
  if (r && r.last) {
    await db.prepare(`UPDATE kols SET last_contact_at = ?, first_contact_at = COALESCE(first_contact_at, ?), updated_at = ? WHERE id = ?`)
      .bind(r.last, r.first, now(), kolId).run();
  }
}

async function createActivity(db, input) {
  const act = clean('activities', input);
  const kol = await db.prepare('SELECT id FROM kols WHERE id = ? AND deleted_at IS NULL').bind(act.kol_id).first();
  if (!kol) return json({ error: '这个 KOL 不存在或已删除' }, 404);
  const row = await insert(db, 'activities', stamp('activities', act, true));
  if (CONTACT_TYPES.includes(act.type)) {
    await db.prepare('UPDATE kols SET touches = touches + 1 WHERE id = ?').bind(act.kol_id).run();
    await syncLastContact(db, act.kol_id);
  }
  // 同一请求里顺带改 KOL 的下次跟进 / 状态（「✓ 已跟进」「标记已发送」「粘贴回复」一次完成）
  const patch = input.kol_patch ? clean('kols', pick(input.kol_patch, ['next_followup_at', 'status']), true) : {};
  const kolRow = await update(db, 'kols', act.kol_id, stamp('kols', patch, false));
  return json({ activity: row, kol: parseRow(kolRow) });
}
const pick = (o, keys) => Object.fromEntries(keys.filter(k => k in o).map(k => [k, o[k]]));

/* ---------- 带货：分成金额默认 = 成交额 × 比例 ---------- */
function withCommission(d, cur = {}) {
  const m = { ...cur, ...d };
  if (!m.commission_manual) {
    d.commission_eur = m.gmv_eur != null && m.commission_rate != null ? Math.round(m.gmv_eur * m.commission_rate) / 100 : null;
  }
  return d;
}

/* ---------- 导入 ---------- */
async function importRows(db, input) {
  const target = input.target === 'deals' ? 'deals' : 'kols';
  const mode = ['skip', 'overwrite', 'merge'].includes(input.mode) ? input.mode : 'skip';
  const rows = Array.isArray(input.rows) ? input.rows.slice(0, 1000) : [];
  const res = { created: 0, updated: 0, skipped: 0, errors: [] };
  if (target === 'deals') return importDeals(db, rows, mode, res);

  const { results: existing } = await db.prepare('SELECT * FROM kols WHERE deleted_at IS NULL').all();
  const index = new Map();
  const remember = r => { for (const k of ['url_key', 'email_key', 'handle_key']) if (r[k]) index.set(k + ':' + r[k], r); };
  existing.forEach(remember);

  for (const [i, raw] of rows.entries()) {
    try {
      const rowMode = ['skip', 'overwrite', 'merge'].includes(raw._mode) ? raw._mode : mode;
      const src = { ...raw }; delete src._mode; delete src._row;
      const autoName = src._auto_name; delete src._auto_name;   // 由账号推出的名字：只在新建时用
      // _default_next：表里没写下次跟进时用的排期（只填空着的，不覆盖已有日期；暂不跟进 / 勿联系的不排）
      const defNext = /^\d{4}-\d{2}-\d{2}$/.test(raw._default_next || '') ? raw._default_next : null; delete src._default_next;
      // _reply_text / _reply_summary：对方回复原文与总结 → 存成一条「收到回复」沟通记录
      const reply = String(raw._reply_text || '').trim(), replySum = String(raw._reply_summary || '').trim();
      delete src._reply_text; delete src._reply_summary;
      const schedulable = r => defNext && !r.next_followup_at && !['paused', 'won'].includes(r.status) && !r.do_not_contact;
      const full = clean('kols', { ...src, name: src.name || autoName });
      const keys = withKeys(full);
      const dupe = ['url_key', 'email_key', 'handle_key'].map(k => keys[k] && index.get(k + ':' + keys[k])).find(Boolean);
      if (!dupe) {
        if (schedulable(full)) full.next_followup_at = defNext;
        const row = await insert(db, 'kols', stamp('kols', { ...full, ...keys }, true));
        remember(row); res.created++;
        await importReply(db, row.id, reply, replySum);
        continue;
      }
      if (rowMode === 'skip') { res.skipped++; continue; }
      // 覆盖：表里有的列全部以新表为准（空格子会清空）；合并：只用新表里有值的格子更新，空格子保留原值，标签与品类取并集
      const given = clean('kols', src, true);
      let data = given;
      if (rowMode === 'merge') {
        data = {};
        for (const [k, v] of Object.entries(given)) {
          if (src[k] === '' || src[k] == null) continue;
          if (TABLES.kols[k].type === 'list') {
            const merged = [...new Set([...(JSON.parse(dupe[k] || '[]')), ...JSON.parse(v)])];
            data[k] = JSON.stringify(merged);
          } else data[k] = v;
        }
      }
      Object.assign(data, withKeys({ ...dupe, ...data }));
      if (schedulable({ ...dupe, ...data })) data.next_followup_at = defNext;
      const row = await update(db, 'kols', dupe.id, stamp('kols', data, false));
      remember(row); res.updated++;
      await importReply(db, dupe.id, reply, replySum);
    } catch (e) {
      if (!(e instanceof Invalid)) throw e;
      res.errors.push({ row: raw._row ?? i + 1, error: e.message });
    }
  }
  return json(res);
}

// 导入时带进来的回复原文：同一个 KOL 已经有一模一样的回复就不重复记
async function importReply(db, kolId, text, summary) {
  if (!text && !summary) return;
  const content = text.slice(0, 20000) || null;
  if (content && await db.prepare("SELECT id FROM activities WHERE kol_id = ? AND type = 'reply_in' AND content = ?").bind(kolId, content).first()) return;
  await insert(db, 'activities', stamp('activities', {
    kol_id: kolId, type: content ? 'reply_in' : 'note',
    summary: ((summary || text.replace(/\s+/g, ' ').slice(0, 120)) + '（导入，原表没有记日期）').slice(0, 500),
    content, happened_at: new Date().toISOString().slice(0, 10)
  }, true));
}

async function importDeals(db, rows, mode, res) {
  const { results: kols } = await db.prepare('SELECT id, name, platform, handle, handle_key FROM kols WHERE deleted_at IS NULL').all();
  const norm = s => String(s || '').trim().replace(/^@/, '').toLowerCase();
  const findKol = (handle, platform) => {
    const h = norm(handle);
    if (!h) return null;
    return kols.find(k => platform && k.handle_key === handleKey(platform, h))
      || kols.find(k => norm(k.handle) === h) || kols.find(k => norm(k.name) === h) || null;
  };
  for (const [i, raw] of rows.entries()) {
    try {
      const kol = findKol(raw.kol, raw.platform);
      if (!kol) throw new Invalid(`找不到 KOL「${String(raw.kol || '').slice(0, 40)}」，请先把他加进 KOL 主表`);
      const src = { ...raw, kol_id: kol.id }; delete src.kol; delete src._row; delete src._mode;
      const data = withCommission(clean('deals', src));
      const dupe = data.content_url && await db.prepare('SELECT * FROM deals WHERE kol_id = ? AND content_url = ? AND IFNULL(period, \'\') = IFNULL(?, \'\')')
        .bind(kol.id, data.content_url, data.period).first();
      if (!dupe) { await insert(db, 'deals', stamp('deals', data, true)); res.created++; continue; }
      if (mode === 'skip') { res.skipped++; continue; }
      const given = clean('deals', src, true);
      const patch = mode === 'merge' ? Object.fromEntries(Object.entries(given).filter(([, v]) => v !== null)) : given;
      await update(db, 'deals', dupe.id, stamp('deals', withCommission(patch, dupe), false));
      res.updated++;
    } catch (e) {
      if (!(e instanceof Invalid)) throw e;
      res.errors.push({ row: raw._row ?? i + 1, error: e.message });
    }
  }
  return json(res);
}

/* ---------- 全量备份 / 恢复 ---------- */
const BACKUP_TABLES = ['kols', 'kol_tasks', 'activities', 'deals', 'templates', 'saved_views', 'keywords', 'settings'];

async function backup(db) {
  const out = { app: 'cosmoswong-kol', version: 1, exported_at: now() };
  for (const t of BACKUP_TABLES) out[t] = (await db.prepare(`SELECT * FROM ${t}`).all()).results;
  return json(out, 200, { 'content-disposition': `attachment; filename="kol-backup-${now().slice(0, 10)}.json"` });
}

async function restore(db, input) {
  if (input.confirm !== 'RESTORE') throw new Invalid('恢复需要二次确认');
  const data = input.data;
  if (!data || data.app !== 'cosmoswong-kol') throw new Invalid('这不是 KOL 工作台导出的备份文件');
  const stmts = [db.prepare('PRAGMA defer_foreign_keys = on')];
  for (const t of [...BACKUP_TABLES].reverse()) stmts.push(db.prepare(`DELETE FROM ${t}`));
  const columns = {};
  for (const t of BACKUP_TABLES) {
    columns[t] = (await db.prepare(`SELECT name FROM pragma_table_info('${t}')`).all()).results.map(r => r.name);
  }
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
async function bootstrap(db, env) {
  // 顺手清理超过撤销期的软删除
  const cutoff = new Date(Date.now() - UNDO_HOURS * 3600e3).toISOString();
  await db.prepare('DELETE FROM kols WHERE deleted_at IS NOT NULL AND deleted_at < ?').bind(cutoff).run();
  const [kols, tasks, deals, templates, views, keywords, settings] = await db.batch([
    db.prepare(`SELECT id, name, handle, platform, profile_url, other_links, followers, avg_views, engagement_rate, country, language,
      category, email, contact_other, status, priority, rating, can_sell, promoted_similar, touches, first_contact_at, last_contact_at,
      next_followup_at, quote, quote_note, coop_type, source, source_url, reason, blocker, crm_synced, do_not_contact, tags, notes,
      data_updated_at, sort_order, created_at, updated_at FROM kols WHERE deleted_at IS NULL ORDER BY id`),
    db.prepare('SELECT * FROM kol_tasks ORDER BY done, IFNULL(due_at, \'9999\'), id'),
    db.prepare('SELECT * FROM deals ORDER BY IFNULL(period, \'\') DESC, id DESC'),
    db.prepare('SELECT * FROM templates ORDER BY scene, language, id'),
    db.prepare('SELECT * FROM saved_views ORDER BY id'),
    db.prepare('SELECT * FROM keywords ORDER BY category, language, id'),
    db.prepare('SELECT key, value FROM settings')
  ]);
  const set = {};
  for (const r of settings.results) { try { set[r.key] = JSON.parse(r.value); } catch { /* 坏值忽略，前端用默认 */ } }
  return json({
    kols: kols.results.map(parseRow), tasks: tasks.results, deals: deals.results, templates: templates.results,
    views: views.results, keywords: keywords.results, settings: set, aiEnabled: !!env.ANTHROPIC_API_KEY
  });
}

/* ---------- 路由 ---------- */
const SIMPLE = { tasks: 'kol_tasks', templates: 'templates', views: 'saved_views', keywords: 'keywords', deals: 'deals' };

async function route(req, env, parts) {
  const db = env.KOL_DB, m = req.method;
  const [res, idRaw, action] = parts;
  const id = idRaw && /^\d+$/.test(idRaw) ? Number(idRaw) : null;

  if (res === 'bootstrap' && m === 'GET') return bootstrap(db, env);
  if (res === 'password' && m === 'POST') return changePassword(req, env);
  if (res === 'backup' && m === 'GET') return backup(db);
  if (res === 'restore' && m === 'POST') return restore(db, await body(req));
  if (res === 'import' && m === 'POST') return importRows(db, await body(req));

  if (res === 'kols') {
    if (!idRaw && m === 'POST') { const b = await body(req); return createKol(db, b.kol || b, !!b.force); }
    if (idRaw === 'batch' && m === 'POST') return batchKols(db, await body(req));
    if (idRaw === 'dupcheck' && m === 'POST') {
      const b = await body(req);
      const keys = withKeys({ profile_url: b.profile_url, email: b.email, platform: b.platform, handle: b.handle });
      return json({ dupes: await findDupes(db, keys, Number(b.exclude_id) || 0) });
    }
    if (id && action === 'restore' && m === 'POST') {
      const row = await db.prepare('UPDATE kols SET deleted_at = NULL WHERE id = ? RETURNING *').bind(id).first();
      return row ? json({ kol: parseRow(row) }) : json({ error: '已经无法撤销' }, 404);
    }
    if (id && !action && m === 'PATCH') return patchKol(db, id, await body(req));
    if (id && !action && m === 'DELETE') {
      await db.prepare('UPDATE kols SET deleted_at = ? WHERE id = ?').bind(now(), id).run();
      return json({ ok: true });
    }
  }

  if (res === 'activities') {
    if (!idRaw && m === 'GET') {
      const kolId = Number(new URL(req.url).searchParams.get('kol_id'));
      if (!kolId) throw new Invalid('缺少 kol_id');
      const { results } = await db.prepare('SELECT * FROM activities WHERE kol_id = ? ORDER BY happened_at DESC, id DESC').bind(kolId).all();
      return json({ activities: results });
    }
    if (!idRaw && m === 'POST') return createActivity(db, await body(req));
    if (id && (m === 'PATCH' || m === 'DELETE')) {
      const cur = await db.prepare('SELECT * FROM activities WHERE id = ?').bind(id).first();
      if (!cur) return json({ error: '这条记录不存在' }, 404);
      let row = null;
      const wasContact = CONTACT_TYPES.includes(cur.type);
      if (m === 'PATCH') { const d = clean('activities', await body(req), true); delete d.kol_id; row = await update(db, 'activities', id, d); }
      else await db.prepare('DELETE FROM activities WHERE id = ?').bind(id).run();
      const isContact = m === 'PATCH' && CONTACT_TYPES.includes(row.type);
      if (wasContact !== isContact) await db.prepare('UPDATE kols SET touches = MAX(0, touches + ?) WHERE id = ?').bind(isContact ? 1 : -1, cur.kol_id).run();
      await syncLastContact(db, cur.kol_id);
      const kol = await db.prepare('SELECT * FROM kols WHERE id = ?').bind(cur.kol_id).first();
      return json({ activity: row, kol: parseRow(kol) });
    }
  }

  if (res === 'settings' && idRaw && m === 'PUT') {
    if (!SETTING_KEYS.includes(idRaw)) throw new Invalid('不认识的设置项');
    const b = await body(req);
    const value = JSON.stringify(b.value ?? null);
    if (value.length > 30000) throw new Invalid('设置内容太大了');
    await db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').bind(idRaw, value, now()).run();
    return json({ ok: true });
  }

  const table = SIMPLE[res];
  if (table) {
    if (!idRaw && m === 'POST') {
      let data = clean(table, await body(req));
      if (table === 'deals') data = withCommission(data);
      if (data.kol_id && !(await db.prepare('SELECT id FROM kols WHERE id = ?').bind(data.kol_id).first())) throw new Invalid('这个 KOL 不存在');
      return json({ item: await insert(db, table, stamp(table, data, true)) });
    }
    if (id && m === 'PATCH') {
      const cur = await db.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
      if (!cur) return json({ error: '这条记录不存在' }, 404);
      let data = clean(table, await body(req), true);
      delete data.kol_id;
      if (table === 'deals') data = withCommission(data, cur);
      return json({ item: await update(db, table, id, stamp(table, data, false)) });
    }
    if (id && m === 'DELETE') {
      await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
      return json({ ok: true });
    }
  }
  return json({ error: '没有这个接口' }, 404);
}

export async function kolApi(req, env, path) {
  if (!env.KOL_DB) return json({ error: '服务端还没绑定数据库' }, 500);
  if (!env.KOL_PASSWORD) return json({ error: '服务端还没设置密码' }, 500);
  const forbidden = () => json({ error: '请求来源不对' }, 403);
  if (path === '/api/kol/login' && req.method === 'POST') return csrfOk(req) ? login(req, env) : forbidden();
  if (path === '/api/kol/logout' && req.method === 'POST') return csrfOk(req) ? logout() : forbidden();
  // 页面打开时探测是否已登录：只回答是 / 否，不含任何数据（这样未登录时浏览器控制台不会出现 401 报错）
  if (path === '/api/kol/session' && req.method === 'GET') return json({ authed: await isAuthed(req, env) });
  if (!(await isAuthed(req, env))) return json({ error: '需要登录' }, 401);
  if (!csrfOk(req)) return forbidden();
  const parts = path.slice('/api/kol/'.length).split('/').filter(Boolean);
  try {
    return await route(req, env, parts);
  } catch (e) {
    if (e instanceof Invalid) return json({ error: e.message }, 400);
    console.error('kol api', e);
    return json({ error: '服务器出错了，请稍后再试' }, 500);
  }
}
