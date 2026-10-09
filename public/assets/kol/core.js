// 必须走 https：登录凭证（Cookie）只在加密连接下保存，用 http:// 打开会「密码对了却马上又要登录」（2026-10-09 实际发生过）
if (location.protocol === 'http:' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) location.replace('https://' + location.host + location.pathname + location.search + location.hash);
/* KOL 工作台 · 核心：工具函数、默认选项、接口、提示、弹层、筛选排序。
   所有模块挂在 window.KOL 上；业务数据只从 /api/kol 读写，localStorage 只存界面偏好。 */
(() => {
  const K = window.KOL = {};

  /* ---------- 基础工具 ---------- */
  K.$ = (s, root = document) => root.querySelector(s);
  K.$$ = (s, root = document) => [...root.querySelectorAll(s)];
  K.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // 外链只放行 http(s)；其余（javascript: 等）一律不出链接
  K.safeUrl = u => { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : ''; } catch { return ''; } };
  K.link = (u, text, cls = '') => {
    const href = K.safeUrl(u);
    return href ? `<a class="${cls}" href="${K.esc(href)}" target="_blank" rel="noopener noreferrer">${K.esc(text ?? u)}</a>` : K.esc(text ?? u ?? '');
  };
  K.uid = () => Math.random().toString(36).slice(2, 10);
  K.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  /* ---------- 日期（一律本地日期 YYYY-MM-DD） ---------- */
  const pad = n => String(n).padStart(2, '0');
  K.ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  K.today = () => K.ymd(new Date());
  K.parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  K.addDays = (s, n) => { const d = K.parseDate(s); d.setDate(d.getDate() + n); return K.ymd(d); };
  K.diffDays = (a, b) => Math.round((K.parseDate(a) - K.parseDate(b)) / 864e5);   // a - b
  K.thisMonth = () => K.today().slice(0, 7);
  K.fmtDate = s => {
    if (!s) return '';
    const y = s.slice(0, 4);
    return y === K.today().slice(0, 4) ? `${Number(s.slice(5, 7))}月${Number(s.slice(8, 10))}日` : s;
  };
  // 下次跟进的相对说法：逾期 N 天 / 今天 / 明天 / N 天后
  K.relFollow = s => {
    if (!s) return { text: '', cls: '' };
    const d = K.diffDays(s, K.today());
    if (d < 0) return { text: `逾期 ${-d} 天`, cls: 'overdue' };
    if (d === 0) return { text: '今天', cls: 'today' };
    if (d === 1) return { text: '明天', cls: '' };
    return { text: K.fmtDate(s), cls: '' };
  };
  K.weekRange = () => {
    const d = new Date(); const day = (d.getDay() + 6) % 7;   // 周一 = 0
    const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
    return [K.ymd(mon), K.addDays(K.ymd(mon), 6)];
  };

  /* ---------- 数字与金额 ---------- */
  K.fmtInt = n => n == null || n === '' ? '' : Number(n).toLocaleString('en-US');
  K.fmtCompact = n => {
    if (n == null || n === '') return '';
    n = Number(n);
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return n.toLocaleString('en-US');
  };
  const eurFmt = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  K.eur = n => n == null || n === '' ? '' : eurFmt.format(Number(n));
  K.round2 = n => Math.round(Number(n) * 100) / 100;

  /* ---------- 默认选项（设置里可改，存 D1 settings 表） ---------- */
  K.DEFAULTS = {
    statuses: [
      { key: 'todo', label: '待触达', color: '#8b8f98', days: 0 },
      { key: 'contacted', label: '已联系/等回复', color: '#2f7cf6', days: 5 },
      { key: 'talking', label: '沟通中', color: '#f2c200', days: 3 },
      { key: 'sampled', label: '已寄样/待出内容', color: '#f5822a', days: 7 },
      { key: 'published', label: '内容已发布', color: '#8b5cf6', days: 14 },
      { key: 'won', label: '已成交', color: '#1aa35a', days: 30 },
      { key: 'partner', label: '长期合作', color: '#0f9fa8', days: 30 },
      { key: 'paused', label: '暂不跟进', color: '#111111', days: 0 }
    ],
    platforms: [
      { name: 'YouTube', color: '#ff1f1f' }, { name: 'TikTok', color: '#3fc3d0' }, { name: 'Instagram', color: '#d62976' },
      { name: 'X', color: '#222222' }, { name: 'Twitch', color: '#9146ff' }, { name: 'Discord', color: '#5865f2' },
      { name: 'Telegram', color: '#2aabee' }, { name: 'Reddit', color: '#ff4500' }, { name: '其他', color: '#8a8f98' }
    ],
    countries: [
      ['DE', '德国'], ['GB', '英国'], ['FR', '法国'], ['IT', '意大利'], ['ES', '西班牙'], ['NL', '荷兰'], ['BE', '比利时'],
      ['AT', '奥地利'], ['CH', '瑞士'], ['PL', '波兰'], ['SE', '瑞典'], ['NO', '挪威'], ['DK', '丹麦'], ['FI', '芬兰'],
      ['IE', '爱尔兰'], ['PT', '葡萄牙'], ['CZ', '捷克'], ['SK', '斯洛伐克'], ['HU', '匈牙利'], ['RO', '罗马尼亚'],
      ['GR', '希腊'], ['HR', '克罗地亚'], ['SI', '斯洛文尼亚'], ['LU', '卢森堡'], ['UA', '乌克兰'], ['TR', '土耳其'],
      ['US', '美国'], ['CA', '加拿大'], ['AU', '澳大利亚'], ['NZ', '新西兰'], ['JP', '日本'], ['KR', '韩国'],
      ['CN', '中国'], ['HK', '中国香港'], ['TW', '中国台湾'], ['SG', '新加坡'], ['IN', '印度'], ['AE', '阿联酋'],
      ['BR', '巴西'], ['MX', '墨西哥']
    ].map(([code, name]) => ({ code, name })),
    languages: [
      ['en', '英语'], ['de', '德语'], ['fr', '法语'], ['es', '西班牙语'], ['it', '意大利语'], ['nl', '荷兰语'], ['pl', '波兰语'],
      ['pt', '葡萄牙语'], ['sv', '瑞典语'], ['da', '丹麦语'], ['no', '挪威语'], ['fi', '芬兰语'], ['cs', '捷克语'],
      ['sk', '斯洛伐克语'], ['hu', '匈牙利语'], ['ro', '罗马尼亚语'], ['el', '希腊语'], ['tr', '土耳其语'], ['uk', '乌克兰语'],
      ['ja', '日语'], ['ko', '韩语'], ['zh', '中文']
    ].map(([code, name]) => ({ code, name })),
    // 赛道与合作模式沿用 2026-09-28「KOL总表模板」定的那套（导入时 Racing / F1 → 赛车模拟 等自动归类，见 io.js）
    categories: ['赛车模拟', '飞行模拟', '模拟器', 'VR 游戏', '硬件测评', '游戏综合', '其他'],
    coop_types: ['未明确', '佣金分销', '付费推广', '寄样置换', '混合'],
    sources: ['自己找的', 'CRM 公海', '推荐', '对方主动'],
    overdue_days: 7,
    profile: { my_name: '', company: '', product: '', product_link: '' },
    view_order: null
  };
  K.PRIORITIES = [
    { key: 'high', label: '高', color: '#e5484d' }, { key: 'mid', label: '中', color: '#f59e0b' }, { key: 'low', label: '低', color: '#64748b' }
  ];
  K.ACT_TYPES = [
    { key: 'email_out', label: '发出邮件', icon: '📤' }, { key: 'reply_in', label: '收到回复', icon: '📥' },
    { key: 'dm', label: '私信', icon: '💬' }, { key: 'call', label: '通话/会议', icon: '📞' },
    { key: 'sample', label: '寄样', icon: '📦' }, { key: 'publish', label: '内容发布', icon: '🎬' },
    { key: 'deal', label: '成交', icon: '💶' }, { key: 'note', label: '备注', icon: '📝' }
  ];
  K.SCENES = [
    { key: 'outreach', label: '开发信' }, { key: 'follow1', label: '首次跟进' }, { key: 'follow2', label: '二次跟进' },
    { key: 'sample', label: '寄样确认' }, { key: 'publish', label: '发布提醒' }, { key: 'settle', label: '成交结算' },
    { key: 'decline', label: '婉拒' }
  ];
  K.YNU = [{ key: 'yes', label: '是' }, { key: 'no', label: '否' }, { key: 'unknown', label: '未知' }];

  K.state = { kols: [], tasks: [], deals: [], templates: [], views: [], keywords: [], settings: {}, aiEnabled: false };
  K.cfg = () => {
    const s = K.state.settings || {};
    const out = {};
    for (const [k, v] of Object.entries(K.DEFAULTS)) out[k] = s[k] ?? v;
    // 状态的 key 是固定的（业务逻辑依赖），只允许改名、颜色、间隔
    out.statuses = K.DEFAULTS.statuses.map(d => ({ ...d, ...((s.statuses || []).find(x => x.key === d.key) || {}) }));
    out.profile = { ...K.DEFAULTS.profile, ...(s.profile || {}) };
    return out;
  };

  /* ---------- 标签与颜色 ---------- */
  K.statusOf = key => K.cfg().statuses.find(s => s.key === key) || { key, label: key || '—', color: '#999' };
  K.platformOf = name => K.cfg().platforms.find(p => p.name.toLowerCase() === String(name || '').toLowerCase()) || { name, color: '#8a8f98' };
  K.priorityOf = key => K.PRIORITIES.find(p => p.key === key);
  K.countryName = code => (K.cfg().countries.find(c => c.code === code) || {}).name || code || '';
  K.langName = code => (K.cfg().languages.find(c => c.code === code) || {}).name || code || '';
  K.flag = code => /^[A-Z]{2}$/.test(code || '') ? String.fromCodePoint(...[...code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : '';
  K.actOf = key => K.ACT_TYPES.find(a => a.key === key) || { key, label: key, icon: '•' };
  K.sceneOf = key => K.SCENES.find(s => s.key === key) || { key, label: key };
  // 背景色上用黑字还是白字
  K.inkOn = hex => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#fff';
    const n = parseInt(m[1], 16), [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#1b1b1f' : '#fff';
  };
  const safeColor = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#8a8f98';
  K.chip = (label, color, extra = '') => {
    const c = safeColor(color);
    return `<span class="chip ${extra}" style="--c:${c};--ink:${K.inkOn(c)}">${K.esc(label)}</span>`;
  };
  K.statusChip = key => {
    const s = K.statusOf(key);
    return `<span class="st st-${K.esc(s.key)}" style="--c:${safeColor(s.color)};--ink:${K.inkOn(safeColor(s.color))}"><i></i>${K.esc(s.label)}</span>`;
  };
  K.platformChip = name => name ? K.chip(K.platformOf(name).name, K.platformOf(name).color, 'pf') : '';
  K.priorityChip = (key, auto = false) => {
    const p = K.priorityOf(key); if (!p) return '';
    const c = safeColor(p.color);
    return auto ? `<span class="chip pri auto" style="--c:${c}" title="按规则自动建议：沟通中、已寄样或粉丝 ≥10 万 → 高；≥1 万 → 中；其余 → 低。点一下可以手动改">${K.esc(p.label)}</span>` : K.chip(p.label, p.color, 'pri');
  };
  // 自动建议优先级（沿用 KOL总表模板 的规则）；手动设过就以手动为准
  K.autoPriority = k => {
    if (['paused', 'partner'].includes(k.status) || k.do_not_contact) return null;
    if (['talking', 'sampled'].includes(k.status) || (k.followers || 0) >= 1e5) return 'high';
    return (k.followers || 0) >= 1e4 ? 'mid' : 'low';
  };
  K.prio = k => k.priority ? { key: k.priority, auto: false } : { key: K.autoPriority(k), auto: true };
  K.prioChip = k => { const p = K.prio(k); return K.priorityChip(p.key, p.auto); };

  // 下一步该做什么：按状态 + 已触达次数（开发信 → 首次跟进 → 最后一封 → 建议暂不跟进）
  K.nextStep = k => {
    if (k.do_not_contact) return { text: '勿再联系', cls: 'stop' };
    const t = k.touches || 0;
    switch (k.status) {
      case 'todo': return { text: '发开发信', scene: 'outreach' };
      case 'contacted':
        if (t <= 1) return { text: '发第 2 封（首次跟进）', scene: 'follow1' };
        if (t === 2) return { text: '发最后一封', scene: 'follow2' };
        return { text: `已发 ${t} 封没回，建议暂不跟进`, cls: 'warn', giveUp: true };
      case 'talking': return { text: '回复对方、推进合作', scene: 'sample' };
      case 'sampled': return { text: '确认收货、催发布', scene: 'publish' };
      case 'published': return { text: '统计带货数据', scene: 'settle' };
      case 'won': return { text: '结算分成', scene: 'settle' };
      case 'partner': return { text: '维护关系、谈下一单', scene: null };
      default: return { text: '—', cls: 'muted' };
    }
  };
  // 国家 → 最可能的内容语言（只作建议，填之前要人确认：比如斯洛伐克的博主可能用德语）
  K.COUNTRY_LANG = { DE: 'de', AT: 'de', CH: 'de', LU: 'de', GB: 'en', IE: 'en', US: 'en', CA: 'en', AU: 'en', NZ: 'en', FR: 'fr', ES: 'es', MX: 'es', IT: 'it', NL: 'nl',
    PL: 'pl', PT: 'pt', BR: 'pt', SE: 'sv', DK: 'da', NO: 'no', FI: 'fi', CZ: 'cs', SK: 'sk', HU: 'hu', RO: 'ro', GR: 'el', TR: 'tr', UA: 'uk', JP: 'ja', KR: 'ko', CN: 'zh', TW: 'zh', HK: 'zh', SG: 'en', IN: 'en' };
  K.countryLabel = code => code ? `${K.flag(code)} ${K.esc(K.countryName(code))}` : '';

  /* ---------- 界面偏好（localStorage，读写都包 try/catch） ---------- */
  K.pref = {
    get(key, def) { try { const v = localStorage.getItem('kol.' + key); return v == null ? def : JSON.parse(v); } catch { return def; } },
    set(key, val) { try { localStorage.setItem('kol.' + key, JSON.stringify(val)); } catch { /* 无痕模式等写不进去，忽略 */ } }
  };

  /* ---------- 接口 ---------- */
  K.api = async (method, path, body) => {
    let r;
    try {
      r = await fetch('/api/kol' + path, {
        method, credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-kol-request': '1' },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch { throw new Error('网络不通，没保存上，请检查网络后重试'); }
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 && path !== '/login') { K.onUnauthorized?.(); throw new Error('登录过期了，请重新输入密码'); }
    if (!r.ok) { const e = new Error(data.error || `出错了（${r.status}）`); e.status = r.status; e.data = data; throw e; }
    return data;
  };

  /* ---------- 提示条（可带撤销按钮） ---------- */
  K.toast = (msg, opts = {}) => {
    const box = K.$('#toasts');
    // 弹窗（dialog）在浏览器顶层，提示条要放进最上面那个弹窗里，否则会被盖住、撤销按钮点不到
    const top = [...document.querySelectorAll('dialog[open]')].pop() || document.body;
    if (box.parentElement !== top) top.append(box);
    const el = document.createElement('div');
    el.className = 'toast' + (opts.error ? ' err' : '');
    el.setAttribute('role', opts.error ? 'alert' : 'status');
    el.innerHTML = `<span>${K.esc(msg)}</span>${opts.action ? `<button type="button">${K.esc(opts.action)}</button>` : ''}`;
    box.append(el);
    let done = false;
    const close = () => { if (done) return; done = true; el.classList.add('out'); setTimeout(() => el.remove(), 200); opts.onClose?.(); };
    if (opts.action) el.querySelector('button').addEventListener('click', () => { opts.onAction?.(); opts.onClose = null; close(); });
    setTimeout(close, opts.timeout || (opts.error ? 6000 : 3000));
    return close;
  };
  K.fail = err => K.toast(err?.message || String(err), { error: true });

  // 删除前二次确认（页面内小弹窗，不用浏览器 confirm）
  K.confirm = (text, okText = '确认删除') => new Promise(resolve => {
    const dlg = K.$('#confirm');
    K.$('#confirm-text').textContent = text;
    K.$('#confirm-ok').textContent = okText;
    const finish = v => { dlg.close(); resolve(v); };
    K.$('#confirm-ok').onclick = () => finish(true);
    K.$('#confirm-cancel').onclick = () => finish(false);
    dlg.oncancel = () => resolve(false);
    dlg.showModal();
    K.$('#confirm-cancel').focus();
  });

  // 先确认、再从界面移除、5 秒内可撤销，过了 5 秒才真正发删除请求
  K.pendingDeletes = new Map();
  K.deferredDelete = async ({ text, label, removeLocal, restoreLocal, commit }) => {
    if (!(await K.confirm(text))) return false;
    const id = K.uid();
    removeLocal(); K.render();
    const run = async () => {
      K.pendingDeletes.delete(id);
      try { await commit(); } catch (e) { restoreLocal(); K.render(); K.fail(e); }
    };
    const timer = setTimeout(run, 5000);
    K.pendingDeletes.set(id, { timer, run });
    K.toast(`已删除${label ? '「' + label + '」' : ''}`, {
      action: '撤销', timeout: 5000,
      onAction: () => { clearTimeout(timer); K.pendingDeletes.delete(id); restoreLocal(); K.render(); }
    });
    return true;
  };
  // 关页面前把还在撤销期的删除立即提交
  window.addEventListener('pagehide', () => { for (const p of K.pendingDeletes.values()) { clearTimeout(p.timer); p.run(); } });

  /* ---------- 弹层（下拉、日期、跟进浮层都用它） ---------- */
  let openPop = null;
  K.closePopover = () => { if (openPop) { const p = openPop; openPop = null; p.el.remove(); p.onClose?.(); } };
  K.popover = (anchor, html, { onClose, cls = '', width } = {}) => {
    K.closePopover();
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.innerHTML = html;
    if (width) el.style.width = width + 'px';
    document.body.append(el);
    const r = anchor.getBoundingClientRect();
    const vw = innerWidth, vh = innerHeight, w = el.offsetWidth, h = el.offsetHeight;
    let left = Math.min(r.left, vw - w - 8), top = r.bottom + 4;
    if (top + h > vh - 8 && r.top - h - 4 > 8) top = r.top - h - 4;
    el.style.left = Math.max(8, left) + 'px';
    el.style.top = Math.max(8, Math.min(top, vh - h - 8)) + 'px';
    openPop = { el, onClose, anchor };
    const first = el.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select');
    if (first) setTimeout(() => first.focus(), 0);
    return el;
  };
  document.addEventListener('pointerdown', e => {
    if (openPop && !openPop.el.contains(e.target) && !openPop.anchor.contains(e.target)) K.closePopover();
  }, true);

  // 带颜色的下拉选择（状态 / 平台 / 优先级 / 国家 / 语言），可搜索；multi=true 时多选
  K.pickOption = (anchor, { options, value, multi = false, search = false, allowEmpty = true, emptyLabel = '清空', onPick }) => {
    let sel = new Set(multi ? (value || []) : [value]);
    const draw = (q = '') => options.filter(o => !q || (o.label + ' ' + (o.hint || '') + ' ' + o.value).toLowerCase().includes(q.toLowerCase()))
      .map(o => `<button type="button" class="opt${sel.has(o.value) ? ' on' : ''}" data-v="${K.esc(o.value)}">${multi ? `<span class="box">${sel.has(o.value) ? '✓' : ''}</span>` : ''}${o.html || K.esc(o.label)}</button>`).join('')
      || '<p class="muted pad">没有匹配的选项</p>';
    const el = K.popover(anchor, `${search ? '<input class="pop-search" placeholder="搜索…" aria-label="搜索选项">' : ''}
      <div class="opts">${draw()}</div>
      ${allowEmpty && !multi ? `<button type="button" class="opt clear" data-v="">${K.esc(emptyLabel)}</button>` : ''}
      ${multi ? '<div class="pop-foot"><button type="button" class="btn sm" data-done>完成</button></div>' : ''}`, { cls: 'pick', onClose: () => { if (multi) onPick([...sel]); } });
    const box = el.querySelector('.opts');
    el.querySelector('.pop-search')?.addEventListener('input', e => { box.innerHTML = draw(e.target.value); });
    el.querySelector('.pop-search')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { const b = box.querySelector('.opt'); if (b) b.click(); }
    });
    el.addEventListener('click', e => {
      if (e.target.closest('[data-done]')) return K.closePopover();
      const b = e.target.closest('[data-v]'); if (!b) return;
      const v = b.dataset.v;
      if (multi) { sel.has(v) ? sel.delete(v) : sel.add(v); b.classList.toggle('on'); b.querySelector('.box').textContent = sel.has(v) ? '✓' : ''; return; }
      K.closePopover(); onPick(v || null);
    });
  };
  K.optionsFor = field => {
    const c = K.cfg();
    switch (field) {
      case 'status': return c.statuses.map(s => ({ value: s.key, label: s.label, html: K.statusChip(s.key) }));
      case 'platform': return c.platforms.map(p => ({ value: p.name, label: p.name, html: K.platformChip(p.name) }));
      case 'priority': return K.PRIORITIES.map(p => ({ value: p.key, label: p.label, html: K.priorityChip(p.key) }));
      case 'country': return c.countries.map(x => ({ value: x.code, label: x.name, hint: x.code, html: `${K.flag(x.code)} ${K.esc(x.name)} <small class="muted">${x.code}</small>` }));
      case 'language': return c.languages.map(x => ({ value: x.code, label: x.name, hint: x.code, html: `${K.esc(x.name)} <small class="muted">${x.code}</small>` }));
      case 'category': return c.categories.map(x => ({ value: x, label: x }));
      case 'coop_type': return c.coop_types.map(x => ({ value: x, label: x }));
      case 'source': return c.sources.map(x => ({ value: x, label: x }));
      case 'rating': return ['A', 'B', 'C'].map(x => ({ value: x, label: { A: 'A 优先谈', B: 'B 可以谈', C: 'C 先观察' }[x] }));
      case 'can_sell': case 'promoted_similar': return K.YNU.map(x => ({ value: x.key, label: x.label }));
      default: return [];
    }
  };

  /* ---------- 剪贴板与下载 ---------- */
  K.copy = async (text, what = '内容') => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.append(ta); ta.select();
      try { document.execCommand('copy'); } finally { ta.remove(); }
    }
    K.toast(`已复制${what}`);
  };
  K.download = (filename, content, type = 'text/plain;charset=utf-8') => {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  /* ---------- 拖动排序（pointer 事件，标签栏和列配置共用） ---------- */
  K.sortable = (container, itemSel, onEnd, { handle, axis = 'x' } = {}) => {
    container.addEventListener('pointerdown', e => {
      const item = e.target.closest(itemSel);
      if (!item || !container.contains(item) || e.button !== 0) return;
      if (handle && !e.target.closest(handle)) return;
      if (e.target.closest('input, button:not([data-drag]), select')) return;
      const start = axis === 'x' ? e.clientX : e.clientY;
      let dragging = false;
      const move = ev => {
        const pos = axis === 'x' ? ev.clientX : ev.clientY;
        if (!dragging && Math.abs(pos - start) < 6) return;
        if (!dragging) { dragging = true; item.classList.add('dragging'); container.classList.add('sorting'); }
        const sibs = [...container.querySelectorAll(itemSel)].filter(x => x !== item);
        const before = sibs.find(s => { const r = s.getBoundingClientRect(); return pos < (axis === 'x' ? r.left + r.width / 2 : r.top + r.height / 2); });
        before ? before.before(item) : sibs.length && sibs[sibs.length - 1].after(item);
      };
      const up = () => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
        if (!dragging) return;
        item.classList.remove('dragging'); container.classList.remove('sorting');
        // 拖完那一下的 click 不要触发打开
        const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
        item.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => item.removeEventListener('click', swallow, { capture: true }), 50);
        onEnd([...container.querySelectorAll(itemSel)].map(x => x.dataset.id));
      };
      addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    });
  };

  /* ---------- 查重（与服务端同一规则，用于即时提示） ---------- */
  K.urlKey = u => {
    try { const x = new URL(u); return (x.hostname.replace(/^(www\.|m\.|mobile\.)/, '') + x.pathname.replace(/\/+$/, '').replace(/\/(videos|featured|shorts|streams|about|playlists|community|posts)$/i, '')).toLowerCase(); } catch { return null; }
  };
  K.handleKey = (p, h) => p && h ? `${String(p).toLowerCase()}|${String(h).trim().replace(/^@/, '').toLowerCase()}` : null;
  K.findDupesLocal = (x, excludeId = 0) => {
    const u = x.profile_url && K.urlKey(x.profile_url), e = x.email && x.email.trim().toLowerCase(), h = K.handleKey(x.platform, x.handle);
    if (!u && !e && !h) return [];
    return K.state.kols.filter(k => k.id !== excludeId).map(k => {
      const why = [u && K.urlKey(k.profile_url || '') === u && '主页链接相同', e && (k.email || '').toLowerCase() === e && '邮箱相同',
        h && K.handleKey(k.platform, k.handle) === h && '同平台账号相同'].filter(Boolean);
      return why.length ? { id: k.id, name: k.name, reason: why.join('、') } : null;
    }).filter(Boolean);
  };

  /* ---------- KOL 数据操作（乐观更新，失败回滚并提示） ---------- */
  K.kol = id => K.state.kols.find(k => k.id === Number(id));
  K.tasksOf = id => K.state.tasks.filter(t => t.kol_id === Number(id));
  K.replaceKol = row => { const i = K.state.kols.findIndex(k => k.id === row.id); if (i >= 0) K.state.kols[i] = row; else K.state.kols.push(row); };

  K.updateKol = async (id, patch) => {
    const cur = K.kol(id); if (!cur) return;
    const before = { ...cur };
    Object.assign(cur, patch); K.render();
    try {
      const { kol, dupes } = await K.api('PATCH', `/kols/${id}`, patch);
      K.replaceKol(kol); K.render();
      if (dupes?.length) K.toast(`提醒：和「${dupes[0].name}」疑似重复（${dupes[0].reason}）`, { timeout: 6000 });
      return kol;
    } catch (e) {
      K.replaceKol(before); K.render(); K.fail(e); throw e;
    }
  };

  K.newKolDefaults = () => ({ status: 'todo', next_followup_at: K.today() });
  K.createKol = async (data, { force = false } = {}) => {
    const { kol } = await K.api('POST', '/kols', { kol: { ...K.newKolDefaults(), ...data }, force });
    K.state.kols.push(kol); K.render();
    return kol;
  };

  K.deleteKol = async id => {
    const k = K.kol(id); if (!k) return;
    if (!(await K.confirm(`确定删除「${k.name}」吗？它的子任务、沟通记录和带货记录也会一起删除。`))) return;
    K.state.kols = K.state.kols.filter(x => x.id !== k.id);
    K.drawer?.closeIf(k.id); K.render();
    try { await K.api('DELETE', `/kols/${k.id}`); }
    catch (e) { K.state.kols.push(k); K.render(); return K.fail(e); }
    K.toast(`已删除「${k.name}」`, {
      action: '撤销', timeout: 5000,
      onAction: async () => {
        try { const { kol } = await K.api('POST', `/kols/${k.id}/restore`); K.replaceKol(kol); K.render(); K.toast('已恢复'); }
        catch (e) { K.fail(e); }
      }
    });
  };

  // 写一条沟通记录（可顺带改下次跟进 / 状态），返回 { activity, kol }
  K.addActivity = async (act, kolPatch) => {
    const res = await K.api('POST', '/activities', { ...act, kol_patch: kolPatch });
    K.replaceKol(res.kol); K.render();
    K.emit('activity', res.activity);
    return res;
  };
  K.defaultFollowDays = status => { const s = K.statusOf(status); return s.days > 0 ? s.days : 3; };

  /* ---------- 简单事件 ---------- */
  const handlers = {};
  K.on = (ev, fn) => (handlers[ev] ||= []).push(fn);
  K.emit = (ev, data) => (handlers[ev] || []).forEach(fn => fn(data));
  K.render = (force = false) => K.emit('render', force);   // force：表单类页面里正在输入时也要重画
})();
