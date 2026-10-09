/* 我的工作台 · 启动、登录、左侧导航、页头、路由（URL hash）、快捷键、主题。
   v3：左侧导航（v5.1 起顺序：今天 / 项目 / 收集箱 / 知识库 / 素材库 / 资源 / 记录，知识库和素材库挨着）+ 设置；页头每页一套（今天是问候语）；
   切换页面时卡片依次浮现；手机上是底部 5 个按钮（今天 / 项目 / ＋收集 / 资源 / 更多）。
   v5：三种风格（经典 / 精密 / 玻璃，theme.js 写到 <html data-skin>），内容一样、只是画法不同；
   精密和玻璃的左栏多一块「进行中的项目」（经典风格里藏起来）；左下角不再显示提效。 */
(() => {
  const D = window.DESK;
  const { esc, $ } = D;
  D.q = '';
  D.current = null;
  const VIEWS = [
    { id: 'today', kind: 'today', name: '今天', icon: 'sun' },
    { id: 'projects', kind: 'projects', name: '项目', icon: 'folders' },
    { id: 'inbox', kind: 'inbox', name: '收集箱', icon: 'inbox' },
    { id: 'kb', kind: 'kb', name: '知识库', icon: 'book' },
    { id: 'assets', kind: 'assets', name: '素材库', icon: 'image' },
    { id: 'resources', kind: 'resources', name: '资源', icon: 'grid' },
    { id: 'records', kind: 'records', name: '记录', icon: 'chart' }
  ];
  const SETTINGS = { id: 'settings', kind: 'settings', name: '设置', icon: 'settings' };
  // 这些页面里有输入框：正在输入时，后台数据刷新不重画（免得光标跳走、打了一半的字没了）
  const FORM_PAGES = ['settings', 'inbox', 'today', 'records', 'project', 'resources', 'kb'];
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let inApp = false;   // 是不是从工作台里点过来的（项目页「← 项目」用浏览器后退还是直接去项目列表）

  /* ---------- 登录 ---------- */
  function showLogin(msg = '') {
    $('#app').hidden = true; $('#login').hidden = false; document.body.classList.remove('authed');
    $('#login-msg').textContent = msg;
    $('#login-pw').value = ''; $('#login-pw').focus();
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
  }
  let justLoggedIn = 0;
  D.onUnauthorized = reason => showLogin(reason === 'nocookie' && Date.now() - justLoggedIn < 15000
    ? '密码是对的，但这个浏览器没有保存登录信息（Cookie 被拦了）。请在浏览器设置里允许 cosmoswong.com 的 Cookie、关掉拦截类插件，或换一个浏览器 / 退出无痕模式再试。'
    : '登录过期了，请重新输入密码');

  async function login(e) {
    e.preventDefault();
    const pw = $('#login-pw').value;
    if (!pw) { $('#login-msg').textContent = '请输入密码'; return; }
    $('#login-msg').textContent = '正在验证…';
    const btn = $('#login button'); btn.disabled = true;
    try { await D.api('POST', '/login', { password: pw }); justLoggedIn = Date.now(); $('#login-msg').textContent = ''; await start(); }
    catch (err) {
      $('#login-msg').textContent = err.message; $('#login-pw').select();
      const f = $('#login'); f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
    }
    finally { btn.disabled = false; }
  }

  async function reload() {
    const data = await D.api('GET', '/bootstrap');
    Object.assign(D.state, {
      projects: data.projects, deliverables: data.deliverables, tasks: data.tasks, pendings: data.pendings, decisions: data.decisions || [],
      ideas: data.ideas, wins: data.wins, inbox: data.inbox, timelines: data.timelines, checklists: data.checklists, prompts: data.prompt_templates,
      links: data.links, resources: data.resources || [], settings: data.settings
    });
    D.acts = {};
  }

  async function start() {
    $('#login').hidden = true; $('#app').hidden = false; document.body.classList.add('authed');
    renderSkeleton();
    try { await reload(); }
    catch (e) { if (e.status !== 401) showLogin(e.message); return; }
    D.emit('ready');
    route(true);
  }
  // 第一次读数据时先画一个骨架，不让页面空白
  function renderSkeleton() {
    $('#head').innerHTML = '<div class="htitle"><div class="skel-line" style="width:260px;height:26px"></div><div class="skel-line" style="width:180px"></div></div>';
    $('#view').innerHTML = `<div class="bento">${[7, 5, 5, 7].map(n => `<section class="card-box s${n} skel-card"><div class="skel-line" style="width:40%"></div><div class="skel-line"></div><div class="skel-line" style="width:80%"></div><div class="skel-line" style="width:60%"></div></section>`).join('')}</div>`;
  }

  /* ---------- 路由：#today / #projects / #inbox / #resources / #assets / #records / #settings / #p/12（可带 /区块） ---------- */
  function viewOf(id) {
    const m = /^p\/(\d+)(?:\/(\w+))?$/.exec(id || '');
    if (m) return { id: `p/${m[1]}`, kind: 'project', pid: Number(m[1]), sec: m[2] };
    if (/^kb\/./.test(id || '')) return { id, kind: 'kb', path: id.slice(3) };
    return id === 'settings' ? SETTINGS : VIEWS.find(v => v.id === id) || VIEWS[0];
  }
  function show(id) { const h = '#' + id; if (location.hash === h) route(); else location.hash = h; }
  function route(first) {
    const h = decodeURIComponent(location.hash.slice(1));
    const view = viewOf(h || 'today');
    const changed = D.current?.id !== view.id;
    D.current = view;
    if (!h) history.replaceState(null, '', '#' + view.id);
    D.closePopover?.();
    renderSide(); renderMain(true, changed || first === true);
    if (changed) $('#main').scrollTop = 0;
    if (view.sec) requestAnimationFrame(() => { const s = D.$('#sec-' + view.sec); if (s) { if (s.tagName === 'DETAILS') s.open = true; s.scrollIntoView({ block: 'start' }); } });
  }
  D.app = {
    show,
    openProject: (pid, sec) => show(`p/${pid}${sec ? '/' + sec : ''}`),
    back: () => { if (inApp && history.length > 1) history.back(); else show('projects'); },
    logout: async () => {
      try { await D.api('POST', '/logout'); } catch { /* 退出失败也照样回登录页 */ }
      Object.assign(D.state, { projects: [], deliverables: [], tasks: [], pendings: [], decisions: [], ideas: [], wins: [], inbox: [], timelines: [], checklists: [], prompts: [], links: [], resources: [], settings: {} });
      D.acts = {};
      showLogin('已退出登录');
    },
    reload: async () => { await reload(); D.render(true); }
  };

  /* ---------- 左侧导航 ---------- */
  function badges() {
    const today = D.today();
    const live = x => D.projOk(x.project_id);
    const overdue = D.state.tasks.filter(t => !t.done && !t.deliverable_id && t.due_at && t.due_at < today && live(t)).length + D.state.deliverables.filter(d => d.status !== 'done' && d.due_at && d.due_at < today && live(d)).length;
    const dueToday = D.state.tasks.filter(t => !t.done && !t.deliverable_id && t.due_at === today && live(t)).length + D.state.deliverables.filter(d => d.status !== 'done' && d.due_at === today && live(d)).length;
    const inbox = D.state.inbox.filter(i => !i.processed_at).length;
    const active = D.state.projects.filter(p => !p.archived_at && !D.LIVE_OUT.includes(D.normStatus(p.status))).length;
    return {
      today: overdue ? { n: overdue, cls: 'red', title: `${overdue} 件逾期` } : dueToday ? { n: dueToday, title: `今天 ${dueToday} 件` } : null,
      projects: active ? { n: active, title: `${active} 个进行中` } : null,
      inbox: inbox ? { n: inbox, cls: 'amber', title: `${inbox} 条没处理` } : null,
      assets: D.assets?.files?.length ? { n: D.assets.files.length.toLocaleString('en-US'), title: '本机素材' } : null
    };
  }
  const navBtn = (v, cur, b) => { const x = b[v.id];
    return `<button type="button" class="nav${cur === v.id ? ' on' : ''}" data-id="${v.id}" ${cur === v.id ? 'aria-current="page"' : ''} title="${esc(v.name)}"><span class="ni">${D.icon(v.icon)}</span><span class="lb-t">${esc(v.name)}</span>${x ? `<span class="n ${x.cls || ''}" title="${esc(x.title)}">${x.n}</span>` : ''}</button>`; };
  function renderSide() {
    const b = badges(), cur = D.current?.kind === 'project' ? 'projects' : D.current?.kind === 'kb' ? 'kb' : D.current?.id;
    const projs = D.dashProjects ? D.dashProjects().slice(0, 6) : [];
    const curPid = D.current?.kind === 'project' ? D.current.pid : null;
    const side = projs.length ? `<div class="side-proj"><div class="side-h">进行中的项目<button type="button" class="icon" data-new-project title="新建项目" aria-label="新建项目">${D.icon('plus', 'sm')}</button></div>${projs.map(p => { const st = D.projStats(p);
      return `<button type="button" class="sp${curPid === p.id ? ' on' : ''}" data-open-project="${p.id}" title="${esc(p.title)}">${D.pie(st.deliv)}<span class="spt">${esc(p.title)}</span><span class="spd${st.days != null && st.days <= 3 && st.days >= 0 ? ' hot' : ''}">${esc(D.tLabel(p))}</span></button>`; }).join('')}</div>` : '';
    $('#tabs').innerHTML = VIEWS.map(v => navBtn(v, cur, b)).join('') + side + '<div class="sep"></div>' + navBtn(SETTINGS, cur, b);
    const pref = window.DESK_THEME?.get() || 'auto';
    $('#side-foot').innerHTML = `<div class="theme-seg" role="group" aria-label="外观">${[['auto', 'monitor', '跟随系统'], ['light', 'sun', '浅色'], ['dark', 'moon', '深色']].map(([k, ic, t]) => `<button type="button" data-theme-set="${k}" class="${pref === k ? 'on' : ''}" title="${t}" aria-label="${t}" aria-pressed="${pref === k}">${D.icon(ic)}</button>`).join('')}</div>`;
    renderBottom(b, cur);
  }
  function renderBottom(b, cur) {
    const more = ['inbox', 'kb', 'assets', 'records', 'settings'].includes(cur);
    const x = b.today;
    $('#bottombar').innerHTML = `
      <button type="button" data-goto="today" class="${cur === 'today' ? 'on' : ''}">${D.icon('sun')}今天${x ? `<span class="badge ${x.cls || ''}">${x.n}</span>` : ''}</button>
      <button type="button" data-goto="projects" class="${cur === 'projects' ? 'on' : ''}">${D.icon('folders')}项目</button>
      <button type="button" class="cap" data-capture aria-label="收集一条">${D.icon('plus')}</button>
      <button type="button" data-goto="resources" class="${cur === 'resources' ? 'on' : ''}">${D.icon('grid')}资源</button>
      <button type="button" data-more class="${more ? 'on' : ''}">${D.icon('menu')}更多${b.inbox ? '<span class="badge amber">' + b.inbox.n + '</span>' : ''}</button>`;
  }
  function openMore(anchor) {
    const b = badges(), cur = D.current?.kind === 'project' ? 'projects' : D.current?.kind === 'kb' ? 'kb' : D.current?.id;
    const el = D.popover(anchor, `<div class="sheet-more">${['inbox', 'kb', 'assets', 'records'].map(id => navBtn(VIEWS.find(v => v.id === id), cur, b)).join('')}${navBtn(SETTINGS, cur, b)}</div>`, { cls: 'sheet' });
    el.addEventListener('click', e => { const n = e.target.closest('.nav[data-id]'); if (n) { D.closePopover(); show(n.dataset.id); } });
  }

  /* ---------- 页头 ---------- */
  function greet() {
    const h = D.nowHour();
    return h < 5 ? '夜深了，早点休息' : h < 11 ? '早上好，开始干活吧' : h < 13 ? '中午好，记得吃饭' : h < 18 ? '下午好，稳稳推进' : h < 22 ? '晚上好，收个尾吧' : '夜深了，早点休息';
  }
  function headInfo(view) {
    const S = D.state, live = S.projects.filter(p => !p.archived_at);
    const cnt = st => live.filter(p => D.normStatus(p.status) === st).length;
    switch (view.kind) {
      case 'today': {
        const today = D.today();
        const next = live.filter(p => D.normStatus(p.status) === 'active' && p.launch_at && p.launch_at >= today).sort((a, b) => a.launch_at.localeCompare(b.launch_at))[0];
        const d = next ? D.diffDays(next.launch_at, today) : null;
        return { title: greet(), sub: `${esc(D.fmtDateW(today))}${next ? ` · <b>${d === 0 ? `「${esc(next.title)}」今天上线` : `距「${esc(next.title)}」${next.launch_tentative ? '暂定' : ''}上线还有 ${d} 天`}</b>` : ''}`, newp: true };
      }
      case 'projects': return { title: '项目', sub: `进行中 ${cnt('active')} 个${cnt('live') ? ` · 收尾 ${cnt('live')} 个` : ''}${cnt('watch') ? ` · 观望 ${cnt('watch')} 个` : ''} · 已交付 ${cnt('done')} 个`, newp: true };
      case 'project': return { crumb: true };
      case 'inbox': { const n = S.inbox.filter(i => !i.processed_at).length; return { title: '收集箱', sub: n ? `还有 ${n} 条没处理` : '都处理完了' }; }
      case 'resources': return { title: '资源', sub: '网页、本机文件夹、小工具、文档，都在这一页；本机的点一下就复制路径' };
      case 'assets': return { title: '素材库', sub: D.assetsSub ? D.assetsSub() : '' };
      case 'kb': return { title: '知识库', sub: D.kbSub ? D.kbSub() : '' };
      case 'records': return { title: '记录', sub: '交付过什么、改了几版，玩法创意每周一个' };
      case 'settings': return { title: '设置', sub: '风格与外观、选项、模板、知识库和数据' };
      default: return { title: '' };
    }
  }
  function renderHead(view) {
    const h = headInfo(view);
    $('#head').innerHTML = `<div class="htitle">${h.crumb ? `<button type="button" class="hcrumb" data-back>${D.icon('back', 'sm')}项目</button>` : `<h1 class="hi">${esc(h.title)}</h1>${h.sub ? `<div class="hsub">${h.sub}</div>` : ''}`}</div>
      <div class="hact"><button type="button" class="qbtn" data-palette aria-label="搜索（⌘K）">${D.icon('search')}<span>搜项目、工具、素材</span><kbd>⌘ K</kbd></button>
        ${h.newp ? `<button type="button" class="btn ghost" data-new-project title="新建项目（n）">${D.icon('plus', 'sm')}项目</button>` : ''}
        <button type="button" class="btn" data-capture title="收集一条（c）">${D.icon('plus', 'sm')}收集</button></div>`;
  }

  /* ---------- 主区 ---------- */
  const RENDER = () => ({ today: D.renderToday, projects: D.renderProjects, project: D.renderProject, inbox: D.renderInbox, records: D.renderRecords, settings: D.renderSettings, resources: D.renderResources, assets: D.renderAssets, kb: D.renderKb });
  function renderMain(force, enter) {
    const view = D.current; if (!view) return;
    const main = $('#main'), el = $('#view');
    const a = document.activeElement;
    const typing = a && main.contains(a) && !a.dataset.done && !a.dataset.keepFocus && (a.matches('.cell-input') || (FORM_PAGES.includes(view.kind) && a.matches('input:not([type=checkbox]):not([type=radio]), textarea, select')));
    if (!force && typing) return;
    // 筛选框：重画后把光标放回原处（边打字边筛选）
    const keep = a && a.dataset?.keepFocus ? { id: a.dataset.keepFocus, s: a.selectionStart, e: a.selectionEnd } : null;
    const scroll = main.scrollTop;
    main.dataset.kind = view.kind;
    renderHead(view);
    RENDER()[view.kind](view, el);
    if (keep) { const f = el.querySelector(`[data-keep-focus="${keep.id}"]`); if (f) { f.focus(); try { f.setSelectionRange(keep.s, keep.e); } catch { /* 日期框等不支持 */ } } }
    if (enter && !reduced()) {
      el.querySelectorAll(':scope > .page > *, :scope .bento > *').forEach((c, i) => c.style.setProperty('--i', Math.min(i, 10)));
      main.classList.remove('enter'); void main.offsetWidth; main.classList.add('enter');
      clearTimeout(renderMain.t); renderMain.t = setTimeout(() => main.classList.remove('enter'), 1200);
      countUp(el);
    } else { main.scrollTop = scroll; el.querySelectorAll('[data-count]').forEach(n => { n.textContent = n.dataset.count; }); }
  }
  // 数字从 0 滚到实际值
  function countUp(root) {
    root.querySelectorAll('[data-count]').forEach(n => {
      const to = Number(n.dataset.count), dec = String(n.dataset.count).includes('.') ? 1 : 0, t0 = performance.now(), dur = 900;
      if (!Number.isFinite(to)) return;
      const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - (1 - k) ** 3; n.textContent = (to * e).toFixed(dec); if (k < 1) requestAnimationFrame(step); };
      n.textContent = (0).toFixed(dec); requestAnimationFrame(step);
    });
  }
  D.on('render', force => { if ($('#app').hidden || !D.current) return; renderSide(); renderMain(force, false); });

  /* ---------- 换风格：先淡出、换、再淡入（浏览器支持就用 View Transitions） ---------- */
  D.setSkin = v => {
    if ((window.DESK_THEME?.getSkin() || 'classic') === v) return;
    const go = () => { window.DESK_THEME?.setSkin(v); renderSide(); renderMain(true, false); D.emit('skin', v); };
    if (document.startViewTransition && !reduced()) document.startViewTransition(go); else go();
    D.toast(`已换成「${{ classic: '经典', precise: '精密', glass: '玻璃' }[v] || v}」风格`, { icon: 'sparkle' });
  };

  /* ---------- 庆祝一下（今天的事全做完时） ---------- */
  D.confetti = (x = innerWidth / 2, y = innerHeight / 3) => {
    if (reduced()) return;
    const box = document.createElement('div'); box.className = 'confetti';
    const acc = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const pal = [acc || '#0f8b7d', '#f0b35a', '#ff8a80', '#8b8cff', '#4cd39b', '#7fc8f8'];
    box.innerHTML = Array.from({ length: 36 }, (_, i) => {
      const ang = Math.random() * Math.PI * 2, dist = 120 + Math.random() * 220;
      return `<i style="--x:${x}px;--y:${y}px;--dx:${Math.cos(ang) * dist}px;--dy:${Math.sin(ang) * dist + 160}px;--r:${Math.round(Math.random() * 720 - 360)}deg;--c:${pal[i % pal.length]};animation-delay:${Math.random() * 80}ms"></i>`;
    }).join('');
    document.body.append(box); setTimeout(() => box.remove(), 1500);
  };

  /* ---------- 绑定 ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    $('#login').addEventListener('submit', login);
    const getView = () => D.current;
    const main = $('#main');
    D.todayEvents(main, getView); D.projectEvents(main); D.projectsListEvents(main); D.inboxEvents(main, getView);
    D.ideasEvents(main, getView); D.winsEvents(main, getView); D.recordsEvents(main); D.settingsEvents(main);
    D.resourcesEvents?.(main); D.assetsEvents?.(main); D.kbEvents?.(main);
    document.addEventListener('click', e => {
      const g = e.target.closest('[data-goto]');
      if (g) {
        if (g.dataset.seg) D.pref.set('records.seg', g.dataset.seg);
        if (g.dataset.sec) D.pref.set('settings.jump', g.dataset.sec);
        return show(g.dataset.goto);
      }
      const o = e.target.closest('[data-open-project]');
      if (o && !e.target.closest('a')) return D.app.openProject(o.dataset.openProject, o.dataset.tab);
      if (e.target.closest('[data-new-project]')) return D.newProject.open();
      if (e.target.closest('[data-capture]')) return D.capture.open();
      if (e.target.closest('[data-palette]')) return D.palette.open();
      const m = e.target.closest('[data-more]'); if (m) return openMore(m);
      const th = e.target.closest('[data-theme-set]');
      if (th) { window.DESK_THEME?.set(th.dataset.themeSet); renderSide(); if (D.current?.kind === 'settings') renderMain(true); return; }
      const sk = e.target.closest('[data-skin-set]');
      if (sk) { D.setSkin(sk.dataset.skinSet); return; }
    });
    $('#tabs').addEventListener('click', e => { const t = e.target.closest('.nav[data-id]'); if (t) show(t.dataset.id); });
    // 系统切换深浅色时，左下角的主题按钮也跟着刷新
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (!$('#app').hidden) renderSide(); });

    document.addEventListener('keydown', e => {
      if ($('#app').hidden) return;
      const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); return D.palette.open(); }
      if (e.key === 'Escape') {
        if (D.popOpen()) { e.preventDefault(); return D.closePopover(); }
        if (document.querySelector('dialog[open]')) return;   // 弹窗自己会关
        if (typing && e.target.matches('[data-keep-focus]')) { const t = e.target; t.blur(); t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); return; }   // 先失焦再清空，重画时就不会把光标放回去
        if (!typing && D.current?.kind === 'project') return D.app.back();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
      if (e.key === '/') { e.preventDefault(); D.palette.open(); }
      if (e.key === 'c') { e.preventDefault(); D.capture.open(); }
      if (e.key === 'n') { e.preventDefault(); D.newProject.open(); }
      if (e.key === 't') { e.preventDefault(); show('today'); }
    });
    window.addEventListener('hashchange', () => { if (!$('#app').hidden) { inApp = true; route(); } });

    // 已登录就直接进；未登录显示登录框
    D.api('GET', '/session').then(r => r.authed ? start() : showLogin()).catch(err => showLogin(err.message));
  });
})();
