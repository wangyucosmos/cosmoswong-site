/* 我的工作台 · 演示模式（/desk-demo，v5）
   给没有密码的人（比如面试官）完整地用一遍工作台：同一套页面代码，只是把「服务器」换成浏览器里的一份模拟——
   - D.api 不再请求 /api/desk，而是在这里按 src/desk/api.js 的同样规则处理（字段校验直接用同一个 schema.mjs）；
   - 数据全是虚构的，存在这个浏览器的 localStorage（deskdemo.db），谁的改动都只在自己的浏览器里，碰不到真实工作台；
   - 知识库是一组示例笔记，素材库是在浏览器私有存储（OPFS）里现画的示例图，GitHub 卡片是假数据；
   - 页面顶部一条提示：这是演示、可以随便点、一键重置。
   只在 desk-demo.html 里加载（<html data-demo="1">）。真实的 /desk 不加载这个文件。 */
(() => {
  const D = window.DESK;
  if (!D?.DEMO) return;
  const KEY = 'deskdemo.db', VER = 1;

  /* ================= 工具 ================= */
  let S = null;   // schema.mjs：TABLES / JSON_COLS / Invalid / clean
  // 带上和本文件一样的版本号（?v=…，deploy.sh 打的），否则 /assets/* 的长缓存会让浏览器一直用旧的校验规则
  const V = (document.currentScript?.src.match(/\?v=\d+/) || [''])[0];
  const ready = import('/assets/desk/schema.mjs' + V).then(m => { S = m; });
  const now = () => new Date().toISOString();
  const today = () => D.today();
  const day = n => D.addDays(today(), n);
  const clone = o => JSON.parse(JSON.stringify(o));
  const toWeekday = s => { const w = D.dow(s); return w === 6 ? D.addDays(s, -1) : w === 0 ? D.addDays(s, -2) : s; };
  const nodeDate = (T, off, weekend) => { const d = D.addDays(T, off); return weekend && off !== 0 ? toWeekday(d) : d; };
  const fail = (msg, status = 400) => { const e = new Error(msg); e.status = status; throw e; };

  const TABLE_NAMES = ['projects', 'deliverables', 'tasks', 'pendings', 'activities', 'decisions', 'ideas', 'wins', 'inbox', 'timelines', 'checklists', 'prompt_templates', 'links', 'resources', 'saved_views'];
  const RES = { projects: 'projects', deliverables: 'deliverables', tasks: 'tasks', pendings: 'pendings', activities: 'activities', ideas: 'ideas', wins: 'wins', inbox: 'inbox',
    timelines: 'timelines', checklists: 'checklists', prompts: 'prompt_templates', links: 'links', views: 'saved_views', decisions: 'decisions', resources: 'resources' };
  const CHILDREN = ['deliverables', 'tasks', 'pendings', 'activities', 'decisions'];
  const REORDERABLE = ['deliverables', 'tasks', 'links', 'timelines', 'resources'];
  const SORTED = ['tasks', 'deliverables', 'links', 'timelines', 'resources'];
  const SETTING_KEYS = ['kinds', 'provinces', 'deliverable_types', 'ask_whom', 'ai_tools', 'win_task_types', 'inbox_sources', 'statuses', 'nudge_days', 'view_order', 'welcome_done', 'wrapup_nag', 'baselines', 'github'];
  const DEFAULTS = { projects: { launch_tentative: 0 }, deliverables: { base_locked: 0, checked: 0 }, tasks: { done: 0, milestone: 0 }, pendings: { blocking: 0, nudge_count: 0 }, links: { pinned: 0 }, resources: { pinned: 0 }, wins: { portfolio_ok: 0 } };

  /* ================= 一份「数据库」：表 = 数组，行和 D1 里一样（JSON 列存成文字） ================= */
  let db = null;
  const save = D.debounce(() => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* 写不进去（无痕模式）：这次打开期间照样能用 */ } }, 150);
  const rows = t => db.t[t] || (db.t[t] = []);
  const live = t => rows(t).filter(r => !r.deleted_at);
  const parse = (table, r) => {
    if (!r) return r;
    const o = clone(r); delete o.deleted_at;
    for (const c of S.JSON_COLS[table] || []) {
      if (!(c in o)) continue;
      const empty = c === 'checklist_state' ? {} : c === 'compare' ? null : [];
      try { o[c] = o[c] ? JSON.parse(o[c]) : empty; } catch { o[c] = empty; }
    }
    return o;
  };
  const stamp = (table, data, isNew) => { const t = now(); if (isNew) data.created_at = t; if (table !== 'settings') data.updated_at = t; return data; };
  const insert = (table, data) => { db.seq[table] = (db.seq[table] || 0) + 1; const r = { ...(DEFAULTS[table] || {}), ...data, id: db.seq[table] }; rows(table).push(r); return parse(table, r); };
  const getRow = (table, id) => live(table).find(r => r.id === Number(id));
  const update = (table, id, data) => { const r = rows(table).find(x => x.id === Number(id)); Object.assign(r, data); return parse(table, r); };
  const order = t => (a, b) => SORTED.includes(t) ? (a.sort_order ?? 1e18) - (b.sort_order ?? 1e18) || a.id - b.id : a.id - b.id;

  /* ================= 和 src/desk/api.js 同样的规则 ================= */
  function checkProject(id, required) {
    if (id == null) { if (required) fail('要先选一个项目'); return; }
    if (!getRow('projects', id)) fail('这个项目不存在或已删除');
  }
  function beforeWrite(table, data, cur, input) {
    if ('project_id' in data && (!cur || data.project_id !== cur.project_id)) checkProject(data.project_id, ['deliverables', 'activities'].includes(table));
    if (table === 'tasks' && 'done' in data) { const given = /^\d{4}-\d{2}-\d{2}$/.test(input.done_at || '') ? input.done_at : null; data.done_at = data.done ? (cur?.done ? cur.done_at : given || today()) : null; }
    if (table === 'pendings' && !cur && !data.asked_at) data.asked_at = today();
    if (table === 'pendings' && 'status' in data && data.status === 'answered' && !cur?.answered_at && !data.answered_at) data.answered_at = today();
    if (table === 'deliverables' && 'status' in data) {
      if (data.status === 'done' && cur?.status !== 'done' && !data.delivered_at && !cur?.delivered_at) data.delivered_at = today();
      if (data.status !== 'done' && cur?.status === 'done' && !('delivered_at' in data)) data.delivered_at = null;
    }
  }
  const doneLinkedTasks = (did, date) => rows('tasks').filter(t => t.deliverable_id === did && !t.done && !t.deleted_at).forEach(t => Object.assign(t, { done: 1, done_at: date, updated_at: now() }));
  function afterActivity(act) {
    if (act.type !== 'ai' || !act.tool) return null;
    const p = getRow('projects', act.project_id); if (!p) return null;
    let list = []; try { list = JSON.parse(p.last_ai || '[]'); } catch { /* 坏值按空 */ }
    if (list.includes(act.tool)) return null;
    return update('projects', p.id, { last_ai: JSON.stringify([act.tool, ...list].slice(0, 10)), updated_at: now() });
  }
  const logDelivery = d => insert('activities', stamp('activities', { project_id: d.project_id, type: 'deliver', summary: `交付：${[d.name || d.type, d.version].filter(Boolean).join(' ')}`.slice(0, 500), happened_at: d.delivered_at || today() }, true));

  function create(table, input) {
    const data = S.clean(table, input);
    beforeWrite(table, data, null, input);
    const row = insert(table, stamp(table, data, true)), out = { item: row };
    if (table === 'activities') out.project = afterActivity(row);
    if (table === 'deliverables' && row.status === 'done') out.activity = logDelivery(row);
    return out;
  }
  function patch(table, id, input) {
    const cur = getRow(table, id); if (!cur) fail('这条记录不存在或已删除', 404);
    const data = S.clean(table, input, true);
    if (['deliverables', 'activities'].includes(table)) delete data.project_id;
    beforeWrite(table, data, cur, input);
    const was = cur.status, row = update(table, id, stamp(table, data, false)), out = { item: row };
    if (table === 'activities') out.project = afterActivity(row);
    if (table === 'deliverables' && row.status === 'done' && was !== 'done') { out.activity = logDelivery(row); doneLinkedTasks(row.id, row.delivered_at || today()); }
    return out;
  }
  function remove(table, id) {
    const t = now(), r = getRow(table, id); if (r) r.deleted_at = t;
    if (table === 'projects') for (const c of CHILDREN) live(c).filter(x => x.project_id === Number(id)).forEach(x => { x.deleted_at = t; });
    return { ok: true };
  }
  function restore(table, id) {
    const r = rows(table).find(x => x.id === Number(id));
    if (!r?.deleted_at) fail('已经无法撤销', 404);
    const at = r.deleted_at; r.deleted_at = null;
    if (table === 'projects') for (const c of CHILDREN) rows(c).filter(x => x.project_id === Number(id) && x.deleted_at === at).forEach(x => { x.deleted_at = null; });
    return { item: parse(table, r) };
  }
  function batchPatch(table, input) {
    const ids = (Array.isArray(input.ids) ? input.ids : []).map(Number).filter(Number.isInteger);
    if (!ids.length) fail('没有选中任何一条');
    const data = stamp(table, S.clean(table, input.patch || {}, true), false); delete data.project_id;
    return { items: ids.map(id => getRow(table, id) && update(table, id, data)).filter(Boolean) };
  }
  function reorder(table, input) {
    const ids = (Array.isArray(input.ids) ? input.ids : []).map(Number).filter(Number.isInteger);
    if (!ids.length) fail('没有要排序的内容');
    ids.forEach((id, i) => { const r = rows(table).find(x => x.id === id); if (r) Object.assign(r, { sort_order: i, updated_at: now() }); });
    return { ok: true };
  }
  function subtree(id) {
    const of = t => live(t).filter(r => r.project_id === id).sort(order(t)).map(r => parse(t, r));
    return { project: parse('projects', rows('projects').find(r => r.id === id)), tasks: of('tasks'), deliverables: of('deliverables'), pendings: of('pendings'), decisions: of('decisions'), wins: of('wins') };
  }
  function schedule(id, input) {
    const p = getRow('projects', id); if (!p) fail('这个项目不存在或已删除', 404);
    const T = S.clean('projects', { launch_at: input.launch_at }, true).launch_at; if (!T) fail('要先填上线日');
    const weekend = input.weekend !== false, t = now();
    Object.assign(p, { launch_at: T, updated_at: t });
    if (input.mode === 'shift') {
      let n = 0;
      live('tasks').filter(r => r.project_id === id && !r.done && r.offset_days != null).forEach(r => { Object.assign(r, { due_at: nodeDate(T, r.offset_days, weekend), updated_at: t }); n++; });
      live('deliverables').filter(r => r.project_id === id && r.status !== 'done' && r.offset_days != null).forEach(r => { Object.assign(r, { due_at: nodeDate(T, r.offset_days, weekend), updated_at: t }); n++; });
      live('pendings').filter(r => r.project_id === id && r.status === 'waiting' && r.offset_days != null).forEach(r => { Object.assign(r, { need_by: nodeDate(T, r.offset_days, weekend), remind_from: r.remind_offset == null ? null : nodeDate(T, r.remind_offset, weekend), updated_at: t }); n++; });
      return { ...subtree(id), shifted: n };
    }
    const items = JSON.parse(S.clean('timelines', { name: 'x', items: input.items }).items);
    const maxSort = Math.max(-1, ...rows('tasks').filter(r => r.project_id === id).map(r => r.sort_order ?? -1));
    items.forEach((n, i) => {
      const due = nodeDate(T, n.offset_days, weekend);
      if (n.kind === 'deliverable') insert('deliverables', { project_id: id, name: n.deliverable_name || null, type: n.deliverable_type, status: 'todo', due_at: due, offset_days: n.offset_days, sort_order: i, created_at: t, updated_at: t });
      else if (n.kind === 'wait') insert('pendings', { project_id: id, question: n.title, ask_whom: n.ask_whom || null, status: 'waiting', blocking: n.blocking ? 1 : 0, need_by: due, remind_from: n.remind_offset == null ? null : nodeDate(T, n.remind_offset, weekend), offset_days: n.offset_days, remind_offset: n.remind_offset ?? null, source: 'timeline', nudge_count: 0, created_at: t, updated_at: t });
      else insert('tasks', { project_id: id, title: n.title, due_at: due, done: 0, sort_order: maxSort + 1 + i, source: 'timeline', offset_days: n.offset_days, milestone: n.is_milestone ? 1 : 0, created_at: t, updated_at: t });
    });
    return { ...subtree(id), created: items.length };
  }
  // 回填：先把每一条都校验、算好，最后一起写（和服务端一样，任何一条不对整批不写）
  function applyOps(pid, input) {
    const p = getRow('projects', pid); if (!p) fail('这个项目不存在或已删除', 404);
    const ops = Array.isArray(input.ops) ? input.ops.slice(0, 100) : [];
    if (!ops.length) fail('没有要更新的内容');
    const t = now(), td = today(), writes = [];
    let lastAi = (() => { try { return JSON.parse(p.last_ai || '[]'); } catch { return []; } })();
    const add = (table, data) => writes.push(() => insert(table, { ...data, created_at: t, updated_at: t }));
    const set = (table, id, data) => writes.push(() => update(table, id, { ...data, updated_at: t }));
    for (const [i, o] of ops.entries()) {
      try {
        switch (o?.op) {
          case 'project': { const d = S.clean('projects', o.data || {}, true); delete d.archived_at; set('projects', pid, d); break; }
          case 'deliverable': {
            if (o.id) {
              const cur = getRow('deliverables', o.id); if (!cur || cur.project_id !== pid) fail('这件交付物不在这个项目里');
              const d = S.clean('deliverables', o.data || {}, true); delete d.project_id;
              if (d.status === 'done' && cur.status !== 'done') {
                d.delivered_at = d.delivered_at || cur.delivered_at || td;
                writes.push(() => doneLinkedTasks(cur.id, d.delivered_at));
                add('activities', { project_id: pid, type: 'deliver', summary: `交付：${[d.name || cur.name || cur.type, d.version || cur.version].filter(Boolean).join(' ')}`.slice(0, 500), happened_at: d.delivered_at });
              }
              set('deliverables', cur.id, d);
            } else { const d = S.clean('deliverables', { ...(o.data || {}), project_id: pid }); if (d.status === 'done') d.delivered_at = d.delivered_at || td; add('deliverables', d); }
            break;
          }
          case 'pending': { const d = S.clean('pendings', { ...(o.data || {}), project_id: pid }); add('pendings', { ...d, asked_at: d.asked_at || td, source: d.source || 'backfill' }); break; }
          case 'answer': {
            const cur = getRow('pendings', o.id); if (!cur || cur.project_id !== pid) fail('这条待确认不在这个项目里');
            const d = S.clean('pendings', { answer: o.answer, answered_at: o.date || td }, true); if (!d.answer) fail('答复内容不能空');
            set('pendings', cur.id, { ...d, status: 'answered' });
            add('activities', { project_id: pid, type: 'feedback', summary: `已答复：${cur.question}`.slice(0, 500), content: `问：${cur.question}\n答：${d.answer}`, happened_at: d.answered_at });
            break;
          }
          case 'decision': add('decisions', S.clean('decisions', { ...(o.data || {}), project_id: pid, decided_at: o.data?.decided_at || td })); break;
          case 'win': { const d = S.clean('wins', { ...(o.data || {}), project_id: pid, happened_at: o.data?.happened_at || td }); if (d.deliverable_id && getRow('deliverables', d.deliverable_id)?.project_id !== pid) d.deliverable_id = null; add('wins', d); break; }
          case 'activity': { const d = S.clean('activities', { ...(o.data || {}), project_id: pid, happened_at: o.data?.happened_at || td }); add('activities', d); if (d.type === 'ai' && d.tool && !lastAi.includes(d.tool)) lastAi = [d.tool, ...lastAi].slice(0, 10); break; }
          default: fail('不认识的更新');
        }
      } catch (e) { fail(`第 ${i + 1} 项：${e.message}`); }
    }
    if (JSON.stringify(lastAi) !== (p.last_ai || '[]')) set('projects', pid, { last_ai: JSON.stringify(lastAi) });
    writes.forEach(w => w());
    return { ...subtree(pid), applied: ops.length };
  }
  function intake(inboxId, input) {
    const item = getRow('inbox', inboxId); if (!item) fail('这条收集不存在或已删除', 404);
    const pdata = S.clean('projects', input.project || {});
    const delivs = (Array.isArray(input.deliverables) ? input.deliverables : []).slice(0, 30).map(d => S.clean('deliverables', { ...d, project_id: 1 }));
    const pends = (Array.isArray(input.pendings) ? input.pendings : []).slice(0, 60).map(x => S.clean('pendings', { ...x, project_id: 1 }));
    const p = insert('projects', stamp('projects', pdata, true)), t = now();
    delivs.forEach((d, i) => insert('deliverables', { ...d, project_id: p.id, sort_order: i, created_at: t, updated_at: t }));
    pends.forEach(x => insert('pendings', { ...x, project_id: p.id, asked_at: x.asked_at || today(), source: 'inbox', created_at: t, updated_at: t }));
    update('inbox', inboxId, { processed_at: t, converted_to: `project:${p.id}`, updated_at: t });
    return { ...subtree(p.id), item: parse('inbox', rows('inbox').find(r => r.id === inboxId)) };
  }
  function nudge(id, input) {
    const cur = getRow('pendings', id); if (!cur) fail('这条待确认不存在或已删除', 404);
    const date = S.clean('activities', { happened_at: input.date || today() }, true).happened_at;
    const item = update('pendings', id, { nudge_count: (cur.nudge_count || 0) + 1, last_nudged_at: date, updated_at: now() });
    const activity = cur.project_id && getRow('projects', cur.project_id) ? insert('activities', stamp('activities', { project_id: cur.project_id, type: 'nudge', summary: `催了一次：${cur.question}`.slice(0, 500), content: String(input.text || '').slice(0, 5000) || null, happened_at: date }, true)) : null;
    return { item, activity };
  }
  function answer(id, input) {
    const cur = getRow('pendings', id); if (!cur) fail('这条待确认不存在或已删除', 404);
    const d = S.clean('pendings', { answer: input.answer, answered_at: input.date || today() }, true);
    if (!d.answer) fail('先写一下对方是怎么答复的');
    const item = update('pendings', id, { ...d, status: 'answered', updated_at: now() });
    const activity = cur.project_id && getRow('projects', cur.project_id) ? insert('activities', stamp('activities', { project_id: cur.project_id, type: 'feedback', summary: `已答复：${cur.question}`.slice(0, 500), content: `问：${cur.question}\n答：${d.answer}`, happened_at: d.answered_at }, true)) : null;
    return { item, activity };
  }
  function convertInbox(id, input) {
    const cur = getRow('inbox', id); if (!cur) fail('这条收集不存在或已删除', 404);
    const table = { project: 'projects', task: 'tasks', pending: 'pendings' }[input.to]; if (!table) fail('不知道要转成什么');
    const src = { ...(input.data || {}) }; if (input.to === 'task') src.source = 'inbox';
    const data = S.clean(table, src); beforeWrite(table, data, null, src);
    const created = insert(table, stamp(table, data, true));
    const item = update('inbox', id, { processed_at: now(), converted_to: `${input.to}:${created.id}`, updated_at: now() });
    return { item, created, kind: table };
  }
  function bootstrap() {
    const cutoff = new Date(Date.now() - 24 * 3600e3).toISOString();
    for (const t of TABLE_NAMES) db.t[t] = rows(t).filter(r => !r.deleted_at || r.deleted_at >= cutoff);
    const out = {};
    for (const t of TABLE_NAMES) out[t === 'prompt_templates' ? 'prompt_templates' : t] = live(t).sort(order(t)).map(r => parse(t, r));
    out.settings = Object.fromEntries(Object.entries(db.settings).map(([k, v]) => { try { return [k, JSON.parse(v)]; } catch { return [k, null]; } }));
    return out;
  }
  function backup() {
    const out = { app: 'cosmoswong-desk', version: 1, exported_at: now(), demo: true };
    for (const t of TABLE_NAMES) out[t] = clone(rows(t));
    out.settings = Object.entries(db.settings).map(([key, value]) => ({ key, value, updated_at: now() }));
    return out;
  }
  function restoreAll(input) {
    if (input.confirm !== 'RESTORE') fail('恢复需要二次确认');
    const data = input.data; if (!data || data.app !== 'cosmoswong-desk') fail('这不是工作台导出的备份文件');
    let count = 0;
    for (const t of TABLE_NAMES) { db.t[t] = Array.isArray(data[t]) ? clone(data[t]) : []; db.seq[t] = Math.max(0, ...db.t[t].map(r => r.id || 0)); count += db.t[t].length; }
    db.settings = Object.fromEntries((Array.isArray(data.settings) ? data.settings : []).map(r => [r.key, r.value]));
    return { ok: true, rows: count };
  }

  /* ================= 假 GitHub：几个示例仓库的提交、两个 进度.md，知识库就是下面的示例笔记 ================= */
  const ghCfg = () => { try { return JSON.parse(db.settings.github || '{}'); } catch { return {}; } };
  const hoursAgo = h => new Date(Date.now() - h * 3600e3).toISOString();
  function gh(method, what, q, body) {
    const cfg = ghCfg();
    if (what === 'status') return { configured: true, login: 'demo-user', repos: cfg.repos || [], progress: cfg.progress || [], drafts: cfg.drafts || null, kb: cfg.kb || [] };
    if (what === 'overview') return { repos: (cfg.repos || []).map((r, i) => ({ repo: r.repo, label: r.label, private: true, html_url: 'https://github.com/', default_branch: 'main', pushed_at: hoursAgo(i * 5 + 1), open_prs: i === 2 ? 1 : 0,
      commits: (DEMO_COMMITS[r.repo] || []).map(([h, m, a], k) => ({ sha: (r.repo.length * 7919 + k * 104729).toString(16).padStart(40, '0').slice(-40), message: m, author: a, date: hoursAgo(h), html_url: 'https://github.com/' })) })) };
    if (what === 'progress') return { files: (cfg.progress || []).map(p => ({ repo: p.repo, path: p.path, label: p.label, sha: db.gh.sha[p.path] || 'a'.repeat(40), text: noteText(p.path) || '', html_url: 'https://github.com/' })) };
    if (what === 'tree') return { files: db.notes.map(n => ({ repo: 'demo/knowledge', path: n.path, full: n.path, size: n.text.length, sha: '0'.repeat(40) })) };
    if (what === 'file' && method === 'GET') { const t = noteText(q.get('path')); if (t == null) fail('GitHub 上找不到这个仓库或文件（也可能是令牌没开这个仓库）', 404); return { repo: q.get('repo'), path: q.get('path'), sha: db.gh.sha[q.get('path')] || 'a'.repeat(40), text: t, html_url: 'https://github.com/' }; }
    if (what === 'file' && method === 'PUT') {
      const path = String(body.path || ''), text = String(body.text ?? '');
      const isProgress = (cfg.progress || []).some(x => x.path === path), isDraft = cfg.drafts && path.startsWith(cfg.drafts.dir + '/') && /\.md$/.test(path) && !body.sha;
      if (!isProgress && !isDraft) fail('工作台只能改配置里的进度文件、在草稿文件夹里新建笔记');
      if (isProgress && body.sha !== (db.gh.sha[path] || 'a'.repeat(40))) fail('有人刚改过这个文件，请重新读取再改', 409);
      const n = db.notes.find(x => x.path === path); if (n) Object.assign(n, { text, mtime: Date.now() }); else db.notes.push({ path, text, mtime: Date.now() });
      const sha = Array.from({ length: 40 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join(''); db.gh.sha[path] = sha;
      DEMO_COMMITS['demo/knowledge']?.unshift([0, `docs: ${isDraft ? '收集箱草稿' : '回写进度'}（来自我的工作台）`, '我的工作台']);
      if (D.kb?.source === 'demo') D.kb.loadDemo(db.notes);
      return { ok: true, sha, commit: sha, html_url: 'https://github.com/', commit_url: 'https://github.com/' };
    }
    fail('没有这个接口', 404);
  }
  const noteText = path => db.notes.find(n => n.path === path)?.text ?? null;
  const DEMO_COMMITS = {
    'demo/work-board': [[1, 'docs: 回写进度「A 省 · 双十一抽奖模块」（来自我的工作台）', '我的工作台'], [5, 'docs: 原型 V2 抽奖弹窗改三档（Claude Code）', 'Claude'], [26, 'docs: 客服文档 V1.1 按业务方意见改（Codex）', 'Codex'], [50, 'docs: 比稿：选定 Claude 版为底稿', 'Claude']],
    'demo/knowledge': [[3, 'docs: 收集箱草稿「业务方说奖品分三档」（来自我的工作台）', '我的工作台'], [30, 'docs: 补充 B 省本地化要点（DeepSeek）', 'DeepSeek'], [74, 'docs: 整理活动规则模板（Claude）', 'Claude']],
    'demo/site': [[8, 'feat(desk): 三种风格可切换', 'Claude'], [31, 'feat: 作品集加案例页', 'Codex']]
  };

  /* ================= 路由：和 /api/desk 一样的地址 ================= */
  async function route(method, path, body = {}) {
    await ready;
    const [p, qs] = path.split('?'), q = new URLSearchParams(qs || '');
    const parts = p.split('/').filter(Boolean), [res, idRaw, action] = parts;
    const id = idRaw && /^\d+$/.test(idRaw) ? Number(idRaw) : null;
    if (res === 'session') return { authed: true };
    if (res === 'login' || res === 'logout') return { ok: true };
    if (res === 'password') fail('演示模式里不能改密码');
    if (res === 'bootstrap') return bootstrap();
    if (res === 'backup') return backup();
    if (res === 'restore') return restoreAll(body);
    if (res === 'init-pack') fail('演示里不用导入初始化包。真实工作台用它一次导入省份、时间表、提示词模板、常用资源和过往项目（这些都不进代码仓库）。');
    if (res === 'gh') return gh(method, idRaw, q, body);
    if (res === 'settings' && idRaw && method === 'PUT') { if (!SETTING_KEYS.includes(idRaw)) fail('不认识的设置项'); db.settings[idRaw] = JSON.stringify(body.value ?? null); return { ok: true }; }
    if (res === 'activities' && !idRaw && method === 'GET') { const pid = Number(q.get('project_id')); return { items: live('activities').filter(r => r.project_id === pid).sort((a, b) => b.happened_at.localeCompare(a.happened_at) || b.id - a.id).map(r => parse('activities', r)) }; }
    if (res === 'projects' && id && action === 'schedule') return schedule(id, body);
    if (res === 'projects' && id && action === 'apply') return applyOps(id, body);
    if (res === 'pendings' && id && action === 'nudge') return nudge(id, body);
    if (res === 'pendings' && id && action === 'answer') return answer(id, body);
    if (res === 'inbox' && id && action === 'convert') return convertInbox(id, body);
    if (res === 'inbox' && id && action === 'intake') return intake(id, body);
    const table = RES[res]; if (!table) fail('没有这个接口', 404);
    if (!idRaw && method === 'POST') return create(table, body);
    if (idRaw === 'batch' && table === 'projects') return batchPatch(table, body);
    if (idRaw === 'reorder' && REORDERABLE.includes(table)) return reorder(table, body);
    if (id && action === 'restore') return restore(table, id);
    if (id && !action && method === 'PATCH') return patch(table, id, body);
    if (id && !action && method === 'DELETE') return remove(table, id);
    fail('没有这个接口', 404);
  }
  D.api = async (method, path, body) => {
    await ready;
    if (!db) load();
    try {
      const out = clone(await route(method, path, body ? clone(body) : {}));
      if (method !== 'GET') save();
      return out;
    } catch (e) {
      if (e instanceof S.Invalid) { const x = new Error(e.message); x.status = e.status || 400; throw x; }
      throw e;
    }
  };

  /* ================= 示例数据（全部虚构） ================= */
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s?.v === VER && s.day) { db = s; return; } } catch { /* 坏了就重来 */ }
    seed();
  }
  D.demoReset = () => { try { localStorage.removeItem(KEY); } catch { /* 无痕模式 */ } location.reload(); };
  function seed() {
    db = { v: VER, day: today(), t: {}, seq: {}, settings: {}, notes: [], gh: { sha: {} } };
    const put = (table, o) => insert(table, stamp(table, { ...S.clean(table, o), ...Object.fromEntries(Object.entries(o).filter(([k]) => !(k in S.TABLES[table]))) }, true));
    const set = (k, v) => { db.settings[k] = JSON.stringify(v); };
    set('provinces', ['A 省', 'B 省', 'C 省']);
    set('welcome_done', true);
    set('github', { repos: [{ repo: 'demo/work-board', label: '工作看板' }, { repo: 'demo/knowledge', label: '知识库' }, { repo: 'demo/site', label: '个人主页' }],
      progress: [{ repo: 'demo/knowledge', path: '进度.md', label: '工作看板' }, { repo: 'demo/knowledge', path: '个人主页/进度.md', label: '个人主页' }],
      drafts: { repo: 'demo/knowledge', dir: '_草稿-工作台' }, kb: [{ repo: 'demo/knowledge', prefix: '', branch: 'main' }] });

    // 时间表模板：月度活动（虚构的通用结构）
    const TL = [
      { offset_days: -20, title: '开工：理需求、列待确认', kind: 'task', is_milestone: true },
      { offset_days: -18, title: '思路方案', kind: 'deliverable', deliverable_type: '思路方案' },
      { offset_days: -16, title: '奖品清单', kind: 'wait', ask_whom: '业务方', remind_offset: -19, blocking: true },
      { offset_days: -13, title: '主页面原型', kind: 'deliverable', deliverable_type: '原型' },
      { offset_days: -11, title: '领导确认原型', kind: 'wait', ask_whom: '领导', remind_offset: -12, blocking: true },
      { offset_days: -8, title: '客服文档', kind: 'deliverable', deliverable_type: '客服文档' },
      { offset_days: -7, title: '活动规则', kind: 'deliverable', deliverable_type: '活动规则' },
      { offset_days: -4, title: '切图归档', kind: 'deliverable', deliverable_type: '切图归档' },
      { offset_days: -2, title: '拨测账号', kind: 'wait', ask_whom: '搭建同事', remind_offset: -4 },
      { offset_days: -1, title: '拨测报告', kind: 'deliverable', deliverable_type: '拨测报告' },
      { offset_days: 0, title: '上线', kind: 'task', is_milestone: true }
    ];
    put('timelines', { name: '月度活动（示例）', kind: '全国月度促活', items: TL, sort_order: 0 });
    put('checklists', { name: '交付前检查（示例）', applies_to: [], items: ['奖品、数值没写死的标「待定」', '活动时间写「暂定」', '没用未授权的官方素材', 'Word 逐页看过排版'] });

    const P = (o) => put('projects', { priority: 'mid', ...o });
    const p1 = P({ title: 'A 省 · 双十一抽奖模块', province: 'A 省', kind: '省福利中心', status: 'active', launch_at: day(3), due_at: day(2), requester: 'A 省业务方',
      summary: '福利中心加一个双十一抽奖模块：每天签到攒次数，三档奖池，中奖弹窗分三种。', next_action: '把原型 V2 发群，抽奖弹窗改成三档', last_ai: ['Claude Code', 'Codex'],
      links: [{ label: '原型（示例）', url: 'https://example.com/proto/a-1111' }], local_paths: ['~/示例/A 省/双十一抽奖'] }).id;
    const p2 = P({ title: '11 月会员促活（全国）', kind: '全国月度促活', status: 'active', launch_at: day(26), launch_tentative: 1, month: day(26).slice(0, 7),
      summary: '每月一期的全国会员促活：主活动页 + 二级页，三份文档。', next_action: '等奖品清单，先出思路方案', last_ai: ['Claude Code'] }).id;
    const p3 = P({ title: 'B 省 · 签到改版', province: 'B 省', kind: '省福利中心', status: 'active', launch_at: day(9), requester: 'B 省业务方',
      summary: '签到页改成 7 天连签 + 补签卡，页面主色跟着换。', next_action: '下午问领导两版签到页用哪一版', last_ai: ['ChatGPT', 'Claude Code'] }).id;
    const p4 = P({ title: 'C 省 · 客服文档更新', province: 'C 省', kind: '省福利中心', status: 'active', due_at: day(1), summary: '规则调整后同步更新客服文档第三章（常见问题）。', next_action: '改完第三章发业务方', last_ai: ['Codex'] }).id;
    const p5 = P({ title: '10 月会员促活（全国）', kind: '全国月度促活', status: 'live', launch_at: day(-6), month: day(-6).slice(0, 7), summary: '国庆档会员促活，已上线，整理数据复盘。', next_action: '整理上线一周的数据', last_ai: ['Claude Code', 'Codex'] }).id;
    const p6 = P({ title: 'A 省 · 国庆打卡活动', province: 'A 省', kind: '省福利中心', status: 'done', launch_at: day(-35), month: day(-35).slice(0, 7), summary: '7 天打卡领券，已交付。', last_ai: ['Claude Code'] }).id;
    const p7 = P({ title: 'B 省 · 积分商城拨测', province: 'B 省', kind: '省福利中心', status: 'done', launch_at: day(-20), summary: '积分商城改版后的全量拨测。', last_ai: ['DeepSeek Harness'] }).id;
    const p8 = P({ title: 'A 省 · 双十一抽奖（去年）', province: 'A 省', kind: '省福利中心', status: 'done', launch_at: D.addDays(day(3), -365), month: D.addDays(day(3), -365).slice(0, 7), summary: '去年的双十一抽奖：转盘 + 两档奖池。' }).id;
    const p9 = P({ title: '12 月会员促活（全国，观望）', kind: '全国月度促活', status: 'watch', launch_at: day(57), launch_tentative: 1, summary: '不一定由我做，先看排期。' }).id;
    P({ title: '玩法提案 · 集卡合成', kind: '玩法创意', status: 'paused', summary: '集齐 5 张卡合成大奖，等领导定方向。', next_action: '等领导定方向' });

    // 用时间表排期（和页面上「一键排期」同一套规则）
    schedule(p2, { mode: 'apply', launch_at: day(26), weekend: true, items: TL });
    schedule(p9, { mode: 'apply', launch_at: day(57), weekend: true, items: TL });
    live('deliverables').filter(d => d.project_id === p2 && d.offset_days <= -18).forEach(d => Object.assign(d, { status: 'doing' }));

    const DL = (pid, type, o = {}) => put('deliverables', { project_id: pid, type, status: 'todo', ...o });
    DL(p1, '思路方案', { name: '抽奖模块思路', version: 'V1', status: 'done', due_at: day(-6), delivered_at: day(-6) });
    DL(p1, '原型', { name: '抽奖模块原型', version: 'V2', status: 'doing', due_at: day(1), base: 'Claude 版（Codex 版落选）', base_locked: 1, file_hint: '抽奖模块原型.fig' });
    DL(p1, '活动规则', { due_at: day(2) });
    DL(p1, '客服文档', { due_at: day(2) });
    DL(p3, '原型', { name: '签到页原型', version: 'V3', status: 'review', due_at: day(0) });
    DL(p3, '拨测报告', { due_at: day(8) });
    DL(p4, '客服文档', { version: 'V1.1', status: 'doing', due_at: day(-1), base: '上月版本（我手改过）', base_locked: 1 });
    DL(p5, '策划案', { name: '数据复盘', version: 'V1', status: 'doing', due_at: day(3) });
    [[p5, '思路方案', 'V2', -24], [p5, '原型', 'V3', -18], [p5, '客服文档', 'V1', -12], [p5, '活动规则', 'V2', -11], [p5, '拨测报告', 'V1', -7],
     [p6, '原型', 'V2', -42], [p6, '活动规则', 'V1', -40], [p6, '客服文档', 'V1', -39], [p7, '拨测报告', 'V2', -21], [p8, '原型', 'V4', -370], [p8, '活动规则', 'V2', -368]]
      .forEach(([pid, type, version, d]) => DL(pid, type, { version, status: 'done', due_at: day(d), delivered_at: day(d), file_hint: '示例文件.docx' }));

    const PD = o => put('pendings', { status: 'waiting', source: 'manual', ...o });
    PD({ project_id: p1, question: '奖品清单', ask_whom: '业务方', ask_name: '张老师', asked_at: day(-5), need_by: day(-1), blocking: 1, nudge_count: 1, last_nudged_at: day(-2) });
    PD({ project_id: p1, question: '抽奖次数上限', ask_whom: '业务方', ask_name: '张老师', asked_at: day(-3), need_by: day(1), blocking: 1 });
    PD({ project_id: p1, question: '活动时间', ask_whom: '业务方', status: 'answered', answer: '11 月 1 日—11 日（暂定）', answered_at: day(-4), asked_at: day(-6) });
    PD({ project_id: p3, question: '签到改版用哪一版', ask_whom: '领导', asked_at: day(-2), need_by: day(2) });
    PD({ project_id: p3, question: '页面主色', ask_whom: '设计师', status: 'answered', answer: '用暖橙，按钮保持蓝色', answered_at: day(-3), asked_at: day(-5) });
    PD({ project_id: p4, question: '客服电话写哪个', ask_whom: '业务方', asked_at: day(-4) });
    PD({ project_id: p5, question: '上线一周的数据', ask_whom: '数据同事', asked_at: day(-1), need_by: day(3) });

    const DC = (pid, content, source, d) => put('decisions', { project_id: pid, content, source, decided_at: day(d) });
    DC(p1, '以 Claude 版原型为底稿，Codex 版不再推进', '我', -3); DC(p1, '抽奖弹窗分三档：大奖 / 普通 / 谢谢参与', '领导', -2); DC(p3, '补签卡每月最多 2 张', '业务方', -4);

    const TK = (o) => put('tasks', { source: 'manual', ...o });
    TK({ project_id: p1, title: '原型 V2 改抽奖弹窗', due_at: day(0) }); TK({ project_id: p1, title: '和设计师对一下切图命名', due_at: day(1) });
    TK({ project_id: p3, title: '问领导签到改版意见', due_at: day(0) }); TK({ project_id: p4, title: '改客服文档第三章', due_at: day(-1) });
    TK({ title: '交周报', due_at: day(0) }); TK({ title: '报销', due_at: day(-2) });
    TK({ project_id: p1, title: '确认活动时间', due_at: day(0), done: 1, done_at: day(0) }); TK({ project_id: p3, title: '整理上一版反馈', due_at: day(-1), done: 1, done_at: day(0) });

    const AC = (pid, type, summary, d, o = {}) => put('activities', { project_id: pid, type, summary, happened_at: day(d), ...o });
    AC(p1, 'progress', '思路方案 V1 发群', -6); AC(p1, 'ai', '比稿：Claude Code 和 Codex 各出一版原型', -4, { tool: 'Codex' });
    AC(p1, 'feedback', '领导：抽奖弹窗再简洁一点，分三档', -2, { content: '（示例）弹窗太花了，分三档就行。' }); AC(p1, 'ai', '开工：原型 V2', -1, { tool: 'Claude Code' });
    AC(p3, 'progress', '原型 V3 发群', -2);

    const wk = n => D.isoWeek(day(-7 * n));
    [['连签 7 天解锁盲盒', 'stay', 'submitted'], ['好友助力砍价换会员', 'value', 'evaluating'], ['答题闯关领流量', 'both', 'adopted'], ['集卡合成大奖', 'value', 'rejected'], ['看视频攒能量', 'stay', 'submitted']]
      .forEach(([title, target, status], i) => put('ideas', { week: wk(i + 1), title, mechanism: '（示例）用户做什么、得到什么、为什么会回来', target, dev_cost: ['light', 'mid', 'heavy'][i % 3], status }));
    [['微信', '张老师：双十一那个抽奖，奖池能不能再加一档实物？另外 11 月 1 号能上吗？我这边要跟领导报一下。'],
     ['会议', '周会：12 月活动大概率要做年终回顾，先把去年 12 月的方案找出来看看。'],
     ['自己想到', '月度活动可以加一个连续打卡的里程碑奖励，下周写进玩法创意。']]
      .forEach(([source, content]) => put('inbox', { source, content }));
    [['常用', '原型（示例）', 'https://example.com/figma', 1], ['常用', '动效发布站（示例）', 'https://example.com/h5', 1], ['常用', '活动后台（示例）', 'https://example.com/admin', 1], ['工具', 'GIF 循环（示例）', 'https://example.com/gif', 0], ['文档', '规范文档（示例）', 'https://example.com/docs', 0]]
      .forEach(([group_name, label, url, pinned], i) => put('links', { group_name, label, url, pinned, sort_order: i }));
    [['folder', '常去文件夹', '客服文档', '~/示例/客服文档', 1], ['folder', '常去文件夹', '活动规则', '~/示例/活动规则', 0], ['tool', '小工具', '长图预览器', '~/示例/工具/长图预览.app', 0], ['doc', 'A 省', 'A 省福利中心规则', '~/示例/A 省/规则.docx', 0]]
      .forEach(([kind, group_name, label, path, pinned], i) => put('resources', { kind, group_name, label, path, pinned, sort_order: i, province: /省/.test(group_name) ? group_name : null }));

    db.notes = DEMO_NOTES.map(([path, text, ago]) => ({ path, text, mtime: Date.now() - ago * 3600e3 }));
    save();
  }

  /* ================= 示例知识库（虚构） ================= */
  const DEMO_NOTES = [
    ['README.md', '---\ntitle: 示例知识库\ntype: index\ntags: [入口]\n---\n# 示例知识库\n\n这是演示用的知识库，内容都是虚构的。真实工作台里，这一页直接读电脑上的知识库文件夹（或经 GitHub 读私有仓库）。\n\n- 规则类：[[交付规范]]、[[活动规则模板]]\n- 省份：[[A 省 · 本地化要点]]、[[B 省 · 本地化要点]]\n- 复盘：[[去年双十一抽奖复盘]]\n', 200],
    ['工作规则/交付规范.md', '---\ntitle: 交付规范\ntype: spec\ntags: [规则, 交付]\n---\n# 交付规范\n\n> [!warning] 硬约束\n> 奖品、数值、库存、概率一律写「待定 / 以活动页面展示为准」，不沿用旧活动的数值。\n\n## Word 文档\n\n- 不用自动编号、不绑项目符号\n- 生成后逐页看一遍：中文、表格、自然分页、末页\n\n## 原型\n\n| 精度 | 用在哪 |\n|---|---|\n| 低保真 | 内部对齐结构 |\n| 高保真 | 领导汇报、对外物料 |\n', 30],
    ['工作规则/活动规则模板.md', '---\ntitle: 活动规则模板\ntype: template\ntags: [规则, 抽奖]\n---\n# 活动规则模板（抽奖类）\n\n1. 活动时间：暂定 X 月 X 日—X 月 X 日\n2. 参与方式：每日签到获得 1 次抽奖机会，每天最多 N 次（待定）\n3. 奖品：以活动页面展示为准\n4. 中奖后 7 天内领取，过期作废\n', 72],
    ['省份/A 省 · 本地化要点.md', '---\ntitle: A 省 · 本地化要点\ntype: spec\ntags: [省份]\n---\n# A 省 · 本地化要点\n\n- 业务方习惯先看思路再看原型，思路方案一页纸就够\n- 抽奖类活动：奖池分档要写清楚，客服问得最多的是「为什么我没中」\n- 去年双十一做过转盘，见 [[去年双十一抽奖复盘]]\n', 120],
    ['省份/B 省 · 本地化要点.md', '---\ntitle: B 省 · 本地化要点\ntype: spec\ntags: [省份]\n---\n# B 省 · 本地化要点\n\n- 签到类活动反馈最好，补签卡是高频诉求\n- 页面主色偏暖，按钮保持蓝色\n', 300],
    ['复盘/去年双十一抽奖复盘.md', '---\ntitle: 去年双十一抽奖复盘\ntype: review\ntags: [复盘, 抽奖]\n---\n# 去年双十一抽奖复盘（A 省）\n\n## 做对了\n\n- 转盘 + 两档奖池，参与门槛低\n\n## 要改\n\n- 「谢谢参与」太多，用户觉得被骗 → 今年改成三档，保底有小奖\n- 抽奖次数上限没提前问清，上线前一天才定\n', 2000],
    ['流程/开工检查.md', '---\ntitle: 开工检查\ntype: flow\ntags: [流程]\n---\n# 开工检查\n\n- [x] 读知识库规则和进度看板\n- [x] 确认原型精度（低保真 / 高保真）\n- [ ] 列出要问业务方的口径\n', 500],
    ['进度.md', '# 进度看板（示例）\n\n## 进行中\n\n### A 省 · 双十一抽奖模块\n\n- **当前版本：** 抽奖模块原型 V2（制作中，底稿：Claude 版）\n- **状态：** 进行中（上线日见工作台）\n- **下一步：** 把原型 V2 发群，抽奖弹窗改成三档\n- **待确认：** 奖品清单（业务方，卡交付）；抽奖次数上限（业务方）\n- **最近经手：** Claude Code ｜ 示例\n\n### C 省 · 客服文档更新\n\n- **当前版本：** 客服文档 V1.1（制作中）\n- **状态：** 进行中\n- **下一步：** 改完第三章发业务方\n- **待确认：** 客服电话写哪个（业务方）\n- **最近经手：** Codex ｜ 示例\n\n## 已交付\n\n### A 省 · 国庆打卡活动\n\n- **状态：** 已交付\n', 2],
    ['个人主页/进度.md', '# 个人主页 · 进度（示例）\n\n## 当前状态\n\n- 工作台 v5 上线：三种风格可切换\n\n## 下一步\n\n1. 作品集补案例截图\n2. 演示模式加更多示例数据\n', 9],
    ['_草稿-工作台/业务方说奖品分三档.md', '---\ntitle: 草稿：业务方说奖品分三档\nsource: 我的工作台 · 收集箱\ntags: [草稿]\n---\n张老师：奖池分三档，大奖一个、普通奖若干、保底小奖。具体数量待定。\n', 3]
  ];
  D.demoNotes = () => { if (!db) load(); return db.notes; };

  /* ================= 示例素材：在浏览器私有存储里画一批活动图（只画一次） ================= */
  const THEMES = { A: ['#ff5f6d', '#ffc371'], B: ['#4facfe', '#00c6fb'], C: ['#43e97b', '#38a169'], K: ['#7f53ac', '#647dee'], L: ['#f7971e', '#ffd200'] };
  const IMAGES = [
    ['各个分省/A 省/弹窗/_当前/抽奖弹窗/中奖弹窗.png', 'A', 'pop', '恭喜中奖'], ['各个分省/A 省/弹窗/_当前/抽奖弹窗/谢谢参与.png', 'A', 'pop', '再接再厉'],
    ['各个分省/A 省/弹窗/_当前/抽奖机切图/转盘.png', 'A', 'wheel', '幸运转盘'], ['各个分省/A 省/切图/_当前/福利中心切图/单页/1-头图/头图.png', 'A', 'banner', '双十一福利'],
    ['各个分省/A 省/切图/_当前/福利中心切图/单页/2-签到/签到.png', 'A', 'grid', '每日签到'], ['各个分省/A 省/切图/_历史/20260805_A 省切图/单页/1-头图/头图.png', 'K', 'banner', '夏日福利'],
    [`各个分省/A 省/弹窗/_历史/${D.addDays(day(3), -365).replace(/-/g, '')}_双十一抽奖弹窗/中奖弹窗.png`, 'L', 'pop', '去年 · 中奖'], [`各个分省/A 省/弹窗/_历史/${D.addDays(day(3), -365).replace(/-/g, '')}_双十一抽奖弹窗/转盘.png`, 'L', 'wheel', '去年 · 转盘'],
    ['各个分省/B 省/弹窗/_当前/签到改版弹窗/补签卡.png', 'B', 'pop', '补签卡'], ['各个分省/B 省/弹窗/_当前/签到改版弹窗/连签奖励.png', 'B', 'pop', '连签 7 天'],
    ['各个分省/B 省/切图/_当前/积分商城/头图.png', 'B', 'banner', '积分商城'], ['各个分省/B 省/切图/_当前/积分商城/商品格.png', 'B', 'grid', '兑换专区'],
    ['各个分省/C 省/切图/_当前/福利中心切图/头图.png', 'C', 'banner', '会员福利'], ['各个分省/C 省/弹窗/_当前/领取弹窗/领取成功.png', 'C', 'pop', '领取成功'],
    ['长图物料/20260728_各省福利中心长图/A 省.png', 'A', 'long', 'A 省福利中心'], ['长图物料/20260728_各省福利中心长图/B 省.png', 'B', 'long', 'B 省福利中心'],
    ['_通用/主KV/双十一主KV.png', 'K', 'kv', '双十一'], ['_通用/主KV/国庆主KV.png', 'L', 'kv', '国庆'],
    ['各个分省/C 省/弹窗/_当前/领取弹窗 2/领取成功.png', 'C', 'pop', '领取成功']   // 和上面那张一样：演示「重复的折成一张」
  ];
  async function drawImage([, theme, kind, text]) {
    const [c1, c2] = THEMES[theme];
    const W = kind === 'banner' ? 750 : kind === 'kv' ? 900 : 600, H = kind === 'banner' ? 320 : kind === 'long' ? 2000 : kind === 'kv' ? 600 : 800;
    const cv = new OffscreenCanvas(W, H), g = cv.getContext('2d');
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.14)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc((i * 173) % W, (i * 311) % H, 40 + i * 18, 0, 7); g.fill(); }
    const rr = (x, y, w, h, r, fill) => { g.fillStyle = fill; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const font = (px, w = 700) => `${w} ${px}px -apple-system, "PingFang SC", sans-serif`;
    if (kind === 'pop') { rr(W * .12, H * .18, W * .76, H * .56, 36, '#fff'); g.fillStyle = c1; g.font = font(54); g.fillText(text, W / 2, H * .36); g.fillStyle = '#999'; g.font = font(26, 500); g.fillText('示例弹窗 · 奖品以页面为准', W / 2, H * .5); rr(W * .28, H * .62, W * .44, 72, 36, c1); g.fillStyle = '#fff'; g.font = font(30); g.fillText('开心收下', W / 2, H * .62 + 36); }
    else if (kind === 'wheel') { const cx = W / 2, cy = H * .48, R = W * .36; for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#fff' : '#ffe4a8'; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, i * Math.PI / 4, (i + 1) * Math.PI / 4); g.fill(); } g.fillStyle = c1; g.beginPath(); g.arc(cx, cy, 64, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = font(30); g.fillText('抽奖', cx, cy); g.font = font(44); g.fillText(text, cx, H * .88); }
    else if (kind === 'banner' || kind === 'kv') { g.fillStyle = '#fff'; g.font = font(kind === 'kv' ? 110 : 72); g.fillText(text, W / 2, H * .42); g.font = font(kind === 'kv' ? 34 : 26, 500); g.fillText('示例活动 · 虚构素材', W / 2, H * .66); }
    else if (kind === 'grid') { g.fillStyle = '#fff'; g.font = font(50); g.fillText(text, W / 2, 90); for (let i = 0; i < 6; i++) rr(40 + (i % 3) * 180, 170 + Math.floor(i / 3) * 280, 160, 250, 24, 'rgba(255,255,255,.9)'); }
    else { g.fillStyle = '#fff'; g.font = font(64); g.fillText(text, W / 2, 160); for (let i = 0; i < 5; i++) rr(50, 300 + i * 330, W - 100, 280, 30, 'rgba(255,255,255,.88)'); }
    return cv.convertToBlob({ type: 'image/png' });
  }
  async function demoAssets() {
    if (!D.assets?.supported) return;
    const A = D.assets;
    if (A.root) return;   // 已经接上过（刷新后 assets.js 会自己恢复）
    try {
      const root = await navigator.storage.getDirectory();
      const base = await root.getDirectoryHandle('示例素材', { create: true });
      let made = false;
      for (const img of IMAGES) {
        const segs = img[0].split('/'); let d = base;
        for (const s of segs.slice(0, -1)) d = await d.getDirectoryHandle(s, { create: true });
        // 已经画好的跳过；0 字节的是上次画到一半页面就刷新了留下的空文件，要重画
        try { if ((await (await d.getFileHandle(segs.at(-1))).getFile()).size > 0) continue; } catch { /* 还没画 */ }
        const fh = await d.getFileHandle(segs.at(-1), { create: true }), w = await fh.createWritable();
        await w.write(await drawImage(img)); await w.close(); made = true;
      }
      await A.connect(base, { silent: true });
      if (made) D.render();
    } catch { /* 浏览器不让写私有存储：素材库就不显示演示图 */ }
  }

  /* ================= 顶部提示条 ================= */
  function bar() {
    if (D.$('.demo-bar')) return;
    const el = document.createElement('div');
    el.className = 'demo-bar'; el.setAttribute('role', 'note');
    el.innerHTML = `<span class="db-tag">演示</span><span class="db-t">数据全是虚构的，可以随便点、随便改——改动只存在你这个浏览器里。</span>
      <span class="db-skins" role="group" aria-label="换个风格">${[['classic', '经典'], ['precise', '精密'], ['glass', '玻璃']].map(([k, t]) => `<button type="button" data-skin-set="${k}">${t}</button>`).join('')}</span>
      <button type="button" class="db-btn" data-demo-reset>重置</button><a class="db-btn" href="/workbench">看设计说明</a>`;
    D.$('.mainwrap').prepend(el);
    syncBar();
  }
  const syncBar = () => D.$$('.demo-bar [data-skin-set]').forEach(b => b.classList.toggle('on', b.dataset.skinSet === window.DESK_THEME?.getSkin()));

  document.addEventListener('click', async e => {
    if (e.target.closest('[data-demo-reset]')) {
      if (!(await D.confirm('把演示数据恢复成最初的样子？你在演示里做的改动会清掉（真实工作台不受任何影响）。', '重置', { danger: false }))) return;
      D.demoReset();
    }
  });
  D.on('ready', () => { bar(); demoAssets(); });
  D.on('skin', syncBar);
  document.addEventListener('DOMContentLoaded', () => { document.title = '我的工作台 · 演示'; });
})();
