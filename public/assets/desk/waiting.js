/* 我的工作台 · 待确认（在等谁）：今天页和项目页共用同一套行和操作。
   v2：有「最晚哪天要」就按离那天还有几天标色（过了标红、两天内标橙），没有才按等了几天；卡交付的靠前；还没到「开始催」那天的先收起来。
   「催一下」自动拼一句客气的催办话术，复制时记一次催办。 */
(() => {
  const D = window.DESK;
  const { esc } = D;

  D.pendingRow = (x, { showProject = true } = {}) => {
    const waiting = x.status === 'waiting', p = x.project_id && D.project(x.project_id);
    const st = waiting ? D.pendState(x) : { level: '' };
    const nudged = x.nudge_count ? `已催 ${x.nudge_count} 次${x.last_nudged_at ? `（${D.diffDays(D.today(), x.last_nudged_at) === 0 ? '今天' : D.diffDays(D.today(), x.last_nudged_at) + ' 天前'}）` : ''}` : '';
    const waited = waiting && !st.later && (x.asked_at || x.remind_from) && D.waitDays(x) > 0 ? `等了 ${D.waitDays(x)} 天` : '';
    const meta = [
      `问${esc(x.ask_whom || '—')}${x.ask_name ? ' · ' + esc(x.ask_name) : ''}`,
      showProject && p ? `<button type="button" class="link-btn" data-open-project="${p.id}" data-tab="pendings">${esc(p.title)}</button>` : '',
      nudged
    ].filter(Boolean).join(' · ');
    // 右边的小标签：一眼看出急不急（细节放在 title 里，鼠标停上去能看到）
    const d = x.need_by ? D.diffDays(x.need_by, D.today()) : null;
    const pill = !waiting ? (x.status === 'answered' ? `${D.fmtDate(x.answered_at)} 已答复` : '不需要了')
      : st.later ? `${D.fmtDate(x.remind_from)} 起催`
      : d != null ? (d < 0 ? `已过 ${-d} 天` : d === 0 ? '今天就要' : d <= 2 ? `还有 ${d} 天` : `${D.fmtDate(x.need_by)}前`)
      : waited || '刚问';
    const pcls = !waiting ? 'ok' : st.level === 'danger' ? 'bad' : st.level === 'warn' ? 'warn' : '';
    const tip = [st.text, waited].filter(Boolean).join(' · ');
    // 头像圈：问谁的第一个字（业务方 → 业、领导 → 领）
    const av = [...String(x.ask_name || x.ask_whom || '？').trim()][0] || '？';
    return `<li class="wrow${st.level ? ' lvl-' + st.level : ''}${waiting ? '' : ' closed'}${st.later ? ' later' : ''}" data-pending="${x.id}">
      <span class="av" aria-hidden="true">${esc(av)}</span>
      <div class="wmain">
        <div class="wq">${waiting && x.blocking ? '<span class="blk">卡交付</span>' : ''}${esc(x.question)}</div>
        <div class="wmeta">${meta}</div>
        ${x.answer ? `<div class="wans">答：${esc(x.answer)}</div>` : ''}
        <div class="wact">${waiting && !st.later ? `<button type="button" class="btn sm ghost" data-nudge>${D.icon('message', 'sm')}催一下</button>` : ''}${waiting ? `<button type="button" class="btn sm ghost ok" data-answer>${D.icon('check', 'sm')}已答复</button>` : ''}
          <button type="button" class="icon" data-pmore aria-label="更多操作">${D.icon('more')}</button></div>
      </div>
      <span class="pill ${pcls} wdays" title="${esc(tip)}">${esc(pill)}</span>
    </li>`;
  };

  // 新增待确认：一条一条加，也可以一次粘贴多条（一行一条；行里可以写「问谁｜要确认什么｜最晚哪天要」）
  D.pendingForm = pid => `<form class="pend-add" data-pending-add ${pid ? `data-pid="${pid}"` : ''}>
    <div class="add-row">
      ${pid ? '' : `<select name="project" aria-label="项目">${D.selectOpts(D.optionsFor('project'), '', { empty: '（不属于任何项目）' })}</select>`}
      <input name="question" maxlength="500" placeholder="＋ 要确认什么，如：奖品表" aria-label="要确认什么">
      <select name="whom" aria-label="问谁">${D.selectOpts(D.cfg().ask_whom, D.cfg().ask_whom[0])}</select>
      <label class="lbl inline">最晚<input name="need" type="date" aria-label="最晚哪天要"></label>
      <label class="check"><input type="checkbox" name="blocking"> 卡交付</label>
      <button class="tb">添加</button>
      <button type="button" class="link-btn small" data-batch-toggle>一次粘贴多条</button>
    </div>
    <div class="batch" hidden>
      <textarea name="batch" rows="5" maxlength="20000" placeholder="一行一条。可以只写问题；也可以写「问谁｜要确认什么｜最晚哪天要」，比如：&#10;业务方｜奖品表｜10-22&#10;活动页标题用哪一版" aria-label="一次粘贴多条待确认"></textarea>
      <div class="row"><button type="button" class="btn sm" data-batch-add>全部加进去</button><span class="muted small">问谁没写的，用上面选的那个</span></div>
    </div></form>`;
  const splitLine = line => {
    const c = line.split(/[｜|]/).map(s => s.trim());
    return c.length >= 2 ? { who: c[0], q: c[1], by: D.parseDateLoose(c[2] || '') } : { who: '', q: c[0], by: null };
  };
  D.submitPending = async (f, pid) => {
    const project_id = pid ?? (f.project?.value ? Number(f.project.value) : null);
    const q = f.question.value.trim(); if (!q) return f.question.focus();
    try {
      await D.create('pendings', { project_id, question: q, ask_whom: f.whom.value, blocking: f.blocking.checked ? 1 : 0, need_by: f.need.value || null, asked_at: D.today() });
      f.question.value = ''; f.need.value = ''; f.blocking.checked = false;
      D.toast('已记下，会出现在「在等谁」里');
    } catch (e) { D.fail(e); }
  };
  D.submitPendingBatch = async (f, pid) => {
    const project_id = pid ?? (f.project?.value ? Number(f.project.value) : null);
    const lines = f.batch.value.split(/\r?\n/).map(l => l.replace(/^\s*(?:[-*•·]|\d+[.、)）])\s*/, '').trim()).filter(Boolean);
    if (!lines.length) return D.toast('先粘贴要确认的问题，一行一条', { error: true });
    const have = new Set(D.pendingsOf(project_id).filter(x => x.status === 'waiting').map(x => x.question.trim()));
    let n = 0;
    try {
      for (const l of lines) {
        const { who, q, by } = splitLine(l);
        if (!q || have.has(q)) continue;
        await D.create('pendings', { project_id, question: q.slice(0, 500), ask_whom: (who || f.whom.value || '').slice(0, 30) || null, need_by: by, asked_at: D.today() });
        have.add(q); n++;
      }
      f.batch.value = ''; f.querySelector('.batch').hidden = true;
      D.toast(n ? `加了 ${n} 条待确认` : '这些都已经在等了，没有新加');
    } catch (e) { D.fail(e); }
  };

  /* ---------- 催一下 / 已答复 / 更多 ---------- */
  function nudgePop(anchor, x) {
    const el = D.popover(anchor, `<form class="pop-form nudge" novalidate>
      <p class="pop-title">催一下${x.need_by ? ` · 最晚 ${esc(D.fmtDate(x.need_by))} 要` : ` · 已经等了 ${D.waitDays(x)} 天`}</p>
      <textarea name="text" rows="4" aria-label="催办话术">${esc(D.nudgeText(x))}</textarea>
      <p class="muted small">可以先改再复制。复制后会记一次催办（次数 + 日期），也写进项目动态。</p>
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
      <textarea name="answer" rows="3" maxlength="5000" placeholder="对方怎么说的（会进「已拍板的口径」，之后生成提示词时每个 AI 都会看到）" aria-label="答复内容"></textarea>
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
      <button type="button" class="opt" data-m="edit">编辑（问谁、最晚哪天要…）</button>
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
      <div class="row"><label>最晚哪天要<input type="date" name="need" value="${esc(x.need_by || '')}"></label><label>从哪天开始催<input type="date" name="from" value="${esc(x.remind_from || '')}"></label></div>
      <label>什么时候问的<input type="date" name="asked" value="${esc(x.asked_at || '')}"></label>
      ${x.answer != null ? `<label>答复<textarea name="answer" rows="2" maxlength="5000">${esc(x.answer || '')}</textarea></label>` : ''}
      <div class="pop-foot"><button class="btn sm">保存</button></div></form>`, { width: 400, cls: 'sheet' });
    el.querySelector('form').addEventListener('submit', e => {
      e.preventDefault();
      const f = e.target, q = f.question.value.trim();
      if (!q) return D.toast('要确认什么不能空', { error: true });
      if (f.need.value && f.from.value && f.from.value > f.need.value) return D.toast('「开始催」要早于「最晚哪天要」', { error: true });
      D.closePopover();
      const patch = { question: q, project_id: f.project.value ? Number(f.project.value) : null, ask_whom: f.whom.value || null, ask_name: f.name.value.trim() || null,
        need_by: f.need.value || null, remind_from: f.from.value || null, asked_at: f.asked.value || null };
      if (f.answer) patch.answer = f.answer.value.trim() || null;
      D.patch('pendings', x.id, patch).catch(() => {});
    });
  }

  // 待确认行出现在今天页和项目页：统一在 document 上接点击和提交
  document.addEventListener('click', e => {
    const bt = e.target.closest('[data-batch-toggle]');
    if (bt) { const b = bt.closest('form').querySelector('.batch'); b.hidden = !b.hidden; if (!b.hidden) b.querySelector('textarea').focus(); return; }
    const ba = e.target.closest('[data-batch-add]');
    if (ba) { const f = ba.closest('form'); return D.submitPendingBatch(f, f.dataset.pid ? Number(f.dataset.pid) : null); }
    const row = e.target.closest('[data-pending]'); if (!row) return;
    const x = D.find('pendings', row.dataset.pending); if (!x) return;
    const b = e.target.closest('button'); if (!b) return;
    if (b.matches('[data-nudge]')) return nudgePop(b, x);
    if (b.matches('[data-answer]')) return answerPop(b, x);
    if (b.matches('[data-pmore]')) return morePop(b, x);
  });
  document.addEventListener('submit', e => {
    const f = e.target.closest('[data-pending-add]'); if (!f) return;
    e.preventDefault();
    D.submitPending(f, f.dataset.pid ? Number(f.dataset.pid) : null);
  });
})();
