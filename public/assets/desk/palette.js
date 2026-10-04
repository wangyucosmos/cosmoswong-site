/* 我的工作台 · ⌘K 搜索面板（v3）：项目、待办、在等谁、网址、本机文件夹、素材图、收集箱，外加常用操作，一个框搜到。
   ⌘K / Ctrl+K 或 / 呼出；↑↓ 选，回车打开，esc 关。 */
(() => {
  const D = window.DESK;
  const { esc } = D;
  let acts = [], sel = 0;
  const dlg = () => D.$('#palette');
  const has = (q, ...xs) => !q || xs.join(' ').toLowerCase().includes(q);
  const go = id => () => D.app.show(id);

  function build(q) {
    const S = D.state, out = [];
    const add = (group, items) => { if (items.length) out.push({ group, items }); };
    const pages = [['today', '今天', 'sun'], ['projects', '项目', 'folders'], ['inbox', '收集箱', 'inbox'], ['resources', '资源', 'grid'], ['assets', '素材库', 'image'], ['records', '记录', 'chart'], ['settings', '设置', 'settings']];
    const ops = [
      ['新建项目', 'plus', () => D.newProject.open(), 'n'], ['收集一条', 'inbox', () => D.capture.open(), 'c'], ['今天收工', 'moon', () => { D.app.show('today'); setTimeout(() => D.wrapup.open(), 50); }],
      ['深色模式', 'moon', () => { window.DESK_THEME?.set('dark'); D.render(true); }], ['浅色模式', 'sun', () => { window.DESK_THEME?.set('light'); D.render(true); }],
      ['外观跟随系统', 'monitor', () => { window.DESK_THEME?.set('auto'); D.render(true); }], ['填提效基准', 'bolt', () => { D.pref.set('settings.jump', 'baselines'); D.app.show('settings'); }]
    ];
    add('页面', pages.filter(([, n]) => has(q, n)).map(([id, n, ic]) => ({ icon: ic, title: n, sub: '跳转', run: go(id) })));
    if (!q) {
      const recent = S.projects.filter(p => !p.archived_at && D.projOk(p.id)).sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')).slice(0, 5);
      add('最近的项目', recent.map(p => ({ icon: 'folders', title: p.title, sub: [D.statusOf(p.status).label, p.province].filter(Boolean).join(' · '), run: () => D.app.openProject(p.id) })));
      add('操作', ops.slice(0, 3).map(([t, ic, run, k]) => ({ icon: ic, title: t, sub: k ? `快捷键 ${k}` : '', run })));
      return out;
    }
    add('项目', S.projects.filter(p => has(q, p.title, p.province, p.summary, p.next_action)).slice(0, 6)
      .map(p => ({ icon: 'folders', title: p.title, sub: [D.statusOf(p.status).label, p.province, p.archived_at ? '已归档' : ''].filter(Boolean).join(' · '), run: () => D.app.openProject(p.id) })));
    add('待办', S.tasks.filter(t => !t.done && !t.deliverable_id && has(q, t.title)).slice(0, 5)
      .map(t => ({ icon: 'checksq', title: t.title, sub: [t.due_at ? D.rel(t.due_at).text : '', D.projectName(t.project_id)].filter(Boolean).join(' · '), run: () => t.project_id ? D.app.openProject(t.project_id, 'tasks') : D.app.show('today') })));
    add('在等谁', S.pendings.filter(x => x.status === 'waiting' && has(q, x.question, x.ask_whom, x.ask_name)).slice(0, 5)
      .map(x => ({ icon: 'hourglass', title: x.question, sub: [`问${x.ask_whom || '—'}`, D.projectName(x.project_id)].filter(Boolean).join(' · '), run: () => x.project_id ? D.app.openProject(x.project_id, 'pendings') : D.app.show('today') })));
    add('已拍板', S.decisions.filter(x => has(q, x.content)).slice(0, 3)
      .map(x => ({ icon: 'check', title: x.content, sub: D.projectName(x.project_id), run: () => D.app.openProject(x.project_id, 'settled') })));
    add('网址', S.links.filter(l => has(q, l.label, l.group_name, l.url)).slice(0, 6)
      .map(l => ({ icon: 'globe', title: l.label, sub: l.group_name || '', run: () => { const u = D.safeUrl(l.url); if (u) window.open(u, '_blank', 'noopener,noreferrer'); } })));
    add('本机', (S.resources || []).filter(r => has(q, r.label, r.group_name, r.path, r.province)).slice(0, 6)
      .map(r => ({ icon: { folder: 'folder', tool: 'tool', doc: 'file' }[r.kind] || 'folder', title: r.label, sub: '回车复制路径', run: () => D.copyPath(r) })));
    const files = D.assets?.files || [];
    const hits = files.filter(f => f.path.toLowerCase().includes(q)).slice(0, 6);
    add('素材', hits.map((f, i) => ({ icon: 'image', title: f.name, sub: `${f.g} · ${f.t}`, run: () => D.assetsOpen?.(hits, i) })));
    add('收集箱', S.inbox.filter(i => !i.processed_at && has(q, i.content)).slice(0, 3)
      .map(i => ({ icon: 'inbox', title: D.firstLine(i.content, 40), sub: i.source || '', run: go('inbox') })));
    add('操作', ops.filter(([t]) => has(q, t)).map(([t, ic, run, k]) => ({ icon: ic, title: t, sub: k ? `快捷键 ${k}` : '', run })));
    return out;
  }

  function draw() {
    const q = D.$('#pal-q').value.trim().toLowerCase();
    const groups = build(q);
    acts = groups.flatMap(g => g.items);
    sel = Math.min(sel, Math.max(0, acts.length - 1));
    let n = 0;
    D.$('#pal-res').innerHTML = groups.length ? groups.map(g => `<div class="pg">${esc(g.group)}</div>${g.items.map(it => { const i = n++;
      return `<button type="button" class="po${i === sel ? ' on' : ''}" data-pi="${i}" role="option" aria-selected="${i === sel}">${D.icon(it.icon)}<span class="pt">${esc(it.title)}</span>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</button>`; }).join('')}`).join('')
      : `<div class="empty">没找到「${esc(q)}」。试试项目名、省份、文件名的一部分。</div>`;
  }
  function move(k) {
    if (!acts.length) return;
    sel = (sel + k + acts.length) % acts.length;
    D.$$('#pal-res .po').forEach(b => { const on = Number(b.dataset.pi) === sel; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); if (on) b.scrollIntoView({ block: 'nearest' }); });
  }
  function run(i) { const it = acts[i]; if (!it) return; dlg().close(); it.run(); }

  D.palette = {
    open() {
      if (dlg().open) return;
      D.closePopover();
      D.$('#pal-q').value = ''; sel = 0; draw();
      dlg().showModal(); D.$('#pal-q').focus();
    }
  };
  document.addEventListener('DOMContentLoaded', () => {
    D.$('#pal-icon').innerHTML = D.icon('search');
    D.$('#pal-q').addEventListener('input', () => { sel = 0; draw(); });
    D.$('#pal-q').addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
    });
    D.$('#pal-res').addEventListener('click', e => { const b = e.target.closest('[data-pi]'); if (b) run(Number(b.dataset.pi)); });
    D.$('#pal-res').addEventListener('mousemove', e => { const b = e.target.closest('[data-pi]'); if (b && Number(b.dataset.pi) !== sel) { sel = Number(b.dataset.pi); D.$$('#pal-res .po').forEach(x => x.classList.toggle('on', x === b)); } });
    dlg().addEventListener('click', e => { if (e.target === dlg()) dlg().close(); });
  });
})();
