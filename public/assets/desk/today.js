/* 我的工作台 · 今天（默认首页）。v2 收成三块：
   现在要做（逾期 + 今天，同一件事只出现一次；原定上线日过了会问「上线了吗」）→ 在等谁（按最晚哪天要排）→ 接下来两周（按天列出上线、交付、节点、最晚日期）。
   「今天」按 Asia/Shanghai 算；已交付 / 暂缓 / 观望的项目不进这一页。 */
(() => {
  const D = window.DESK;
  const { esc } = D;
  D.nextWorkday = s => { let d = D.addDays(s, 1); while ([0, 6].includes(D.dow(d))) d = D.addDays(d, 1); return d; };

  function itemRow({ kind, row }, today) {
    const p = row.project_id && D.project(row.project_id), r = D.rel(row.due_at);
    const proj = p ? `<button type="button" class="link-btn proj" data-open-project="${p.id}" data-tab="${kind === 'task' ? 'tasks' : 'delivs'}">${esc(p.title)}</button>` : '';
    const due = row.due_at < today ? `<span class="due overdue">${esc(r.text)}</span>` : '';
    if (kind === 'task') {
      return `<li class="trow${row.due_at < today ? ' late' : ''}" data-today-task="${row.id}">
        <label class="check"><input type="checkbox" data-tdone aria-label="完成"> <span>${row.milestone ? '🚩 ' : ''}${esc(row.title)}</span></label>
        ${row.offset_days != null ? `<small class="muted">${esc(D.offsetLabel(row.offset_days))}</small>` : ''}${proj}${due}</li>`;
    }
    return `<li class="trow deliv${row.due_at < today ? ' late' : ''}" data-today-deliv="${row.id}">
      <label class="check"><input type="checkbox" data-ddone aria-label="标成已交付"> <span>📦 ${esc(D.delivLabel(row))} <small class="muted">要交 · ${esc(D.delivStatusOf(row.status).label)}</small></span></label>
      ${row.offset_days != null ? `<small class="muted">${esc(D.offsetLabel(row.offset_days))}</small>` : ''}${proj}${due}</li>`;
  }

  // 接下来两周：按天列出（只列有事的那几天）
  function agenda(today) {
    const days = [];
    for (let i = 1; i <= 14; i++) {
      const d = D.addDays(today, i), rows = [];
      for (const p of D.state.projects) if (p.launch_at === d && D.projOk(p.id)) rows.push(`<li class="ag launch"><span class="ic">◆</span><b>${p.launch_tentative ? '暂定上线' : '上线'}</b>：<button type="button" class="link-btn" data-open-project="${p.id}">${esc(p.title)}</button></li>`);
      for (const x of D.state.deliverables) if (x.due_at === d && x.status !== 'done' && D.projOk(x.project_id)) rows.push(`<li class="ag"><span class="ic">📦</span>交 ${esc(D.delivLabel(x))} <button type="button" class="link-btn proj" data-open-project="${x.project_id}" data-tab="delivs">${esc(D.projectName(x.project_id))}</button></li>`);
      for (const x of D.state.pendings) if (x.need_by === d && x.status === 'waiting' && D.projOk(x.project_id)) rows.push(`<li class="ag wait"><span class="ic">⏳</span>最晚要到：${esc(x.question)}（问${esc(x.ask_whom || '—')}）${x.project_id ? ` <button type="button" class="link-btn proj" data-open-project="${x.project_id}" data-tab="pendings">${esc(D.projectName(x.project_id))}</button>` : ''}</li>`);
      for (const x of D.state.tasks) if (x.due_at === d && !x.done && !x.deliverable_id && D.projOk(x.project_id)) rows.push(`<li class="ag"><span class="ic">${x.milestone ? '🚩' : '☐'}</span>${esc(x.title)}${x.project_id ? ` <button type="button" class="link-btn proj" data-open-project="${x.project_id}" data-tab="tasks">${esc(D.projectName(x.project_id))}</button>` : ''}</li>`);
      if (rows.length) days.push(`<div class="agday${[0, 6].includes(D.dow(d)) ? ' wkend' : ''}"><h4>${i === 1 ? '明天 ' : ''}${esc(D.fmtDate(d))} <small>${D.wk(d)}</small></h4><ul>${rows.join('')}</ul></div>`);
    }
    return days.join('') || '<p class="muted">接下来两周没有上线、交付或要催的东西。</p>';
  }

  D.renderToday = (view, el) => {
    const today = D.today(), c = D.cfg();
    const tasks = D.state.tasks.filter(t => !t.done && !t.deliverable_id && t.due_at && t.due_at <= today && D.projOk(t.project_id));
    const delivs = D.state.deliverables.filter(d => d.status !== 'done' && d.due_at && d.due_at <= today && D.projOk(d.project_id));
    const items = [...tasks.map(row => ({ kind: 'task', row })), ...delivs.map(row => ({ kind: 'deliv', row }))]
      .sort((a, b) => a.row.due_at.localeCompare(b.row.due_at) || a.row.id - b.row.id);
    const overdueN = items.filter(x => x.row.due_at < today).length;
    const askLaunch = D.state.projects.filter(p => !p.archived_at && D.normStatus(p.status) === 'active' && p.launch_at && p.launch_at < today);
    const waitsAll = D.state.pendings.filter(x => x.status === 'waiting' && D.projOk(x.project_id));
    const later = waitsAll.filter(x => D.pendState(x).later).sort((a, b) => (a.remind_from || '').localeCompare(b.remind_from || ''));
    const waits = D.sortWaiting(waitsAll.filter(x => !D.pendState(x).later));
    const week = D.isoWeek(today), dow = D.dow(today);
    const ideaDone = D.state.ideas.some(i => i.week === week && i.status !== 'draft');
    const inboxN = D.state.inbox.filter(i => !i.processed_at).length;

    const welcome = c.welcome_done ? '' : `<section class="card-box welcome">
      <h3>👋 每天这样用</h3>
      <ol>
        <li>早上先看「现在要做」：红色是逾期的，做完直接勾掉；要交的东西勾掉时，顺手记一下这次用了多久。</li>
        <li>「在等谁」按<b>最晚哪天要</b>排好了，快到期的标橙、过期的标红。点「催一下」会拼好一句客气话，复制去微信发。</li>
        <li>业务方发来新需求，按 <kbd>c</kbd> 粘进收集箱；让 AI 拆完，把它输出的【新建项目】那段贴回来，项目、交付物、待确认一次建好。</li>
        <li>给 AI 派活：打开项目 → 点工具名，开工提示词就复制好了。AI 干完把汇报整段贴回「回填」，下一步、待确认、交付、用时自动更新。</li>
      </ol>
      <div class="row"><button type="button" class="btn sm" data-welcome-done>知道了，不再显示</button><span class="muted small">快捷键：<kbd>/</kbd> 搜索 <kbd>c</kbd> 收集 <kbd>n</kbd> 新项目 <kbd>t</kbd> 回到今天</span></div>
    </section>`;

    const now = `<section class="card-box now${overdueN ? ' has-late' : ''}"><h3>现在要做 <span class="gcount">${items.length}</span>${overdueN ? ` <span class="badge red">逾期 ${overdueN}</span>` : ''}</h3>
      ${askLaunch.map(p => `<div class="ask-launch" data-launch-ask="${p.id}"><span>⚠ 「<button type="button" class="link-btn" data-open-project="${p.id}">${esc(p.title)}</button>」${p.launch_tentative ? '暂定' : '原定'} ${esc(D.fmtDate(p.launch_at))} 上线，上线了吗？</span>
        <span class="row-btns"><button type="button" class="btn sm" data-launched>已上线</button><button type="button" class="btn sm ghost" data-reschedule>改期</button></span></div>`).join('')}
      ${items.length ? `<ul class="tlist">${items.map(x => itemRow(x, today)).join('')}</ul>` : `<p class="muted">${askLaunch.length ? '' : '🎉 今天没有到期的事。'}</p>`}
      <form class="add-row today-add" data-today-add>
        <input name="title" maxlength="200" placeholder="＋ 加一条今天的待办" aria-label="今天的待办">
        <select name="project" aria-label="项目">${D.selectOpts(D.optionsFor('project'), '', { empty: '（不属于任何项目）' })}</select>
        <button class="tb">添加</button></form></section>`;

    const wait = `<section class="card-box"><h3>在等谁 <span class="gcount">${waits.length}</span></h3>
      ${waits.length ? `<ul class="wlist">${waits.map(x => D.pendingRow(x)).join('')}</ul>` : '<p class="muted">现在没有要催的事。</p>'}
      ${later.length ? `<details class="later-box"><summary>还没到催的时候（${later.length}）</summary><ul class="wlist">${later.map(x => D.pendingRow(x)).join('')}</ul></details>` : ''}
    </section>`;

    const side = `
      ${inboxN ? `<section class="card-box inbox-nag"><h3>📥 收集箱还有 ${inboxN} 条没处理</h3><button type="button" class="btn sm ghost" data-goto="inbox">去处理</button></section>` : ''}
      ${ideaDone ? '' : `<section class="card-box idea-nag${dow === 0 || dow >= 4 ? ' late' : ''}"><h3>💡 本周玩法创意还没提交</h3>
        <p>每周一个，写好后在「记录 → 玩法创意」里把状态改成「已提交」，这张卡就会消失。${dow === 0 || dow >= 4 ? '<b>已经周' + '日一二三四五六'[dow] + '了。</b>' : ''}</p>
        <button type="button" class="btn sm" data-goto="records" data-seg="ideas">去写</button></section>`}`;

    el.innerHTML = `<div class="page today">${welcome}
      <p class="today-sum">${esc(D.fmtDateW(today))}　·　${overdueN ? `<b class="due overdue">逾期 ${overdueN}</b>　·　` : ''}今天 ${items.length - overdueN} 件　·　在等 ${waits.length} 件</p>
      <div class="today-cols"><div class="col">${now}${wait}</div>
        <div class="col"><section class="card-box"><h3>接下来两周</h3><div class="agenda">${agenda(today)}</div></section>${side}</div></div>
      ${D.linksRow ? D.linksRow() : ''}
      <div class="wrap-bar"><button type="button" class="btn" data-wrapup>🌙 今天收工</button><button type="button" class="link-btn mobile-only" data-goto="records">玩法创意 · 提效记录 →</button></div></div>`;
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
      const ask = e.target.closest('[data-launch-ask]');
      if (ask) {
        const p = D.project(ask.dataset.launchAsk);
        if (e.target.closest('[data-launched]')) return D.patch('projects', p.id, { status: 'live', launch_tentative: 0 }).then(() => D.toast(`「${p.title}」已标成「已上线收尾」`)).catch(() => {});
        if (e.target.closest('[data-reschedule]')) return D.datePopover(e.target.closest('[data-reschedule]'), null, v => v && D.setLaunch(p, v), { base: D.today(), clear: false });
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

  /* ================= 今天收工：看一眼今天勾掉了什么，记下明天第一件事（提效挪到「标成已交付」时记） ================= */
  const dlg = () => D.$('#wrapup');
  function open() {
    const today = D.today();
    const doneTasks = D.state.tasks.filter(t => t.done && t.done_at === today && !t.deliverable_id);
    const doneDelivs = D.state.deliverables.filter(d => d.status === 'done' && d.delivered_at === today);
    const tomorrow = D.nextWorkday(today);
    D.$('#wrapup-form').innerHTML = `
      <section class="wsec"><h4>今天勾掉了 ${doneTasks.length + doneDelivs.length} 件</h4>
        ${doneTasks.length + doneDelivs.length ? `<ul class="done-list">${doneTasks.map(t => `<li>✓ ${esc(t.title)}${t.project_id ? ` <small class="muted">${esc(D.projectName(t.project_id))}</small>` : ''}</li>`).join('')}${doneDelivs.map(d => `<li>📦 交付了 ${esc(D.delivLabel(d))} <small class="muted">${esc(D.projectName(d.project_id))}</small></li>`).join('')}</ul>` : '<p class="muted">今天还没勾掉任何事。没关系，明天继续。</p>'}</section>
      <section class="wsec"><h4>明天第一件事 <small class="muted">${esc(D.fmtDateW(tomorrow))}</small></h4>
        <input name="first" maxlength="200" placeholder="写成能直接动手的一句话，如：把原型 V2 发群" aria-label="明天第一件事">
        <div class="row wrap"><select name="first_project" aria-label="属于哪个项目">${D.selectOpts(D.optionsFor('project'), '', { empty: '（不属于任何项目）' })}</select>
          <label class="check"><input type="radio" name="first_mode" value="task" checked> 新建明天的待办</label>
          <label class="check"><input type="radio" name="first_mode" value="next"> 写进项目的「下一步」</label></div></section>
      <div class="row end"><button type="button" class="btn sm ghost" data-wrap-close>取消</button><button class="btn sm">收工</button></div>`;
    dlg().showModal();
    D.$('#wrapup-form [name=first]').focus();
  }
  async function save(e) {
    e.preventDefault();
    const f = e.target, first = f.first.value.trim(), fp = f.first_project.value ? Number(f.first_project.value) : null;
    const btn = f.querySelector('button:not([type=button])'); btn.disabled = true;
    try {
      if (first) {
        if (f.first_mode.value === 'next' && fp) await D.patch('projects', fp, { next_action: first });
        else await D.create('tasks', { title: first, project_id: fp, due_at: D.nextWorkday(D.today()) });
      }
      dlg().close(); D.toast('收工啦，明天见 👋');
    } catch (err) { D.fail(err); }
    finally { btn.disabled = false; }
  }
  D.wrapup = { open };
  document.addEventListener('DOMContentLoaded', () => {
    D.$('#wrapup-form').addEventListener('submit', save);
    dlg().addEventListener('click', e => { if (e.target.closest('[data-wrap-close]')) dlg().close(); });
  });
})();
