/* 我的工作台 · 项目视图模型：列定义、筛选、分组、排序、视图配置（内置视图存 localStorage，自定义视图存 D1）、URL hash。
   写法照 /kol 的 model.js。 */
(() => {
  const D = window.DESK;

  /* ---------- 列 ---------- */
  // edit：pick 彩色下拉 / multi 多选 / date 日期 / month 月份 / text 点击直接改
  D.COLS = [
    { key: 'title', label: '项目名', w: 260, fixed: true, edit: 'text' },   // 点名字打开抽屉；点 ✎ 原地改名
    { key: 'kind', label: '类型', w: 120, edit: 'pick' },
    { key: 'province', label: '省份', w: 112, edit: 'pick' },
    { key: 'status', label: '状态', w: 110, edit: 'pick' },
    { key: 'priority', label: '优先级', w: 80, edit: 'pick' },
    { key: 'launch_at', label: '上线日', w: 110, edit: 'date' },
    { key: 'due_at', label: '截止日', w: 110, edit: 'date' },
    { key: 'next_action', label: '下一步', w: 220, edit: 'text' },
    { key: 'pendings', label: '待确认', w: 80, num: true },
    { key: 'progress', label: '交付物', w: 80, num: true },
    { key: 'last_ai', label: '最近经手', w: 150, edit: 'multi' },
    { key: 'requester', label: '需求方', w: 120, edit: 'text' },
    { key: 'month', label: '所属月份', w: 100, edit: 'month' },
    { key: 'summary', label: '一句话需求', w: 240, edit: 'text' },
    { key: 'tags', label: '标签', w: 140, edit: 'tags' },
    { key: 'notes', label: '备注', w: 200, edit: 'text' },
    { key: 'updated_at', label: '更新时间', w: 110 }
  ];
  D.col = key => D.COLS.find(c => c.key === key);
  D.DEFAULT_COLS = ['title', 'kind', 'province', 'status', 'launch_at', 'due_at', 'next_action', 'pendings', 'progress', 'last_ai'];

  const live = p => !D.LIVE_OUT.includes(p.status);
  // 单元格显示（全部转义）
  D.cellHtml = (p, key) => {
    const v = p[key];
    switch (key) {
      case 'status': return D.statusChip(v);
      case 'kind': return D.kindChip(v);
      case 'province': return D.provChip(v);
      case 'priority': return D.priorityChip(v);
      case 'launch_at': case 'due_at': {
        if (!v) return '';
        const r = D.rel(v, { past: live(p) && !(key === 'launch_at' && ['live', 'done'].includes(p.status)) });
        return `<span class="due ${r.cls}" title="${D.esc(D.fmtDateW(v))}">${D.esc(r.text)}</span>`;
      }
      case 'pendings': {
        const w = D.waitingOf(p.id); if (!w.length) return '';
        const block = w.some(x => x.blocking);
        return `<span class="cnt${block ? ' block' : ''}" title="${block ? '有卡交付的待确认' : '等待中的待确认'}">${w.length}</span>`;
      }
      case 'progress': { const g = D.progressOf(p.id); return g.total ? `<span class="prog${g.done === g.total ? ' full' : ''}">${g.done}/${g.total}</span>` : ''; }
      case 'last_ai': case 'tags': return (v || []).map(x => `<span class="tag">${D.esc(x)}</span>`).join('');
      case 'updated_at': return D.esc(D.isoToShDate(v));
      default: return D.esc(v ?? '');
    }
  };
  // 导出 / 排序用的纯文本
  D.cellText = (p, key) => {
    const v = p[key];
    switch (key) {
      case 'status': return D.statusOf(v).label;
      case 'priority': return D.priorityOf(v)?.label || '';
      case 'pendings': return D.waitingOf(p.id).length || '';
      case 'progress': { const g = D.progressOf(p.id); return g.total ? `${g.done}/${g.total}` : ''; }
      case 'last_ai': case 'tags': return (v || []).join('、');
      case 'links': return (v || []).map(l => `${l.label || ''} ${l.url}`.trim()).join('\n');
      case 'local_paths': return (v || []).join('\n');
      case 'updated_at': case 'created_at': return D.isoToShDate(v);
      default: return v ?? '';
    }
  };

  /* ---------- 筛选 ---------- */
  D.FILTERS = [
    { key: 'kind', label: '类型', multi: true },
    { key: 'province', label: '省份', multi: true },
    { key: 'status', label: '状态', multi: true },
    { key: 'priority', label: '优先级', multi: true },
    { key: 'last_ai', label: '最近经手', multi: true },
    { key: 'launch', label: '上线日', options: [['week', '本周'], ['month', '本月'], ['past', '已过'], ['none', '未设置']] },
    { key: 'blocking', label: '卡交付', options: [['yes', '有卡交付的待确认'], ['no', '没有']] },
    { key: 'archived', label: '归档', options: [['show', '包含已归档'], ['only', '只看已归档']] }
  ];
  D.filterOptions = key => {
    const f = D.FILTERS.find(x => x.key === key);
    if (f.options) return f.options.map(([value, label]) => ({ value, label }));
    return D.optionsFor(key);
  };
  D.filterLabel = (key, val) => {
    const f = D.FILTERS.find(x => x.key === key);
    if (f.options) return (f.options.find(o => o[0] === val) || [, val])[1];
    if (key === 'status') return D.statusOf(val).label;
    if (key === 'priority') return D.priorityOf(val)?.label || val;
    return val;
  };

  D.matchSearch = (p, q) => {
    if (!q) return true;
    const hay = [p.title, p.summary, p.next_action, p.notes, p.requester, p.province, (p.tags || []).join(' '),
      ...D.pendingsOf(p.id).map(x => x.question)].join('\n').toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w));
  };

  D.applyFilters = (list, view, q = '') => {
    const f = view.cfg.filters || {};
    const [w0, w1] = D.weekRange(), today = D.today(), m = D.thisMonth();
    return list.filter(p => {
      if (f.archived === 'only' ? !p.archived_at : f.archived !== 'show' && p.archived_at) return false;
      if (!D.matchSearch(p, q)) return false;
      for (const key of ['kind', 'province', 'status', 'priority']) {
        if (f[key]?.length && !f[key].includes(p[key] ?? '')) return false;
      }
      if (f.last_ai?.length && !(p.last_ai || []).some(x => f.last_ai.includes(x))) return false;
      if (f.launch) {
        const d = p.launch_at;
        const ok = { week: d && d >= w0 && d <= w1, month: d && d.slice(0, 7) === m, past: d && d < today, none: !d }[f.launch];
        if (!ok) return false;
      }
      if (f.blocking && (f.blocking === 'yes') !== D.waitingOf(p.id).some(x => x.blocking)) return false;
      return true;
    });
  };

  /* ---------- 排序 ---------- */
  const order = (key, v) => {
    if (key === 'status') return D.cfg().statuses.findIndex(s => s.key === v);
    if (key === 'priority') { const i = D.PRIORITIES.findIndex(p => p.key === v); return i < 0 ? 9 : i; }
    if (key === 'kind') { const i = D.cfg().kinds.findIndex(k => k.name === v); return i < 0 ? 99 : i; }
    if (key === 'province') { const i = D.cfg().provinces.indexOf(v); return i < 0 ? 99 : i; }
    return v;
  };
  const val = (p, key) => key === 'pendings' ? D.waitingOf(p.id).length || null : key === 'progress' ? (D.progressOf(p.id).total ? D.progressOf(p.id).done / D.progressOf(p.id).total : null) : p[key];
  D.sortProjects = (list, sort) => {
    if (!sort?.key) return list;
    const dir = sort.dir === 'desc' ? -1 : 1, key = sort.key;
    const empty = v => v == null || v === '' || (Array.isArray(v) && !v.length);
    return [...list].sort((a, b) => {
      const x = val(a, key), y = val(b, key);
      if (empty(x) && empty(y)) return a.id - b.id;
      if (empty(x)) return 1;   // 空值永远排最后
      if (empty(y)) return -1;
      let ox = order(key, x), oy = order(key, y);
      if (Array.isArray(ox)) { ox = ox.join(); oy = oy.join(); }
      const c = typeof ox === 'number' && typeof oy === 'number' ? ox - oy : String(ox).localeCompare(String(oy), 'zh-CN');
      return c * dir || a.id - b.id;
    });
  };

  /* ---------- 分组 ---------- */
  D.GROUPS = [{ key: 'none', label: '不分组' }, { key: 'status', label: '状态' }, { key: 'kind', label: '类型' }, { key: 'province', label: '省份' }, { key: 'priority', label: '优先级' }];
  D.groupProjects = (list, by) => {
    if (!by || by === 'none') return [{ key: '__all', value: null, items: list }];
    const map = new Map();
    for (const p of list) { const v = p[by] ?? ''; if (!map.has(v)) map.set(v, []); map.get(v).push(p); }
    const c = D.cfg();
    let keys;
    // 状态、类型分组即使为空也显示（方便往里加项目）；其余只显示有数据的组
    if (by === 'status') keys = c.statuses.map(s => s.key);
    else if (by === 'kind') keys = [...c.kinds.map(k => k.name), ...[...map.keys()].filter(v => v && !c.kinds.some(k => k.name === v))].concat(map.has('') ? [''] : []);
    else if (by === 'priority') keys = [...D.PRIORITIES.map(p => p.key), ''].filter(v => map.has(v));
    else if (by === 'province') keys = [...c.provinces.filter(v => map.has(v)), ...[...map.keys()].filter(v => v && !c.provinces.includes(v)), ''].filter(v => map.has(v));
    else keys = [...map.keys()];
    return keys.map(v => ({ key: by + ':' + v, value: v, items: map.get(v) || [] }));
  };
  D.groupTitle = (by, v) => {
    if (v === '' || v == null) return `<span class="muted">${by === 'province' ? '全国 / 未填省份' : '未填写'}</span>`;
    switch (by) {
      case 'status': return D.statusChip(v);
      case 'kind': return D.kindChip(v);
      case 'priority': return D.priorityChip(v);
      default: return `<span class="tag">${D.esc(v)}</span>`;
    }
  };

  /* ---------- 视图 ---------- */
  D.BUILTIN = [
    { id: 'today', kind: 'today', name: '今天', icon: '☀️' },
    { id: 'projects', kind: 'list', name: '项目', icon: '📋', def: { group: 'status', sort: { key: 'launch_at', dir: 'asc' } } },
    { id: 'board', kind: 'board', name: '看板', icon: '🗂️', def: {} },
    { id: 'timeline', kind: 'timeline', name: '时间线', icon: '📅' },
    { id: 'waiting', kind: 'waiting', name: '在等谁', icon: '⏳' },
    { id: 'inbox', kind: 'inbox', name: '收集箱', icon: '📥' },
    { id: 'ideas', kind: 'ideas', name: '玩法创意', icon: '💡' },
    { id: 'wins', kind: 'wins', name: '提效记录', icon: '📈' },
    { id: 'links', kind: 'links', name: '快捷入口', icon: '🔗' }
  ];
  const cfgCache = {};
  const CFG_VERSION = 1;   // 内置视图默认列变了就 +1
  D.resetViewCfg = id => { delete cfgCache[id]; };
  const freshCfg = def => ({ filters: {}, group: 'status', sort: null, cols: [...D.DEFAULT_COLS], widths: {}, collapsed: {}, ...(def ? JSON.parse(JSON.stringify(def)) : {}) });

  D.allViews = () => {
    const custom = D.state.views.map(v => {
      let cfg = {}; try { cfg = JSON.parse(v.config || '{}'); } catch { /* 坏配置按空处理 */ }
      return { id: 'v' + v.id, dbId: v.id, kind: v.type, name: v.name, icon: v.icon || (v.type === 'board' ? '🗂️' : '📋'), custom: true, def: cfg };
    });
    const all = [...D.BUILTIN, ...custom];
    const ord = D.cfg().view_order;
    if (Array.isArray(ord)) all.sort((a, b) => (ord.indexOf(a.id) + 1 || 999) - (ord.indexOf(b.id) + 1 || 999));
    return all;
  };
  D.viewById = id => D.allViews().find(v => v.id === id);

  // 取视图当前配置：内置视图 = 默认 + localStorage 覆盖；自定义视图 = D1 里保存的配置
  D.viewCfg = view => {
    if (!['list', 'board'].includes(view.kind)) return null;
    if (cfgCache[view.id]) return cfgCache[view.id];
    const base = freshCfg(view.def);
    const saved = view.custom ? {} : D.pref.get('view.' + view.id, {});
    if (!view.custom && saved.cfgv !== CFG_VERSION) { delete saved.cols; delete saved.widths; }
    const cfg = cfgCache[view.id] = { ...base, ...saved };
    if (!cfg.cols?.includes('title')) cfg.cols = ['title', ...(cfg.cols || [])];
    return cfg;
  };
  const saveCustom = D.debounce(async (view, cfg) => {
    try { await D.api('PATCH', `/views/${view.dbId}`, { config: JSON.stringify(cfg) }); const v = D.state.views.find(x => x.id === view.dbId); if (v) v.config = JSON.stringify(cfg); }
    catch (e) { D.fail(e); }
  }, 600);
  D.saveViewCfg = view => {
    const cfg = cfgCache[view.id];
    if (view.custom) saveCustom(view, cfg); else D.pref.set('view.' + view.id, { ...cfg, cfgv: CFG_VERSION });
  };

  /* ---------- URL hash：#<视图>?kind=…&province=…&q=… ---------- */
  D.readHash = () => {
    const h = decodeURIComponent(location.hash.slice(1));
    const [id, qs = ''] = h.split('?');
    const params = new URLSearchParams(qs);
    const filters = {}; let q = '';
    for (const [k, v] of params) {
      if (k === 'q') { q = v; continue; }
      const f = D.FILTERS.find(x => x.key === k);
      if (!f) continue;
      filters[k] = f.multi ? v.split(',').filter(Boolean) : v;
    }
    return { id, filters, q, hasFilters: [...params.keys()].some(k => k !== 'q') };
  };
  D.writeHash = (view, q) => {
    const p = new URLSearchParams();
    const f = view.cfg?.filters || {};
    for (const x of D.FILTERS) {
      const v = f[x.key];
      if (Array.isArray(v) ? v.length : v) p.set(x.key, Array.isArray(v) ? v.join(',') : v);
    }
    if (q) p.set('q', q);
    const s = p.toString();
    const hash = '#' + view.id + (s ? '?' + s : '');
    if (location.hash !== hash) history.replaceState(null, '', hash);
  };
})();
