/* 我的工作台 · 在等谁（待确认中心）：今天视图、在等谁视图、项目抽屉共用同一套待确认行和操作。
   等了 3 天以上标橙、7 天以上标红（天数在设置里改）；卡交付的置顶。「催一下」自动拼一句客气的催办话术，复制时记一次催办。 */
(() => {
  const D = window.DESK;
  const { esc } = D;

  D.sortWaiting = list => [...list].sort((a, b) => b.blocking - a.blocking || D.waitDays(b) - D.waitDays(a) || a.id - b.id);

  D.pendingRow = (x, { showProject = true } = {}) => {
    const waiting = x.status === 'waiting', p = x.project_id && D.project(x.project_id);
    const days = D.waitDays(x), lvl = waiting ? D.waitLevel(x) : '';
    const nudged = x.nudge_count ? `已催 ${x.nudge_count} 次${x.last_nudged_at ? `（${D.diffDays(D.today(), x.last_nudged_at) === 0 ? '今天' : D.diffDays(D.today(), x.last_nudged_at) + ' 天前'}）` : ''}` : '';
    const meta = [
      `问${esc(x.ask_whom || '—')}${x.ask_name ? ' · ' + esc(x.ask_name) : ''}`,
      showProject && p ? `<button type="button" class="link-btn" data-open-project="${p.id}" data-tab="pendings">${esc(p.title)}</button>` : '',
      waiting ? `<span class="wdays">等了 ${days} 天</span>` : x.status === 'answered' ? `${esc(D.fmtDate(x.answered_at))} 已答复` : '不需要了',
      nudged
    ].filter(Boolean).join(' · ');
    return `<li class="wrow${lvl ? ' lvl-' + lvl : ''}${waiting ? '' : ' closed'}" data-pending="${x.id}">
      <div class="wmain">
        <div class="wq">${waiting && x.blocking ? '<span class="blk">卡交付</span>' : ''}${esc(x.question)}</div>
        <div class="wmeta muted">${meta}</div>
        ${x.answer ? `<div class="wans">答：${esc(x.answer)}</div>` : ''}
      </div>
      <div class="wact">${waiting ? '<button type="button" class="btn sm ghost" data-nudge>催一下</button><button type="button" class="btn sm ghost ok" data-answer>已答复</button>' : ''}
        <button type="button" class="icon" data-pmore aria-label="更多操作">⋯</button></div>
    </li>`;
  };

  D.pendingForm = pid => `<form class="add-row pend-add" data-pending-add>
    ${pid ? '' : `<select name="project" aria-label="项目">${D.selectOpts(D.optionsFor('project'), '', { empty: '（不属于任何项目）' })}</select>`}
    <input name="question" maxlength="500" placeholder="＋ 要确认什么，如：奖品表" aria-label="要确认什么" required>
    <select name="whom" aria-label="问谁">${D.selectOpts(D.cfg().ask_whom, D.cfg().ask_whom[0])}</select>
    <input name="name" maxlength="40" placeholder="名字（可不填）" aria-label="名字" class="w120">
    <label class="check"><input type="checkbox" name="blocking"> 卡交付</label>
    <button class="tb">添加</button></form>`;
  D.submitPending = async (f, pid) => {
    const q = f.question.value.trim(); if (!q) return;
    const project_id = pid ?? (f.project?.value ? Number(f.project.value) : null);
    try {
      await D.create('pendings', { project_id, question: q, ask_whom: f.whom.value, ask_name: f.name.value.trim(), blocking: f.blocking.checked ? 1 : 0, asked_at: D.today() });
      f.question.value = ''; f.name.value = ''; f.blocking.checked = false;
      D.toast('已记下，会出现在「在等谁」里');
    } catch (e) { D.fail(e); }
  };

  /* ---------- 催一下 / 已答复 / 更多 ---------- */
  function nudgePop(anchor, x) {
    const el = D.popover(anchor, `<form class="pop-form nudge" novalidate>
      <p class="pop-title">催一下 · 已经等了 ${D.waitDays(x)} 天</p>
      <textarea name="text" rows="4" aria-label="催办话术">${esc(D.nudgeText(x))}</textarea>
      <p class="muted small">可以先改再复制。复制后会记一次催办（次数 + 日期），也写进项目时间线。</p>
      <div class="pop-foot"><button type="button" class="btn sm ghost" data-cancel>取消</button><button class="btn sm">复制并记一次催办</button></div>
    </form>`, { width: 360, cls: 'sheet' });
    el.querySelector('[data-cancel]').addEventListener('click', D.closePopover);
    el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const text = e.target.text.value.trim();
      D.closePopover();
      await D.copy(text, '催办话术');
      try {
        const r = await D.api('POST', `/pendings/${x.id}/nudge`, { date: D.today(), text });
        D.put('pendings', r.item); if (r.activity) D.emit('activity', r.activity); D.render();
      } catch (err) { D.fail(err); }
    });
  }
  function answerPop(anchor, x) {
    const el = D.popover(anchor, `<form class="pop-form" novalidate>
      <p class="pop-title">已答复 · ${esc(D.firstLine(x.question, 30))}</p>
      <textarea name="answer" rows="3" maxlength="5000" placeholder="对方怎么说的（会写进项目时间线，之后生成提示词时算「已确认的口径」）" aria-label="答复内容"></textarea>
      <label>答复日期<input type="date" name="date" value="${D.today()}"></label>
      <div class="pop-foot"><button type="button" class="btn sm ghost" data-cancel>取消</button><button class="btn sm">保存</button></div>
    </form>`, { width: 360, cls: 'sheet' });
    el.querySelector('[data-cancel]').addEventListener('click', D.closePopover);
    el.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const answer = e.target.answer.value.trim();
      if (!answer) return D.toast('先写一下对方是怎么答复的', { error: true });
      D.closePopover();
      try {
        const r = await D.api('POST', `/pendings/${x.id}/answer`, { answer, date: e.target.date.value || D.today() });
        D.put('pendings', r.item); if (r.activity) D.emit('activity', r.activity); D.render(); D.toast('已记下答复');
      } catch (err) { D.fail(err); }
    });
  }
  function morePop(anchor, x) {
    const waiting = x.status === 'waiting';
    const el = D.popover(anchor, `<div class="opts">
      <button type="button" class="opt" data-m="edit">编辑</button>
      ${waiting ? `<button type="button" class="opt" data-m="block">${x.blocking ? '取消「卡交付」' : '标成「卡交付」'}</button><button type="button" class="opt" data-m="drop">不需要了</button>` : '<button type="button" class="opt" data-m="reopen">重新打开（继续等）</button>'}
      <button type="button" class="opt danger" data-m="del">删除</button></div>`, { cls: 'pick' });
    el.addEventListener('click', async e => {
      const m = e.target.closest('[data-m]')?.dataset.m; if (!m) return;
      D.closePopover();
      if (m === 'block') return D.patch('pendings', x.id, { blocking: x.blocking ? 0 : 1 }).catch(() => {});
      if (m === 'drop') return D.patch('pendings', x.id, { status: 'dropped' }).then(() => D.toast('已标成「不需要了」')).catch(() => {});
      if (m === 'reopen') return D.patch('pendings', x.id, { status: 'waiting' }).catch(() => {});
      if (m === 'del') return D.remove('pendings', x.id, { label: x.question });
      if (m === 'edit') return editPop(anchor, x);
    });
  }
  function editPop(anchor, x) {
    const el = D.popover(anchor, `<form class="pop-form" novalidate>
      <label>要确认什么<textarea name="question" rows="2" maxlength="500">${esc(x.question)}</textarea></label>
      <label>项目<select name="project">${D.selectOpts(D.optionsFor('project'), x.project_id ? String(x.project_id) : '', { empty: '（不属于任何项目）' })}</select></label>
      <div class="row"><label>问谁<select name="whom">${D.selectOpts(D.cfg().ask_whom, x.ask_whom || '')}</select></label><label>名字<input name="name" maxlength="40" value="${esc(x.ask_name || '')}"></label></div>
      <label>什么时候问的<input type="date" name="asked" value="${esc(x.asked_at || '')}"></label>
      ${x.answer != null ? `<label>答复<textarea name="answer" rows="2" maxlength="5000">${esc(x.answer || '')}</textarea></label>` : ''}
      <div class="pop-foot"><button class="btn sm">保存</button></div></form>`, { width: 380, cls: 'sheet' });
    el.querySelector('form').addEventListener('submit', e => {
      e.preventDefault();
      const f = e.target, q = f.question.value.trim();
      if (!q) return D.toast('要确认什么不能空', { error: true });
      D.closePopover();
      const patch = { question: q, project_id: f.project.value ? Number(f.project.value) : null, ask_whom: f.whom.value || null, ask_name: f.name.value.trim() || null, asked_at: f.asked.value || null };
      if (f.answer) patch.answer = f.answer.value.trim() || null;
      D.patch('pendings', x.id, patch).catch(() => {});
    });
  }

  // 待确认行在三个地方出现：统一在 document 上接点击
  document.addEventListener('click', e => {
    const row = e.target.closest('[data-pending]'); if (!row) return;
    const x = D.find('pendings', row.dataset.pending); if (!x) return;
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('[data-nudge]')) return nudgePop(b, x);
    if (b.matches('[data-answer]')) return answerPop(b, x);
    if (b.matches('[data-pmore]')) return morePop(b, x);
  });

  /* ---------- 在等谁视图 ---------- */
  D.renderWaiting = (view, el) => {
    const f = D.pref.get('waiting.filter', { whom: '', show: 'waiting' });
    const match = x => (!f.whom || x.ask_whom === f.whom) && (!D.q || [x.question, x.answer, x.ask_name, D.projectName(x.project_id)].join('\n').toLowerCase().includes(D.q.toLowerCase()));
    const visible = x => !x.project_id || (D.project(x.project_id) && !D.project(x.project_id).archived_at);
    const all = D.state.pendings.filter(visible);
    const waiting = D.sortWaiting(all.filter(x => x.status === 'waiting' && match(x)));
    const closed = all.filter(x => x.status !== 'waiting' && match(x)).sort((a, b) => (b.answered_at || b.updated_at || '').localeCompare(a.answered_at || a.updated_at || ''));
    const c = D.cfg().nudge_days;
    const whoms = [...new Set(all.map(x => x.ask_whom).filter(Boolean))];
    el.innerHTML = `<div class="page waiting">
      <div class="toolbar"><div class="filters">
        <select data-wf="whom" aria-label="问谁"><option value="">所有人</option>${whoms.map(w => `<option ${w === f.whom ? 'selected' : ''}>${esc(w)}</option>`).join('')}</select>
        <span class="muted small">等了 ${c.warn} 天以上标橙、${c.danger} 天以上标红，卡交付的排最前</span></div></div>
      <section class="card-box"><h3>等待中 <span class="gcount">${waiting.length}</span></h3>
        <ul class="wlist">${waiting.map(x => D.pendingRow(x)).join('') || '<li class="muted">没有在等的事。业务方口头说了、还没定下来的口径，可以记在这里。</li>'}</ul>
        ${D.pendingForm(null)}</section>
      <section class="card-box"><details ${f.show === 'all' ? 'open' : ''} data-wclosed><summary>已答复 / 不需要了（${closed.length}）</summary>
        <ul class="wlist">${closed.map(x => D.pendingRow(x)).join('') || '<li class="muted">暂无</li>'}</ul></details></section>
    </div>`;
  };
  D.waitingEvents = (main, getView) => {
    main.addEventListener('change', e => {
      if (getView()?.kind !== 'waiting') return;
      if (e.target.dataset.wf) { const f = D.pref.get('waiting.filter', { whom: '', show: 'waiting' }); f.whom = e.target.value; D.pref.set('waiting.filter', f); D.render(); }
    });
    main.addEventListener('toggle', e => {
      if (getView()?.kind !== 'waiting' || !e.target.matches?.('[data-wclosed]')) return;
      const f = D.pref.get('waiting.filter', { whom: '', show: 'waiting' }); f.show = e.target.open ? 'all' : 'waiting'; D.pref.set('waiting.filter', f);
    }, true);
    main.addEventListener('submit', e => {
      if (!['waiting', 'today'].includes(getView()?.kind) || !e.target.matches('[data-pending-add]')) return;
      e.preventDefault(); D.submitPending(e.target, null);
    });
  };
})();
