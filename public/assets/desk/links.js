/* 我的工作台 · 快捷入口：按分组展示卡片，点击新标签页打开；可拖动排序、增删改。
   只是外链：页面本身不访问对方，也不加载对方的图标（零外部请求）。 */
(() => {
  const D = window.DESK;
  const { esc } = D;
  const host = u => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return ''; } };
  const sorted = () => [...D.state.links].sort((a, b) => (a.sort_order ?? 1e18) - (b.sort_order ?? 1e18) || a.id - b.id);

  D.renderLinks = (view, el) => {
    const groups = new Map();
    for (const l of sorted().filter(l => !D.q || [l.label, l.url, l.group_name].join(' ').toLowerCase().includes(D.q.toLowerCase()))) {
      const g = l.group_name || '未分组'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(l);
    }
    el.innerHTML = `<div class="page links">
      <div class="toolbar"><div class="filters"><span class="muted small">点卡片在新标签页打开；拖 ⠿ 调整顺序；✎ 改名字、链接或分组。</span></div>
        <div class="tools"><button type="button" class="btn sm" data-link-new>＋ 添加入口</button></div></div>
      ${groups.size ? [...groups.entries()].map(([g, list]) => `<section class="card-box"><h3>${esc(g)} <span class="gcount">${list.length}</span></h3>
        <div class="lgrid" data-group="${esc(g)}">${list.map(l => `<div class="lcard" data-id="${l.id}">
          <span class="grip" data-drag title="拖动排序">⠿</span>
          ${D.safeUrl(l.url) ? `<a class="lmain" href="${esc(D.safeUrl(l.url))}" target="_blank" rel="noopener noreferrer"><b>${esc(l.label)}</b><small>${esc(host(l.url))}</small></a>` : `<span class="lmain"><b>${esc(l.label)}</b><small class="warn-text">链接不对</small></span>`}
          <button type="button" class="icon" data-link-edit aria-label="编辑 ${esc(l.label)}">✎</button></div>`).join('')}</div></section>`).join('')
        : '<p class="empty-state">还没有快捷入口。常用的设计工具、后台、发布站、知识库都可以放这里；也可以在「设置 → 导入初始化包」一次导进来。</p>'}
    </div>`;
    el.querySelectorAll('.lgrid').forEach(box => D.sortable(box, '.lcard', ids => reorder(ids), { axis: 'xy', handle: '.grip' }));
  };

  async function reorder(ids) {
    ids.forEach((id, i) => { const l = D.find('links', id); if (l) l.sort_order = i; });
    try { await D.api('POST', '/links/reorder', { ids: ids.map(Number) }); } catch (e) { D.fail(e); }
    D.render();
  }

  function edit(anchor, l) {
    const groupsList = [...new Set(D.state.links.map(x => x.group_name).filter(Boolean))];
    const el = D.popover(anchor, `<form class="pop-form" novalidate><p class="pop-title">${l ? '编辑入口' : '添加入口'}</p>
      <label>名称<input name="label" maxlength="60" value="${esc(l?.label || '')}" required></label>
      <label>链接<input name="url" type="url" maxlength="1000" value="${esc(l?.url || '')}" placeholder="https://…" required></label>
      <label>分组<input name="group" maxlength="30" value="${esc(l?.group_name || '')}" list="link-groups" placeholder="如：设计工具"></label>
      <datalist id="link-groups">${groupsList.map(g => `<option value="${esc(g)}">`).join('')}</datalist>
      <div class="pop-foot">${l ? '<button type="button" class="btn sm danger ghost" data-del>删除</button><span class="grow"></span>' : ''}<button class="btn sm">保存</button></div></form>`, { width: 340, cls: 'sheet' });
    el.querySelector('[data-del]')?.addEventListener('click', () => { D.closePopover(); D.remove('links', l.id, { label: l.label }); });
    el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target, label = f.label.value.trim(), url = f.url.value.trim();
      if (!label) return D.toast('名称不能空', { error: true });
      if (!D.safeUrl(url)) return D.toast('链接要以 https:// 或 http:// 开头', { error: true });
      D.closePopover();
      const data = { label, url, group_name: f.group.value.trim() || null };
      try { if (l) await D.patch('links', l.id, data); else { await D.create('links', { ...data, sort_order: D.state.links.length }); D.toast('已添加'); } }
      catch (err) { if (!l) D.fail(err); }
    });
  }

  D.linksEvents = (main, getView) => {
    main.addEventListener('click', e => {
      if (getView()?.kind !== 'links') return;
      if (e.target.closest('[data-link-new]')) return edit(e.target.closest('[data-link-new]'), null);
      const b = e.target.closest('[data-link-edit]');
      if (b) return edit(b, D.find('links', b.closest('[data-id]').dataset.id));
    });
  };
})();
