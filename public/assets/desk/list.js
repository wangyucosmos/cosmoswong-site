/* 我的工作台 · 项目列表 + 列表/看板共用的工具栏（筛选、分组、排序、列、批量操作）。写法照 /kol 的 list.js。 */
(() => {
  const D = window.DESK;
  const { esc } = D;
  D.sel = new Set();          // 勾选的项目

  /* ================= 工具栏 ================= */
  D.toolbarHtml = view => {
    const cfg = view.cfg, f = cfg.filters || {};
    const chips = D.FILTERS.filter(x => Array.isArray(f[x.key]) ? f[x.key].length : f[x.key]).map(x => {
      const vals = Array.isArray(f[x.key]) ? f[x.key] : [f[x.key]];
      return `<span class="fchip"><button type="button" data-act="filter-edit" data-f="${x.key}">${esc(x.label)}：${esc(vals.map(v => D.filterLabel(x.key, v)).join('、'))}</button><button type="button" class="x" data-act="filter-remove" data-f="${x.key}" aria-label="去掉这个筛选">×</button></span>`;
    }).join('');
    const isList = view.kind === 'list';
    const g = D.GROUPS.find(x => x.key === (cfg.group || 'none'));
    const s = cfg.sort?.key ? `${D.col(cfg.sort.key)?.label || cfg.sort.key} ${cfg.sort.dir === 'desc' ? '↓' : '↑'}` : '默认';
    return `<div class="vhead"><div class="toolbar">
      <div class="filters">${chips}<button type="button" class="tb" data-act="filter-add">＋ 筛选</button>
        ${chips ? '<button type="button" class="tb ghost" data-act="filter-clear">清空筛选</button>' : ''}</div>
      <div class="tools">
        ${isList ? `<button type="button" class="tb" data-act="group">分组：${esc(g.label)}</button>
        <button type="button" class="tb" data-act="sort">排序：${esc(s)}</button>
        <button type="button" class="tb" data-act="cols">列</button>` : ''}
        <button type="button" class="tb" data-act="csv" title="导出当前视图里的项目（Excel 打开不乱码）">导出 CSV</button>
        <button type="button" class="tb" data-act="view-menu" aria-label="视图选项">⋯</button>
      </div>
    </div>
    <div class="batchbar" ${D.sel.size ? '' : 'hidden'}>
      <b>已选 ${D.sel.size} 个</b>
      <button type="button" class="tb" data-act="batch" data-field="status">改状态</button>
      <button type="button" class="tb" data-act="batch" data-field="priority">改优先级</button>
      <button type="button" class="tb" data-act="batch" data-field="due_at">改截止日</button>
      <button type="button" class="tb" data-act="batch-archive">归档</button>
      <button type="button" class="tb ghost" data-act="batch-clear">取消选择</button>
    </div></div>`;
  };

  const changed = view => { D.saveViewCfg(view); D.writeHash(view, D.q); D.render(); };

  D.filterEditor = (anchor, view, key) => {
    const f = D.FILTERS.find(x => x.key === key), cfg = view.cfg;
    if (f.multi) {
      return D.pickOption(anchor, {
        options: D.filterOptions(key), value: cfg.filters[key] || [], multi: true, search: key === 'province',
        onPick: vals => { cfg.filters[key] = vals; if (!vals.length) delete cfg.filters[key]; changed(view); }
      });
    }
    const cur = cfg.filters[key] || '';
    const el = D.popover(anchor, `<div class="opts">${D.filterOptions(key).map(o => `<button type="button" class="opt${cur === o.value ? ' on' : ''}" data-v="${o.value}">${esc(o.label)}</button>`).join('')}</div>`, { cls: 'pick' });
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      cfg.filters[key] = b.dataset.v; D.closePopover(); changed(view);
    });
  };

  D.toolbarClick = (e, view, list) => {
    const b = e.target.closest('[data-act]'); if (!b) return false;
    const cfg = view.cfg, act = b.dataset.act;
    switch (act) {
      case 'filter-add': {
        const el = D.popover(b, `<div class="opts">${D.FILTERS.map(f => `<button type="button" class="opt" data-k="${f.key}">${esc(f.label)}</button>`).join('')}</div>`, { cls: 'pick' });
        el.addEventListener('click', ev => { const x = ev.target.closest('[data-k]'); if (x) D.filterEditor(b, view, x.dataset.k); });
        return true;
      }
      case 'filter-edit': D.filterEditor(b, view, b.dataset.f); return true;
      case 'filter-remove': delete cfg.filters[b.dataset.f]; changed(view); return true;
      case 'filter-clear': cfg.filters = {}; changed(view); return true;
      case 'group':
        D.pickOption(b, { options: D.GROUPS.map(g => ({ value: g.key, label: g.label })), value: cfg.group || 'none', allowEmpty: false,
          onPick: v => { cfg.group = v; changed(view); } });
        return true;
      case 'sort': {
        const opts = D.COLS.map(c => ({ value: c.key, label: c.label }));
        const el = D.popover(b, `<div class="seg"><button type="button" data-dir="asc" class="${cfg.sort?.dir !== 'desc' ? 'on' : ''}">从小到大 ↑</button><button type="button" data-dir="desc" class="${cfg.sort?.dir === 'desc' ? 'on' : ''}">从大到小 ↓</button></div>
          <div class="opts">${opts.map(o => `<button type="button" class="opt${cfg.sort?.key === o.value ? ' on' : ''}" data-v="${o.value}">${esc(o.label)}</button>`).join('')}</div>
          <button type="button" class="opt clear" data-v="">不排序</button>`, { cls: 'pick' });
        el.addEventListener('click', ev => {
          const d = ev.target.closest('[data-dir]');
          if (d) { cfg.sort = { key: cfg.sort?.key || 'launch_at', dir: d.dataset.dir }; D.closePopover(); return changed(view); }
          const o = ev.target.closest('[data-v]'); if (!o) return;
          cfg.sort = o.dataset.v ? { key: o.dataset.v, dir: cfg.sort?.dir || 'asc' } : null; D.closePopover(); changed(view);
        });
        return true;
      }
      case 'cols': colsEditor(b, view); return true;
      case 'csv': exportCsv(list, view); return true;
      case 'view-menu': viewMenu(b, view); return true;
      case 'batch': batch(b, b.dataset.field); return true;
      case 'batch-archive': batchApply({ archived_at: new Date().toISOString() }, '已归档'); return true;
      case 'batch-clear': D.sel.clear(); D.render(); return true;
    }
    return false;
  };

  function exportCsv(list, view) {
    if (!list?.length) return D.toast('当前视图没有项目可导出', { error: true });
    const keys = ['title', 'kind', 'province', 'month', 'status', 'priority', 'requester', 'launch_at', 'due_at', 'summary', 'next_action', 'pendings', 'progress', 'last_ai', 'tags', 'links', 'local_paths', 'notes', 'updated_at'];
    const label = { links: '链接', local_paths: '本机路径' };
    D.download(`项目-${view.name}-${D.today()}.csv`, D.toCsv(keys.map(k => label[k] || D.col(k)?.label || k), list.map(p => keys.map(k => D.cellText(p, k)))), 'text/csv;charset=utf-8');
    D.toast(`已导出 ${list.length} 个项目`);
  }

  function colsEditor(anchor, view) {
    const cfg = view.cfg;
    const draw = () => {
      const shown = cfg.cols.map(D.col).filter(Boolean), hidden = D.COLS.filter(c => !cfg.cols.includes(c.key));
      return `<p class="pop-title">拖动 ⠿ 调整顺序，勾选显示</p><div class="col-list">${shown.map(c => `<div class="col-item" data-id="${c.key}"><span class="grip" data-drag>⠿</span><label><input type="checkbox" checked ${c.fixed ? 'disabled' : ''} data-col="${c.key}"> ${esc(c.label)}</label></div>`).join('')}</div>
        <div class="col-hidden">${hidden.map(c => `<div class="col-item"><span class="grip"></span><label><input type="checkbox" data-col="${c.key}"> ${esc(c.label)}</label></div>`).join('')}</div>
        <div class="pop-foot"><button type="button" class="btn sm ghost" data-reset>恢复默认列</button></div>`;
    };
    const el = D.popover(anchor, draw(), { cls: 'cols-pop', width: 260 });
    const bind = () => D.sortable(el.querySelector('.col-list'), '.col-item', ids => { cfg.cols = ids; changed(view); }, { axis: 'y', handle: '.grip' });
    bind();
    el.addEventListener('change', e => {
      const k = e.target.dataset.col; if (!k) return;
      cfg.cols = e.target.checked ? [...cfg.cols, k] : cfg.cols.filter(x => x !== k);
      changed(view); el.innerHTML = draw(); bind();
    });
    el.addEventListener('click', e => {
      if (!e.target.closest('[data-reset]')) return;
      cfg.cols = [...(view.def?.cols || D.DEFAULT_COLS)]; cfg.widths = {}; changed(view); el.innerHTML = draw(); bind();
    });
  }

  function viewMenu(anchor, view) {
    const el = D.popover(anchor, `<div class="opts">
      <button type="button" class="opt" data-m="save">＋ 把当前筛选存成新视图</button>
      ${view.custom ? '<button type="button" class="opt" data-m="rename">重命名这个视图</button><button type="button" class="opt danger" data-m="delete">删除这个视图</button>'
        : '<button type="button" class="opt" data-m="reset">恢复这个视图的默认设置</button>'}</div>`, { cls: 'pick' });
    el.addEventListener('click', async e => {
      const m = e.target.closest('[data-m]')?.dataset.m; if (!m) return;
      D.closePopover();
      if (m === 'save') D.app.newView(anchor);
      if (m === 'reset') { D.pref.set('view.' + view.id, {}); D.resetViewCfg(view.id); D.app.show(view.id); }
      if (m === 'rename') D.app.renameView(anchor, view);
      if (m === 'delete') D.app.deleteView(view);
    });
  }

  async function batchApply(patch, what) {
    const ids = [...D.sel];
    const before = ids.map(id => ({ ...D.project(id) }));
    ids.forEach(id => Object.assign(D.project(id) || {}, patch)); D.render();
    try {
      const { items } = await D.api('POST', '/projects/batch', { ids, patch });
      items.forEach(r => D.put('projects', r));
      if (patch.archived_at) D.sel.clear();
      D.render(); D.toast(`${what || '已更新'} ${items.length} 个项目`);
    } catch (e) { before.forEach(r => D.put('projects', r)); D.render(); D.fail(e); }
  }
  function batch(anchor, field) {
    if (field === 'due_at') return D.datePopover(anchor, null, v => batchApply({ due_at: v }));
    D.pickOption(anchor, { options: D.optionsFor(field), allowEmpty: field !== 'status', onPick: v => batchApply({ [field]: v }) });
  }

  /* ================= 日期小弹层（快捷 今天 / +1 / +3 / +7） ================= */
  D.datePopover = (anchor, value, onPick, { base, clear = true } = {}) => {
    const from = base || D.today();
    const el = D.popover(anchor, `<div class="quick">${[['今天', 0], ['明天', 1], ['+3 天', 3], ['+7 天', 7], ['+14 天', 14]].map(([l, n]) => `<button type="button" class="tb" data-d="${D.addDays(from, n)}">${l}</button>`).join('')}</div>
      <input type="date" value="${esc(value || '')}" aria-label="选日期">
      ${clear ? '<div class="pop-foot"><button type="button" class="btn sm ghost" data-d="">清空</button></div>' : ''}`, { cls: 'datepop' });
    el.addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (b) { D.closePopover(); onPick(b.dataset.d || null); } });
    el.querySelector('input').addEventListener('change', e => { if (e.target.value) { D.closePopover(); onPick(e.target.value); } });
  };

  // 改上线日：有时间表节点时，问要不要整体顺移未完成的节点
  D.setLaunch = async (p, v) => {
    if ((v || null) === (p.launch_at || null)) return;
    const nodes = [...D.tasksOf(p.id).filter(t => !t.done && t.offset_days != null), ...D.delivsOf(p.id).filter(d => d.status !== 'done' && d.offset_days != null)];
    if (v && nodes.length && p.launch_at) {
      const shift = await D.confirm(`上线日改成 ${D.fmtDateW(v)}。要不要把 ${nodes.length} 个还没完成的时间表节点（待办和交付物）一起按新上线日顺移？已完成的不动；遇到周末提前到周五。`, '一起顺移', { danger: false });
      if (shift) {
        try {
          const r = await D.api('POST', `/projects/${p.id}/schedule`, { mode: 'shift', launch_at: v, weekend: true });
          applySchedule(r); D.toast(`已顺移 ${r.shifted} 个节点`); return;
        } catch (e) { return D.fail(e); }
      }
    }
    D.patch('projects', p.id, { launch_at: v }).catch(() => {});
  };
  const applySchedule = r => {
    D.put('projects', r.project);
    D.state.tasks = D.state.tasks.filter(t => t.project_id !== r.project.id).concat(r.tasks);
    D.state.deliverables = D.state.deliverables.filter(d => d.project_id !== r.project.id).concat(r.deliverables);
    D.render();
  };
  D.applySchedule = applySchedule;

  /* ================= 单元格编辑 ================= */
  D.editCell = (td, p, key) => {
    const col = D.col(key); if (!col?.edit) return;
    const save = v => {
      if (JSON.stringify(v ?? null) === JSON.stringify(p[key] ?? null)) return;
      if (key === 'launch_at') return D.setLaunch(p, v);
      D.patch('projects', p.id, { [key]: v }).catch(() => {});
    };
    switch (col.edit) {
      case 'pick':
        return D.pickOption(td, { options: D.optionsFor(key), value: p[key], search: key === 'province', allowEmpty: key !== 'status', onPick: save });
      case 'multi':
        return D.pickOption(td, { options: D.optionsFor(key), value: p[key] || [], multi: true, onPick: save });
      case 'date': return D.datePopover(td, p[key], save);
      case 'month': {
        const el = D.popover(td, `<form class="pop-form"><label>所属月份<input type="month" name="m" value="${esc(p.month || '')}"></label><div class="pop-foot"><button type="button" class="btn sm ghost" data-clear>清空</button><button class="btn sm">保存</button></div></form>`);
        el.querySelector('[data-clear]').addEventListener('click', () => { D.closePopover(); save(null); });
        el.querySelector('form').addEventListener('submit', e => { e.preventDefault(); D.closePopover(); save(e.target.m.value || null); });
        return;
      }
      case 'tags': {
        const el = D.popover(td, `<form class="pop-form"><label>标签（用逗号分隔）</label><input name="t" value="${esc((p.tags || []).join(', '))}"><div class="pop-foot"><button class="btn sm">保存</button></div></form>`);
        el.querySelector('form').addEventListener('submit', e => { e.preventDefault(); D.closePopover(); save(e.target.t.value.split(/[,，]/).map(s => s.trim()).filter(Boolean)); });
        return;
      }
      default: {
        // 文字：原地变输入框，回车或失焦保存，Esc 取消
        const input = document.createElement('input');
        input.className = 'cell-input';
        input.value = p[key] ?? '';
        td.innerHTML = ''; td.append(input); input.focus(); input.select?.();
        let done = false;
        const finish = ok => {
          if (done) return; done = true; input.dataset.done = '1';
          if (!ok) return D.render();
          const v = input.value.trim() || null;
          if (key === 'title' && !v) { D.toast('项目名不能空', { error: true }); return D.render(); }
          save(v); D.render();
        };
        input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) finish(true); if (e.key === 'Escape') { e.stopPropagation(); finish(false); } });
        input.addEventListener('blur', () => finish(true));
      }
    }
  };

  /* ================= 列表渲染 ================= */
  function rowHtml(p, cols) {
    const sel = D.sel.has(p.id), s = D.statusOf(p.status);
    let html = `<tr class="prow${sel ? ' sel' : ''}${p.archived_at ? ' archived' : ''}" data-id="${p.id}">
      <td class="c-sel"><input type="checkbox" data-sel aria-label="选择 ${esc(p.title)}" ${sel ? 'checked' : ''}></td>`;
    for (const key of cols) {
      if (key === 'title') {
        html += `<td class="c-title" data-col="title"><div class="name-wrap">
          <span class="sdot" style="--c:${esc(s.color)}" title="${esc(s.label)}"></span>
          <button type="button" class="name" data-act="open">${esc(p.title)}</button>
          ${p.archived_at ? '<span class="tag">已归档</span>' : ''}
          <button type="button" class="rename" data-act="edit-title" title="改名" aria-label="改名">✎</button>
        </div></td>`;
      } else {
        const col = D.col(key);
        html += `<td class="c-${key}${col?.num ? ' num' : ''}${col?.edit ? ' editable' : ''}" data-col="${key}">${D.cellHtml(p, key)}</td>`;
      }
    }
    return html + '</tr>';
  }

  D.renderList = (view, el) => {
    const cfg = view.cfg;
    const cols = cfg.cols.filter(c => D.col(c));
    const list = D.sortProjects(D.applyFilters(D.state.projects, view, D.q), cfg.sort);
    D.currentList = list;
    const groups = D.groupProjects(list, cfg.group);
    const span = cols.length + 1;
    const w = key => cfg.widths?.[key] || D.col(key)?.w || 120;
    const tableW = 40 + cols.reduce((a, c) => a + w(c), 0);

    let body = '';
    if (!D.state.projects.length) {
      body = `<div class="empty-state"><p>还没有项目。</p><p>把业务方的需求粘进「收集箱」，再一键转成项目；或者直接新建一个。</p>
        <p><button type="button" class="btn" data-new-project>＋ 新建项目</button> <button type="button" class="btn ghost" data-goto="inbox">去收集箱</button></p></div>`;
    } else if (!list.length) {
      body = `<div class="empty-state"><p>没有符合条件的项目。</p><p><button type="button" class="btn ghost" data-act="filter-clear">清空筛选</button></p></div>`;
    } else {
      const head = `<colgroup><col style="width:40px">${cols.map(c => `<col data-col="${c}" style="width:${w(c)}px">`).join('')}</colgroup>
        <thead><tr><th class="c-sel"><input type="checkbox" data-sel-all aria-label="全选" ${list.every(p => D.sel.has(p.id)) ? 'checked' : ''}></th>${cols.map(c => {
          const s = cfg.sort?.key === c ? (cfg.sort.dir === 'desc' ? ' ↓' : ' ↑') : '';
          return `<th data-sort="${c}" class="${D.col(c).num ? 'num' : ''}${s ? ' sorted' : ''}"><span>${esc(D.col(c).label)}${s}</span><i class="rz" data-rz="${c}"></i></th>`;
        }).join('')}</tr></thead>`;
      const groupsHtml = groups.map(g => {
        const collapsed = cfg.collapsed?.[g.key];
        const title = g.key === '__all' ? '' : `<tr class="ghead"><td colspan="${span}"><button type="button" class="gtoggle" data-act="collapse" data-g="${esc(g.key)}"><span class="caret${collapsed ? '' : ' open'}">▸</span>${D.groupTitle(cfg.group, g.value)}<span class="gcount">${g.items.length}</span></button></td></tr>`;
        const rows = collapsed ? '' : g.items.map(p => rowHtml(p, cols)).join('');
        const add = collapsed ? '' : `<tr class="addrow"><td></td><td colspan="${span - 1}"><button type="button" class="add-inline" data-act="add-inline" data-g="${esc(g.key)}">＋ 添加项目</button></td></tr>`;
        return `<tbody>${title}${rows}${add}</tbody>`;
      }).join('');
      body = `<div class="table-wrap"><table class="grid" style="width:${tableW}px">${head}${groupsHtml}</table></div>
        <p class="foot-count muted">共 ${list.length} 个${D.state.projects.length !== list.length ? `（全部 ${D.state.projects.length} 个，已归档的默认不显示）` : ''}</p>`;
    }
    el.innerHTML = D.toolbarHtml(view) + body;
    el.style.setProperty('--vhead', el.querySelector('.vhead').offsetHeight + 'px');
  };

  /* ================= 列表事件（挂在 #main 上，由 app.js 转发） ================= */
  D.listEvents = (main, getView) => {
    main.addEventListener('click', e => {
      const view = getView(); if (view?.kind !== 'list') return;
      if (D.toolbarClick(e, view, D.currentList)) return;
      const tr = e.target.closest('tr.prow'); const p = tr && D.project(tr.dataset.id);
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'collapse') {
        const g = e.target.closest('[data-g]').dataset.g;
        view.cfg.collapsed = { ...view.cfg.collapsed, [g]: !view.cfg.collapsed?.[g] }; D.saveViewCfg(view); return D.render();
      }
      if (act === 'add-inline') return inlineAdd(e.target.closest('[data-act]'), view);
      if (!p) {
        const th = e.target.closest('th[data-sort]');
        if (th && !e.target.closest('.rz')) {
          const key = th.dataset.sort, s = view.cfg.sort;
          view.cfg.sort = s?.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null;
          changed(view);
        }
        return;
      }
      if (act === 'open') return D.drawer.open(p.id);
      if (act === 'edit-title') return D.editCell(tr.querySelector('.c-title'), p, 'title');
      const td = e.target.closest('td[data-col]');
      if (td && td.dataset.col !== 'title' && !e.target.closest('input')) {
        if (D.col(td.dataset.col)?.edit) D.editCell(td, p, td.dataset.col);
        else D.drawer.open(p.id, td.dataset.col === 'pendings' ? 'pendings' : td.dataset.col === 'progress' ? 'delivs' : undefined);
      }
    });
    main.addEventListener('change', e => {
      const view = getView(); if (view?.kind !== 'list') return;
      if (e.target.matches('[data-sel-all]')) { D.currentList.forEach(p => e.target.checked ? D.sel.add(p.id) : D.sel.delete(p.id)); return D.render(); }
      if (e.target.matches('[data-sel]')) { const id = Number(e.target.closest('tr').dataset.id); e.target.checked ? D.sel.add(id) : D.sel.delete(id); return D.render(); }
    });
    // 拖表头右边缘调列宽
    main.addEventListener('pointerdown', e => {
      const rz = e.target.closest('[data-rz]'); const view = getView();
      if (!rz || view?.kind !== 'list') return;
      e.preventDefault();
      const key = rz.dataset.rz, col = main.querySelector(`col[data-col="${key}"]`), table = main.querySelector('table.grid');
      const startX = e.clientX, startW = col.getBoundingClientRect().width || parseInt(col.style.width), startT = table.offsetWidth;
      const move = ev => { const w = Math.max(60, startW + ev.clientX - startX); col.style.width = w + 'px'; table.style.width = startT + w - startW + 'px'; };
      const up = ev => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', up);
        view.cfg.widths = { ...view.cfg.widths, [key]: Math.round(Math.max(60, startW + ev.clientX - startX)) }; D.saveViewCfg(view);
      };
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    });
  };

  function inlineAdd(btn, view) {
    const gk = btn.dataset.g;
    const [by, ...rest] = gk.split(':'); const val = rest.join(':');
    const td = btn.parentElement;
    td.innerHTML = `<form class="inline-add"><input name="title" placeholder="项目名，回车保存（Esc 取消）" maxlength="120" aria-label="新项目名"></form>`;
    const form = td.querySelector('form'), input = form.title;
    input.focus();
    input.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); D.render(); } });
    input.addEventListener('blur', () => { if (!input.value.trim()) setTimeout(D.render, 100); });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const title = input.value.trim(); if (!title) return;
      const data = { title, status: 'need', priority: 'mid' };
      if (gk !== '__all' && val) data[by] = val;
      // 当前视图的筛选条件也带上，免得新建的项目一保存就从视图里消失
      for (const key of ['kind', 'province', 'status', 'priority']) {
        const f = view.cfg.filters[key]; if (f?.length === 1 && !(key in data && gk !== '__all' && by === key)) data[key] = f[0];
      }
      input.disabled = true;
      try { await D.create('projects', data); D.toast(`已添加「${title}」`); }
      catch (err) { D.fail(err); input.disabled = false; }
    });
  }
})();
