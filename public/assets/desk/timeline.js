/* 我的工作台 · 时间线：横向按周排，一行一个没交付的项目。
   今天竖线、上线日（菱形）、交付物截止（圆点）、时间表里程碑（三角）。纯 HTML + CSS 定位，不引图表库。点任一标记打开项目抽屉。 */
(() => {
  const D = window.DESK;
  const { esc } = D;
  const RANGES = [['4w', '4 周'], ['8w', '8 周'], ['month', '本月']];

  // 时间范围：4 / 8 周从上周一开始（能看到刚逾期的）；本月就是 1 号到月底
  D.timelineRange = key => {
    const today = D.today();
    if (key === 'month') { const m = today.slice(0, 7); return { start: m + '-01', end: D.monthEnd(m) }; }
    const start = D.addDays(D.weekMonday(today), -7);
    return { start, end: D.addDays(start, (key === '8w' ? 8 : 4) * 7 - 1) };
  };
  // 某一天在时间轴上的位置（百分比，取那一天的正中间）
  D.timelinePos = (date, { start, end }) => (D.diffDays(date, start) + 0.5) / (D.diffDays(end, start) + 1) * 100;

  D.renderTimeline = (view, el) => {
    const key = D.pref.get('timeline.range', '4w');
    const R = D.timelineRange(key), days = D.diffDays(R.end, R.start) + 1, today = D.today();
    const inRange = d => d && d >= R.start && d <= R.end;
    const pos = d => D.timelinePos(d, R).toFixed(3);
    const projects = D.state.projects.filter(p => !p.archived_at && p.status !== 'done' && D.matchSearch(p, D.q))
      .sort((a, b) => (a.launch_at || '9999').localeCompare(b.launch_at || '9999') || a.id - b.id);

    // 表头：每周一一个刻度；周末底色
    let grid = '', head = '';
    for (let i = 0; i < days; i++) {
      const d = D.addDays(R.start, i), w = D.dow(d);
      if (w === 6 || w === 0) grid += `<i class="wkend" style="left:${(i / days * 100).toFixed(3)}%;width:${(100 / days).toFixed(3)}%"></i>`;
      if (w === 1 || i === 0) {
        grid += `<i class="wline" style="left:${(i / days * 100).toFixed(3)}%"></i>`;
        head += `<span class="wlabel" style="left:${(i / days * 100).toFixed(3)}%">${esc(D.isoWeek(d).slice(5))} · ${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}</span>`;
      }
    }
    const todayLine = inRange(today) ? `<i class="tline" data-date="${today}" style="left:${pos(today)}%" title="今天 ${esc(D.fmtDateW(today))}"></i>` : '';

    const rows = projects.map(p => {
      const marks = [];
      const delivs = D.delivsOf(p.id).filter(d => d.due_at);
      const miles = D.tasksOf(p.id).filter(t => t.milestone && t.due_at);
      for (const d of delivs) marks.push({ date: d.due_at, cls: 'm-deliv' + (d.status === 'done' ? ' done' : !d.due_at || d.due_at >= today ? '' : ' late'), tab: 'delivs', tip: `交付物：${D.delivLabel(d)}（${D.delivStatusOf(d.status).label}）· 截止 ${D.fmtDateW(d.due_at)}` });
      for (const t of miles) marks.push({ date: t.due_at, cls: 'm-mile' + (t.done ? ' done' : ''), tab: 'tasks', tip: `里程碑 ${D.offsetLabel(t.offset_days)}：${t.title} · ${D.fmtDateW(t.due_at)}${t.done ? '（已完成）' : ''}` });
      if (p.launch_at) marks.push({ date: p.launch_at, cls: 'm-launch', tab: 'overview', tip: `上线日 · ${D.fmtDateW(p.launch_at)}` });
      const shown = marks.filter(m => inRange(m.date));
      const early = marks.filter(m => m.date < R.start).length, late = marks.length - shown.length - early;
      // 同一天的标记上下错开
      const seen = {};
      const html = shown.sort((a, b) => a.date.localeCompare(b.date)).map(m => {
        const k = seen[m.date] = (seen[m.date] ?? -1) + 1;
        return `<button type="button" class="mk ${m.cls}" data-open-project="${p.id}" data-tab="${m.tab}" data-date="${m.date}" style="left:${pos(m.date)}%;--k:${k}" title="${esc(m.tip)}" aria-label="${esc(m.tip)}"></button>`;
      }).join('');
      // 从最早的节点到上线日画一条淡色的条
      const dates = marks.map(m => m.date).sort();
      let bar = '';
      if (dates.length > 1) {
        const a = dates[0] < R.start ? R.start : dates[0], b = dates[dates.length - 1] > R.end ? R.end : dates[dates.length - 1];
        if (a <= b && b >= R.start && a <= R.end) bar = `<i class="span" style="left:${(D.diffDays(a, R.start) / days * 100).toFixed(3)}%;width:${((D.diffDays(b, a) + 1) / days * 100).toFixed(3)}%"></i>`;
      }
      return `<div class="tl-row" data-id="${p.id}">
        <button type="button" class="tl-name" data-open-project="${p.id}"><span class="sdot" style="--c:${esc(D.statusOf(p.status).color)}"></span><span class="t">${esc(p.title)}</span>${D.provChip(p.province)}</button>
        <div class="tl-track">${grid}${bar}${todayLine}${html}
          ${early ? `<span class="edge l" title="更早还有 ${early} 个节点">‹ ${early}</span>` : ''}${late ? `<span class="edge r" title="更晚还有 ${late} 个节点">${late} ›</span>` : ''}
          ${!marks.length ? '<span class="tl-empty muted">还没有日期：给它填上线日，或在抽屉里「一键排期」</span>' : ''}</div>
      </div>`;
    }).join('');

    el.innerHTML = `<div class="page tl-page">
      <div class="toolbar"><div class="filters"><div class="seg" role="group" aria-label="时间范围">${RANGES.map(([k, l]) => `<button type="button" data-range="${k}" class="${k === key ? 'on' : ''}">${l}</button>`).join('')}</div>
        <span class="muted small">${esc(D.fmtDate(R.start))} — ${esc(D.fmtDate(R.end))}</span></div>
        <div class="tools legend"><span><i class="mk m-launch"></i>上线日</span><span><i class="mk m-deliv"></i>交付物截止</span><span><i class="mk m-mile"></i>里程碑</span><span><i class="tl-legend-today"></i>今天</span></div></div>
      ${projects.length ? `<div class="tl"><div class="tl-row tl-head"><span></span><div class="tl-track">${head}${todayLine.replace('tline', 'tline head')}</div></div>${rows}</div>`
        : `<div class="empty-state"><p>没有进行中的项目。</p><p><button type="button" class="btn" data-new-project>＋ 新建项目</button></p></div>`}
    </div>`;
  };

  D.timelineEvents = (main, getView) => {
    main.addEventListener('click', e => {
      if (getView()?.kind !== 'timeline') return;
      const r = e.target.closest('[data-range]');
      if (r) { D.pref.set('timeline.range', r.dataset.range); D.render(); }
      // 点标记打开抽屉：由 app.js 里统一的 [data-open-project] 处理
    });
  };
})();
