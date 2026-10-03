/* 我的工作台 · 启动、登录、标签栏、路由（URL hash）、搜索、快捷键。
   v2：4 个标签（今天 / 项目 / 收集箱 / 记录）+ 项目页（#p/12）+ 设置；手机上是底部 3 个大按钮（今天 / ＋收集 / 项目）。 */
(() => {
  const D = window.DESK;
  const { esc, $ } = D;
  D.q = '';
  D.current = null;
  const VIEWS = [
    { id: 'today', kind: 'today', name: '今天', icon: '☀️' },
    { id: 'projects', kind: 'projects', name: '项目', icon: '📋' },
    { id: 'inbox', kind: 'inbox', name: '收集箱', icon: '📥' },
    { id: 'records', kind: 'records', name: '记录', icon: '📈' }
  ];
  const SETTINGS = { id: 'settings', kind: 'settings', name: '设置', icon: '⚙️' };
  // 这些页面里有输入框：正在输入时，后台数据刷新不重画（免得光标跳走、打了一半的字没了）
  const FORM_PAGES = ['settings', 'inbox', 'today', 'records', 'project'];
  const SEARCHABLE = ['projects', 'inbox', 'records'];
  let inApp = false;   // 是不是从工作台里点过来的（项目页「← 项目」用浏览器后退还是直接去项目列表）

  /* ---------- 登录 ---------- */
  function showLogin(msg = '') {
    $('#app').hidden = true; $('#login').hidden = false; document.body.classList.remove('authed');
    $('#login-msg').textContent = msg;
    $('#login-pw').value = ''; $('#login-pw').focus();
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
  }
  D.onUnauthorized = () => showLogin('登录过期了，请重新输入密码');

  async function login(e) {
    e.preventDefault();
    const pw = $('#login-pw').value;
    if (!pw) { $('#login-msg').textContent = '请输入密码'; return; }
    $('#login-msg').textContent = '正在验证…';
    const btn = $('#login button'); btn.disabled = true;
    try { await D.api('POST', '/login', { password: pw }); $('#login-msg').textContent = ''; await start(); }
    catch (err) { $('#login-msg').textContent = err.message; $('#login-pw').select(); }
    finally { btn.disabled = false; }
  }

  async function reload() {
    const data = await D.api('GET', '/bootstrap');
    Object.assign(D.state, {
      projects: data.projects, deliverables: data.deliverables, tasks: data.tasks, pendings: data.pendings, decisions: data.decisions || [],
      ideas: data.ideas, wins: data.wins, inbox: data.inbox, timelines: data.timelines, checklists: data.checklists, prompts: data.prompt_templates,
      links: data.links, settings: data.settings
    });
    D.acts = {};
  }

  async function start() {
    try { await reload(); }
    catch (e) { if (e.status !== 401) showLogin(e.message); return; }
    $('#login').hidden = true; $('#app').hidden = false; document.body.classList.add('authed');
    route();
  }

  /* ---------- 路由：#today / #projects / #inbox / #records / #settings / #p/12（可带 /区块） ---------- */
  function viewOf(id) {
    const m = /^p\/(\d+)(?:\/(\w+))?$/.exec(id || '');
    if (m) return { id: `p/${m[1]}`, kind: 'project', pid: Number(m[1]), sec: m[2] };
    return id === 'settings' ? SETTINGS : VIEWS.find(v => v.id === id) || VIEWS[0];
  }
  function show(id) { const h = '#' + id; if (location.hash === h) route(); else location.hash = h; }
  function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    const view = viewOf(h || 'today');
    const changed = D.current?.id !== view.id;
    D.current = view;
    if (!h) history.replaceState(null, '', '#' + view.id);
    renderTabs(); renderMain(true);
    if (changed) $('#main').scrollTop = 0;
    if (view.sec) requestAnimationFrame(() => { const s = D.$('#sec-' + view.sec); if (s) { if (s.tagName === 'DETAILS') s.open = true; s.scrollIntoView({ block: 'start' }); } });
  }
  D.app = {
    show,
    openProject: (pid, sec) => show(`p/${pid}${sec ? '/' + sec : ''}`),
    back: () => { if (inApp && history.length > 1) history.back(); else show('projects'); },
    logout: async () => {
      try { await D.api('POST', '/logout'); } catch { /* 退出失败也照样回登录页 */ }
      Object.assign(D.state, { projects: [], deliverables: [], tasks: [], pendings: [], decisions: [], ideas: [], wins: [], inbox: [], timelines: [], checklists: [], prompts: [], links: [], settings: {} });
      D.acts = {};
      showLogin('已退出登录');
    },
    reload: async () => { await reload(); D.render(true); }
  };

  function badges() {
    const today = D.today();
    const live = x => D.projOk(x.project_id);
    const overdue = D.state.tasks.filter(t => !t.done && !t.deliverable_id && t.due_at && t.due_at < today && live(t)).length + D.state.deliverables.filter(d => d.status !== 'done' && d.due_at && d.due_at < today && live(d)).length;
    const dueToday = D.state.tasks.filter(t => !t.done && !t.deliverable_id && t.due_at === today && live(t)).length + D.state.deliverables.filter(d => d.status !== 'done' && d.due_at === today && live(d)).length;
    const inbox = D.state.inbox.filter(i => !i.processed_at).length;
    return {
      today: overdue ? { n: overdue, cls: 'red', title: `${overdue} 件逾期` } : dueToday ? { n: dueToday, title: `今天 ${dueToday} 件` } : null,
      inbox: inbox ? { n: inbox, cls: 'amber', title: `${inbox} 条没处理` } : null
    };
  }
  function renderTabs() {
    const b = badges(), cur = D.current?.kind === 'project' ? 'projects' : D.current?.id;
    $('#tabs').innerHTML = `<div class="tab-list" role="tablist">${VIEWS.map(v => { const x = b[v.id];
      return `<button type="button" role="tab" class="tab${cur === v.id ? ' on' : ''}" data-id="${v.id}" aria-selected="${cur === v.id}"><span class="ti">${v.icon}</span>${esc(v.name)}${x ? `<span class="badge ${x.cls || ''}" title="${esc(x.title)}">${x.n}</span>` : ''}</button>`; }).join('')}</div>`;
    D.$$('#bottombar [data-goto]').forEach(btn => btn.classList.toggle('on', btn.dataset.goto === cur));
    const tb = D.$('#bottombar [data-goto="today"] .badge'), x = b.today;
    if (tb) { tb.hidden = !x; tb.textContent = x ? x.n : ''; tb.className = 'badge ' + (x?.cls || ''); }
  }

  function renderMain(force) {
    const view = D.current; if (!view) return;
    const main = $('#main');
    const a = document.activeElement;
    // 已经提交完的格子输入框（data-done）不算在打字
    const typing = a && main.contains(a) && !a.dataset.done && (a.matches('.cell-input') || (FORM_PAGES.includes(view.kind) && a.matches('input:not([type=checkbox]):not([type=radio]), textarea, select')));
    if (!force && typing) return;
    const scroll = main.scrollTop;
    main.dataset.kind = view.kind;
    ({ today: D.renderToday, projects: D.renderProjects, project: D.renderProject, inbox: D.renderInbox, records: D.renderRecords, settings: D.renderSettings })[view.kind](view, main);
    main.scrollTop = scroll;
  }
  D.on('render', force => { if ($('#app').hidden) return; renderTabs(); renderMain(force); });

  /* ---------- 绑定 ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    $('#login').addEventListener('submit', login);
    const getView = () => D.current;
    const main = $('#main');
    D.todayEvents(main, getView); D.projectEvents(main); D.projectsListEvents(main); D.inboxEvents(main, getView);
    D.ideasEvents(main, getView); D.winsEvents(main, getView); D.recordsEvents(main); D.settingsEvents(main);
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
    });
    $('#tabs').addEventListener('click', e => { const t = e.target.closest('.tab[data-id]'); if (t) show(t.dataset.id); });
    $('#new-project').addEventListener('click', () => D.newProject.open());
    $('#open-capture').addEventListener('click', () => D.capture.open());
    $('#open-settings').addEventListener('click', () => show('settings'));

    const search = D.debounce(() => { if (!SEARCHABLE.includes(D.current?.kind)) show('projects'); else renderMain(true); }, 150);
    $('#q').addEventListener('input', e => { D.q = e.target.value.trim(); search(); });
    $('#q').addEventListener('keydown', e => { if (e.key === 'Escape') { e.target.value = ''; D.q = ''; search(); e.target.blur(); } });

    document.addEventListener('keydown', e => {
      if ($('#app').hidden) return;
      const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
      if (e.key === 'Escape') {
        if (D.popOpen()) { e.preventDefault(); return D.closePopover(); }
        if (document.querySelector('dialog[open]')) return;   // 弹窗自己会关
        if (!typing && D.current?.kind === 'project') return D.app.back();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
      if (e.key === '/') { e.preventDefault(); $('#q').focus(); $('#q').select(); }
      if (e.key === 'c') { e.preventDefault(); D.capture.open(); }
      if (e.key === 'n') { e.preventDefault(); D.newProject.open(); }
      if (e.key === 't') { e.preventDefault(); show('today'); }
    });
    window.addEventListener('hashchange', () => { if (!$('#app').hidden) { inApp = true; route(); } });

    // 已登录就直接进；未登录显示登录框
    D.api('GET', '/session').then(r => r.authed ? start() : showLogin()).catch(err => showLogin(err.message));
  });
})();
