/* KOL 工作台 · 视图模型：列定义、筛选、分组、排序、视图配置（内置视图存 localStorage，自定义视图存 D1）、URL hash。 */
(() => {
  const K = window.KOL;

  /* ---------- 列 ---------- */
  // edit：status/platform/priority/country/language/category… 用彩色下拉；date 用日期框；int/num/text/email/url 点击直接编辑
  K.COLS = [
    { key: 'name', label: '名称', w: 240, fixed: true },
    { key: 'status', label: '状态', w: 150, edit: 'pick' },
    { key: 'next_step', label: '下一步', w: 190 },
    { key: 'touches', label: '已触达', w: 80, edit: 'int', num: true },
    { key: 'platform', label: '平台', w: 120, edit: 'pick' },
    { key: 'handle', label: '账号', w: 140, edit: 'text' },
    { key: 'followers', label: '粉丝量', w: 110, edit: 'int', num: true },
    { key: 'avg_views', label: '平均播放', w: 110, edit: 'int', num: true },
    { key: 'engagement_rate', label: '互动率 %', w: 90, edit: 'num', num: true },
    { key: 'country', label: '国家', w: 120, edit: 'pick' },
    { key: 'language', label: '语言', w: 100, edit: 'pick' },
    { key: 'category', label: '品类', w: 160, edit: 'multi' },
    { key: 'priority', label: '优先级', w: 90, edit: 'pick' },
    { key: 'rating', label: '初筛评级', w: 90, edit: 'pick' },
    { key: 'last_contact_at', label: '上次联系', w: 110, edit: 'date' },
    { key: 'next_followup_at', label: '下次跟进', w: 120, edit: 'date' },
    { key: 'first_contact_at', label: '首次联系', w: 110, edit: 'date' },
    { key: 'email', label: '邮箱', w: 200, edit: 'email' },
    { key: 'contact_other', label: '其他联系方式', w: 180, edit: 'text' },
    { key: 'quote', label: '报价 €', w: 100, edit: 'num', num: true },
    { key: 'coop_type', label: '合作方式', w: 110, edit: 'pick' },
    { key: 'source', label: '来源', w: 110, edit: 'pick' },
    { key: 'can_sell', label: '带货权限', w: 90, edit: 'pick' },
    { key: 'crm_synced', label: '已录入 CRM', w: 100, edit: 'bool' },
    { key: 'tags', label: '标签', w: 160, edit: 'tags' },
    { key: 'blocker', label: '卡点', w: 180, edit: 'text' },
    { key: 'notes', label: '备注', w: 220, edit: 'text' },
    { key: 'created_at', label: '录入时间', w: 110 }
  ];
  K.col = key => K.COLS.find(c => c.key === key);
  K.DEFAULT_COLS = ['name', 'status', 'platform', 'followers', 'country', 'language', 'priority', 'last_contact_at', 'next_followup_at'];

  // 单元格显示（全部转义）
  K.cellHtml = (k, key) => {
    const v = k[key];
    switch (key) {
      case 'status': return K.statusChip(v);
      case 'platform': return K.platformChip(v);
      case 'priority': return K.prioChip(k);
      case 'next_step': { const s = K.nextStep(k); return `<span class="step ${s.cls || ''}">${K.esc(s.text)}</span>`; }
      case 'touches': return v ? K.esc(v + ' 次') : '';
      case 'country': return K.countryLabel(v);
      case 'language': return K.esc(K.langName(v));
      case 'category': case 'tags': return (v || []).map(x => `<span class="tag">${K.esc(x)}</span>`).join('');
      case 'followers': case 'avg_views': return K.esc(K.fmtInt(v));
      case 'engagement_rate': return v == null ? '' : K.esc(v + '%');
      case 'quote': return K.esc(K.eur(v));
      case 'next_followup_at': {
        if (!v) return '';
        const r = K.relFollow(v);
        return `<span class="due ${r.cls}" title="${K.esc(v)}">${K.esc(r.text)}</span>`;
      }
      case 'last_contact_at': case 'first_contact_at': return v ? `<span title="${K.esc(v)}">${K.esc(K.fmtDate(v))}</span>` : '';
      case 'created_at': return K.esc((v || '').slice(0, 10));
      case 'crm_synced': return v ? '<span class="yes">✓ 已录入</span>' : '';
      case 'can_sell': case 'promoted_similar': return K.esc((K.YNU.find(x => x.key === v) || {}).label || '');
      case 'rating': return v ? `<span class="rating r-${K.esc(v)}">${K.esc(v)}</span>` : '';
      case 'email': return v ? `<span class="mono">${K.esc(v)}</span>` : '';
      default: return K.esc(v ?? '');
    }
  };
  // 导出 / 排序用的纯文本
  K.cellText = (k, key) => {
    const v = k[key];
    switch (key) {
      case 'status': return K.statusOf(v).label;
      case 'priority': { const p = K.prio(k); return (K.priorityOf(p.key)?.label || '') + (p.key && p.auto ? '（建议）' : ''); }
      case 'next_step': return K.nextStep(k).text;
      case 'country': return v ? K.countryName(v) : '';
      case 'language': return v ? K.langName(v) : '';
      case 'category': case 'tags': return (v || []).join('、');
      case 'crm_synced': case 'do_not_contact': return v ? '是' : '否';
      case 'can_sell': case 'promoted_similar': return (K.YNU.find(x => x.key === v) || {}).label || '';
      default: return v ?? '';
    }
  };

  /* ---------- 筛选 ---------- */
  K.FILTERS = [
    { key: 'status', label: '状态', multi: true },
    { key: 'platform', label: '平台', multi: true },
    { key: 'country', label: '国家', multi: true },
    { key: 'language', label: '语言', multi: true },
    { key: 'priority', label: '优先级', multi: true },
    { key: 'category', label: '品类', multi: true },
    { key: 'followers', label: '粉丝量', options: [['lt10k', '< 1 万'], ['10k-100k', '1–10 万'], ['100k-500k', '10–50 万'], ['gt500k', '50 万+']] },
    { key: 'followup', label: '下次跟进', options: [['today', '今天'], ['week', '本周'], ['overdue', '逾期'], ['none', '未设置']] },
    { key: 'crm', label: 'CRM', options: [['yes', '已录入'], ['no', '未录入']] },
    { key: 'email', label: '邮箱', options: [['yes', '有邮箱'], ['no', '没有邮箱']] }
  ];
  K.filterOptions = key => {
    const f = K.FILTERS.find(x => x.key === key);
    if (f.options) return f.options.map(([value, label]) => ({ value, label }));
    return K.optionsFor(key);
  };
  K.filterLabel = (key, val) => {
    const f = K.FILTERS.find(x => x.key === key);
    if (key === 'followers' && /^c:/.test(val)) {
      const [a, b] = val.slice(2).split('-');
      return `${a ? K.fmtCompact(a) : '0'} – ${b ? K.fmtCompact(b) : '不限'}`;
    }
    if (f.options) return (f.options.find(o => o[0] === val) || [, val])[1];
    if (key === 'status') return K.statusOf(val).label;
    if (key === 'priority') return K.priorityOf(val)?.label || val;
    if (key === 'country') return K.countryName(val);
    if (key === 'language') return K.langName(val);
    return val;
  };

  const followersIn = (n, v) => {
    if (n == null) return false;
    if (/^c:/.test(v)) { const [a, b] = v.slice(2).split('-'); return (!a || n >= +a) && (!b || n <= +b); }
    return { lt10k: n < 1e4, '10k-100k': n >= 1e4 && n < 1e5, '100k-500k': n >= 1e5 && n < 5e5, gt500k: n >= 5e5 }[v];
  };

  // 内置视图自带的基础条件（不显示成筛选标签）
  K.BASE = {
    today: k => k.next_followup_at && k.next_followup_at <= K.today() && !['paused', 'won'].includes(k.status) && !k.do_not_contact,   // 长期合作也要按 30 天回访
    stale: k => {
      if (!k.last_contact_at || ['paused', 'won'].includes(k.status) || k.do_not_contact) return false;
      return K.diffDays(K.today(), k.last_contact_at) > Number(K.cfg().overdue_days || 7);
    }
  };

  K.matchSearch = (k, q) => {
    if (!q) return true;
    const hay = [k.name, k.handle, k.email, k.notes, k.contact_other, (k.tags || []).join(' ')].join('\n').toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w));
  };

  K.applyFilters = (kols, view, q = '') => {
    const f = view.cfg.filters || {};
    const base = K.BASE[view.base];
    const [w0, w1] = K.weekRange(), today = K.today();
    return kols.filter(k => {
      if (base && !base(k)) return false;
      if (!K.matchSearch(k, q)) return false;
      for (const key of ['status', 'platform', 'country', 'language']) {
        if (f[key]?.length && !f[key].includes(k[key] ?? '')) return false;
      }
      if (f.priority?.length && !f.priority.includes(K.prio(k).key ?? '')) return false;   // 没手动设的按自动建议算
      if (f.category?.length && !(k.category || []).some(c => f.category.includes(c))) return false;
      if (f.followers && !followersIn(k.followers, f.followers)) return false;
      if (f.followup) {
        const d = k.next_followup_at;
        const ok = { today: d === today, week: d && d >= w0 && d <= w1, overdue: d && d < today, none: !d }[f.followup];
        if (!ok) return false;
      }
      if (f.crm && (f.crm === 'yes') !== !!k.crm_synced) return false;
      if (f.email && (f.email === 'yes') !== !!k.email) return false;
      return true;
    });
  };

  /* ---------- 排序 ---------- */
  const order = (key, v) => {
    if (key === 'status') return K.cfg().statuses.findIndex(s => s.key === v);
    if (key === 'priority') { const i = K.PRIORITIES.findIndex(p => p.key === v); return i < 0 ? 9 : i; }
    if (key === 'country') { const i = K.cfg().countries.findIndex(c => c.code === v); return i < 0 ? 999 : i; }
    return v;
  };
  K.sortKols = (list, sort) => {
    if (!sort?.key) return list;
    const dir = sort.dir === 'desc' ? -1 : 1, key = sort.key;
    const empty = v => v == null || v === '' || (Array.isArray(v) && !v.length);
    const val = (k, key) => key === 'priority' ? K.prio(k).key : key === 'next_step' ? K.nextStep(k).text : k[key];
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
  K.GROUPS = [
    { key: 'none', label: '不分组' }, { key: 'status', label: '状态' }, { key: 'platform', label: '平台' },
    { key: 'country', label: '国家' }, { key: 'language', label: '语言' }, { key: 'priority', label: '优先级' }, { key: 'category', label: '品类' }
  ];
  K.groupKols = (list, by) => {
    if (!by || by === 'none') return [{ key: '__all', value: null, items: list }];
    const map = new Map();
    for (const k of list) {
      const v = by === 'category' ? (k.category || [])[0] ?? '' : by === 'priority' ? K.prio(k).key ?? '' : k[by] ?? '';
      if (!map.has(v)) map.set(v, []);
      map.get(v).push(k);
    }
    // 状态分组即使为空也显示（方便往里加人）；其余只显示有数据的组
    let keys;
    const c = K.cfg();
    if (by === 'status') keys = c.statuses.map(s => s.key);
    else if (by === 'priority') keys = [...K.PRIORITIES.map(p => p.key), ''].filter(v => map.has(v));
    else if (by === 'country') keys = [...c.countries.map(x => x.code).filter(v => map.has(v)), ...[...map.keys()].filter(v => v && !c.countries.some(x => x.code === v)), ''].filter(v => map.has(v));
    else keys = [...map.keys()].filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), 'zh-CN')).concat(map.has('') ? [''] : []);
    return keys.map(v => ({ key: by + ':' + v, value: v, items: map.get(v) || [] }));
  };
  K.groupTitle = (by, v) => {
    if (v === '' || v == null) return `<span class="muted">未填写</span>`;
    switch (by) {
      case 'status': return K.statusChip(v);
      case 'platform': return K.platformChip(v);
      case 'priority': return K.priorityChip(v);
      case 'country': return K.countryLabel(v);
      case 'language': return K.esc(K.langName(v));
      default: return `<span class="tag">${K.esc(v)}</span>`;
    }
  };

  /* ---------- 视图 ---------- */
  K.BUILTIN = [
    { id: 'welcome', kind: 'welcome', name: '欢迎', icon: '👋' },
    { id: 'today', kind: 'list', name: '今日待跟进', icon: '✅', base: 'today', followBtn: true,
      def: { group: 'none', sort: { key: 'next_followup_at', dir: 'asc' }, cols: ['name', 'status', 'next_step', 'next_followup_at', 'touches', 'platform', 'followers', 'country', 'priority'] } },
    { id: 'stale', kind: 'list', name: '超期未联系', icon: '⚠️', base: 'stale', followBtn: true,
      def: { group: 'status', sort: { key: 'last_contact_at', dir: 'asc' }, cols: ['name', 'status', 'last_contact_at', 'next_followup_at', 'platform', 'followers', 'country', 'language', 'priority'] } },
    { id: 'all', kind: 'list', name: '所有 KOL', icon: '👥', def: { group: 'status', sort: { key: 'name', dir: 'asc' } } },
    { id: 'board', kind: 'board', name: 'KOL 看板', icon: '🗂️', def: {} },
    { id: 'fix', kind: 'quality', name: '待补全', icon: '🧩' },
    { id: 'deals', kind: 'deals', name: '带货与分成', icon: '💶' },
    { id: 'finder', kind: 'finder', name: '找人助手', icon: '🔍' },
    { id: 'templates', kind: 'templates', name: '邮件模板', icon: '✉️' }
  ];
  const cfgCache = {};
  const CFG_VERSION = 2;   // 内置视图默认列变了就 +1
  K.resetViewCfg = id => { delete cfgCache[id]; };
  const freshCfg = def => ({ filters: {}, group: 'status', sort: null, cols: [...K.DEFAULT_COLS], widths: {}, collapsed: {}, ...(def ? JSON.parse(JSON.stringify(def)) : {}) });

  K.allViews = () => {
    const custom = K.state.views.map(v => {
      let cfg = {}; try { cfg = JSON.parse(v.config || '{}'); } catch { /* 坏配置按空处理 */ }
      return { id: 'v' + v.id, dbId: v.id, kind: v.type, name: v.name, icon: v.icon || (v.type === 'board' ? '🗂️' : '📋'), custom: true, def: cfg };
    });
    const all = [...K.BUILTIN, ...custom];
    const ord = K.cfg().view_order;
    if (Array.isArray(ord)) all.sort((a, b) => (ord.indexOf(a.id) + 1 || 999) - (ord.indexOf(b.id) + 1 || 999));
    return all;
  };
  K.viewById = id => K.allViews().find(v => v.id === id);

  // 取视图当前配置：内置视图 = 默认 + localStorage 覆盖；自定义视图 = D1 里保存的配置
  K.viewCfg = view => {
    if (!['list', 'board'].includes(view.kind)) return null;
    if (cfgCache[view.id]) return cfgCache[view.id];
    const base = freshCfg(view.def);
    const saved = view.custom ? {} : K.pref.get('view.' + view.id, {});
    if (!view.custom && saved.cfgv !== CFG_VERSION) { delete saved.cols; delete saved.widths; }
    const cfg = cfgCache[view.id] = { ...base, ...saved };
    if (!cfg.cols?.includes('name')) cfg.cols = ['name', ...(cfg.cols || [])];
    return cfg;
  };
  const saveCustom = K.debounce(async (view, cfg) => {
    try { await K.api('PATCH', `/views/${view.dbId}`, { config: JSON.stringify(cfg) }); const v = K.state.views.find(x => x.id === view.dbId); if (v) v.config = JSON.stringify(cfg); }
    catch (e) { K.fail(e); }
  }, 600);
  K.saveViewCfg = view => {
    const cfg = cfgCache[view.id];
    if (view.custom) saveCustom(view, cfg); else K.pref.set('view.' + view.id, { ...cfg, cfgv: CFG_VERSION });
  };

  /* ---------- URL hash：#<视图>?country=DE,FR&q=… ---------- */
  K.readHash = () => {
    const h = decodeURIComponent(location.hash.slice(1));
    const [id, qs = ''] = h.split('?');
    const params = new URLSearchParams(qs);
    const filters = {}; let q = '';
    for (const [k, v] of params) {
      if (k === 'q') { q = v; continue; }
      const f = K.FILTERS.find(x => x.key === k);
      if (!f) continue;
      filters[k] = f.multi ? v.split(',').filter(Boolean) : v;
    }
    return { id, filters, q, hasFilters: [...params.keys()].some(k => k !== 'q') };
  };
  K.writeHash = (view, q) => {
    const p = new URLSearchParams();
    const f = view.cfg?.filters || {};
    for (const x of K.FILTERS) {
      const v = f[x.key];
      if (Array.isArray(v) ? v.length : v) p.set(x.key, Array.isArray(v) ? v.join(',') : v);
    }
    if (q) p.set('q', q);
    const s = p.toString();
    const hash = '#' + view.id + (s ? '?' + s : '');
    if (location.hash !== hash) history.replaceState(null, '', hash);
  };
})();
