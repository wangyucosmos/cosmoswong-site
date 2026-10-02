/* KOL 工作台 · 列表视图 + 列表/看板共用的工具栏（筛选、分组、排序、列、批量操作）。 */
(() => {
  const K = window.KOL;
  const { esc } = K;
  K.sel = new Set();          // 勾选的 KOL
  K.queueable = list => list.filter(k => !k.do_not_contact && (k.status === 'todo' || (k.status === 'contacted' && !K.nextStep(k).giveUp)));
  K.expanded = new Set();     // 展开子任务的 KOL

  /* ================= 工具栏 ================= */
  K.toolbarHtml = view => {
    const cfg = view.cfg, f = cfg.filters || {};
    const chips = K.FILTERS.filter(x => Array.isArray(f[x.key]) ? f[x.key].length : f[x.key]).map(x => {
      const vals = Array.isArray(f[x.key]) ? f[x.key] : [f[x.key]];
      return `<span class="fchip"><button type="button" data-act="filter-edit" data-f="${x.key}">${esc(x.label)}：${esc(vals.map(v => K.filterLabel(x.key, v)).join('、'))}</button><button type="button" class="x" data-act="filter-remove" data-f="${x.key}" aria-label="去掉这个筛选">×</button></span>`;
    }).join('');
    const isList = view.kind === 'list';
    const g = K.GROUPS.find(x => x.key === (cfg.group || 'none'));
    const s = cfg.sort?.key ? `${K.col(cfg.sort.key)?.label || cfg.sort.key} ${cfg.sort.dir === 'desc' ? '↓' : '↑'}` : '默认';
    return `<div class="vhead"><div class="toolbar">
      <div class="filters">${chips}<button type="button" class="tb" data-act="filter-add">＋ 筛选</button>
        ${chips ? '<button type="button" class="tb ghost" data-act="filter-clear">清空筛选</button>' : ''}</div>
      <div class="tools">
        ${view.followBtn && K.queueable(K.currentList || []).length ? `<button type="button" class="btn sm" data-act="queue" title="按顺序一个接一个写好邮件，发完点「已发送」自动跳到下一个">✉️ 逐个发信（${K.queueable(K.currentList).length}）</button>` : ''}
        ${isList ? `<button type="button" class="tb" data-act="group">分组：${esc(g.label)}</button>
        <button type="button" class="tb" data-act="sort">排序：${esc(s)}</button>
        <button type="button" class="tb" data-act="cols">列</button>` : ''}
        <button type="button" class="tb" data-act="io">导入 / 导出</button>
        <button type="button" class="tb" data-act="view-menu" aria-label="视图选项">⋯</button>
      </div>
    </div>
    <div class="batchbar" ${K.sel.size ? '' : 'hidden'}>
      <b>已选 ${K.sel.size} 个</b>
      <button type="button" class="tb" data-act="batch" data-field="status">改状态</button>
      <button type="button" class="tb" data-act="batch" data-field="priority">改优先级</button>
      <button type="button" class="tb" data-act="batch" data-field="platform">改平台</button>
      <button type="button" class="tb" data-act="batch" data-field="next_followup_at">改下次跟进</button>
      <button type="button" class="tb" data-act="batch-export">导出所选</button>
      <button type="button" class="tb ghost" data-act="batch-clear">取消选择</button>
    </div></div>`;
  };

  const changed = view => { K.saveViewCfg(view); K.writeHash(view, K.q); K.render(); };

  K.filterEditor = (anchor, view, key) => {
    const f = K.FILTERS.find(x => x.key === key), cfg = view.cfg;
    if (f.multi) {
      return K.pickOption(anchor, {
        options: K.filterOptions(key), value: cfg.filters[key] || [], multi: true, search: ['country', 'language'].includes(key),
        onPick: vals => { cfg.filters[key] = vals; if (!vals.length) delete cfg.filters[key]; changed(view); }
      });
    }
    const cur = cfg.filters[key] || '';
    const custom = key === 'followers' ? (/^c:/.test(cur) ? cur.slice(2).split('-') : ['', '']) : null;
    const el = K.popover(anchor, `<div class="opts">${K.filterOptions(key).map(o => `<button type="button" class="opt${cur === o.value ? ' on' : ''}" data-v="${o.value}">${esc(o.label)}</button>`).join('')}</div>
      ${custom ? `<form class="pop-form" data-custom><label>自定义区间</label><div class="row"><input name="a" type="number" min="0" placeholder="最少" value="${esc(custom[0])}" aria-label="最少粉丝">–<input name="b" type="number" min="0" placeholder="最多" value="${esc(custom[1])}" aria-label="最多粉丝"><button class="btn sm">确定</button></div></form>` : ''}`, { cls: 'pick' });
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      cfg.filters[key] = b.dataset.v; K.closePopover(); changed(view);
    });
    el.querySelector('[data-custom]')?.addEventListener('submit', e => {
      e.preventDefault();
      const a = e.target.a.value, b = e.target.b.value;
      if (a || b) cfg.filters[key] = `c:${a}-${b}`; else delete cfg.filters[key];
      K.closePopover(); changed(view);
    });
  };

  K.toolbarClick = (e, view, list) => {
    const b = e.target.closest('[data-act]'); if (!b) return false;
    const cfg = view.cfg, act = b.dataset.act;
    switch (act) {
      case 'filter-add': {
        const el = K.popover(b, `<div class="opts">${K.FILTERS.map(f => `<button type="button" class="opt" data-k="${f.key}">${esc(f.label)}</button>`).join('')}</div>`, { cls: 'pick' });
        el.addEventListener('click', ev => { const x = ev.target.closest('[data-k]'); if (x) K.filterEditor(b, view, x.dataset.k); });
        return true;
      }
      case 'filter-edit': K.filterEditor(b, view, b.dataset.f); return true;
      case 'filter-remove': delete cfg.filters[b.dataset.f]; changed(view); return true;
      case 'filter-clear': cfg.filters = {}; changed(view); return true;
      case 'group':
        K.pickOption(b, { options: K.GROUPS.map(g => ({ value: g.key, label: g.label })), value: cfg.group || 'none', allowEmpty: false,
          onPick: v => { cfg.group = v; changed(view); } });
        return true;
      case 'sort': {
        const opts = K.COLS.map(c => ({ value: c.key, label: c.label }));
        const el = K.popover(b, `<div class="seg"><button type="button" data-dir="asc" class="${cfg.sort?.dir !== 'desc' ? 'on' : ''}">从小到大 ↑</button><button type="button" data-dir="desc" class="${cfg.sort?.dir === 'desc' ? 'on' : ''}">从大到小 ↓</button></div>
          <div class="opts">${opts.map(o => `<button type="button" class="opt${cfg.sort?.key === o.value ? ' on' : ''}" data-v="${o.value}">${esc(o.label)}</button>`).join('')}</div>
          <button type="button" class="opt clear" data-v="">不排序</button>`, { cls: 'pick' });
        el.addEventListener('click', ev => {
          const d = ev.target.closest('[data-dir]');
          if (d) { cfg.sort = { key: cfg.sort?.key || 'name', dir: d.dataset.dir }; K.closePopover(); return changed(view); }
          const o = ev.target.closest('[data-v]'); if (!o) return;
          cfg.sort = o.dataset.v ? { key: o.dataset.v, dir: cfg.sort?.dir || 'asc' } : null; K.closePopover(); changed(view);
        });
        return true;
      }
      case 'cols': colsEditor(b, view); return true;
      case 'io': K.io.menu(b, view, list); return true;
      case 'view-menu': viewMenu(b, view); return true;
      case 'batch': batch(b, b.dataset.field); return true;
      case 'batch-export': K.io.exportCsv(K.state.kols.filter(k => K.sel.has(k.id)), view, '所选'); return true;
      case 'batch-clear': K.sel.clear(); K.render(); return true;
      case 'queue': K.mail.queue(K.queueable(list).map(k => k.id)); return true;
    }
    return false;
  };

  function colsEditor(anchor, view) {
    const cfg = view.cfg;
    const draw = () => {
      const shown = cfg.cols.map(K.col).filter(Boolean), hidden = K.COLS.filter(c => !cfg.cols.includes(c.key));
      return `<p class="pop-title">拖动 ⠿ 调整顺序，勾选显示</p><div class="col-list">${shown.map(c => `<div class="col-item" data-id="${c.key}"><span class="grip" data-drag>⠿</span><label><input type="checkbox" checked ${c.fixed ? 'disabled' : ''} data-col="${c.key}"> ${esc(c.label)}</label></div>`).join('')}</div>
        <div class="col-hidden">${hidden.map(c => `<div class="col-item"><span class="grip"></span><label><input type="checkbox" data-col="${c.key}"> ${esc(c.label)}</label></div>`).join('')}</div>
        <div class="pop-foot"><button type="button" class="btn sm ghost" data-reset>恢复默认列</button></div>`;
    };
    const el = K.popover(anchor, draw(), { cls: 'cols-pop', width: 260 });
    const bind = () => K.sortable(el.querySelector('.col-list'), '.col-item', ids => { cfg.cols = ids; changed(view); }, { axis: 'y', handle: '.grip' });
    bind();
    el.addEventListener('change', e => {
      const k = e.target.dataset.col; if (!k) return;
      cfg.cols = e.target.checked ? [...cfg.cols, k] : cfg.cols.filter(x => x !== k);
      changed(view); el.innerHTML = draw(); bind();
    });
    el.addEventListener('click', e => {
      if (!e.target.closest('[data-reset]')) return;
      cfg.cols = [...(view.def?.cols || K.DEFAULT_COLS)]; cfg.widths = {}; changed(view); el.innerHTML = draw(); bind();
    });
  }

  function viewMenu(anchor, view) {
    const el = K.popover(anchor, `<div class="opts">
      <button type="button" class="opt" data-m="save">＋ 把当前筛选存成新视图</button>
      ${view.custom ? '<button type="button" class="opt" data-m="rename">重命名这个视图</button><button type="button" class="opt danger" data-m="delete">删除这个视图</button>'
        : '<button type="button" class="opt" data-m="reset">恢复这个视图的默认设置</button>'}</div>`, { cls: 'pick' });
    el.addEventListener('click', async e => {
      const m = e.target.closest('[data-m]')?.dataset.m; if (!m) return;
      K.closePopover();
      if (m === 'save') K.app.newView(anchor);
      if (m === 'reset') { K.pref.set('view.' + view.id, {}); K.resetViewCfg(view.id); K.app.show(view.id); }
      if (m === 'rename') K.app.renameView(anchor, view);
      if (m === 'delete') K.app.deleteView(view);
    });
  }

  function batch(anchor, field) {
    const ids = [...K.sel];
    const apply = async patch => {
      const before = ids.map(id => ({ ...K.kol(id) }));
      ids.forEach(id => Object.assign(K.kol(id) || {}, patch)); K.render();
      try {
        const { kols } = await K.api('POST', '/kols/batch', { ids, patch });
        kols.forEach(K.replaceKol); K.render(); K.toast(`已更新 ${kols.length} 个 KOL`);
      } catch (e) { before.forEach(K.replaceKol); K.render(); K.fail(e); }
    };
    if (field === 'next_followup_at') return K.datePopover(anchor, null, v => apply({ next_followup_at: v }));
    K.pickOption(anchor, { options: K.optionsFor(field), search: false, allowEmpty: field !== 'status', onPick: v => apply({ [field]: v }) });
  }

  /* ================= 日期小弹层（快捷 +1/+3/+7/+14） ================= */
  K.datePopover = (anchor, value, onPick, { base } = {}) => {
    const from = base || K.today();
    const el = K.popover(anchor, `<div class="quick">${[['今天', 0], ['+1 天', 1], ['+3 天', 3], ['+7 天', 7], ['+14 天', 14]].map(([l, n]) => `<button type="button" class="tb" data-d="${K.addDays(from, n)}">${l}</button>`).join('')}</div>
      <input type="date" value="${esc(value || '')}" aria-label="选日期">
      <div class="pop-foot"><button type="button" class="btn sm ghost" data-d="">清空</button></div>`, { cls: 'datepop' });
    el.addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (b) { K.closePopover(); onPick(b.dataset.d || null); } });
    el.querySelector('input').addEventListener('change', e => { if (e.target.value) { K.closePopover(); onPick(e.target.value); } });
  };

  /* ================= 单元格编辑 ================= */
  K.editCell = (td, k, key) => {
    const col = K.col(key); if (!col?.edit) return;
    const save = v => { if (JSON.stringify(v ?? null) !== JSON.stringify(k[key] ?? null)) K.updateKol(k.id, { [key]: v }).catch(() => {}); };
    switch (col.edit) {
      case 'pick':
        return K.pickOption(td, { options: K.optionsFor(key), value: k[key], search: ['country', 'language'].includes(key), allowEmpty: key !== 'status',
          emptyLabel: key === 'priority' ? '自动（按规则建议）' : '清空', onPick: save });
      case 'multi':
        return K.pickOption(td, { options: K.optionsFor(key), value: k[key] || [], multi: true, onPick: save });
      case 'date': return K.datePopover(td, k[key], save);
      case 'bool': return save(k[key] ? 0 : 1);
      case 'tags': {
        const el = K.popover(td, `<form class="pop-form"><label>标签（用逗号分隔）</label><input name="t" value="${esc((k.tags || []).join(', '))}"><div class="pop-foot"><button class="btn sm">保存</button></div></form>`);
        el.querySelector('form').addEventListener('submit', e => { e.preventDefault(); K.closePopover(); save(e.target.t.value.split(/[,，]/).map(s => s.trim()).filter(Boolean)); });
        return;
      }
      default: {
        // 文字 / 数字：原地变输入框，回车或失焦保存，Esc 取消
        const input = document.createElement('input');
        input.className = 'cell-input';
        input.type = col.edit === 'int' || col.edit === 'num' ? 'number' : col.edit === 'email' ? 'email' : 'text';
        if (col.edit === 'num') input.step = '0.01';
        input.value = k[key] ?? '';
        td.innerHTML = ''; td.append(input); input.focus(); input.select?.();
        let done = false;
        const finish = ok => {
          if (done) return; done = true;
          const raw = input.value.trim();
          if (!ok) return K.render();
          const v = raw === '' ? null : (col.edit === 'int' || col.edit === 'num') ? Number(raw) : raw;
          if (key === 'name' && !v) { K.toast('名称不能空', { error: true }); return K.render(); }
          save(v); K.render();
        };
        input.addEventListener('keydown', e => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') { e.stopPropagation(); finish(false); } });
        input.addEventListener('blur', () => finish(true));
      }
    }
  };

  /* ================= 列表渲染 ================= */
  const subCount = id => { const t = K.tasksOf(id); return t.length ? `${t.filter(x => x.done).length}/${t.length}` : ''; };

  function rowHtml(k, cols, view) {
    const sel = K.sel.has(k.id), exp = K.expanded.has(k.id), sc = subCount(k.id);
    const s = K.statusOf(k.status);
    const overdue = k.next_followup_at && k.next_followup_at < K.today() && !['won', 'paused'].includes(k.status);
    let html = `<tr class="krow${sel ? ' sel' : ''}${overdue ? ' is-overdue' : ''}" data-id="${k.id}">
      <td class="c-sel"><input type="checkbox" data-sel aria-label="选择 ${esc(k.name)}" ${sel ? 'checked' : ''}></td>`;
    for (const key of cols) {
      if (key === 'name') {
        html += `<td class="c-name" data-col="name"><div class="name-wrap">
          <button type="button" class="caret${exp ? ' open' : ''}${sc ? '' : ' empty'}" data-act="toggle-sub" aria-label="展开子任务">▸</button>
          <span class="sdot st-${esc(k.status)}" style="--c:${esc(s.color)}" title="${esc(s.label)}"></span>
          <button type="button" class="name" data-act="open">${esc(k.name)}</button>
          ${k.do_not_contact ? '<span class="dnc" title="对方要求勿再联系">勿联系</span>' : ''}
          ${sc ? `<button type="button" class="subcount" data-act="toggle-sub" title="子任务">☑ ${sc}</button>` : ''}
          <button type="button" class="rename" data-act="edit-name" title="改名" aria-label="改名">✎</button>
        </div></td>`;
      } else {
        const col = K.col(key);
        html += `<td class="c-${key}${col?.num ? ' num' : ''}${col?.edit ? ' editable' : ''}" data-col="${key}">${K.cellHtml(k, key)}</td>`;
      }
    }
    if (view.followBtn) html += `<td class="c-act"><button type="button" class="follow-btn" data-act="follow">✓ 已跟进</button></td>`;
    html += '</tr>';
    if (exp) {
      const span = cols.length + (view.followBtn ? 1 : 0);
      for (const t of K.tasksOf(k.id)) {
        const od = !t.done && t.due_at && t.due_at < K.today();
        html += `<tr class="subrow${t.done ? ' done' : ''}" data-task="${t.id}"><td></td><td colspan="${span}"><div class="sub-wrap">
          <label><input type="checkbox" data-task-done ${t.done ? 'checked' : ''}> <span>${esc(t.title)}</span></label>
          ${t.due_at ? `<span class="due ${od ? 'overdue' : ''}">${esc(K.fmtDate(t.due_at))}</span>` : ''}
          <button type="button" class="x" data-act="task-del" aria-label="删除子任务">×</button></div></td></tr>`;
      }
      html += `<tr class="subrow add" data-kol="${k.id}"><td></td><td colspan="${span}"><form class="sub-add" data-sub-add="${k.id}"><input name="title" placeholder="＋ 添加子任务，回车保存" maxlength="200" aria-label="新子任务"><input name="due" type="date" aria-label="截止日期"></form></td></tr>`;
    }
    return html;
  }

  K.renderList = (view, el) => {
    const cfg = view.cfg;
    const cols = cfg.cols.filter(c => K.col(c));
    const list = K.sortKols(K.applyFilters(K.state.kols, view, K.q), cfg.sort);
    K.currentList = list;
    const groups = K.groupKols(list, cfg.group);
    const span = cols.length + 1 + (view.followBtn ? 1 : 0);
    const w = key => cfg.widths?.[key] || K.col(key)?.w || 120;
    const tableW = 40 + cols.reduce((a, c) => a + w(c), 0) + (view.followBtn ? 110 : 0);

    let body = '';
    if (!K.state.kols.length) {
      body = `<div class="empty-state"><p>还没有 KOL。</p><p><button type="button" class="btn" data-goto="finder">去「找人助手」加第一个</button> 或者 <button type="button" class="btn ghost" data-act="io">导入 CSV</button></p></div>`;
    } else if (!list.length) {
      body = view.base === 'today' && !Object.keys(cfg.filters).length && !K.q
        ? `<div class="empty-state"><p>🎉 今天没有要跟进的 KOL。</p><p class="muted">可以去「所有 KOL」给待触达的人排上下次跟进日期。</p></div>`
        : `<div class="empty-state"><p>没有符合条件的 KOL。</p><p><button type="button" class="btn ghost" data-act="filter-clear">清空筛选</button></p></div>`;
    } else {
      const head = `<colgroup><col style="width:40px">${cols.map(c => `<col data-col="${c}" style="width:${w(c)}px">`).join('')}${view.followBtn ? '<col style="width:110px">' : ''}</colgroup>
        <thead><tr><th class="c-sel"><input type="checkbox" data-sel-all aria-label="全选" ${list.every(k => K.sel.has(k.id)) ? 'checked' : ''}></th>${cols.map(c => {
          const s = cfg.sort?.key === c ? (cfg.sort.dir === 'desc' ? ' ↓' : ' ↑') : '';
          return `<th data-sort="${c}" class="${K.col(c).num ? 'num' : ''}${s ? ' sorted' : ''}"><span>${esc(K.col(c).label)}${s}</span><i class="rz" data-rz="${c}"></i></th>`;
        }).join('')}${view.followBtn ? '<th></th>' : ''}</tr></thead>`;
      const groupsHtml = groups.map(g => {
        const collapsed = cfg.collapsed?.[g.key];
        const title = g.key === '__all' ? '' : `<tr class="ghead"><td colspan="${span}"><button type="button" class="gtoggle" data-act="collapse" data-g="${esc(g.key)}"><span class="caret${collapsed ? '' : ' open'}">▸</span>${K.groupTitle(cfg.group, g.value)}<span class="gcount">${g.items.length}</span></button></td></tr>`;
        const rows = collapsed ? '' : g.items.map(k => rowHtml(k, cols, view)).join('');
        const add = collapsed ? '' : `<tr class="addrow"><td></td><td colspan="${span - 1}"><button type="button" class="add-inline" data-act="add-inline" data-g="${esc(g.key)}">＋ 添加 KOL</button></td></tr>`;
        return `<tbody>${title}${rows}${add}</tbody>`;
      }).join('');
      body = `<div class="table-wrap"><table class="grid" style="width:${tableW}px">${head}${groupsHtml}</table></div>
        <p class="foot-count muted">共 ${list.length} 个${K.state.kols.length !== list.length ? `（全部 ${K.state.kols.length} 个）` : ''}</p>`;
    }
    el.innerHTML = K.toolbarHtml(view) + body;
    el.style.setProperty('--vhead', el.querySelector('.vhead').offsetHeight + 'px');
  };

  /* ================= 列表事件（挂在 #main 上，由 app.js 转发） ================= */
  K.listEvents = (main, getView) => {
    main.addEventListener('click', e => {
      const view = getView(); if (view?.kind !== 'list') return;
      if (K.toolbarClick(e, view, K.currentList)) return;
      const tr = e.target.closest('tr.krow'); const k = tr && K.kol(tr.dataset.id);
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'collapse') {
        const g = e.target.closest('[data-g]').dataset.g;
        view.cfg.collapsed = { ...view.cfg.collapsed, [g]: !view.cfg.collapsed?.[g] }; K.saveViewCfg(view); return K.render();
      }
      if (act === 'add-inline') return inlineAdd(e.target.closest('[data-act]'), view);
      if (act === 'task-del') {
        const id = Number(e.target.closest('[data-task]').dataset.task), t = K.state.tasks.find(x => x.id === id);
        return K.deferredDelete({ text: `删除子任务「${t.title}」？`, label: t.title,
          removeLocal: () => { K.state.tasks = K.state.tasks.filter(x => x.id !== id); },
          restoreLocal: () => K.state.tasks.push(t), commit: () => K.api('DELETE', `/tasks/${id}`) });
      }
      if (!k) {
        const th = e.target.closest('th[data-sort]');
        if (th && !e.target.closest('.rz')) {
          const key = th.dataset.sort, s = view.cfg.sort;
          view.cfg.sort = s?.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null;
          changed(view);
        }
        return;
      }
      if (act === 'open') return K.drawer.open(k.id);
      if (act === 'toggle-sub') { K.expanded.has(k.id) ? K.expanded.delete(k.id) : K.expanded.add(k.id); return K.render(); }
      if (act === 'follow') return K.followupPopover(e.target.closest('[data-act]'), k);
      if (act === 'edit-name') return K.editCell(tr.querySelector('.c-name'), k, 'name');
      const td = e.target.closest('td[data-col]');
      if (td && td.dataset.col !== 'name' && !e.target.closest('input')) K.editCell(td, k, td.dataset.col);
    });
    main.addEventListener('change', async e => {
      const view = getView(); if (view?.kind !== 'list') return;
      if (e.target.matches('[data-sel-all]')) {
        K.currentList.forEach(k => e.target.checked ? K.sel.add(k.id) : K.sel.delete(k.id)); return K.render();
      }
      if (e.target.matches('[data-sel]')) {
        const id = Number(e.target.closest('tr').dataset.id); e.target.checked ? K.sel.add(id) : K.sel.delete(id); return K.render();
      }
      if (e.target.matches('[data-task-done]')) {
        const id = Number(e.target.closest('[data-task]').dataset.task);
        K.setTaskDone(id, e.target.checked);
      }
    });
    main.addEventListener('submit', async e => {
      const f = e.target.closest('[data-sub-add]'); if (!f) return;
      e.preventDefault();
      const title = f.title.value.trim(); if (!title) return;
      try { await K.addTask(Number(f.dataset.subAdd), title, f.due.value || null); } catch (err) { K.fail(err); }
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
        view.cfg.widths = { ...view.cfg.widths, [key]: Math.round(Math.max(60, startW + ev.clientX - startX)) }; K.saveViewCfg(view);
      };
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    });
  };

  function inlineAdd(btn, view) {
    const gk = btn.dataset.g;
    const [by, ...rest] = gk.split(':'); const val = rest.join(':');
    const td = btn.parentElement;
    td.innerHTML = `<form class="inline-add"><input name="name" placeholder="KOL 名称，回车保存（Esc 取消）" maxlength="120" aria-label="新 KOL 名称"></form>`;
    const form = td.querySelector('form'), input = form.name;
    input.focus();
    input.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); K.render(); } });
    input.addEventListener('blur', () => { if (!input.value.trim()) setTimeout(K.render, 100); });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const name = input.value.trim(); if (!name) return;
      const data = { name };
      if (gk !== '__all' && val) data[by] = by === 'category' ? [val] : val;
      // 当前视图的筛选条件也带上，免得新建的人一保存就从视图里消失
      for (const key of ['status', 'platform', 'country', 'language', 'priority']) {
        const f = view.cfg.filters[key]; if (f?.length === 1 && !(key in data)) data[key] = f[0];
      }
      input.disabled = true;
      try { await K.createKol(data); K.toast(`已添加「${name}」`); }
      catch (err) { K.fail(err); input.disabled = false; }
    });
  }

  /* ================= 子任务 ================= */
  K.addTask = async (kolId, title, due) => {
    const { item } = await K.api('POST', '/tasks', { kol_id: kolId, title, due_at: due });
    K.state.tasks.push(item); K.expanded.add(kolId); K.render();
    return item;
  };
  K.setTaskDone = async (id, done) => {
    const t = K.state.tasks.find(x => x.id === id); if (!t) return;
    const before = t.done; t.done = done ? 1 : 0; K.render();
    try { const { item } = await K.api('PATCH', `/tasks/${id}`, { done: t.done }); Object.assign(t, item); }
    catch (e) { t.done = before; K.render(); K.fail(e); }
  };
})();
