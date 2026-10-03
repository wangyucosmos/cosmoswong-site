/* 我的工作台 · 快捷入口（v2：今天页底部一行；增删改、拖动排序在「设置 → 快捷入口」）。
   只是外链：页面本身不访问对方，也不加载对方的图标（零外部请求）。 */
(() => {
  const D = window.DESK;
  const { esc } = D;
  const host = u => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return ''; } };
  const sorted = () => [...D.state.links].sort((a, b) => (a.sort_order ?? 1e18) - (b.sort_order ?? 1e18) || a.id - b.id);
  const a = (l, inner) => D.safeUrl(l.url) ? `<a href="${esc(D.safeUrl(l.url))}" target="_blank" rel="noopener noreferrer" title="${esc(l.group_name ? l.group_name + ' · ' : '')}${esc(host(l.url))}">${inner}</a>` : '';

  // 今天页底部的一行
  D.linksRow = () => {
    const list = sorted();
    if (!list.length) return '';
    return `<nav class="links-row" aria-label="快捷入口"><span class="muted small">快捷入口</span>${list.map(l => a(l, esc(l.label))).join('')}
      <button type="button" class="link-btn small" data-goto="settings" data-sec="links">管理</button></nav>`;
  };

  // 设置页里的管理区
  D.linksManager = () => {
    const groups = new Map();
    for (const l of sorted()) { const g = l.group_name || '未分组'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(l); }
    return `<div class="links-manager"><div class="row"><span class="muted small">拖 ⠿ 调整顺序；✎ 改名字、链接或分组。今天页底部会按这个顺序显示。</span><span class="grow"></span><button type="button" class="btn sm" data-link-new>＋ 添加入口</button></div>
      ${groups.size ? [...groups.entries()].map(([g, list]) => `<h4>${esc(g)} <span class="gcount">${list.length}</span></h4>
        <div class="lgrid">${list.map(l => `<div class="lcard" data-id="${l.id}"><span class="grip" data-drag title="拖动排序">⠿</span>
          ${a(l, `<b>${esc(l.label)}</b><small>${esc(host(l.url))}</small>`).replace('<a ', '<a class="lmain" ') || `<span class="lmain"><b>${esc(l.label)}</b><small class="warn-text">链接不对</small></span>`}
          <button type="button" class="icon" data-link-edit aria-label="编辑 ${esc(l.label)}">✎</button></div>`).join('')}</div>`).join('')
        : '<p class="muted">还没有快捷入口。常用的设计工具、后台、发布站都可以放这里；也可以在「数据 → 导入初始化包」一次导进来。</p>'}</div>`;
  };
  D.bindLinksManager = box => box.querySelectorAll('.lgrid').forEach(g => D.sortable(g, '.lcard', ids => reorder(ids), { axis: 'xy', handle: '.grip' }));

  async function reorder(ids) {
    ids.forEach((id, i) => { const l = D.find('links', id); if (l) l.sort_order = i; });
    try { await D.api('POST', '/links/reorder', { ids: ids.map(Number) }); } catch (e) { D.fail(e); }
    D.render(true);
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
      catch (err) { D.fail(err); }
    });
  }

  document.addEventListener('click', e => {
    if (!e.target.closest('.links-manager')) return;
    if (e.target.closest('[data-link-new]')) return edit(e.target.closest('[data-link-new]'), null);
    const b = e.target.closest('[data-link-edit]');
    if (b) return edit(b, D.find('links', b.closest('[data-id]').dataset.id));
  });
})();
