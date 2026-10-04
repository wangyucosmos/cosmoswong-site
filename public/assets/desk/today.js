/* 我的工作台 · 今天（默认首页）。v3：便当格布局（样稿 A / B）
   现在要做（逾期 + 今天，勾掉的留在下面划线；空闲时列出「顺手的事」）｜在等谁｜月度节奏｜接下来两周（14 天日历条 + 最近几天的事）｜提效｜常用｜素材库
   「今天」按 Asia/Shanghai 算；已交付 / 暂缓 / 观望的项目不进这一页（月度节奏除外：它就是用来看观望的月份的）。 */
(() => {
  const D = window.DESK;
  const { esc } = D;
  D.nextWorkday = s => { let d = D.addDays(s, 1); while ([0, 6].includes(D.dow(d))) d = D.addDays(d, 1); return d; };
  const head = (icon, title, extra = '', cls = '') => `<h3 class="ch"><span class="ci ${cls}">${D.icon(icon)}</span>${title}${extra}</h3>`;
  D.cardHead = head;
  const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };
  const dayLabel = (d, today) => { const k = D.diffDays(d, today); return k === 0 ? '今天' : k === 1 ? '明天' : k === 2 ? '后天' : `${D.wk(d)} ${Number(d.slice(8))}`; };

  /* ---------- 现在要做 ---------- */
  function itemRow({ kind, row }, today) {
    const p = row.project_id && D.project(row.project_id);
    const proj = p ? `<button type="button" class="link-btn proj" data-open-project="${p.id}" data-tab="${kind === 'task' ? 'tasks' : 'delivs'}">${esc(p.title)}</button>` : '';
    const late = row.due_at < today, d = D.diffDays(today, row.due_at);
    const pill = late ? `<span class="pill bad">逾期 ${d} 天</span>` : '<span class="pill acc">今天</span>';
    const off = row.offset_days != null ? `<span>${esc(D.offsetLabel(row.offset_days))}</span>` : '';
    if (kind === 'task') {
      return `<li class="trow${late ? ' late' : ''}" data-today-task="${row.id}">
        <label class="ck"><input type="checkbox" data-tdone aria-label="完成：${esc(row.title)}"><span class="box">${D.icon('check')}</span></label>
        <div class="tt"><span class="t1">${row.milestone ? D.icon('flag', 'sm') + ' ' : ''}${esc(row.title)}</span><div class="t2">${proj}${off}</div></div>${pill}</li>`;
    }
    return `<li class="trow deliv${late ? ' late' : ''}" data-today-deliv="${row.id}">
      <label class="ck deliv"><input type="checkbox" data-ddone aria-label="标成已交付：${esc(D.delivLabel(row))}"><span class="box">${D.icon('check')}</span></label>
      <div class="tt"><span class="t1">${D.icon('box', 'sm')} ${esc(D.delivLabel(row))}</span><div class="t2">${proj}<span>要交 · ${esc(D.delivStatusOf(row.status).label)}</span>${off}</div></div>${pill}</li>`;
  }
  function doneRow({ kind, row }) {
    const p = row.project_id && D.project(row.project_id);
    const proj = p ? `<button type="button" class="link-btn proj" data-open-project="${p.id}">${esc(p.title)}</button>` : '';
    if (kind === 'task') return `<li class="trow done" data-today-task="${row.id}"><label class="ck"><input type="checkbox" data-tdone checked aria-label="改回没做：${esc(row.title)}"><span class="box">${D.icon('check')}</span></label>
      <div class="tt"><span class="t1">${esc(row.title)}</span><div class="t2">${proj}</div></div><span class="pill">完成</span></li>`;
    const w = D.state.wins.find(x => x.deliverable_id === row.id);
    return `<li class="trow done"><label class="ck deliv"><input type="checkbox" checked disabled aria-label="已交付"><span class="box">${D.icon('check')}</span></label>
      <div class="tt"><span class="t1">${esc(D.delivLabel(row))}</span><div class="t2">${proj}${w?.after_minutes != null ? `<span>用时 ${esc(D.fmtMinutes(w.after_minutes))}</span>` : ''}</div></div><span class="pill ok">已交付</span></li>`;
  }
  // 空闲时可以顺手做的事
  function idleList(today) {
    const out = [], dow = D.dow(today), c = D.cfg();
    const week = D.isoWeek(today);
    if (!D.state.ideas.some(i => i.week === week && i.status !== 'draft')) out.push(`<li>${D.icon('bulb')}<span class="grow">本周玩法创意还没提交${dow === 0 || dow >= 4 ? `<b class="warn-text">（已经${D.wk(today)}了）</b>` : ''}</span><button type="button" class="tb" data-goto="records" data-seg="ideas">去写</button></li>`);
    const inboxN = D.state.inbox.filter(i => !i.processed_at).length;
    if (inboxN) out.push(`<li>${D.icon('inbox')}<span class="grow">收集箱还有 ${inboxN} 条没处理</span><button type="button" class="tb" data-goto="inbox">去处理</button></li>`);
    const since = D.addDays(today, -30);
    const noTime = D.state.deliverables.filter(d => d.status === 'done' && d.delivered_at >= since && !D.state.wins.some(w => w.deliverable_id === d.id)).slice(0, 2);
    for (const d of noTime) out.push(`<li>${D.icon('clock')}<span class="grow">「${esc(D.delivLabel(d))}」交付了还没记用时</span><button type="button" class="tb" data-open-project="${d.project_id}" data-tab="wins">去记</button></li>`);
    if (!Object.keys(c.baselines).length) out.push(`<li>${D.icon('bolt')}<span class="grow">提效基准还没填：每类交付物以前大概要多久</span><button type="button" class="tb" data-goto="settings" data-sec="baselines">去填</button></li>`);
    return out.slice(0, 4);
  }
  function nowCard(today) {
    const tasks = D.state.tasks.filter(t => !t.done && !t.deliverable_id && t.due_at && t.due_at <= today && D.projOk(t.project_id));
    const delivs = D.state.deliverables.filter(d => d.status !== 'done' && d.due_at && d.due_at <= today && D.projOk(d.project_id));
    const items = [...tasks.map(row => ({ kind: 'task', row })), ...delivs.map(row => ({ kind: 'deliv', row }))]
      .sort((a, b) => a.row.due_at.localeCompare(b.row.due_at) || a.row.id - b.row.id);
    const done = [...D.state.tasks.filter(t => t.done && t.done_at === today && !t.deliverable_id && D.projOk(t.project_id)).map(row => ({ kind: 'task', row })),
      ...D.state.deliverables.filter(d => d.status === 'done' && d.delivered_at === today && D.projOk(d.project_id)).map(row => ({ kind: 'deliv', row }))];
    const overdueN = items.filter(x => x.row.due_at < today).length;
    const askLaunch = D.state.projects.filter(p => !p.archived_at && D.normStatus(p.status) === 'active' && p.launch_at && p.launch_at < today);
    const idle = idleList(today);
    return { overdueN, n: items.length, html: `<section class="card-box hero now${overdueN ? ' has-late' : ''}">
      ${head('checksq', '现在要做', `${overdueN ? ` <span class="badge red">逾期 ${overdueN}</span>` : ''}<span class="more">${items.length} 件${done.length ? ` · 已完成 ${done.length}` : ''}</span>`)}
      ${askLaunch.map(p => `<div class="ask-launch" data-launch-ask="${p.id}"><span>${D.icon('rocket', 'sm')} 「<button type="button" class="link-btn" data-open-project="${p.id}">${esc(p.title)}</button>」${p.launch_tentative ? '暂定' : '原定'} ${esc(D.fmtDate(p.launch_at))} 上线，上线了吗？</span>
        <span class="row-btns"><button type="button" class="btn sm" data-launched>已上线</button><button type="button" class="btn sm ghost" data-reschedule>改期</button></span></div>`).join('')}
      ${items.length || done.length ? `<ul class="tlist">${items.map(x => itemRow(x, today)).join('')}${done.map(doneRow).join('')}</ul>`
        : askLaunch.length ? '' : `<div class="done-cheer"><div class="big-i">${D.icon('check', 'lg')}</div>今天没有到期的事。</div>`}
      ${idle.length ? `<div class="sub-h">${D.icon('coffee', 'sm')}顺手的事</div><ul class="idle">${idle.join('')}</ul>` : ''}
      <form class="add-row today-add" data-today-add>
        <input name="title" maxlength="200" placeholder="＋ 加一条今天的待办，回车保存" aria-label="今天的待办">
        <select name="project" aria-label="项目">${D.selectOpts(D.optionsFor('project').filter(o => D.projOk(o.value)), '', { empty: '（不属于任何项目）' })}</select>
        <button class="tb">添加</button></form></section>` };
  }

  /* ---------- 在等谁 ---------- */
  function waitCard() {
    const all = D.state.pendings.filter(x => x.status === 'waiting' && D.projOk(x.project_id));
    const later = all.filter(x => D.pendState(x).later).sort((a, b) => (a.remind_from || '').localeCompare(b.remind_from || ''));
    const waits = D.sortWaiting(all.filter(x => !D.pendState(x).later));
    return { n: waits.length, html: `<section class="card-box lift">${head('clock', '在等谁', '<span class="more">按最晚日期排</span>')}
      ${waits.length ? `<ul class="wlist">${waits.map(x => D.pendingRow(x)).join('')}</ul>` : '<p class="muted">现在没有要催的事。</p>'}
      ${later.length ? `<details class="later-box"><summary>还没到催的时候（${later.length}）</summary><ul class="wlist">${later.map(x => D.pendingRow(x)).join('')}</ul></details>` : ''}
    </section>` };
  }

  /* ---------- 月度节奏：上个月 / 这个月 / 下个月的月度项目 ---------- */
  const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
  const monthRe = m => new RegExp(`(?<![\\d十])(${m}|${CN[m - 1]})月`);
  const RANK = { active: 0, live: 1, watch: 2, paused: 3, done: 4 };
  D.monthProject = ym => {
    const m = Number(ym.slice(5)), re = monthRe(m);
    // 按「所属月份」或上线日的月份认；两样都没填的，看项目名里有没有「3月 / 三月」这样的字
    const hit = p => p.month === ym || (p.launch_at || '').slice(0, 7) === ym || (!p.month && !p.launch_at && re.test(p.title));
    const cands = D.state.projects.filter(p => !p.archived_at && (p.kind === '全国月度促活' || /月度|促活/.test(p.title)) && hit(p));
    return cands.sort((a, b) => RANK[D.normStatus(a.status)] - RANK[D.normStatus(b.status)] || b.id - a.id)[0];
  };
  function monthsCard(today) {
    const cur = today.slice(0, 7);
    const cells = [-1, 0, 1].map(n => {
      const ym = shiftMonth(cur, n), p = D.monthProject(ym), m = Number(ym.slice(5));
      const st = p ? D.statusOf(p.status) : null;
      const line2 = p ? (p.launch_at ? `${D.fmtDate(p.launch_at)} 上线${p.launch_tentative ? '（暂定）' : ''}` : D.normStatus(p.status) === 'watch' ? '不一定是我做' : D.firstLine(p.title.replace(/^\d{4}\s*年\s*\d{1,2}\s*月\s*/, '').replace(/^[：:·\s]+/, ''), 14)) : '还没有';
      const isCur = p && ['active', 'live'].includes(D.normStatus(p.status));
      return `<div class="mo${isCur ? ' cur' : ''}" ${p ? `data-open-project="${p.id}" title="${esc(p.title)}"` : ''}><div class="m">${m}月</div><div class="d">${p ? esc(st.label) : '—'}<br>${esc(line2)}</div></div>`;
    }).join('');
    return `<section class="card-box lift">${head('calendar', '月度节奏', '<span class="more">全国月度促活</span>')}<div class="months">${cells}</div></section>`;
  }

  /* ---------- 接下来两周 ---------- */
  function agendaCard(today) {
    const ev = d => {
      const out = [];
      for (const p of D.state.projects) if (p.launch_at === d && D.projOk(p.id)) out.push({ k: 'launch', html: `<span class="it launch">${D.icon('diamond')}${p.launch_tentative ? '暂定上线' : '上线'}：<button type="button" class="link-btn" data-open-project="${p.id}">${esc(p.title)}</button></span>` });
      for (const x of D.state.deliverables) if (x.due_at === d && x.status !== 'done' && D.projOk(x.project_id)) out.push({ k: 'deliv', html: `<span class="it">${D.icon('box')}交 ${esc(D.delivLabel(x))} <button type="button" class="link-btn proj" data-open-project="${x.project_id}" data-tab="delivs">${esc(D.projectName(x.project_id))}</button></span>` });
      for (const x of D.state.pendings) if (x.need_by === d && x.status === 'waiting' && D.projOk(x.project_id)) out.push({ k: 'wait', html: `<span class="it wait">${D.icon('hourglass')}最晚要到：${esc(x.question)}（问${esc(x.ask_whom || '—')}）${x.project_id ? ` <button type="button" class="link-btn proj" data-open-project="${x.project_id}" data-tab="pendings">${esc(D.projectName(x.project_id))}</button>` : ''}</span>` });
      for (const x of D.state.tasks) if (x.due_at === d && !x.done && !x.deliverable_id && D.projOk(x.project_id) && d !== today) out.push({ k: 'task', html: `<span class="it">${D.icon(x.milestone ? 'flag' : 'list')}${esc(x.title)}${x.project_id ? ` <button type="button" class="link-btn proj" data-open-project="${x.project_id}" data-tab="tasks">${esc(D.projectName(x.project_id))}</button>` : ''}</span>` });
      return out;
    };
    const days = [], ups = [], cnt = { deliv: 0, wait: 0 };
    let launch = null;
    for (let i = 0; i < 14; i++) {
      const d = D.addDays(today, i), list = ev(d);
      list.forEach(e => { if (e.k in cnt) cnt[e.k]++; if (e.k === 'launch' && !launch) launch = d; });
      const kinds = [...new Set(list.map(e => e.k))].slice(0, 3);
      days.push(`<div class="day${i === 0 ? ' today' : ''}${[0, 6].includes(D.dow(d)) ? ' wkend' : ''}">${'日一二三四五六'[D.dow(d)]}<div class="dn">${Number(d.slice(8))}</div>${kinds.map(k => `<div class="dot k-${k === 'deliv' ? 'deliv' : k}" style="--d:${i}"></div>`).join('')}</div>`);
      if (i > 0 && list.length && ups.length < 4) ups.push(`<div class="up"><b>${esc(dayLabel(d, today))}</b><div class="its">${list.slice(0, 4).map(e => e.html).join('')}${list.length > 4 ? `<span class="muted">还有 ${list.length - 4} 件</span>` : ''}</div></div>`);
    }
    return `<section class="card-box s7 lift">${head('list', '接下来两周', `<span class="more">${esc(D.fmtDate(today))} — ${esc(D.fmtDate(D.addDays(today, 13)))}</span>`)}
      <div class="days">${days.join('')}</div>
      <div class="ups">${ups.join('') || '<p class="muted">接下来两周没有上线、交付或要催的东西。</p>'}</div>
      <div class="legend"><span><i></i>要交的 ${cnt.deliv}</span><span><i class="k-wait"></i>等别人给 ${cnt.wait}</span>${launch ? `<span><i class="k-launch"></i>上线 ${esc(D.fmtDate(launch))}</span>` : ''}</div></section>`;
  }

  /* ---------- 提效 ---------- */
  // 左下角和记录页共用：最能说明问题的一条（平均降幅最大的交付物类型）
  D.bestWin = () => {
    const rows = (D.winByType ? D.winByType(D.state.wins) : []).filter(r => r.n && r.before > 0);
    if (!rows.length) return null;
    const r = rows.sort((a, b) => (1 - b.after / b.before) - (1 - a.after / a.before) || b.count - a.count)[0];
    const pct = Math.round((1 - r.after / r.before) * 100);
    return { big: `−${pct}%`, text: `${r.type}用时：从 ${D.fmtMinutes(Math.round(r.before / r.n))} 降到 ${D.fmtMinutes(Math.round(r.after / r.n))}，共 ${r.count} 次` };
  };
  function winsCard(today) {
    const wins = D.state.wins;
    if (!wins.length) return `<section class="card-box s5 lift">${head('bolt', '提效')}
      <p class="muted">交付时记一下这次用了多久，这里就会算出你省了多少时间，攒成作品集里的数字。</p>
      <div class="row"><button type="button" class="btn sm ghost" data-goto="settings" data-sec="baselines">先填提效基准</button></div></section>`;
    const q0 = `${today.slice(0, 4)}-${String(Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
    const qSaved = wins.filter(w => w.happened_at >= q0).reduce((a, w) => a + (D.saved(w) || 0), 0);
    const months = D.winMonthly(wins, 8);
    let acc = 0; const pts = months.map(m => (acc += Math.max(0, m.saved)));
    const max = Math.max(...pts, 1), W = 300, H = 58;
    const xy = pts.map((v, i) => [Math.round(i / (pts.length - 1) * W), Math.round(H - 4 - v / max * (H - 10))]);
    const line = xy.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');
    const rows = D.winByType(wins).filter(r => r.n).slice(0, 2);
    const hrs = Math.round(qSaved / 6) / 10;
    return `<section class="card-box s5 lift">${head('bolt', '提效', '<button type="button" class="more link-btn" data-goto="records" data-seg="wins">全部记录</button>')}
      <div class="bignum"><span data-count="${hrs}">${hrs}</span><small>小时</small><em>本季度省下</em></div>
      <svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="ar" d="${line} L${W} ${H} L0 ${H}Z"/><path class="ln" pathLength="1" d="${line}"/></svg>
      <div class="kv">${rows.map(r => `<div>${esc(r.type)}<b>${esc(D.fmtMinutes(Math.round(r.before / r.n)))} → ${esc(D.fmtMinutes(Math.round(r.after / r.n)))}</b></div>`).join('')}</div></section>`;
  }

  /* ---------- 常用 ---------- */
  function commonCard(span) {
    const pinned = [...D.state.links.filter(l => l.pinned).map(x => ({ t: 'link', x })), ...(D.state.resources || []).filter(r => r.pinned).map(x => ({ t: 'res', x }))];
    // 钉住的在前，不够 6 个用前面的网址补上
    const list = [...pinned, ...D.state.links.filter(l => !l.pinned).map(x => ({ t: 'link', x }))].slice(0, 6);
    return `<section class="card-box ${span} lift">${head('grid', '常用', '<button type="button" class="more link-btn" data-goto="resources">全部资源 →</button>')}
      ${list.length ? `<div class="tiles">${list.map(({ t, x }) => D.resTile(t, x)).join('')}</div>` : '<p class="muted">去「资源」页添加常用网址、本机文件夹和小工具，钉住的会显示在这里。</p>'}</section>`;
  }

  D.renderToday = (view, el) => {
    const today = D.today(), c = D.cfg();
    const welcome = c.welcome_done ? '' : `<section class="card-box welcome">${head('hand', '每天这样用')}
      <ol>
        <li>早上先看<b>「现在要做」</b>：红色是逾期的，做完直接勾掉；要交的东西勾掉时，顺手记一下这次用了多久。</li>
        <li><b>「在等谁」</b>按最晚哪天要排好了，快到期的标橙、过期的标红。点「催一下」会拼好一句客气话，复制去微信发。</li>
        <li>业务方发来新需求，按 <kbd>c</kbd> 粘进收集箱；让 AI 拆完，把它输出的【新建项目】那段贴回来，项目、交付物、待确认一次建好。</li>
        <li>给 AI 派活：打开项目 → 点工具名，开工提示词就复制好了。AI 干完把汇报整段贴回「回填」，下一步、待确认、交付、用时自动更新。</li>
        <li>按 <kbd>⌘</kbd> <kbd>K</kbd> 什么都能搜：项目、待办、网址、本机文件夹、素材图。</li>
      </ol>
      <div class="row"><button type="button" class="btn sm" data-welcome-done>知道了，不再显示</button><span class="muted small">快捷键：<kbd>⌘K</kbd> 搜索 <kbd>c</kbd> 收集 <kbd>n</kbd> 新项目 <kbd>t</kbd> 回到今天</span></div>
    </section>`;
    const now = nowCard(today), wait = waitCard(), ac = D.assetsCard ? D.assetsCard() : '';
    el.innerHTML = `<div class="page today">
      <div class="bento">${welcome}<div class="stack s7">${now.html}</div><div class="stack s5">${wait.html}${monthsCard(today)}</div>${agendaCard(today)}${winsCard(today)}${commonCard(ac ? 's5' : 's12')}${ac}</div>
      <div class="wrap-bar"><button type="button" class="btn" data-wrapup>${D.icon('moon', 'sm')}今天收工</button></div></div>`;
  };

  D.todayEvents = (main, getView) => {
    main.addEventListener('change', async e => {
      if (getView()?.kind !== 'today') return;
      const t = e.target;
      if (t.matches('[data-tdone]')) {
        const row = t.closest('[data-today-task]'), id = Number(row.dataset.todayTask);
        const left = D.$$('#view .tlist .trow:not(.done)').length;
        row.classList.toggle('done', t.checked);
        if (t.checked && left === 1) {   // 最后一件也做完了
          const r = t.getBoundingClientRect(); D.confetti(r.left + 10, r.top + 10);
          D.toast('今天到期的事都做完了，漂亮', { icon: 'sparkle' });
        }
        await new Promise(r => setTimeout(r, 650));   // 先看清划线，再挪到「已完成」
        return D.setTaskDone(id, t.checked);
      }
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
        ${doneTasks.length + doneDelivs.length ? `<ul class="done-list">${doneTasks.map(t => `<li>✓ ${esc(t.title)}${t.project_id ? ` <small class="muted">${esc(D.projectName(t.project_id))}</small>` : ''}</li>`).join('')}${doneDelivs.map(d => `<li>✓ 交付了 ${esc(D.delivLabel(d))} <small class="muted">${esc(D.projectName(d.project_id))}</small></li>`).join('')}</ul>` : '<p class="muted">今天还没勾掉任何事。没关系，明天继续。</p>'}</section>
      <section class="wsec"><h4>明天第一件事 <small class="muted">${esc(D.fmtDateW(tomorrow))}</small></h4>
        <input name="first" maxlength="200" placeholder="写成能直接动手的一句话，如：把原型 V2 发群" aria-label="明天第一件事">
        <div class="row wrap"><select name="first_project" aria-label="属于哪个项目">${D.selectOpts(D.optionsFor('project').filter(o => D.projOk(o.value)), '', { empty: '（不属于任何项目）' })}</select>
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
      dlg().close(); D.toast('收工啦，明天见', { icon: 'moon' });
    } catch (err) { D.fail(err); }
    finally { btn.disabled = false; }
  }
  D.wrapup = { open };
  document.addEventListener('DOMContentLoaded', () => {
    D.$('#wrapup-form').addEventListener('submit', save);
    dlg().addEventListener('click', e => { if (e.target.closest('[data-wrap-close]')) dlg().close(); });
  });
})();
