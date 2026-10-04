/* 我的工作台 · 核心：工具函数、日期（一律按 Asia/Shanghai）、默认选项、接口、提示、弹层、数据操作。
   所有模块挂在 window.DESK 上；业务数据只从 /api/desk 读写，localStorage 只存界面偏好。
   写法照 /kol 的 core.js（同一套弹层、下拉、提示条、拖动排序），但不共用文件，两个工作台互不影响。 */
(() => {
  const D = window.DESK = {};

  /* ---------- 基础工具 ---------- */
  D.$ = (s, root = document) => root.querySelector(s);
  D.$$ = (s, root = document) => [...root.querySelectorAll(s)];
  D.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // 外链只放行 http(s)；其余（javascript: 等）一律不出链接
  D.safeUrl = u => { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : ''; } catch { return ''; } };
  D.link = (u, text, cls = '') => {
    const href = D.safeUrl(u);
    return href ? `<a class="${cls}" href="${D.esc(href)}" target="_blank" rel="noopener noreferrer">${D.esc(text ?? u)}</a>` : D.esc(text ?? u ?? '');
  };
  D.uid = () => Math.random().toString(36).slice(2, 10);
  D.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  D.firstLine = (s, n = 40) => { const l = String(s || '').split('\n').map(x => x.trim()).find(Boolean) || ''; return l.length > n ? l.slice(0, n) + '…' : l; };

  /* ---------- 日期：「今天」「本周」「逾期」一律按 Asia/Shanghai 算，日期都是 YYYY-MM-DD 字符串 ----------
     电脑时区设成别的（比如 UTC），23:30 前后算出来的「今天」也和上海一致。日期加减都在 UTC 上做，不受本机时区影响。 */
  const shFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
  const shParts = d => Object.fromEntries(shFmt.formatToParts(d).map(p => [p.type, p.value]));
  D.today = () => { const p = shParts(new Date()); return `${p.year}-${p.month}-${p.day}`; };
  D.nowHour = () => Number(shParts(new Date()).hour);
  const U = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  D.addDays = (s, n) => new Date(U(s) + n * 864e5).toISOString().slice(0, 10);
  D.diffDays = (a, b) => Math.round((U(a) - U(b)) / 864e5);   // a − b
  D.dow = s => new Date(U(s)).getUTCDay();                     // 0 = 周日
  D.wk = s => '周' + '日一二三四五六'[D.dow(s)];
  D.thisMonth = () => D.today().slice(0, 7);
  D.weekMonday = s => D.addDays(s, -((D.dow(s) + 6) % 7));
  D.weekRange = () => { const m = D.weekMonday(D.today()); return [m, D.addDays(m, 6)]; };
  D.monthEnd = ym => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
  // ISO 周：2026-W41（周一开始；跨年的周按周四所在的年算）
  D.isoWeek = s => {
    const d = new Date(U(s)); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
    const y = d.getUTCFullYear(), jan4 = new Date(Date.UTC(y, 0, 4));
    const w = 1 + Math.round(((d - jan4) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
    return `${y}-W${String(w).padStart(2, '0')}`;
  };
  D.weekStart = w => {
    const [y, n] = w.split('-W').map(Number), jan4 = Date.UTC(y, 0, 4);
    return new Date(jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * 864e5 + (n - 1) * 7 * 864e5).toISOString().slice(0, 10);
  };
  D.weekLabel = w => { if (!/^\d{4}-W\d{2}$/.test(w || '')) return w || ''; const m = D.weekStart(w); return `${w.slice(5)}（${D.fmtDate(m)}–${D.fmtDate(D.addDays(m, 6))}）`; };
  D.fmtDate = s => {
    if (!s) return '';
    return s.slice(0, 4) === D.today().slice(0, 4) ? `${Number(s.slice(5, 7))}月${Number(s.slice(8, 10))}日` : s;
  };
  D.fmtDateW = s => s ? `${D.fmtDate(s)}（${D.wk(s)}）` : '';
  // 相对说法：逾期 N 天 / 今天 / 明天 / 日期
  D.rel = (s, { past = true } = {}) => {
    if (!s) return { text: '', cls: '' };
    const d = D.diffDays(s, D.today());
    if (d < 0) return past ? { text: `逾期 ${-d} 天`, cls: 'overdue' } : { text: D.fmtDate(s), cls: 'past' };
    if (d === 0) return { text: '今天', cls: 'today' };
    if (d === 1) return { text: '明天', cls: 'soon' };
    return { text: D.fmtDate(s), cls: d <= 7 ? 'soon' : '' };
  };
  D.launchText = p => {
    if (!p.launch_at) return '';
    const d = D.diffDays(p.launch_at, D.today()), pre = p.launch_tentative ? '暂定 ' : '';
    const when = d === 0 ? '今天' : d === 1 ? '明天' : D.fmtDateW(p.launch_at);
    return `${pre}${when}上线${d > 1 ? `（还有 ${d} 天）` : d < 0 ? `（已过 ${-d} 天）` : ''}`;
  };
  D.offsetLabel = n => n == null ? '' : n === 0 ? 'T' : n < 0 ? `T−${-n}` : `T+${n}`;
  D.fmtMinutes = m => {
    if (m == null || m === '') return '';
    m = Number(m);
    if (Math.abs(m) < 60) return `${m} 分钟`;
    const h = Math.round(m / 6) / 10;
    return `${String(h).replace(/\.0$/, '')} 小时`;
  };
  D.isoToShDate = iso => { if (!iso) return ''; const p = shParts(new Date(iso)); return `${p.year}-${p.month}-${p.day}`; };

  /* ---------- 默认选项（设置里可改，存 D1 settings 表）。这里只放通用默认值，任何具体业务内容走「初始化包」 ---------- */
  D.DEFAULTS = {
    kinds: [
      { name: '省福利中心', color: '#2f7cf6' }, { name: '全国月度促活', color: '#e5484d' }, { name: '玩法创意', color: '#8b5cf6' },
      { name: '临时需求', color: '#f59e0b' }, { name: '个人', color: '#64748b' }
    ],
    provinces: [],   // 省份默认为空：名单会变，在设置里填，或从初始化包导入
    deliverable_types: ['思路方案', '策划案', '原型', '动效稿', '客服文档', '活动规则', '掌厅文案', '切图归档', '拨测报告', '玩法提案', '其他'],
    ask_whom: ['业务方', '领导', '设计师', '搭建同事', '开发', '其他'],
    ai_tools: ['Claude Code', 'Codex', 'DeepSeek Harness', 'ChatGPT', 'Cowork', '我自己'],
    win_task_types: ['策划', '原型', 'Word 文档', '规则更新', '切图归档', '拨测', '数据整理', '其他'],
    inbox_sources: ['微信', '会议', '邮件', '自己想到', '其他'],
    nudge_days: { warn: 3, danger: 7 },
    welcome_done: false,
    baselines: {}   // 提效基准：每类交付物「以前大概要多少分钟」，第一次交付时问一次
  };
  // v2：项目状态只有 5 个。旧版的 6 个细分状态（需求中 / 策划中 / 原型中 / 等确认 / 出文档中 / 测试拨测）都算「进行中」——
  // 数据库里不改它们，回退到旧版时原样还在
  D.STATUSES = [
    { key: 'active', label: '进行中', color: '#2f7cf6' },
    { key: 'live', label: '已上线收尾', color: '#1aa35a' },
    { key: 'watch', label: '观望', color: '#b7791f', hint: '不一定是我做：能看排期，但不进「今天」' },
    { key: 'paused', label: '暂缓', color: '#9ca3af' },
    { key: 'done', label: '已交付', color: '#0f766e' }
  ];
  D.LEGACY_ACTIVE = ['need', 'plan', 'proto', 'review', 'docs', 'test'];
  D.normStatus = k => D.LEGACY_ACTIVE.includes(k) ? 'active' : k;
  D.LIVE_OUT = ['done', 'paused', 'watch'];   // 已交付 / 暂缓 / 观望 的项目不进「今天」
  D.PRIORITIES = [{ key: 'high', label: '高', color: '#e5484d' }, { key: 'mid', label: '中', color: '#f59e0b' }, { key: 'low', label: '低', color: '#64748b' }];
  D.DELIV_STATUSES = [{ key: 'todo', label: '未开始', color: '#9ca3af' }, { key: 'doing', label: '制作中', color: '#2f7cf6' }, { key: 'review', label: '待审', color: '#e8a400' }, { key: 'done', label: '已交付', color: '#1aa35a' }];
  D.PEND_STATUSES = [{ key: 'waiting', label: '等待中' }, { key: 'answered', label: '已答复' }, { key: 'dropped', label: '不需要了' }];
  D.ACT_TYPES = [
    { key: 'progress', label: '进展', icon: 'right' }, { key: 'deliver', label: '交付', icon: 'box' }, { key: 'feedback', label: '收到反馈', icon: 'message' },
    { key: 'nudge', label: '催办', icon: 'clock' }, { key: 'ai', label: 'AI 经手', icon: 'sparkle' }, { key: 'note', label: '备注', icon: 'edit' }
  ];
  D.IDEA_TARGETS = [{ key: 'value', label: '高价值转化' }, { key: 'stay', label: '3 分钟停留' }, { key: 'both', label: '两者' }, { key: 'other', label: '其他' }];
  D.IDEA_COSTS = [{ key: 'light', label: '轻' }, { key: 'mid', label: '中' }, { key: 'heavy', label: '重' }];
  D.IDEA_STATUSES = [
    { key: 'draft', label: '草稿', color: '#9ca3af' }, { key: 'submitted', label: '已提交', color: '#2f7cf6' }, { key: 'evaluating', label: '开发评估中', color: '#e8a400' },
    { key: 'adopted', label: '被采纳', color: '#1aa35a' }, { key: 'rejected', label: '未采纳', color: '#64748b' }
  ];
  D.TODO_SCOPES = ['策划', '原型', 'Word', '规则更新', '拨测', '其他'];
  D.SCENES = ['开工', '收工', '需求梳理', '写玩法提案', '其他'];

  D.state = { projects: [], deliverables: [], tasks: [], pendings: [], decisions: [], ideas: [], wins: [], inbox: [], timelines: [], checklists: [], prompts: [], links: [], resources: [], settings: {} };
  const named = x => typeof x === 'string' ? { name: x } : x;
  D.cfg = () => {
    const s = D.state.settings || {};
    const out = {};
    for (const [k, v] of Object.entries(D.DEFAULTS)) out[k] = s[k] ?? v;
    out.kinds = (out.kinds || []).map(named).filter(x => x?.name).map(x => ({ name: x.name, color: x.color || D.hashColor(x.name) }));
    out.nudge_days = { ...D.DEFAULTS.nudge_days, ...(s.nudge_days || {}) };
    out.baselines = { ...(s.baselines || {}) };
    return out;
  };

  /* ---------- 标签与颜色 ---------- */
  const PALETTE = ['#2f7cf6', '#e5484d', '#8b5cf6', '#1aa35a', '#f5822a', '#0ea5e9', '#d6409f', '#0f766e', '#a16207', '#4f46e5', '#64748b', '#be123c'];
  D.hashColor = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };
  D.inkOn = hex => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#fff';
    const n = parseInt(m[1], 16), [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#1b1b1f' : '#fff';
  };
  const safeColor = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#8a8f98';
  D.chip = (label, color, extra = '') => {
    const c = safeColor(color);
    return `<span class="chip ${extra}" style="--c:${c};--ink:${D.inkOn(c)}">${D.esc(label)}</span>`;
  };
  D.soft = (label, color, extra = '') => `<span class="soft ${extra}" style="--c:${safeColor(color)}">${D.esc(label)}</span>`;
  D.statusOf = key => D.STATUSES.find(s => s.key === D.normStatus(key)) || { key, label: key || '—', color: '#999' };
  D.statusChip = key => {
    const s = D.statusOf(key);
    return `<span class="st st-${D.esc(s.key)}" style="--c:${safeColor(s.color)}" title="${D.esc(s.hint || '')}"><i></i>${D.esc(s.label)}</span>`;
  };
  D.kindOf = name => D.cfg().kinds.find(k => k.name === name) || { name, color: D.hashColor(name || '') };
  D.kindChip = name => name ? D.soft(name, D.kindOf(name).color, 'kind') : '';
  D.provChip = name => name ? `<span class="prov">${D.esc(name)}</span>` : '';
  D.priorityOf = key => D.PRIORITIES.find(p => p.key === key);
  D.priorityChip = key => { const p = D.priorityOf(key); return p ? D.chip(p.label, p.color, 'pri') : ''; };
  D.delivStatusOf = key => D.DELIV_STATUSES.find(s => s.key === key) || D.DELIV_STATUSES[0];
  D.delivChip = key => { const s = D.delivStatusOf(key); return D.soft(s.label, s.color, 'ds'); };
  D.ideaStatusOf = key => D.IDEA_STATUSES.find(s => s.key === key) || D.IDEA_STATUSES[0];
  D.ideaChip = key => { const s = D.ideaStatusOf(key); return D.soft(s.label, s.color); };
  D.actOf = key => D.ACT_TYPES.find(a => a.key === key) || { key, label: key, icon: 'sparkle' };
  D.labelOf = (list, key) => (list.find(x => x.key === key) || {}).label || '';

  /* ---------- 界面偏好（localStorage，读写都包 try/catch） ---------- */
  D.pref = {
    get(key, def) { try { const v = localStorage.getItem('desk.' + key); return v == null ? def : JSON.parse(v); } catch { return def; } },
    set(key, val) { try { localStorage.setItem('desk.' + key, JSON.stringify(val)); } catch { /* 无痕模式等写不进去，忽略 */ } }
  };

  /* ---------- 接口 ---------- */
  D.api = async (method, path, body) => {
    let r;
    try {
      r = await fetch('/api/desk' + path, {
        method, credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-desk-request': '1' },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch { throw new Error('网络不通，没保存上，请检查网络后重试'); }
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 && path !== '/login') { D.onUnauthorized?.(); throw new Error('登录过期了，请重新输入密码'); }
    if (!r.ok) { const e = new Error(data.error || `出错了（${r.status}）`); e.status = r.status; e.data = data; throw e; }
    return data;
  };

  /* ---------- 提示条（可带撤销按钮） ---------- */
  D.toast = (msg, opts = {}) => {
    let box = D.$('#toasts');
    // 提示条的容器可能跟着某个弹窗被重画掉了（比如看大图时换下一张）：没了就重新建一个
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.className = 'toasts'; box.setAttribute('aria-live', 'polite'); }
    // 弹窗（dialog）在浏览器顶层，提示条要放进最上面那个弹窗里，否则会被盖住、撤销按钮点不到
    const top = [...document.querySelectorAll('dialog[open]')].pop() || document.body;
    if (box.parentElement !== top) top.append(box);
    const el = document.createElement('div');
    el.className = 'toast' + (opts.error ? ' err' : '');
    el.setAttribute('role', opts.error ? 'alert' : 'status');
    el.innerHTML = `${D.icon ? D.icon(opts.error ? 'x' : opts.icon || 'check', 'sm') : ''}<span>${D.esc(msg)}</span>${opts.action ? `<button type="button">${D.esc(opts.action)}</button>` : ''}`;
    box.append(el);
    let done = false;
    const close = () => { if (done) return; done = true; el.classList.add('out'); setTimeout(() => el.remove(), 260); opts.onClose?.(); };
    if (opts.action) el.querySelector('button').addEventListener('click', () => { opts.onAction?.(); opts.onClose = null; close(); });
    setTimeout(close, opts.timeout || (opts.error ? 6000 : 3000));
    return close;
  };
  // 已经提示过的错误（乐观更新失败时）不重复弹
  D.fail = err => { if (err?.reported) return; if (err && typeof err === 'object') err.reported = true; D.toast(err?.message || String(err), { error: true }); };

  // 二次确认（页面内小弹窗，不用浏览器 confirm）
  D.confirm = (text, okText = '确认删除', { danger = true } = {}) => new Promise(resolve => {
    const dlg = D.$('#confirm');
    D.$('#confirm-text').textContent = text;
    const ok = D.$('#confirm-ok');
    ok.textContent = okText; ok.classList.toggle('danger', danger);
    const finish = v => { dlg.close(); resolve(v); };
    ok.onclick = () => finish(true);
    D.$('#confirm-cancel').onclick = () => finish(false);
    dlg.oncancel = () => resolve(false);
    dlg.showModal();
    D.$('#confirm-cancel').focus();
  });

  /* ---------- 弹层（下拉、日期、催一下浮层都用它） ---------- */
  let openPop = null;
  D.closePopover = () => { if (openPop) { const p = openPop; openPop = null; p.el.remove(); p.onClose?.(); } };
  D.popover = (anchor, html, { onClose, cls = '', width } = {}) => {
    D.closePopover();
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.innerHTML = html;
    if (width) el.style.width = width + 'px';
    // 弹窗打开时，浮层要放进弹窗里（顶层），否则点不到
    const host = [...document.querySelectorAll('dialog[open]')].pop() || document.body;
    host.append(el);
    const r = anchor.getBoundingClientRect();
    const vw = innerWidth, vh = innerHeight, w = el.offsetWidth, h = el.offsetHeight;
    let left = Math.min(r.left, vw - w - 8), top = r.bottom + 4;
    if (top + h > vh - 8 && r.top - h - 4 > 8) top = r.top - h - 4;
    el.style.left = Math.max(8, left) + 'px';
    el.style.top = Math.max(8, Math.min(top, vh - h - 8)) + 'px';
    openPop = { el, onClose, anchor };
    const first = el.querySelector('[autofocus], input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select');
    if (first) setTimeout(() => first.focus(), 0);
    return el;
  };
  D.popOpen = () => !!openPop;
  document.addEventListener('pointerdown', e => {
    if (openPop && !openPop.el.contains(e.target) && !openPop.anchor.contains(e.target)) D.closePopover();
  }, true);

  // 带颜色的下拉选择，可搜索；multi=true 时多选
  D.pickOption = (anchor, { options, value, multi = false, search = false, allowEmpty = true, emptyLabel = '清空', onPick, extra = '' }) => {
    let sel = new Set(multi ? (value || []) : [value]);
    const draw = (q = '') => options.filter(o => !q || (o.label + ' ' + (o.hint || '') + ' ' + o.value).toLowerCase().includes(q.toLowerCase()))
      .map(o => `<button type="button" class="opt${sel.has(o.value) ? ' on' : ''}" data-v="${D.esc(o.value)}">${multi ? `<span class="box">${sel.has(o.value) ? '✓' : ''}</span>` : ''}${o.html || D.esc(o.label)}</button>`).join('')
      || '<p class="muted pad">没有可选的项。可以去「设置」里添加。</p>';
    const el = D.popover(anchor, `${search ? '<input class="pop-search" placeholder="搜索…" aria-label="搜索选项">' : ''}
      <div class="opts">${draw()}</div>
      ${allowEmpty && !multi ? `<button type="button" class="opt clear" data-v="">${D.esc(emptyLabel)}</button>` : ''}
      ${extra}
      ${multi ? '<div class="pop-foot"><button type="button" class="btn sm" data-done>完成</button></div>' : ''}`, { cls: 'pick', onClose: () => { if (multi) onPick([...sel]); } });
    const box = el.querySelector('.opts');
    el.querySelector('.pop-search')?.addEventListener('input', e => { box.innerHTML = draw(e.target.value); });
    el.querySelector('.pop-search')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { const b = box.querySelector('.opt'); if (b) b.click(); }
    });
    el.addEventListener('click', e => {
      if (e.target.closest('[data-done]')) return D.closePopover();
      const b = e.target.closest('[data-v]'); if (!b) return;
      const v = b.dataset.v;
      if (multi) { sel.has(v) ? sel.delete(v) : sel.add(v); b.classList.toggle('on'); b.querySelector('.box').textContent = sel.has(v) ? '✓' : ''; return; }
      D.closePopover(); onPick(v || null);
    });
  };
  D.optionsFor = field => {
    const c = D.cfg();
    switch (field) {
      case 'status': return D.STATUSES.map(s => ({ value: s.key, label: s.label, hint: s.hint, html: `${D.statusChip(s.key)}${s.hint ? ` <small class="muted">${D.esc(s.hint)}</small>` : ''}` }));
      case 'kind': return c.kinds.map(k => ({ value: k.name, label: k.name, html: D.kindChip(k.name) }));
      case 'province': return c.provinces.map(p => ({ value: p, label: p }));
      case 'priority': return D.PRIORITIES.map(p => ({ value: p.key, label: p.label, html: D.priorityChip(p.key) }));
      case 'last_ai': case 'ai_tool': return c.ai_tools.map(x => ({ value: x, label: x }));
      case 'deliverable_type': return c.deliverable_types.map(x => ({ value: x, label: x }));
      case 'deliv_status': return D.DELIV_STATUSES.map(s => ({ value: s.key, label: s.label, html: D.delivChip(s.key) }));
      case 'ask_whom': return c.ask_whom.map(x => ({ value: x, label: x }));
      case 'idea_status': return D.IDEA_STATUSES.map(s => ({ value: s.key, label: s.label, html: D.ideaChip(s.key) }));
      case 'target': return D.IDEA_TARGETS.map(s => ({ value: s.key, label: s.label }));
      case 'dev_cost': return D.IDEA_COSTS.map(s => ({ value: s.key, label: s.label }));
      case 'task_type': return c.win_task_types.map(x => ({ value: x, label: x }));
      case 'project': return D.liveProjects().map(p => ({ value: String(p.id), label: p.title, hint: p.province || '', html: `${D.esc(p.title)} ${p.province ? `<small class="muted">${D.esc(p.province)}</small>` : ''}` }));
      default: return [];
    }
  };
  // <select> 的选项 HTML
  D.selectOpts = (list, value, { empty } = {}) => (empty != null ? `<option value="">${D.esc(empty)}</option>` : '') +
    list.map(o => { const v = typeof o === 'string' ? o : o.value ?? o.key; const l = typeof o === 'string' ? o : o.label ?? o.name; return `<option value="${D.esc(v)}" ${String(v) === String(value ?? '') ? 'selected' : ''}>${D.esc(l)}</option>`; }).join('');

  /* ---------- 剪贴板与下载 ---------- */
  D.copy = async (text, what = '内容') => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      ([...document.querySelectorAll('dialog[open]')].pop() || document.body).append(ta); ta.select();
      try { document.execCommand('copy'); } finally { ta.remove(); }
    }
    D.toast(`已复制${what}`);
  };
  D.download = (filename, content, type = 'text/plain;charset=utf-8') => {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const csvCell = v => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  // UTF-8 带 BOM：Excel 直接打开不乱码
  D.toCsv = (header, rows) => '﻿' + [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

  /* ---------- 拖动排序（pointer 事件，标签栏、列配置、待办、快捷入口共用） ---------- */
  D.sortable = (container, itemSel, onEnd, { handle, axis = 'x' } = {}) => {
    container.addEventListener('pointerdown', e => {
      const item = e.target.closest(itemSel);
      if (!item || !container.contains(item) || e.button !== 0) return;
      if (handle && !e.target.closest(handle)) return;
      if (e.target.closest('input, textarea, button:not([data-drag]), select, a')) return;
      const sx = e.clientX, sy = e.clientY;
      let dragging = false;
      const move = ev => {
        const x = ev.clientX, y = ev.clientY;
        if (!dragging && Math.hypot(x - sx, y - sy) < 6) return;
        if (!dragging) { dragging = true; item.classList.add('dragging'); container.classList.add('sorting'); }
        const sibs = [...container.querySelectorAll(itemSel)].filter(x => x !== item);
        // axis：x 横排、y 竖排、xy 自动换行的网格（按阅读顺序找插入位置）
        const before = sibs.find(s => {
          const r = s.getBoundingClientRect();
          if (axis === 'x') return x < r.left + r.width / 2;
          if (axis === 'y') return y < r.top + r.height / 2;
          return y < r.top || (y <= r.bottom && x < r.left + r.width / 2);
        });
        before ? before.before(item) : sibs.length && sibs[sibs.length - 1].after(item);
      };
      const up = () => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
        if (!dragging) return;
        item.classList.remove('dragging'); container.classList.remove('sorting');
        const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
        item.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => item.removeEventListener('click', swallow, { capture: true }), 50);
        onEnd([...container.querySelectorAll(itemSel)].map(x => x.dataset.id));
      };
      addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    });
  };

  /* ---------- 数据：通用增改删（乐观更新，失败回滚并提示；删除可 5 秒内撤销） ---------- */
  D.find = (res, id) => D.state[res].find(x => x.id === Number(id));
  D.put = (res, row) => { const list = D.state[res], i = list.findIndex(x => x.id === row.id); if (i >= 0) list[i] = row; else list.push(row); };
  D.project = id => D.find('projects', id);
  D.liveProjects = () => D.state.projects.filter(p => !p.archived_at);
  D.projectName = id => { const p = D.project(id); return p ? p.title : ''; };

  // 项目时间线（activities）不在 D.state 里，按项目放在 D.acts 缓存（打开抽屉时才读）
  D.create = async (res, data) => {
    const r = await D.api('POST', '/' + res, data);
    if (res !== 'activities') D.put(res, r.item);
    if (r.project) D.put('projects', r.project);
    if (r.activity) D.emit('activity', r.activity);
    if (res === 'activities') D.emit('activity', r.item);
    D.render();
    return r.item;
  };
  // 乐观更新：先改本地再发请求，失败改回来
  D.patch = async (res, id, patch, { force } = {}) => {
    const cur = D.find(res, id); if (!cur) return;
    const before = JSON.parse(JSON.stringify(cur));
    Object.assign(cur, patch); D.render();
    try {
      const r = await D.api('PATCH', `/${res}/${id}`, force ? { ...patch, force: true } : patch);
      D.put(res, r.item);
      if (r.project) D.put('projects', r.project);
      if (r.activity) D.emit('activity', r.activity);
      D.render();
      return r.item;
    } catch (e) {
      D.put(res, before); D.render();
      if (e.status !== 409) D.fail(e);
      throw e;
    }
  };
  const CHILD = ['deliverables', 'tasks', 'pendings', 'decisions'];
  D.remove = async (res, id, { label, text } = {}) => {
    const isAct = res === 'activities';
    const row = isAct ? Object.values(D.acts || {}).flat().find(x => x.id === Number(id)) : D.find(res, id);
    if (!row) return false;
    if (!(await D.confirm(text || `确定删除「${label}」吗？`))) return false;
    const removed = { [res]: [row] };
    if (isAct) D.acts[row.project_id] = D.acts[row.project_id].filter(x => x !== row);
    else D.state[res] = D.state[res].filter(x => x !== row);
    if (res === 'projects') for (const c of CHILD) { removed[c] = D.state[c].filter(x => x.project_id === row.id); D.state[c] = D.state[c].filter(x => x.project_id !== row.id); }
    const putBack = () => {
      if (isAct) return D.emit('activity', row);   // ai.js 会把它按日期放回 D.acts
      for (const [k, rows] of Object.entries(removed)) rows.forEach(r => D.put(k, r));
    };
    D.render();
    try { await D.api('DELETE', `/${res}/${id}`); }
    catch (e) { putBack(); D.render(); D.fail(e); return false; }
    D.emit('removed', { res, id });
    D.toast(`已删除${label ? '「' + D.firstLine(label, 24) + '」' : ''}`, {
      action: '撤销', timeout: 5000,
      onAction: async () => {
        try { await D.api('POST', `/${res}/${id}/restore`); putBack(); D.emit('restored', { res, id }); D.render(); D.toast('已恢复'); }
        catch (e) { D.fail(e); }
      }
    });
    return true;
  };

  /* ---------- 常用派生数据 ---------- */
  D.tasksOf = pid => D.state.tasks.filter(t => t.project_id === Number(pid));
  D.delivsOf = pid => D.state.deliverables.filter(d => d.project_id === Number(pid));
  D.pendingsOf = pid => D.state.pendings.filter(x => x.project_id === Number(pid));
  D.waitingOf = pid => D.pendingsOf(pid).filter(x => x.status === 'waiting');
  D.progressOf = pid => { const l = D.delivsOf(pid); return { done: l.filter(d => d.status === 'done').length, total: l.length }; };
  D.decisionsOf = pid => D.state.decisions.filter(x => x.project_id === Number(pid));
  // 旧版时间表留下的「同名待办」挂在交付物上（deliverable_id），页面上只显示那件交付物
  D.openTasks = pid => D.tasksOf(pid).filter(t => !t.deliverable_id);
  // 项目还「活着」：没归档、不是已交付 / 暂缓 / 观望（不属于任何项目的也算）
  D.projOk = pid => { if (!pid) return true; const p = D.project(pid); return !!p && !p.archived_at && !D.LIVE_OUT.includes(D.normStatus(p.status)); };
  // 等了几天：从问的那天（模板生成的从开始催那天）算起
  D.waitDays = x => Math.max(0, D.diffDays(D.today(), x.asked_at || x.remind_from || D.isoToShDate(x.created_at) || D.today()));
  // 待确认的紧急程度：有「最晚哪天要」就按离那天还有几天算；没有就按等了几天（设置里的天数）
  D.pendState = x => {
    const today = D.today();
    if (x.status !== 'waiting') return { level: '', text: '' };
    if (x.remind_from && x.remind_from > today) return { later: true, level: '', text: `${D.fmtDate(x.remind_from)} 开始催` };
    if (x.need_by) {
      const d = D.diffDays(x.need_by, today);
      if (d < 0) return { level: 'danger', text: `已过最晚日期 ${-d} 天`, d };
      if (d <= 2) return { level: 'warn', text: d === 0 ? '今天就要' : `最晚 ${D.fmtDate(x.need_by)}（${D.wk(x.need_by)}），还有 ${d} 天`, d };
      return { level: '', text: `最晚 ${D.fmtDate(x.need_by)}（${D.wk(x.need_by)}），还有 ${d} 天`, d };
    }
    const w = D.waitDays(x), c = D.cfg().nudge_days;
    return { level: w >= c.danger ? 'danger' : w >= c.warn ? 'warn' : '', text: '', d: 9999 };
  };
  D.waitLevel = x => D.pendState(x).level;
  const LV = { danger: 0, warn: 1, '': 2 };
  D.sortWaiting = list => [...list].sort((a, b) => {
    const A = D.pendState(a), B = D.pendState(b);
    return LV[A.level] - LV[B.level] || b.blocking - a.blocking || (A.d ?? 9999) - (B.d ?? 9999) || D.waitDays(b) - D.waitDays(a) || a.id - b.id;
  });
  // 一个项目的排期：时间表生成的待办、交付物、等别人给的，按日期排在一起
  D.scheduleOf = pid => [
    ...D.tasksOf(pid).filter(t => t.offset_days != null && !t.deliverable_id && t.due_at).map(t => ({ kind: 'task', date: t.due_at, off: t.offset_days, title: t.title, done: !!t.done, milestone: !!t.milestone, ref: t })),
    ...D.delivsOf(pid).filter(d => d.offset_days != null && d.due_at).map(d => ({ kind: 'deliverable', date: d.due_at, off: d.offset_days, title: D.delivLabel(d), done: d.status === 'done', ref: d })),
    ...D.pendingsOf(pid).filter(x => x.offset_days != null && x.need_by).map(x => ({ kind: 'wait', date: x.need_by, off: x.offset_days, title: x.question, done: x.status !== 'waiting', ref: x }))
  ].sort((a, b) => a.date.localeCompare(b.date) || a.off - b.off);
  // 下一个节点：还没完成的、日期最早的那个
  D.nextNode = pid => D.scheduleOf(pid).find(n => !n.done);
  D.delivLabel = d => [d.name || d.type, d.version].filter(Boolean).join(' ');
  // 交付前检查：按交付物类型匹配清单（清单的「适用交付物」为空 = 所有类型）
  D.checklistsFor = type => D.state.checklists.filter(cl => !(cl.applies_to || []).length || cl.applies_to.includes(type));
  D.checkProgress = d => {
    let total = 0, done = 0;
    for (const cl of D.checklistsFor(d.type)) for (const item of cl.items || []) { total++; if (d.checklist_state?.[cl.id]?.[item]) done++; }
    return { total, done };
  };

  /* ---------- 日期小弹层（快捷 今天 / 明天 / +3 / +7 / +14） ---------- */
  D.datePopover = (anchor, value, onPick, { base, clear = true } = {}) => {
    const from = base || D.today();
    const el = D.popover(anchor, `<div class="quick">${[['今天', 0], ['明天', 1], ['+3 天', 3], ['+7 天', 7], ['+14 天', 14]].map(([l, n]) => `<button type="button" class="tb" data-d="${D.addDays(from, n)}">${l}</button>`).join('')}</div>
      <input type="date" value="${D.esc(value || '')}" aria-label="选日期">
      ${clear ? '<div class="pop-foot"><button type="button" class="btn sm ghost" data-d="">清空</button></div>' : ''}`, { cls: 'datepop' });
    el.addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (b) { D.closePopover(); onPick(b.dataset.d || null); } });
    el.querySelector('input').addEventListener('change', e => { if (e.target.value) { D.closePopover(); onPick(e.target.value); } });
  };

  D.setTaskDone = async (id, done) => {
    if (!D.find('tasks', id)) return;
    try { await D.patch('tasks', id, done ? { done: 1, done_at: D.today() } : { done: 0 }); } catch { /* 已提示 */ }
  };

  // 排期 / 回填 / 拆解之后，服务端返回这个项目的全部子记录，整体替换
  D.applySubtree = r => {
    const pid = r.project.id;
    D.put('projects', r.project);
    for (const k of ['tasks', 'deliverables', 'pendings', 'decisions', 'wins']) if (Array.isArray(r[k])) D.state[k] = D.state[k].filter(x => x.project_id !== pid).concat(r[k]);
    delete D.acts?.[pid];
    D.render();
  };

  /* ---------- 识别 AI 写的日期和时长（回填用） ---------- */
  // 2026-10-22 / 10-22 / 10/22 / 10月22日 → YYYY-MM-DD；没写年份的取今年，已经过去两个月以上的算明年
  D.parseDateLoose = s => {
    s = String(s || '').trim();
    let m = s.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    let y, mo, d;
    if (m) [, y, mo, d] = m.map(Number);
    else if ((m = s.match(/(\d{1,2})[-/.月](\d{1,2})日?/))) { [, mo, d] = m.map(Number); y = Number(D.today().slice(0, 4)); }
    else return null;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    let out = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (!m[0].match(/\d{4}/) && D.diffDays(out, D.today()) < -60) out = `${y + 1}${out.slice(4)}`;
    return new Date(out + 'T00:00:00Z').toISOString().slice(0, 10) === out ? out : null;
  };
  // 40 / 40 分钟 / 1.5 小时 / 3h / 半天 / 2 天（一天按 8 小时） → 分钟
  D.parseMinutes = s => {
    s = String(s || '').replace(/[，,]/g, '').trim();
    if (/半天/.test(s)) return 240;
    const m = s.match(/(\d+(?:\.\d+)?)\s*(小时|个小时|h|H|天|分钟|分|min|m)?/);
    if (!m) return null;
    const n = Number(m[1]), u = m[2] || '分钟';
    return Math.round(/小时|h/i.test(u) ? n * 60 : /天/.test(u) ? n * 480 : n);
  };

  /* ---------- 简单事件 ---------- */
  const handlers = {};
  D.on = (ev, fn) => (handlers[ev] ||= []).push(fn);
  D.emit = (ev, data) => (handlers[ev] || []).forEach(fn => fn(data));
  D.render = (force = false) => D.emit('render', force);   // force：表单类页面里正在输入时也要重画
})();
