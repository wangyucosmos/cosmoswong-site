/* KOL 工作台 · 启动、登录、视图标签栏、搜索、路由（URL hash）、快捷键。 */
(() => {
  const K = window.KOL;
  const { esc, $ } = K;
  K.q = '';
  K.current = null;
  const SETTINGS_VIEW = { id: 'settings', kind: 'settings', name: '设置', icon: '⚙️' };
  const FORM_PAGES = ['finder', 'templates', 'settings'];

  /* ---------- 登录 ---------- */
  function showLogin(msg = '') {
    $('#app').hidden = true; $('#login').hidden = false;
    $('#login-msg').textContent = msg;
    $('#login-pw').value = ''; $('#login-pw').focus();
    K.drawer?.close();
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
  }
  K.onUnauthorized = () => showLogin('登录过期了，请重新输入密码');

  async function login(e) {
    e.preventDefault();
    const pw = $('#login-pw').value;
    if (!pw) { $('#login-msg').textContent = '请输入密码'; return; }
    $('#login-msg').textContent = '正在验证…';
    const btn = $('#login button'); btn.disabled = true;
    try { await K.api('POST', '/login', { password: pw }); $('#login-msg').textContent = ''; await start(); }
    catch (err) { $('#login-msg').textContent = err.message; $('#login-pw').select(); }
    finally { btn.disabled = false; }
  }

  async function reload() {
    const data = await K.api('GET', '/bootstrap');
    Object.assign(K.state, data);
    const ids = new Set(K.state.kols.map(k => k.id));
    for (const id of [...K.sel]) if (!ids.has(id)) K.sel.delete(id);
  }

  async function start() {
    try { await reload(); }
    catch (e) { if (e.status !== 401) showLogin(e.message); return; }
    $('#login').hidden = true; $('#app').hidden = false;
    route(true);
  }

  /* ---------- 视图与路由 ---------- */
  function show(id, { fromHash = false } = {}) {
    const view = id === 'settings' ? SETTINGS_VIEW : K.viewById(id) || K.viewById('today');
    if (K.current?.id !== view.id) { K.sel.clear(); window.scrollTo(0, 0); $('#main').scrollTop = 0; }
    K.current = view;
    view.cfg = K.viewCfg(view);
    if (fromHash && view.cfg) {
      const h = K.readHash();
      if (h.hasFilters) { view.cfg.filters = h.filters; K.saveViewCfg(view); }
      K.q = h.q; $('#q').value = K.q;
    }
    K.pref.set('lastView', view.id);
    if (view.cfg) K.writeHash(view, K.q);
    else history.replaceState(null, '', '#' + view.id);
    renderTabs(); renderMain(true);
  }
  function route(initial) {
    const h = K.readHash();
    show(h.id || (initial ? 'today' : K.current?.id || 'today'), { fromHash: true });
  }

  function renderTabs() {
    const views = K.allViews();
    const today = K.state.kols.filter(K.BASE.today);
    const overdue = today.filter(k => k.next_followup_at < K.today()).length;
    $('#tabs').innerHTML = `<div class="tab-list" role="tablist">${views.map(v => {
      const badge = v.id === 'today' && today.length ? `<span class="badge${overdue ? ' red' : ''}" title="${overdue ? `其中 ${overdue} 个已逾期` : ''}">${today.length}</span>` : '';
      return `<button type="button" role="tab" class="tab${K.current?.id === v.id ? ' on' : ''}" data-id="${esc(v.id)}" aria-selected="${K.current?.id === v.id}"><span class="ti">${esc(v.icon)}</span>${esc(v.name)}${badge}</button>`;
    }).join('')}</div><button type="button" class="tab add" data-newview>＋ 视图</button>`;
  }

  function renderMain(force) {
    const view = K.current; if (!view) return;
    const main = $('#main');
    const a = document.activeElement;
    if (!force && FORM_PAGES.includes(view.kind) && a && main.contains(a) && a.matches('input:not([type=checkbox]):not([type=radio]), textarea, select')) return;
    const scroll = [main.scrollTop, main.querySelector('.table-wrap')?.scrollLeft, main.querySelector('.board')?.scrollLeft];
    main.dataset.kind = view.kind;
    ({
      list: K.renderList, board: K.renderBoard, deals: K.renderDeals, finder: K.renderFinder,
      templates: K.renderTemplates, welcome: K.renderWelcome, settings: K.renderSettings
    })[view.kind](view, main);
    main.scrollTop = scroll[0];
    if (scroll[1] != null && main.querySelector('.table-wrap')) main.querySelector('.table-wrap').scrollLeft = scroll[1];
    if (scroll[2] != null && main.querySelector('.board')) main.querySelector('.board').scrollLeft = scroll[2];
  }
  K.on('render', force => { if ($('#app').hidden) return; renderTabs(); renderMain(force); });

  /* ---------- 自定义视图 ---------- */
  function newView(anchor) {
    const src = K.current?.cfg ? K.current : null;
    const el = K.popover(anchor, `<form class="pop-form">
      <p class="pop-title">新建视图</p>
      <p class="muted small">${src ? `会保存「${esc(src.name)}」当前的筛选、分组、排序和列。` : '从「所有 KOL」的默认设置开始。'}</p>
      <label>名字<input name="name" maxlength="40" required placeholder="例：德语区高优先级"></label>
      <label>图标<input name="icon" maxlength="4" value="📋" style="width:60px"></label>
      <label>类型<select name="type"><option value="list" ${src?.kind !== 'board' ? 'selected' : ''}>列表</option><option value="board" ${src?.kind === 'board' ? 'selected' : ''}>看板</option></select></label>
      <div class="pop-foot"><button class="btn sm">创建</button></div></form>`, { width: 280 });
    el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target, name = f.name.value.trim(); if (!name) return;
      const cfg = src?.cfg ? { ...JSON.parse(JSON.stringify(src.cfg)), collapsed: {} } : { group: 'status', cols: [...K.DEFAULT_COLS], filters: {} };
      // 内置视图自带的基础条件（今日待跟进等）不随新视图保存，改成可见的筛选条
      if (src?.base === 'today' && !cfg.filters.followup) cfg.filters.followup = 'overdue';
      K.closePopover();
      try {
        const { item } = await K.api('POST', '/views', { name, icon: f.icon.value.trim() || '📋', type: f.type.value, config: JSON.stringify(cfg) });
        K.state.views.push(item); show('v' + item.id); K.toast(`已新建视图「${name}」`);
      } catch (err) { K.fail(err); }
    });
  }
  function renameView(anchor, view) {
    const el = K.popover(anchor, `<form class="pop-form"><label>视图名字<input name="name" maxlength="40" value="${esc(view.name)}" required></label>
      <label>图标<input name="icon" maxlength="4" value="${esc(view.icon)}" style="width:60px"></label><div class="pop-foot"><button class="btn sm">保存</button></div></form>`);
    el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault(); K.closePopover();
      try {
        const { item } = await K.api('PATCH', `/views/${view.dbId}`, { name: e.target.name.value.trim(), icon: e.target.icon.value.trim() });
        Object.assign(K.state.views.find(v => v.id === view.dbId), item); K.render(true);
      } catch (err) { K.fail(err); }
    });
  }
  async function deleteView(view) {
    const row = K.state.views.find(v => v.id === view.dbId);
    const ok = await K.deferredDelete({ text: `删除视图「${view.name}」？（只删视图，不会删任何 KOL）`, label: view.name,
      removeLocal: () => { K.state.views = K.state.views.filter(v => v !== row); K.resetViewCfg(view.id); },
      restoreLocal: () => K.state.views.push(row), commit: () => K.api('DELETE', `/views/${view.dbId}`) });
    if (ok) show('all');
  }
  async function logout() {
    try { await K.api('POST', '/logout'); } catch { /* 退出失败也照样回登录页 */ }
    Object.assign(K.state, { kols: [], tasks: [], deals: [], templates: [], views: [], keywords: [], settings: {} });
    showLogin('已退出登录');
  }
  K.app = { show, newView, renameView, deleteView, logout, reload: async () => { await reload(); K.render(true); } };

  /* ---------- 绑定 ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    $('#login').addEventListener('submit', login);
    const getView = () => K.current;
    const main = $('#main');
    K.listEvents(main, getView); K.boardEvents(main, getView); K.templateEvents(main, getView);
    K.finderEvents(main, getView); K.dealsEvents(main, getView); K.settingsEvents(main, getView);
    document.addEventListener('click', e => { const g = e.target.closest('[data-goto]'); if (g) { K.drawer.close(); show(g.dataset.goto); } });

    $('#tabs').addEventListener('click', e => {
      if (e.target.closest('[data-newview]')) return newView(e.target.closest('[data-newview]'));
      const t = e.target.closest('.tab[data-id]'); if (t) show(t.dataset.id);
    });
    K.sortable($('#tabs'), '.tab[data-id]', async ids => {
      // 拖动时 tab-list 内部的顺序就是新顺序
      try { await K.api('PUT', '/settings/view_order', { value: ids }); K.state.settings.view_order = ids; } catch (err) { K.fail(err); }
      renderTabs();
    });
    $('#new-kol').addEventListener('click', () => K.openNewKol());
    $('#open-settings').addEventListener('click', () => show('settings'));
    $('#mail-close')?.addEventListener('click', () => $('#mail').close());

    const search = K.debounce(() => {
      if (!['list', 'board'].includes(K.current?.kind)) show('all');
      K.writeHash(K.current, K.q); renderMain(true);
    }, 150);
    $('#q').addEventListener('input', e => { K.q = e.target.value.trim(); search(); });
    $('#q').addEventListener('keydown', e => { if (e.key === 'Escape') { e.target.value = ''; K.q = ''; search(); e.target.blur(); } });

    document.addEventListener('keydown', e => {
      if ($('#app').hidden) return;
      const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
      if (e.key === 'Escape') {
        if (document.querySelector('.pop')) return K.closePopover();
        if (document.querySelector('dialog[open]')) return;   // 弹窗自己会关
        if (K.drawer.isOpen()) return K.drawer.close();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') { e.preventDefault(); $('#q').focus(); $('#q').select(); }
      if (e.key === 'n') { e.preventDefault(); K.openNewKol(); }
    });
    window.addEventListener('hashchange', () => { if (!$('#app').hidden) route(false); });

    // 已登录就直接进；未登录显示登录框
    K.api('GET', '/session').then(r => r.authed ? start() : showLogin()).catch(err => showLogin(err.message));
  });
})();
