/* 我的工作台 · 看板：每个状态一列，拖卡片改状态 / 列内排序（pointer 事件，触控板顺滑；触屏长按后拖）。写法照 /kol 的 board.js。 */
(() => {
  const D = window.DESK;
  const { esc } = D;

  // 列内顺序：sort_order 小的在前；没排过的按新建先后（id）排在后面
  const eff = p => p.sort_order ?? 1e9 + p.id;

  function launchTag(p) {
    if (!p.launch_at) return '';
    const d = D.diffDays(p.launch_at, D.today());
    const notLive = !['live', 'done', 'paused'].includes(p.status);
    const cls = d < 0 && notLive ? 'overdue' : d >= 0 && d <= 7 && notLive ? 'soon' : '';
    const text = d < 0 ? (notLive ? `上线日已过 ${-d} 天` : D.fmtDate(p.launch_at)) : d === 0 ? '今天上线' : d <= 7 ? `${d} 天后上线` : D.fmtDate(p.launch_at);
    return `<div><dt>上线</dt><dd class="due ${cls}" title="${esc(D.fmtDateW(p.launch_at))}">${esc(text)}</dd></div>`;
  }

  function card(p) {
    const g = D.progressOf(p.id), w = D.waitingOf(p.id), block = w.some(x => x.blocking);
    return `<article class="card" data-id="${p.id}" tabindex="0" aria-label="${esc(p.title)}">
      <h4>${esc(p.title)}</h4>
      <div class="card-tags">${D.provChip(p.province)}${D.kindChip(p.kind)}${D.priorityChip(p.priority)}</div>
      <dl>
        ${launchTag(p)}
        ${g.total ? `<div><dt>交付物</dt><dd><span class="prog${g.done === g.total ? ' full' : ''}">${g.done}/${g.total}</span></dd></div>` : ''}
        ${w.length ? `<div><dt>待确认</dt><dd><span class="cnt${block ? ' block' : ''}">${w.length}${block ? ' · 卡交付' : ''}</span></dd></div>` : ''}
      </dl>
    </article>`;
  }

  D.renderBoard = (view, el) => {
    const list = D.applyFilters(D.state.projects, view, D.q);
    D.currentList = list;
    const cols = D.cfg().statuses.map(s => {
      const items = list.filter(p => p.status === s.key).sort((a, b) => eff(a) - eff(b));
      return `<section class="bcol" data-status="${s.key}" style="--c:${esc(s.color)}">
        <header>${D.statusChip(s.key)}<span class="gcount">${items.length}</span></header>
        <div class="bcards" data-status="${s.key}">${items.map(card).join('')}</div>
        <button type="button" class="add-inline" data-act="board-add" data-status="${s.key}">＋ 添加项目</button>
      </section>`;
    }).join('');
    el.innerHTML = D.toolbarHtml(view) + (D.state.projects.length ? `<div class="board">${cols}</div>`
      : `<div class="empty-state"><p>还没有项目。</p><p><button type="button" class="btn" data-new-project>＋ 新建项目</button></p></div>`);
  };

  D.boardEvents = (main, getView) => {
    main.addEventListener('click', e => {
      const view = getView(); if (view?.kind !== 'board') return;
      if (D.toolbarClick(e, view, D.currentList)) return;
      const add = e.target.closest('[data-act="board-add"]');
      if (add) return boardAdd(add);
      const c = e.target.closest('.card');
      if (c) D.drawer.open(c.dataset.id);
    });
    main.addEventListener('keydown', e => {
      const c = e.target.closest?.('.card');
      if (c && e.key === 'Enter') D.drawer.open(c.dataset.id);
    });
    main.addEventListener('pointerdown', e => {
      const view = getView(); if (view?.kind !== 'board') return;
      const c = e.target.closest('.card'); if (!c || e.button !== 0) return;
      startDrag(e, c, main);
    });
  };

  function boardAdd(btn) {
    const status = btn.dataset.status;
    const form = document.createElement('form');
    form.className = 'inline-add';
    form.innerHTML = '<input name="title" placeholder="项目名，回车保存" maxlength="120" aria-label="新项目名">';
    btn.replaceWith(form);
    const input = form.title; input.focus();
    input.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); D.render(); } });
    input.addEventListener('blur', () => { if (!input.value.trim()) setTimeout(D.render, 100); });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const title = input.value.trim(); if (!title) return;
      input.disabled = true;
      try { await D.create('projects', { title, status, priority: 'mid' }); D.toast(`已添加「${title}」`); } catch (err) { D.fail(err); input.disabled = false; }
    });
  }

  /* ---------- 拖动 ---------- */
  let drag = null;
  // 长按拖动期间禁止页面滚动（必须是非 passive 监听）
  document.addEventListener('touchmove', e => { if (drag?.active) e.preventDefault(); }, { passive: false });

  function startDrag(e, cardEl, main) {
    const touch = e.pointerType === 'touch';
    const sx = e.clientX, sy = e.clientY;
    drag = { cardEl, active: false, sx, sy, x: sx, y: sy };
    const holdTimer = touch ? setTimeout(() => activate(), 300) : null;

    const activate = () => {
      if (!drag || drag.active) return;
      drag.active = true;
      const r = cardEl.getBoundingClientRect();
      const ghost = cardEl.cloneNode(true);
      ghost.classList.add('ghost');
      ghost.style.width = r.width + 'px';
      ghost.style.left = r.left + 'px'; ghost.style.top = r.top + 'px';
      document.body.append(ghost);
      drag.ghost = ghost; drag.dx = drag.x - r.left; drag.dy = drag.y - r.top;
      drag.ph = document.createElement('div'); drag.ph.className = 'placeholder'; drag.ph.style.height = r.height + 'px';
      cardEl.after(drag.ph); cardEl.classList.add('lifted');
      document.body.classList.add('dragging-card');
      if (navigator.vibrate) try { navigator.vibrate(10); } catch { /* 不支持就算了 */ }
      place();
    };
    const place = () => {
      const g = drag.ghost; if (!g) return;
      g.style.transform = `translate(${drag.x - drag.dx - parseFloat(g.style.left)}px, ${drag.y - drag.dy - parseFloat(g.style.top)}px) rotate(1.5deg)`;
      g.style.pointerEvents = 'none';
      const under = document.elementFromPoint(drag.x, drag.y);
      const col = under?.closest('.bcards') || under?.closest('.bcol')?.querySelector('.bcards');
      if (!col) return;
      const cards = [...col.querySelectorAll('.card:not(.lifted)')];
      const before = cards.find(c => { const r = c.getBoundingClientRect(); return drag.y < r.top + r.height / 2; });
      before ? col.insertBefore(drag.ph, before) : col.append(drag.ph);
      // 拖到边缘时自动横向滚动
      const board = main.querySelector('.board');
      if (board) { const br = board.getBoundingClientRect(); if (drag.x > br.right - 40) board.scrollLeft += 12; if (drag.x < br.left + 40) board.scrollLeft -= 12; }
    };
    const move = ev => {
      if (!drag) return;
      drag.x = ev.clientX; drag.y = ev.clientY;
      if (!drag.active) {
        const dist = Math.hypot(ev.clientX - sx, ev.clientY - sy);
        if (touch) { if (dist > 8) cancel(); return; }   // 触屏没长按就滑动 = 在滚页面
        if (dist > 5) activate();
        return;
      }
      place();
    };
    const cleanup = () => {
      clearTimeout(holdTimer);
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', cancel);
      document.body.classList.remove('dragging-card');
    };
    const cancel = () => {
      cleanup();
      if (drag?.active) { drag.ghost.remove(); drag.ph.remove(); cardEl.classList.remove('lifted'); }
      drag = null;
    };
    const up = () => {
      cleanup();
      if (!drag?.active) { drag = null; return; }
      const { ph, ghost } = drag;
      const col = ph.parentElement;
      const status = col.dataset.status;
      const near = dir => { let n = ph[dir]; while (n && (n.classList.contains('lifted') || !n.classList.contains('card'))) n = n[dir]; return n; };
      const prev = near('previousElementSibling'), next = near('nextElementSibling');
      ghost.remove(); ph.remove(); cardEl.classList.remove('lifted');
      drag = null;
      // 吞掉拖完那一下的 click，免得打开抽屉
      const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
      addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => removeEventListener('click', swallow, { capture: true }), 50);
      const p = D.project(cardEl.dataset.id); if (!p) return;
      const a = prev ? eff(D.project(prev.dataset.id)) : null, b = next ? eff(D.project(next.dataset.id)) : null;
      const ord = a == null && b == null ? eff(p) : a == null ? b - 1024 : b == null ? a + 1024 : (a + b) / 2;
      const patch = { sort_order: ord };
      if (status && status !== p.status) patch.status = status;
      if (patch.status || ord !== eff(p)) {
        D.patch('projects', p.id, patch).then(() => { if (patch.status) D.toast(`「${p.title}」→ ${D.statusOf(status).label}`); }).catch(() => {});
      } else D.render();
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', cancel);
  }
})();
