/* KOL 工作台 · 看板视图：每个状态一列，拖卡片改状态 / 列内排序（pointer 事件，触控板顺滑；触屏长按后拖）。 */
(() => {
  const K = window.KOL;
  const { esc } = K;

  // 列内顺序：sort_order 小的在前；没排过的按录入先后（id）排在后面
  const eff = k => k.sort_order ?? 1e9 + k.id;

  function card(k) {
    const r = K.relFollow(k.next_followup_at);
    const live = !['won', 'paused'].includes(k.status);
    const sc = K.tasksOf(k.id);
    return `<article class="card" data-id="${k.id}" tabindex="0" aria-label="${esc(k.name)}">
      <h4>${esc(k.name)}${k.do_not_contact ? ' <span class="dnc">勿联系</span>' : ''}</h4>
      <div class="card-tags">${K.platformChip(k.platform)}${K.prioChip(k)}${k.country ? `<span class="flag" title="${esc(K.countryName(k.country))}">${K.flag(k.country)} ${esc(k.country)}</span>` : ''}</div>
      <dl>
        ${k.followers != null ? `<div><dt>粉丝</dt><dd>${esc(K.fmtInt(k.followers))}</dd></div>` : ''}
        ${k.next_followup_at ? `<div><dt>下次跟进</dt><dd class="due ${live ? r.cls : ''}">${esc(live ? r.text : K.fmtDate(k.next_followup_at))}</dd></div>` : ''}
        ${k.quote != null ? `<div><dt>报价</dt><dd>${esc(K.eur(k.quote))}</dd></div>` : ''}
        ${sc.length ? `<div><dt>子任务</dt><dd>☑ ${sc.filter(t => t.done).length}/${sc.length}</dd></div>` : ''}
      </dl>
    </article>`;
  }

  K.renderBoard = (view, el) => {
    const list = K.applyFilters(K.state.kols, view, K.q);
    K.currentList = list;
    const cols = K.cfg().statuses.map(s => {
      const items = list.filter(k => k.status === s.key).sort((a, b) => eff(a) - eff(b));
      return `<section class="bcol" data-status="${s.key}" style="--c:${esc(s.color)}">
        <header>${K.statusChip(s.key)}<span class="gcount">${items.length}</span></header>
        <div class="bcards" data-status="${s.key}">${items.map(card).join('')}</div>
        <button type="button" class="add-inline" data-act="board-add" data-status="${s.key}">＋ 添加 KOL</button>
      </section>`;
    }).join('');
    el.innerHTML = K.toolbarHtml(view) + (K.state.kols.length ? `<div class="board">${cols}</div>`
      : `<div class="empty-state"><p>还没有 KOL。</p><p><button type="button" class="btn" data-goto="finder">去「找人助手」加第一个</button></p></div>`);
  };

  K.boardEvents = (main, getView) => {
    main.addEventListener('click', e => {
      const view = getView(); if (view?.kind !== 'board') return;
      if (K.toolbarClick(e, view, K.currentList)) return;
      const add = e.target.closest('[data-act="board-add"]');
      if (add) return boardAdd(add);
      const c = e.target.closest('.card');
      if (c) K.drawer.open(c.dataset.id);
    });
    main.addEventListener('keydown', e => {
      const c = e.target.closest?.('.card');
      if (c && e.key === 'Enter') K.drawer.open(c.dataset.id);
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
    form.innerHTML = '<input name="name" placeholder="KOL 名称，回车保存" maxlength="120" aria-label="新 KOL 名称">';
    btn.replaceWith(form);
    const input = form.name; input.focus();
    input.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); K.render(); } });
    input.addEventListener('blur', () => { if (!input.value.trim()) setTimeout(K.render, 100); });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const name = input.value.trim(); if (!name) return;
      input.disabled = true;
      try { await K.createKol({ name, status }); K.toast(`已添加「${name}」`); } catch (err) { K.fail(err); input.disabled = false; }
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
    let holdTimer = touch ? setTimeout(() => activate(), 300) : null;

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
      // 拖到列边缘时自动横向滚动
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
      // 占位符前后最近的、不是被拖那张的卡片
      const near = dir => { let n = ph[dir]; while (n && (n.classList.contains('lifted') || !n.classList.contains('card'))) n = n[dir]; return n; };
      const prev = near('previousElementSibling'), next = near('nextElementSibling');
      ghost.remove(); ph.remove(); cardEl.classList.remove('lifted');
      drag = null;
      // 吞掉拖完那一下的 click，免得打开抽屉
      const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
      addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => removeEventListener('click', swallow, { capture: true }), 50);
      const k = K.kol(cardEl.dataset.id); if (!k) return;
      const a = prev ? eff(K.kol(prev.dataset.id)) : null, b = next ? eff(K.kol(next.dataset.id)) : null;
      const order = a == null && b == null ? eff(k) : a == null ? b - 1024 : b == null ? a + 1024 : (a + b) / 2;
      const patch = { sort_order: order };
      if (status && status !== k.status) patch.status = status;
      if (patch.status || order !== eff(k)) {
        K.updateKol(k.id, patch).then(() => { if (patch.status) K.toast(`「${k.name}」→ ${K.statusOf(status).label}`); }).catch(() => {});
      } else K.render();
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', cancel);
  }
})();
