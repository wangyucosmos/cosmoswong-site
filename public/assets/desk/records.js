/* 我的工作台 · 记录：交付记录 + 玩法创意 + 用时记录（上面切换）。
   v5：默认是「交付记录」——标成已交付时自动记下的日期、版本、谁经手，不用另外填；以后做作品集时翻这里。
   「用时记录」是 v2–v4 时记的「以前要多久 / 用 AI 后多久」，v5 起不再问，旧记录留着能看（wins.js）。玩法创意在 ideas.js。 */
(() => {
  const D = window.DESK;
  const { esc } = D;
  D.recSeg = () => { const s = D.pref.get('records.seg', 'delivs'); return ['delivs', 'ideas', 'wins'].includes(s) ? s : 'delivs'; };
  D.isRec = seg => D.current?.kind === 'records' && D.recSeg() === seg;
  // 用时记录的类型就用交付物类型（以前记过的其他类型也保留）
  D.winTypes = () => [...new Set([...D.cfg().deliverable_types, '其他', ...D.state.wins.map(w => w.task_type).filter(Boolean)])];

  // 「V3」「v2.1」「第 4 版」→ 4；读不出来就算 1 版
  const verNo = v => { const m = /(\d+)/.exec(String(v || '')); return m ? Math.max(1, Number(m[1])) : 1; };
  function renderDelivs(view, el) {
    const all = D.state.deliverables.filter(d => d.status === 'done' && d.delivered_at).sort((a, b) => b.delivered_at.localeCompare(a.delivered_at) || b.id - a.id);
    const tm = D.thisMonth(), y = D.today().slice(0, 4);
    const month = all.filter(d => d.delivered_at.slice(0, 7) === tm), year = all.filter(d => d.delivered_at.slice(0, 4) === y);
    const projs = new Set(year.map(d => d.project_id));
    const avgVer = year.length ? (year.reduce((a, d) => a + verNo(d.version), 0) / year.length).toFixed(1) : '—';
    const types = [...year.reduce((m, d) => m.set(d.type, (m.get(d.type) || 0) + 1), new Map()).entries()].sort((a, b) => b[1] - a[1]);
    const groups = new Map(); all.forEach(d => { const k = d.delivered_at.slice(0, 7); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(d); });
    el.innerHTML = `<div class="page delivs">
      <div class="stats">
        <div class="stat"><span>本月交付</span><b>${month.length} 件</b><em>${tm}</em></div>
        <div class="stat"><span>今年交付</span><b>${year.length} 件</b><em>${projs.size} 个项目</em></div>
        <div class="stat"><span>平均改到第几版</span><b>${avgVer}</b><em>按交付物上写的版本号算</em></div>
        <div class="stat"><span>最多的是</span><b>${esc(types[0]?.[0] || '—')}</b><em>${types.slice(0, 3).map(([t, n]) => `${esc(t)} ${n}`).join(' · ') || '今年还没有'}</em></div>
      </div>
      <section class="card-box">${D.cardHead('box', '交付记录', '<span class="more">标成已交付时自动记下，不用另外填</span>')}
        ${all.length ? [...groups.entries()].map(([m, list]) => `<h4 class="sub-h">${esc(`${m.slice(0, 4)} 年 ${Number(m.slice(5))} 月`)} <span class="gcount">${list.length} 件</span></h4>
          <ul class="dlog">${list.map(d => { const p = D.project(d.project_id); return `<li><span class="dd mono">${esc(d.delivered_at.slice(5).replace('-', '.'))}</span>
            <span class="dt"><b>${esc(D.delivLabel(d))}</b>${d.base ? `<small class="muted">底稿：${esc(d.base)}</small>` : ''}</span>
            ${p ? `<button type="button" class="link-btn proj" data-open-project="${p.id}" data-tab="delivs">${esc(p.title)}</button>` : '<span></span>'}
            <span class="tags">${(p?.last_ai || []).slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</span></li>`; }).join('')}</ul>`).join('')
          : '<p class="muted">还没有交付过的东西。项目页里把交付物「标成已交付」，这里就会自动出现。</p>'}</section></div>`;
  }

  D.renderRecords = (view, el) => {
    let seg = D.recSeg();
    if (seg === 'wins' && !D.state.wins.length) seg = 'delivs';
    const tab = (k, ic, t) => `<button type="button" data-rec="${k}" class="${seg === k ? 'on' : ''}" aria-selected="${seg === k}">${D.icon(ic, 'sm')} ${t}</button>`;
    el.innerHTML = `<div class="rec-head"><div class="seg" role="tablist" aria-label="记录">${tab('delivs', 'box', '交付记录')}${tab('ideas', 'bulb', '玩法创意')}${D.state.wins.length ? tab('wins', 'clock', '用时记录') : ''}</div></div>
      <div class="rec-body"></div>`;
    ({ delivs: renderDelivs, ideas: D.renderIdeas, wins: D.renderWins })[seg](view, el.querySelector('.rec-body'));
  };
  D.recordsEvents = main => {
    main.addEventListener('click', e => {
      if (D.current?.kind !== 'records') return;
      const b = e.target.closest('[data-rec]');
      if (b) { D.pref.set('records.seg', b.dataset.rec); D.render(true); }
    });
  };
})();
