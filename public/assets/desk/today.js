/* 我的工作台 · 今天（默认首页，一屏看完）：逾期 → 今天要做 → 7 天内上线 / 截止 → 在等谁 → 本周玩法创意 → 收集箱 → 今天收工。
   「今天」按 Asia/Shanghai 算；「已交付」「暂缓」的项目不在这里出现。 */
(() => {
  const D = window.DESK;
  const { esc } = D;

  // 项目还「活着」：没归档、不是已交付 / 暂缓（不属于任何项目的待办也算）
  D.projOk = pid => { if (!pid) return true; const p = D.project(pid); return !!p && !p.archived_at && !D.LIVE_OUT.includes(p.status); };
  D.nextWorkday = s => { let d = D.addDays(s, 1); while ([0, 6].includes(D.dow(d))) d = D.addDays(d, 1); return d; };

  function itemRow({ kind, row }, { showProject = true } = {}) {
    const p = row.project_id && D.project(row.project_id), r = D.rel(row.due_at);
    const proj = showProject && p ? `<button type="button" class="link-btn proj" data-open-project="${p.id}" data-tab="${kind === 'task' ? 'tasks' : 'delivs'}">${esc(p.title)}</button>` : '';
    if (kind === 'task') {
      return `<li class="trow" data-today-task="${row.id}">
        <label class="check"><input type="checkbox" data-tdone aria-label="完成"> <span>${row.milestone ? '🚩 ' : ''}${esc(row.title)}</span></label>
        ${row.offset_days != null ? `<small class="muted">${esc(D.offsetLabel(row.offset_days))}</small>` : ''}${proj}
        <span class="due ${r.cls}">${esc(r.text)}</span></li>`;
    }
    const cp = D.checkProgress(row);
    return `<li class="trow deliv" data-today-deliv="${row.id}">
      <label class="check"><input type="checkbox" data-ddone aria-label="标成已交付"> <span>📦 ${esc(D.delivLabel(row))} <small class="muted">交付物 · ${esc(D.delivStatusOf(row.status).label)}${cp.total ? ` · 检查 ${cp.done}/${cp.total}` : ''}</small></span></label>
      ${proj}<span class="due ${r.cls}">${esc(r.text)}</span></li>`;
  }

  function countdown(p, today) {
    const lines = [];
    const notLive = !['live', 'done', 'paused'].includes(p.status);
    const within = d => d && d >= today && D.diffDays(d, today) <= 7;
    if (within(p.launch_at) && notLive) { const n = D.diffDays(p.launch_at, today); lines.push({ n, text: n === 0 ? '今天上线' : `还有 ${n} 天上线`, cls: 'launch' }); }
    if (within(p.due_at)) { const n = D.diffDays(p.due_at, today); lines.push({ n, text: n === 0 ? '今天截止' : `还有 ${n} 天截止`, cls: 'due' }); }
    if (!lines.length) return null;
    lines.sort((a, b) => a.n - b.n);   // 更近的那个日期写在前面
    const nn = D.nextNode(p.id);
    let node = '';
    if (nn) {
      const d = D.diffDays(nn.due_at, today);
      const when = d < 0 ? `已逾期 ${-d} 天` : d === 0 ? '今天' : d <= 6 ? D.wk(nn.due_at) : `${D.fmtDate(nn.due_at)} ${D.wk(nn.due_at)}`;
      node = `<small class="nn">下一个节点：${esc(D.offsetLabel(nn.offset_days))} ${esc(nn.title)}（${esc(when)}）</small>`;
    }
    const name = p.province && !p.title.startsWith(p.province) ? `${p.province} ${p.title}` : p.title;
    return { n: Math.min(...lines.map(l => l.n)), html: `<button type="button" class="cd-card${lines[0].n <= 1 ? ' hot' : ''}" data-open-project="${p.id}">
      <b>${esc(name)}</b>${lines.map(l => `<span class="cd ${l.cls}">${esc(l.text)}</span>`).join('')}${node}</button>` };
  }

  D.renderToday = (view, el) => {
    const today = D.today(), c = D.cfg();
    const tasks = D.state.tasks.filter(t => !t.done && t.due_at && D.projOk(t.project_id));
    const delivs = D.state.deliverables.filter(d => d.status !== 'done' && d.due_at && D.projOk(d.project_id));
    const items = [...tasks.map(row => ({ kind: 'task', row })), ...delivs.map(row => ({ kind: 'deliv', row }))];
    const overdue = items.filter(x => x.row.due_at < today).sort((a, b) => a.row.due_at.localeCompare(b.row.due_at) || a.row.id - b.row.id);
    const dueToday = items.filter(x => x.row.due_at === today);
    const groups = new Map();
    for (const x of dueToday) { const k = x.row.project_id || 0; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
    const soon = D.state.projects.filter(p => !p.archived_at && !D.LIVE_OUT.includes(p.status)).map(p => countdown(p, today)).filter(Boolean).sort((a, b) => a.n - b.n);
    const waits = D.sortWaiting(D.state.pendings.filter(x => x.status === 'waiting' && D.projOk(x.project_id)));
    const week = D.isoWeek(today), dow = D.dow(today);
    const ideaDone = D.state.ideas.some(i => i.week === week && i.status !== 'draft');
    const ideaLate = dow === 0 || dow >= 4;   // 周四起变橙
    const inboxN = D.state.inbox.filter(i => !i.processed_at).length;

    const welcome = c.welcome_done ? '' : `<section class="card-box welcome">
      <h3>👋 每天这样用</h3>
      <ol>
        <li>早上先看这一页：<b>红色</b>是逾期的，先处理；「今天要做」做完直接勾掉。</li>
        <li>「在等谁」按等的天数排好了，等久了点 <b>催一下</b>，会拼好一句客气的催办话，复制去微信发就行。</li>
        <li>业务方发来新需求，按 <kbd>c</kbd> 粘进「收集箱」，有空再转成项目、待办或待确认。</li>
        <li>给 AI 开工前，打开项目 →「AI 交接」生成开工提示词；AI 干完把汇报贴回来，顺手记一条提效。</li>
        <li>下班前点最下面的 <b>今天收工</b>，一分钟记下明天第一件事。</li>
      </ol>
      <div class="row"><button type="button" class="btn sm" data-welcome-done>知道了，不再显示</button><span class="muted small">快捷键：<kbd>/</kbd> 搜索 <kbd>c</kbd> 收集 <kbd>n</kbd> 新项目 <kbd>t</kbd> 回到今天</span></div>
    </section>`;

    const left = `
      ${overdue.length ? `<section class="card-box sec-overdue"><h3>逾期 <span class="badge red">${overdue.length}</span></h3><ul class="tlist">${overdue.map(x => itemRow(x)).join('')}</ul></section>` : ''}
      <section class="card-box"><h3>今天要做 <span class="gcount">${dueToday.length}</span> <small class="muted">${esc(D.fmtDateW(today))}</small></h3>
        ${dueToday.length ? [...groups.entries()].map(([pid, list]) => `<div class="tgroup">${pid ? `<button type="button" class="link-btn gname" data-open-project="${pid}">${esc(D.projectName(pid))}</button>` : '<span class="gname muted">不属于任何项目</span>'}
          <ul class="tlist">${list.map(x => itemRow(x, { showProject: false })).join('')}</ul></div>`).join('')
          : `<p class="muted">${overdue.length ? '今天到期的都清了，先把上面逾期的处理掉。' : '🎉 今天没有到期的事。'}</p>`}
        <form class="add-row today-add" data-today-add>
          <input name="title" maxlength="200" placeholder="＋ 加一条今天的待办" aria-label="今天的待办">
          <select name="project" aria-label="项目">${D.selectOpts(D.optionsFor('project'), '', { empty: '（不属于任何项目）' })}</select>
          <button class="tb">添加</button></form></section>
      <section class="card-box"><h3>7 天内上线 / 截止</h3>
        ${soon.length ? `<div class="cd-grid">${soon.map(s => s.html).join('')}</div>` : '<p class="muted">7 天内没有要上线或截止的项目。</p>'}</section>`;

    const right = `
      <section class="card-box"><h3>在等谁 <span class="gcount">${waits.length}</span> <button type="button" class="link-btn small" data-goto="waiting">全部 →</button></h3>
        ${waits.length ? `<ul class="wlist">${waits.map(x => D.pendingRow(x)).join('')}</ul>` : '<p class="muted">没有在等的事。业务方口头说了、还没定下来的口径，记在项目的「待确认」里，这里就会提醒你催。</p>'}</section>
      ${ideaDone ? '' : `<section class="card-box idea-nag${ideaLate ? ' late' : ''}"><h3>💡 本周玩法创意还没提交</h3>
        <p>每周一个，写好后在「玩法创意」里把状态改成「已提交」，这张卡就会消失。${ideaLate ? '<b>已经周' + '日一二三四五六'[dow] + '了。</b>' : ''}</p>
        <button type="button" class="btn sm" data-goto="ideas">去写</button></section>`}
      ${inboxN ? `<section class="card-box inbox-nag"><h3>📥 收集箱还有 ${inboxN} 条没处理</h3><button type="button" class="btn sm ghost" data-goto="inbox">去处理</button></section>` : ''}`;

    el.innerHTML = `<div class="page today">${welcome}
      <div class="today-cols"><div class="col">${left}</div><div class="col">${right}</div></div>
      <div class="wrap-bar"><button type="button" class="btn" data-wrapup>🌙 今天收工</button></div></div>`;
  };

  D.todayEvents = (main, getView) => {
    main.addEventListener('change', async e => {
      if (getView()?.kind !== 'today') return;
      const t = e.target;
      if (t.matches('[data-tdone]')) return D.setTaskDone(Number(t.closest('[data-today-task]').dataset.todayTask), t.checked);
      if (t.matches('[data-ddone]')) {
        const d = D.find('deliverables', t.closest('[data-today-deliv]').dataset.todayDeliv);
        if (!(await D.deliver(d))) { t.checked = false; D.render(); }
      }
    });
    main.addEventListener('click', async e => {
      if (getView()?.kind !== 'today') return;
      if (e.target.closest('[data-welcome-done]')) {
        D.state.settings.welcome_done = true; D.render();
        try { await D.api('PUT', '/settings/welcome_done', { value: true }); } catch (err) { D.fail(err); }
      }
      if (e.target.closest('[data-wrapup]')) D.wrapup.open();
    });
    main.addEventListener('submit', async e => {
      if (getView()?.kind !== 'today' || !e.target.matches('[data-today-add]')) return;
      e.preventDefault();
      const f = e.target, title = f.title.value.trim(); if (!title) return;
      try { await D.create('tasks', { title, due_at: D.today(), project_id: f.project.value ? Number(f.project.value) : null }); D.toast('已加到今天'); }
      catch (err) { D.fail(err); }
    });
  };

  /* ================= 今天收工 ================= */
  const dlg = () => D.$('#wrapup');
  const NAG_MAX = 3;   // 提效快填：每周最多主动展开 3 次
  function open() {
    const today = D.today(), week = D.isoWeek(today), c = D.cfg();
    const doneTasks = D.state.tasks.filter(t => t.done && t.done_at === today);
    const doneDelivs = D.state.deliverables.filter(d => d.status === 'done' && d.delivered_at === today);
    const nag = c.wrapup_nag?.week === week ? c.wrapup_nag : { week, count: 0 };
    const showWin = nag.count < NAG_MAX;
    if (showWin) {
      D.state.settings.wrapup_nag = { week, count: nag.count + 1 };
      D.api('PUT', '/settings/wrapup_nag', { value: D.state.settings.wrapup_nag }).catch(() => {});
    }
    const tomorrow = D.nextWorkday(today);
    const projOpts = D.selectOpts(D.optionsFor('project'), '', { empty: '（不属于任何项目）' });
    const tools = c.ai_tools.filter(x => x !== '我自己');
    D.$('#wrapup-form').innerHTML = `
      <section class="wsec"><h4>今天勾掉了 ${doneTasks.length + doneDelivs.length} 件</h4>
        ${doneTasks.length + doneDelivs.length ? `<ul class="done-list">${doneTasks.map(t => `<li>✓ ${esc(t.title)}${t.project_id ? ` <small class="muted">${esc(D.projectName(t.project_id))}</small>` : ''}</li>`).join('')}${doneDelivs.map(d => `<li>📦 交付了 ${esc(D.delivLabel(d))} <small class="muted">${esc(D.projectName(d.project_id))}</small></li>`).join('')}</ul>` : '<p class="muted">今天还没勾掉任何事。没关系，明天继续。</p>'}</section>
      <section class="wsec"><h4>明天第一件事 <small class="muted">${esc(D.fmtDateW(tomorrow))}</small></h4>
        <input name="first" maxlength="200" placeholder="写成能直接动手的一句话，如：把原型 V2 发群" aria-label="明天第一件事">
        <div class="row wrap"><select name="first_project" aria-label="属于哪个项目">${projOpts}</select>
          <label class="check"><input type="radio" name="first_mode" value="task" checked> 新建明天的待办</label>
          <label class="check"><input type="radio" name="first_mode" value="next"> 写进项目的「下一步」</label></div></section>
      <section class="wsec"><h4>有没有新的待确认要记？</h4>
        <input name="pq" maxlength="500" placeholder="要确认什么（没有就空着）" aria-label="新的待确认">
        <div class="row wrap"><select name="pq_project" aria-label="项目">${projOpts}</select>
          <select name="pq_whom" aria-label="问谁">${D.selectOpts(c.ask_whom, c.ask_whom[0])}</select>
          <label class="check"><input type="checkbox" name="pq_block"> 卡交付</label></div></section>
      <section class="wsec win-quick" ${showWin ? '' : 'hidden'}><h4>提效记录快填 <small class="muted">今天哪件事用了 AI？可以跳过（本周第 ${Math.min(nag.count + 1, NAG_MAX)} 次提醒，每周最多 ${NAG_MAX} 次）</small></h4>
        <div class="row wrap"><input name="win_task" maxlength="200" placeholder="做了什么，如：客服文档 V1" aria-label="做了什么">
          <select name="win_type" aria-label="任务类型">${D.selectOpts(c.win_task_types, c.win_task_types[0])}</select>
          <select name="win_project" aria-label="项目">${projOpts}</select></div>
        <div class="checks">${tools.map(t => `<label><input type="checkbox" name="win_tools" value="${esc(t)}"> ${esc(t)}</label>`).join('')}</div>
        <div class="row wrap"><label class="lbl inline">以前大概 <input type="number" name="win_before" min="0" max="100000" class="w80" aria-label="以前大概多少分钟"> 分钟</label>
          <label class="lbl inline">这次 <input type="number" name="win_after" min="0" max="100000" class="w80" aria-label="这次多少分钟"> 分钟</label>
          <label class="check"><input type="checkbox" name="win_ok"> 可以上作品集（需脱敏）</label></div></section>
      ${showWin ? '' : '<p class="muted small"><button type="button" class="link-btn" data-show-win>＋ 也记一条提效</button>（本周已经提醒过 3 次，不再自动展开）</p>'}
      <div class="row end"><button type="button" class="btn sm ghost" data-wrap-close>取消</button><button class="btn sm">收工</button></div>`;
    dlg().showModal();
    D.$('#wrapup-form [name=first]').focus();
  }

  async function save(e) {
    e.preventDefault();
    const f = e.target, today = D.today(), jobs = [];
    const first = f.first.value.trim(), fp = f.first_project.value ? Number(f.first_project.value) : null;
    if (first) {
      if (f.first_mode.value === 'next' && fp) jobs.push(() => D.patch('projects', fp, { next_action: first }));
      else jobs.push(() => D.create('tasks', { title: first, project_id: fp, due_at: D.nextWorkday(today) }));
    }
    const pq = f.pq.value.trim();
    if (pq) jobs.push(() => D.create('pendings', { question: pq, project_id: f.pq_project.value ? Number(f.pq_project.value) : null, ask_whom: f.pq_whom.value, blocking: f.pq_block.checked ? 1 : 0, asked_at: today }));
    const wt = f.win_task.value.trim(), before = f.win_before.value, after = f.win_after.value;
    if (!f.querySelector('.win-quick').hidden && wt && (before || after)) {
      jobs.push(() => D.create('wins', { happened_at: today, task: wt, task_type: f.win_type.value, project_id: f.win_project.value ? Number(f.win_project.value) : null,
        tools: [...f.querySelectorAll('[name=win_tools]:checked')].map(x => x.value), before_minutes: before === '' ? null : Number(before), after_minutes: after === '' ? null : Number(after), portfolio_ok: f.win_ok.checked ? 1 : 0 }));
    } else if (!f.querySelector('.win-quick').hidden && wt) return D.toast('提效记录要填「以前大概多久」和「这次多久」，或者把「做了什么」清空跳过', { error: true });
    const btn = f.querySelector('button:not([type=button])'); btn.disabled = true;
    try {
      for (const j of jobs) await j();
      dlg().close(); D.toast(jobs.length ? '收工啦，明天见 👋' : '收工啦，明天见');
    } catch (err) { if (err.status !== 409) D.fail(err); }
    finally { btn.disabled = false; }
  }

  D.wrapup = { open };
  document.addEventListener('DOMContentLoaded', () => {
    D.$('#wrapup-form').addEventListener('submit', save);
    dlg().addEventListener('click', e => {
      if (e.target.closest('[data-wrap-close]')) dlg().close();
      if (e.target.closest('[data-show-win]')) { D.$('#wrapup-form .win-quick').hidden = false; e.target.closest('p').remove(); }
    });
  });
})();
