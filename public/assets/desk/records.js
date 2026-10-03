/* 我的工作台 · 记录：提效记录 + 玩法创意（v2 合成一个标签页，上面切换）。具体内容在 wins.js / ideas.js。 */
(() => {
  const D = window.DESK;
  D.recSeg = () => D.pref.get('records.seg', 'wins');
  D.isRec = seg => D.current?.kind === 'records' && D.recSeg() === seg;
  // 提效记录的类型就用交付物类型（以前记过的其他类型也保留）
  D.winTypes = () => [...new Set([...D.cfg().deliverable_types, '其他', ...D.state.wins.map(w => w.task_type).filter(Boolean)])];

  D.renderRecords = (view, el) => {
    const seg = D.recSeg();
    el.innerHTML = `<div class="rec-head"><div class="seg" role="tablist" aria-label="记录">
        <button type="button" data-rec="wins" class="${seg === 'wins' ? 'on' : ''}" aria-selected="${seg === 'wins'}">📈 提效记录</button>
        <button type="button" data-rec="ideas" class="${seg === 'ideas' ? 'on' : ''}" aria-selected="${seg === 'ideas'}">💡 玩法创意</button></div></div>
      <div class="rec-body"></div>`;
    (seg === 'ideas' ? D.renderIdeas : D.renderWins)(view, el.querySelector('.rec-body'));
  };
  D.recordsEvents = main => {
    main.addEventListener('click', e => {
      if (D.current?.kind !== 'records') return;
      const b = e.target.closest('[data-rec]');
      if (b) { D.pref.set('records.seg', b.dataset.rec); D.render(true); }
    });
  };
})();
