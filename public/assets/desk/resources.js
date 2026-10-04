/* 我的工作台 · 资源（v3）：网页链接 + 本机文件夹 + 本地小工具 + 文档，一页看全。
   网页存在 links 表（点开新标签页）；其余存在 resources 表，只记名字和路径——网页不会去访问这些路径，点一下就复制路径，
   到访达按 ⌘⇧G 粘贴就能打开。钉住的显示在今天页「常用」里。具体的路径、文件名走初始化包导入，不进代码仓库。 */
(() => {
  const D = window.DESK;
  const { esc } = D;
  D.RES_KINDS = [
    { key: 'web', label: '网页', icon: 'globe', empty: '常用的设计工具、后台、发布站，点开就是新标签页。' },
    { key: 'folder', label: '本机文件夹', icon: 'folder', empty: '常去的文件夹（客服文档、活动规则、各省切图……），点一下复制路径。' },
    { key: 'tool', label: '本地小工具', icon: 'tool', empty: '自己电脑上的小工具、脚本，点一下复制位置。' },
    { key: 'doc', label: '文档', icon: 'file', empty: '常翻的文档（往期客服文档、活动规则），按省份或类型分组。' }
  ];
  const kindOf = k => D.RES_KINDS.find(x => x.key === k) || D.RES_KINDS[1];
  const host = u => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return ''; } };
  const ord = (a, b) => (b.pinned || 0) - (a.pinned || 0) || (a.sort_order ?? 1e18) - (b.sort_order ?? 1e18) || a.id - b.id;
  const initial = s => { const c = [...String(s || '?').trim()][0] || '?'; return /[a-z]/i.test(c) ? c.toUpperCase() : c; };
  const tail = p => String(p || '').split('/').filter(Boolean).slice(-2).join('/');
  const match = (x, q) => !q || [x.label, x.group_name, x.url, x.path, x.province, x.note].join(' ').toLowerCase().includes(q.toLowerCase());

  // 今天页「常用」里的小方块
  D.resTile = (t, x) => {
    if (t === 'link') {
      const href = D.safeUrl(x.url);
      return `<a class="tile" ${href ? `href="${esc(href)}" target="_blank" rel="noopener noreferrer"` : ''} title="${esc(x.label)}"><span class="tico" style="--c:${D.hashColor(x.group_name || x.label)}">${esc(initial(x.label))}</span><span class="tl">${esc(x.label)}</span><span class="s">${esc(x.group_name || host(x.url))}</span></a>`;
    }
    const k = kindOf(x.kind);
    return `<button type="button" class="tile" data-res-copy="${x.id}" title="点一下复制路径：${esc(x.path)}"><span class="tico" style="--c:${D.hashColor(x.kind + (x.group_name || ''))}">${D.icon(k.icon)}</span><span class="tl">${esc(x.label)}</span><span class="s">${esc(k.label)}</span></button>`;
  };
  D.copyPath = async r => { await D.copy(r.path, '路径（在访达按 ⌘⇧G 粘贴就能打开）'); };

  function item(t, x) {
    const pin = `<button type="button" class="icon" data-res-pin="${t}:${x.id}" title="${x.pinned ? '取消钉住' : '钉到今天页「常用」'}" aria-label="${x.pinned ? '取消钉住' : '钉到今天页'}">${D.icon('pin')}</button>`;
    const ops = `<span class="rops">${pin}<button type="button" class="icon" data-res-edit="${t}:${x.id}" title="编辑" aria-label="编辑 ${esc(x.label)}">${D.icon('edit')}</button></span>`;
    const color = D.hashColor(t === 'link' ? x.group_name || x.label : x.kind + (x.group_name || ''));
    if (t === 'link') {
      const href = D.safeUrl(x.url);
      return `<div class="ritem-wrap"><a class="ritem" ${href ? `href="${esc(href)}" target="_blank" rel="noopener noreferrer"` : ''} data-id="${x.id}"><span class="tico" style="--c:${color}">${esc(initial(x.label))}</span>
        <span class="rt"><b>${esc(x.label)}</b><small>${href ? esc(host(x.url)) : '<span class="warn-text">链接不对</span>'}</small></span>${x.pinned ? `<span class="rpin" title="已钉到今天页">${D.icon('pin', 'sm')}</span>` : ''}</a>${ops}</div>`;
    }
    return `<div class="ritem-wrap"><button type="button" class="ritem" data-res-copy="${x.id}" title="点一下复制路径：${esc(x.path)}"><span class="tico" style="--c:${color}">${D.icon(kindOf(x.kind).icon)}</span>
      <span class="rt"><b>${esc(x.label)}</b><small>${esc(x.note || tail(x.path))}</small></span>${x.pinned ? `<span class="rpin" title="已钉到今天页">${D.icon('pin', 'sm')}</span>` : ''}</button>${ops}</div>`;
  }
  function groups(list, by) {
    const m = new Map();
    for (const x of list) { const g = by(x) || ''; if (!m.has(g)) m.set(g, []); m.get(g).push(x); }
    return [...m.entries()].sort((a, b) => (a[0] === '') - (b[0] === '') || 0);
  }

  D.renderResources = (view, el) => {
    const q = D.rq || '';
    const links = D.state.links.filter(x => match(x, q)).sort(ord);
    const res = (D.state.resources || []).filter(x => match(x, q));
    const sec = k => {
      const list = k.key === 'web' ? links : res.filter(r => r.kind === k.key).sort(ord);
      const total = k.key === 'web' ? D.state.links.length : (D.state.resources || []).filter(r => r.kind === k.key).length;
      const gs = groups(list, x => k.key === 'doc' ? x.province || x.group_name : x.group_name);
      return `<section class="card-box rsec" data-rsec="${k.key}">${D.cardHead(k.icon, k.label, `<span class="gcount">${list.length}${q && list.length !== total ? ` / ${total}` : ''}</span><button type="button" class="more link-btn" data-res-new="${k.key}">＋ 添加</button>`)}
        ${list.length ? gs.map(([g, xs]) => {
          const grid = `<div class="rgrid">${xs.map(x => item(k.key === 'web' ? 'link' : 'res', x)).join('')}</div>`;
          // 文档多：每组折起来，筛选时自动展开
          if (k.key === 'doc' && gs.length > 3) return `<details class="rgroup" ${q ? 'open' : ''}><summary>${esc(g || '未分组')} <span class="gcount">${xs.length}</span></summary>${grid}</details>`;
          return `${gs.length > 1 || g ? `<h4>${esc(g || '未分组')} <span class="gcount">${xs.length}</span></h4>` : ''}${grid}`;
        }).join('')
          : `<p class="muted">${q ? '没有符合的。' : esc(k.empty)}</p>`}</section>`;
    };
    el.innerHTML = `<div class="page resources">
      <div class="ptools"><input class="filter" type="search" data-rfilter data-keep-focus="rq" value="${esc(q)}" placeholder="筛选：名字、分组、路径…" aria-label="筛选资源">
        <span class="muted small">本机的东西网页打不开，点一下会复制路径；钉住的显示在今天页。</span><span class="grow"></span><button type="button" class="btn sm" data-res-new="web">${D.icon('plus', 'sm')}添加</button></div>
      ${D.RES_KINDS.map(sec).join('')}</div>`;
  };

  /* ---------- 添加 / 编辑 ---------- */
  function edit(anchor, kind, x) {
    const isWeb = kind === 'web';
    const pool = isWeb ? D.state.links : (D.state.resources || []).filter(r => r.kind === kind);
    const gl = [...new Set(pool.map(r => r.group_name).filter(Boolean))];
    const el = D.popover(anchor, `<form class="pop-form res-add" novalidate><p class="pop-title">${x ? '编辑' : '添加'}${esc(kindOf(kind).label)}</p>
      ${x ? '' : `<label>类型<select name="kind">${D.RES_KINDS.map(k => `<option value="${k.key}" ${k.key === kind ? 'selected' : ''}>${esc(k.label)}</option>`).join('')}</select></label>`}
      <label>名称<input name="label" maxlength="80" value="${esc(x?.label || '')}" required></label>
      <label data-for="web" ${isWeb ? '' : 'hidden'}>链接<input name="url" type="url" maxlength="1000" value="${esc(x?.url || '')}" placeholder="https://…"></label>
      <label data-for="path" ${isWeb ? 'hidden' : ''}>路径<input name="path" maxlength="500" value="${esc(x?.path || '')}" placeholder="访达里右键 → 按住 Option →「拷贝为路径名」"></label>
      <label>分组<input name="group" maxlength="30" value="${esc(x?.group_name || '')}" list="res-groups" placeholder="如：设计工具 / 客服文档"></label>
      <datalist id="res-groups">${gl.map(g => `<option value="${esc(g)}">`).join('')}</datalist>
      <label data-for="path" ${isWeb ? 'hidden' : ''}>说明<input name="note" maxlength="300" value="${esc(x?.note || '')}" placeholder="可不填"></label>
      <label class="check"><input type="checkbox" name="pinned" ${x?.pinned ? 'checked' : ''}> 钉到今天页「常用」</label>
      <div class="pop-foot">${x ? '<button type="button" class="btn sm danger ghost" data-del>删除</button><span class="grow"></span>' : ''}<button class="btn sm">保存</button></div></form>`, { width: 360, cls: 'sheet' });
    const f = el.querySelector('form');
    f.kind?.addEventListener('change', () => { const w = f.kind.value === 'web'; f.querySelectorAll('[data-for=web]').forEach(n => { n.hidden = !w; }); f.querySelectorAll('[data-for=path]').forEach(n => { n.hidden = w; }); });
    el.querySelector('[data-del]')?.addEventListener('click', () => { D.closePopover(); D.remove(isWeb ? 'links' : 'resources', x.id, { label: x.label }); });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const k = f.kind ? f.kind.value : kind, label = f.label.value.trim();
      if (!label) return D.toast('名称不能空', { error: true });
      const common = { label, group_name: f.group.value.trim() || null, pinned: f.pinned.checked ? 1 : 0 };
      try {
        if (k === 'web') {
          const url = f.url.value.trim();
          if (!D.safeUrl(url)) return D.toast('链接要以 https:// 或 http:// 开头', { error: true });
          D.closePopover();
          if (x) await D.patch('links', x.id, { ...common, url }); else { await D.create('links', { ...common, url, sort_order: D.state.links.length }); D.toast('已添加'); }
        } else {
          const path = f.path.value.trim();
          if (!path) return D.toast('路径不能空', { error: true });
          D.closePopover();
          const data = { ...common, path, note: f.note.value.trim() || null };
          if (x) await D.patch('resources', x.id, data); else { await D.create('resources', { ...data, kind: k, sort_order: (D.state.resources || []).length }); D.toast('已添加'); }
        }
      } catch (err) { D.fail(err); }
    });
  }
  const parse = v => { const [t, id] = String(v).split(':'); return { table: t === 'link' ? 'links' : 'resources', row: D.find(t === 'link' ? 'links' : 'resources', id) }; };

  D.resourcesEvents = main => {
    main.addEventListener('input', e => { if (D.current?.kind === 'resources' && e.target.matches('[data-rfilter]')) { D.rq = e.target.value.trim(); D.render(true); } });
    main.addEventListener('click', e => {
      const n = e.target.closest('[data-res-new]');
      if (n) return edit(n, n.dataset.resNew, null);
      const ed = e.target.closest('[data-res-edit]');
      if (ed) { e.preventDefault(); const { row } = parse(ed.dataset.resEdit); if (row) edit(ed, row.kind || 'web', row); return; }
      const pin = e.target.closest('[data-res-pin]');
      if (pin) { e.preventDefault(); const { table, row } = parse(pin.dataset.resPin); if (row) D.patch(table, row.id, { pinned: row.pinned ? 0 : 1 }).then(() => D.toast(row.pinned ? '已钉到今天页「常用」' : '已取消钉住', { icon: 'pin' })).catch(() => {}); }
    });
  };
  // 复制路径：今天页、资源页、搜索面板都能点
  document.addEventListener('click', e => {
    const c = e.target.closest('[data-res-copy]');
    if (!c || e.target.closest('.rops')) return;
    const r = D.find('resources', c.dataset.resCopy);
    if (r) D.copyPath(r);
  });
})();
