/* 我的工作台 · 启动、登录、视图标签栏、搜索、路由（URL hash）、快捷键、新建项目。写法照 /kol 的 app.js。 */
(() => {
  const D = window.DESK;
  const { esc, $ } = D;
  D.q = '';
  D.current = null;
  const SETTINGS_VIEW = { id: 'settings', kind: 'settings', name: '设置', icon: '⚙️' };
  // 这些页面里有输入框：正在输入时，后台数据刷新不重画（免得光标跳走、打了一半的字没了）
  const FORM_PAGES = ['settings', 'inbox', 'ideas', 'today', 'waiting', 'wins', 'links'];
  const SEARCHABLE = ['list', 'board', 'timeline', 'waiting', 'inbox', 'ideas', 'wins', 'links'];

  /* ---------- 登录 ---------- */
  function showLogin(msg = '') {
    $('#app').hidden = true; $('#login').hidden = false;
    $('#login-msg').textContent = msg;
    $('#login-pw').value = ''; $('#login-pw').focus();
    D.drawer?.close();
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
      projects: data.projects, deliverables: data.deliverables, tasks: data.tasks, pendings: data.pendings, ideas: data.ideas, wins: data.wins,
      inbox: data.inbox, timelines: data.timelines, checklists: data.checklists, prompts: data.prompt_templates, links: data.links, views: data.saved_views, settings: data.settings
    });
    D.acts = {};
    const ids = new Set(D.state.projects.map(p => p.id));
    for (const id of [...D.sel]) if (!ids.has(id)) D.sel.delete(id);
  }

  async function start() {
    try { await reload(); }
    catch (e) { if (e.status !== 401) showLogin(e.message); return; }
    $('#login').hidden = true; $('#app').hidden = false;
    route(true);
  }

  /* ---------- 视图与路由 ---------- */
  function show(id, { fromHash = false } = {}) {
    const view = id === 'settings' ? SETTINGS_VIEW : D.viewById(id) || D.viewById('today');
    if (D.current?.id !== view.id) { D.sel.clear(); $('#main').scrollTop = 0; }
    D.current = view;
    view.cfg = D.viewCfg(view);
    if (fromHash && view.cfg) {
      const h = D.readHash();
      if (h.hasFilters) { view.cfg.filters = h.filters; D.saveViewCfg(view); }
      D.q = h.q; $('#q').value = D.q;
    }
    if (view.cfg) D.writeHash(view, D.q);
    else history.replaceState(null, '', '#' + view.id);
    renderTabs(); renderMain(true);
  }
  function route(initial) {
    const h = D.readHash();
    show(h.id || (initial ? 'today' : D.current?.id || 'today'), { fromHash: true });
  }

  function badges() {
    const today = D.today();
    const live = x => D.projOk(x.project_id);
    const overdue = D.state.tasks.filter(t => !t.done && t.due_at && t.due_at < today && live(t)).length + D.state.deliverables.filter(d => d.status !== 'done' && d.due_at && d.due_at < today && live(d)).length;
    const dueToday = D.state.tasks.filter(t => !t.done && t.due_at === today && live(t)).length + D.state.deliverables.filter(d => d.status !== 'done' && d.due_at === today && live(d)).length;
    // 角标和「在等谁」视图同一口径：只排除已归档项目的（暂缓项目的待确认也还在等）
    const waits = D.state.pendings.filter(x => x.status === 'waiting' && (!x.project_id || (D.project(x.project_id) && !D.project(x.project_id).archived_at)));
    return {
      today: overdue ? { n: overdue, cls: 'red', title: `${overdue} 件逾期` } : dueToday ? { n: dueToday, title: `今天 ${dueToday} 件` } : null,
      waiting: waits.length ? { n: waits.length, cls: waits.some(x => D.waitLevel(x) === 'danger') ? 'red' : waits.some(x => D.waitLevel(x) === 'warn') ? 'amber' : '', title: '等待中的待确认' } : null,
      inbox: (() => { const n = D.state.inbox.filter(i => !i.processed_at).length; return n ? { n, cls: 'amber', title: `${n} 条没处理` } : null; })()
    };
  }
  function renderTabs() {
    const views = D.allViews(), b = badges();
    $('#tabs').innerHTML = `<div class="tab-list" role="tablist">${views.map(v => {
      const x = b[v.id];
      return `<button type="button" role="tab" class="tab${D.current?.id === v.id ? ' on' : ''}" data-id="${esc(v.id)}" aria-selected="${D.current?.id === v.id}"><span class="ti">${esc(v.icon)}</span>${esc(v.name)}${x ? `<span class="badge ${x.cls || ''}" title="${esc(x.title)}">${x.n}</span>` : ''}</button>`;
    }).join('')}</div><button type="button" class="tab add" data-newview title="把当前项目视图的筛选、分组、排序、列存成新视图">＋ 视图</button>`;
  }

  function renderMain(force) {
    const view = D.current; if (!view) return;
    const main = $('#main');
    const a = document.activeElement;
    // 已经提交完的格子输入框（data-done）不算在打字
    const typing = a && main.contains(a) && !a.dataset.done && (a.matches('.cell-input') || (FORM_PAGES.includes(view.kind) && a.matches('input:not([type=checkbox]):not([type=radio]), textarea, select')));
    if (!force && typing) return;
    const scroll = [main.scrollTop, main.querySelector('.table-wrap')?.scrollLeft, main.querySelector('.board')?.scrollLeft];
    main.dataset.kind = view.kind;
    ({
      today: D.renderToday, list: D.renderList, board: D.renderBoard, timeline: D.renderTimeline, waiting: D.renderWaiting,
      inbox: D.renderInbox, ideas: D.renderIdeas, wins: D.renderWins, links: D.renderLinks, settings: D.renderSettings
    })[view.kind](view, main);
    main.scrollTop = scroll[0];
    if (scroll[1] != null && main.querySelector('.table-wrap')) main.querySelector('.table-wrap').scrollLeft = scroll[1];
    if (scroll[2] != null && main.querySelector('.board')) main.querySelector('.board').scrollLeft = scroll[2];
  }
  D.on('render', force => { if ($('#app').hidden) return; renderTabs(); renderMain(force); });

  /* ---------- 自定义视图（项目列表 / 看板的筛选、分组、排序、列） ---------- */
  function newView(anchor) {
    const src = D.current?.cfg ? D.current : null;
    const el = D.popover(anchor, `<form class="pop-form">
      <p class="pop-title">新建视图</p>
      <p class="muted small">${src ? `会保存「${esc(src.name)}」当前的筛选、分组、排序和列。` : '从「项目」的默认设置开始。'}</p>
      <label>名字<input name="name" maxlength="40" required placeholder="例：本月要上线的"></label>
      <label>图标<input name="icon" maxlength="4" value="📋" class="w70"></label>
      <label>类型<select name="type"><option value="list" ${src?.kind !== 'board' ? 'selected' : ''}>列表</option><option value="board" ${src?.kind === 'board' ? 'selected' : ''}>看板</option></select></label>
      <div class="pop-foot"><button class="btn sm">创建</button></div></form>`, { width: 280 });
    el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target, name = f.name.value.trim(); if (!name) return;
      const cfg = src?.cfg ? { ...JSON.parse(JSON.stringify(src.cfg)), collapsed: {} } : { group: 'status', cols: [...D.DEFAULT_COLS], filters: {} };
      D.closePopover();
      try {
        const item = await D.create('views', { name, icon: f.icon.value.trim() || '📋', type: f.type.value, config: JSON.stringify(cfg) });
        show('v' + item.id); D.toast(`已新建视图「${name}」`);
      } catch (err) { D.fail(err); }
    });
  }
  function renameView(anchor, view) {
    const el = D.popover(anchor, `<form class="pop-form"><label>视图名字<input name="name" maxlength="40" value="${esc(view.name)}" required></label>
      <label>图标<input name="icon" maxlength="4" value="${esc(view.icon)}" class="w70"></label><div class="pop-foot"><button class="btn sm">保存</button></div></form>`);
    el.querySelector('form').addEventListener('submit', e => {
      e.preventDefault(); D.closePopover();
      D.patch('views', view.dbId, { name: e.target.name.value.trim(), icon: e.target.icon.value.trim() }).catch(() => {});
    });
  }
  async function deleteView(view) {
    const ok = await D.remove('views', view.dbId, { label: view.name, text: `删除视图「${view.name}」？（只删视图，不会删任何项目）` });
    if (ok) { D.resetViewCfg(view.id); show('projects'); }
  }
  async function logout() {
    try { await D.api('POST', '/logout'); } catch { /* 退出失败也照样回登录页 */ }
    Object.assign(D.state, { projects: [], deliverables: [], tasks: [], pendings: [], ideas: [], wins: [], inbox: [], timelines: [], checklists: [], prompts: [], links: [], views: [], settings: {} });
    D.acts = {};
    showLogin('已退出登录');
  }
  D.app = { show, newView, renameView, deleteView, logout, reload: async () => { await reload(); D.render(true); } };

  /* ---------- 新建项目（也用于「收集箱 → 转成项目」） ---------- */
  const npDlg = () => $('#newproj');
  let fromInbox = null;
  function openNew(preset = {}, inboxItem = null) {
    fromInbox = inboxItem;
    const c = D.cfg();
    const tls = [...D.state.timelines, D.GENERIC_TIMELINE];
    $('#newproj-title').textContent = inboxItem ? '收集箱 → 转成项目' : '新建项目';
    $('#newproj-form').innerHTML = `<div class="fgrid">
      <label class="fld wide"><span class="fl">项目名</span><input name="title" maxlength="120" required value="${esc(preset.title || '')}" placeholder="如：示例省份 A · 十一月活动"></label>
      <label class="fld"><span class="fl">类型</span><select name="kind">${D.selectOpts(c.kinds.map(k => k.name), preset.kind || c.kinds[0]?.name || '', { empty: '（不选）' })}</select></label>
      <label class="fld"><span class="fl">省份</span><select name="province">${D.selectOpts(c.provinces, preset.province || '', { empty: c.provinces.length ? '（全国 / 不选）' : '（还没设置省份清单）' })}</select></label>
      <label class="fld"><span class="fl">状态</span><select name="status">${D.selectOpts(c.statuses.map(s => ({ value: s.key, label: s.label })), preset.status || 'need')}</select></label>
      <label class="fld"><span class="fl">优先级</span><select name="priority">${D.selectOpts(D.PRIORITIES.map(p => ({ value: p.key, label: p.label })), preset.priority || 'mid')}</select></label>
      <label class="fld"><span class="fl">上线日</span><input type="date" name="launch_at" value="${esc(preset.launch_at || '')}"></label>
      <label class="fld"><span class="fl">我这边的截止日</span><input type="date" name="due_at" value="${esc(preset.due_at || '')}"></label>
      <label class="fld"><span class="fl">所属月份（月度活动用）</span><input type="month" name="month" value="${esc(preset.month || '')}"></label>
      <label class="fld"><span class="fl">需求方</span><input name="requester" maxlength="60" value="${esc(preset.requester || '')}" placeholder="如：省公司业务方"></label>
      <label class="fld wide"><span class="fl">一句话需求</span><textarea name="summary" rows="3" maxlength="2000">${esc(preset.summary || '')}</textarea></label>
      <label class="fld wide"><span class="fl">一键排期（可选）</span><select name="tl"><option value="">不套用时间表</option>${tls.map((t, i) => `<option value="${i}">${esc(t.name)}${t.builtin ? '（内置示例）' : ''}</option>`).join('')}</select></label>
      <label class="fld wide check" data-weekend hidden><input type="checkbox" name="weekend" checked> 遇到周末提前到周五（需要先填上线日）</label>
    </div>
    <div class="row end"><button type="button" class="btn sm ghost" data-np-close>取消</button><button class="btn sm">${inboxItem ? '转成项目' : '创建'}</button></div>`;
    const f = $('#newproj-form');
    f.tl.addEventListener('change', () => { f.querySelector('[data-weekend]').hidden = !f.tl.value; });
    npDlg().showModal();
    f.title.focus(); f.title.select();
  }
  async function submitNew(e) {
    e.preventDefault();
    const f = e.target, btn = f.querySelector('button:not([type=button])');
    const data = Object.fromEntries(['title', 'kind', 'province', 'status', 'priority', 'launch_at', 'due_at', 'month', 'requester', 'summary'].map(k => [k, f[k].value.trim() || null]));
    if (!data.title) return D.toast('项目名不能空', { error: true });
    const tl = f.tl.value !== '' ? [...D.state.timelines, D.GENERIC_TIMELINE][Number(f.tl.value)] : null;
    if (tl && !data.launch_at) return D.toast('要一键排期，先填上线日', { error: true });
    btn.disabled = true;
    try {
      const p = fromInbox ? await D.inboxConvert(fromInbox, 'project', data) : await D.create('projects', data);
      if (tl) await D.applyTimeline(p.id, tl, data.launch_at, f.weekend.checked);
      npDlg().close();
      D.toast(`已创建「${p.title}」`);
      D.drawer.open(p.id);
    } catch (err) { D.fail(err); }
    finally { btn.disabled = false; }
  }
  D.newProject = { open: openNew };

  /* ---------- 绑定 ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    $('#login').addEventListener('submit', login);
    const getView = () => D.current;
    const main = $('#main');
    D.listEvents(main, getView); D.boardEvents(main, getView); D.timelineEvents(main, getView); D.todayEvents(main, getView);
    D.waitingEvents(main, getView); D.inboxEvents(main, getView); D.ideasEvents(main, getView); D.winsEvents(main, getView);
    D.linksEvents(main, getView); D.settingsEvents(main, getView);
    document.addEventListener('click', e => {
      const g = e.target.closest('[data-goto]'); if (g) { D.drawer.close(); return show(g.dataset.goto); }
      const o = e.target.closest('[data-open-project]'); if (o && !o.closest('#drawer')) return D.drawer.open(o.dataset.openProject, o.dataset.tab);
      if (e.target.closest('[data-new-project]')) return openNew();
    });

    $('#tabs').addEventListener('click', e => {
      if (e.target.closest('[data-newview]')) return newView(e.target.closest('[data-newview]'));
      const t = e.target.closest('.tab[data-id]'); if (t) show(t.dataset.id);
    });
    D.sortable($('#tabs'), '.tab[data-id]', async ids => {
      try { await D.api('PUT', '/settings/view_order', { value: ids }); D.state.settings.view_order = ids; } catch (err) { D.fail(err); }
      renderTabs();
    });
    $('#new-project').addEventListener('click', () => openNew());
    $('#open-capture').addEventListener('click', () => D.capture.open());
    $('#open-settings').addEventListener('click', () => show('settings'));
    $('#newproj-form').addEventListener('submit', submitNew);
    npDlg().addEventListener('click', e => { if (e.target.closest('[data-np-close]')) npDlg().close(); });

    const search = D.debounce(() => {
      if (!SEARCHABLE.includes(D.current?.kind)) show('projects');
      if (D.current.cfg) D.writeHash(D.current, D.q);
      renderMain(true);
    }, 150);
    $('#q').addEventListener('input', e => { D.q = e.target.value.trim(); search(); });
    $('#q').addEventListener('keydown', e => { if (e.key === 'Escape') { e.target.value = ''; D.q = ''; search(); e.target.blur(); } });

    document.addEventListener('keydown', e => {
      if ($('#app').hidden) return;
      const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
      if (e.key === 'Escape') {
        if (D.popOpen()) { e.preventDefault(); return D.closePopover(); }
        if (document.querySelector('dialog[open]')) return;   // 弹窗自己会关
        if (D.drawer.isOpen()) return D.drawer.close();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
      if (e.key === '/') { e.preventDefault(); $('#q').focus(); $('#q').select(); }
      if (e.key === 'c') { e.preventDefault(); D.capture.open(); }
      if (e.key === 'n') { e.preventDefault(); openNew(); }
      if (e.key === 't') { e.preventDefault(); D.drawer.close(); show('today'); }
    });
    window.addEventListener('hashchange', () => { if (!$('#app').hidden) route(false); });

    // 已登录就直接进；未登录显示登录框
    D.api('GET', '/session').then(r => r.authed ? start() : showLogin()).catch(err => showLogin(err.message));
  });
})();
