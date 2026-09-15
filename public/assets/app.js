/* cosmoswong.com · 页面逻辑。内容全部来自 data.js（window.SITE）。
   每个页面的 <main data-page="…"> 决定渲染哪个板块。 */
(() => {
  const S = window.SITE;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const page = document.body.dataset.page || 'home';

  /* ---------- 公共骨架：背景、导航、页脚 ---------- */
  const NAV = [
    ['/', '首页'], ['/portfolio', '作品集'], ['/resume', '简历'],
    ['/trips', '旅游计划'], ['/tools', '工具箱'], ['/knowledge', '知识库'], ['/bookmarks', '收藏'],
    ['https://jianshen.cosmoswong.com', '我的健身计划']
  ];
  const here = location.pathname.replace(/\/$/, '') || '/';
  document.body.insertAdjacentHTML('afterbegin', `
    <div class="mesh" aria-hidden="true"><i></i><i></i><i></i></div>
    <header class="top"><div class="wrap"><nav class="nav">
      <a class="logo" href="/">${esc(S.me.name).toUpperCase()}</a>
      <ul id="menu">${NAV.map(([h, t]) => `<li><a href="${h}" class="${(h === '/' ? here === '/' : here.startsWith(h)) ? 'on' : ''}">${t}</a></li>`).join('')}</ul>
      <button class="burger" aria-label="菜单" aria-expanded="false">☰</button>
    </nav></div></header>`);
  document.body.insertAdjacentHTML('beforeend', `
    <div class="wrap"><footer>
      <span>© ${new Date().getFullYear()} ${esc(S.me.name)}</span>
      <span>${S.me.email ? `<a href="mailto:${esc(S.me.email)}">${esc(S.me.email)}</a>` : ''}${S.me.links.map(l => ` · <a href="${esc(l.url)}" target="_blank" rel="noreferrer">${esc(l.label)}</a>`).join('')}</span>
    </footer></div>`);
  /* 手机菜单：打开时锁住页面滚动（记住位置，关掉后还原），点遮罩或链接关闭 */
  document.body.insertAdjacentHTML('beforeend', '<div class="menu-backdrop" aria-hidden="true"></div>');
  let lockedY = 0;
  const setMenu = open => {
    const m = $('#menu'), b = $('.burger');
    if (open) {
      lockedY = window.scrollY;
      document.body.style.top = -lockedY + 'px';
      document.body.classList.add('menu-open');
      m.classList.add('open'); b.classList.add('on'); b.textContent = '✕';
      // 菜单很短时容器刚好包住内容，iOS 不把它当滚动区、没有回弹。
      // 让容器比内容矮 1px，它就"可滚动"了，滑到头会有原生的橡皮筋效果。
      m.style.maxHeight = '';
      requestAnimationFrame(() => { if (m.scrollHeight <= m.clientHeight) m.style.maxHeight = (m.clientHeight - 1) + 'px'; });
    } else {
      m.classList.remove('open'); b.classList.remove('on'); b.textContent = '☰';
      document.body.classList.remove('menu-open');
      document.body.style.top = '';
      window.scrollTo(0, lockedY);
    }
    b.setAttribute('aria-expanded', open);
  };
  $('.burger').onclick = () => setMenu(!$('#menu').classList.contains('open'));
  $('.menu-backdrop').onclick = () => setMenu(false);
  $('#menu').addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
  window.addEventListener('resize', () => { if (innerWidth > 820 && $('#menu').classList.contains('open')) setMenu(false); });
  if (page !== 'home') document.body.classList.add('inner');

  /* ---------- 卡片 3D 倾斜 ---------- */
  document.addEventListener('mousemove', e => {
    const c = e.target.closest('.card'); if (!c) return;
    const r = c.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
    c.style.transform = `translateY(-6px) rotateX(${-y * 8}deg) rotateY(${x * 8}deg)`;
  });
  document.addEventListener('mouseout', e => { const c = e.target.closest('.card'); if (c && !c.contains(e.relatedTarget)) c.style.transform = ''; });

  /* ---------- 渲染小工具 ---------- */
  const workCard = w => `
    <article class="card link" data-work="${esc(w.id)}" tabindex="0" role="button" aria-label="查看 ${esc(w.title)}">
      <div class="cover ${w.cover ? '' : 'ph'}" style="${w.cover ? `background-image:url('${esc(w.cover)}')` : ''}"></div>
      <div class="body"><div class="k">${esc(w.category)} · ${esc(w.year)}</div>
        <h3>${esc(w.title)}</h3><p>${esc(w.summary)}</p>
        ${w.tags?.length ? `<div class="pills">${w.tags.map(t => `<span class="pill">${esc(t)}</span>`).join('')}</div>` : ''}
      </div></article>`;
  const STATUS = { 进行中: 'live', 规划中: 'dim', 已完成: 'ok' };
  const tripCard = (t, big) => {
    const inner = `<div class="cover ph"></div><div class="body">
      <div class="k">${esc(t.dates)}</div><h3>${esc(t.title)}</h3><p>${esc(t.summary)}</p>
      <div class="pills"><span class="pill ${STATUS[t.status] || ''}">${esc(t.status)}</span>${t.url ? '<span class="pill">打开行程站 →</span>' : ''}</div></div>`;
    return t.url ? `<a class="card link${big ? ' big' : ''}" href="${esc(t.url)}" target="_blank" rel="noreferrer">${inner}</a>`
                 : `<article class="card${big ? ' big' : ''}">${inner}</article>`;
  };
  const toolRow = t => t.url
    ? `<a class="row" href="${esc(t.url)}" target="_blank" rel="noreferrer"><span class="ic">${esc(t.icon)}</span><span class="t"><h3>${esc(t.name)}</h3><p>${esc(t.desc)}</p></span><span class="arrow">→</span></a>`
    : `<div class="row"><span class="ic">${esc(t.icon)}</span><span class="t"><h3>${esc(t.name)}</h3><p>${esc(t.desc)}</p></span><span class="pill dim">筹备中</span></div>`;

  /* ---------- 各页面 ---------- */
  const R = {};

  R.home = () => {
    const featured = S.portfolio.filter(w => w.featured).slice(0, 3);
    const trips = S.trips.flatMap(c => c.items.map(t => ({ ...t, category: c.category })));
    return `
    <section class="hero">
      <h1 class="up"><span class="pre">Hello, I'm</span><span>${esc(S.me.name)}.</span></h1>
      <p class="sub up d1"><b>${esc(S.me.title)}</b><br>${esc(S.me.tagline)}</p>
      <div class="cta up d2"><a class="btn solid" href="/portfolio">看作品集 →</a>
        ${S.resume.pdf ? `<a class="btn glass" href="${esc(S.resume.pdf)}" download>下载简历</a>` : `<a class="btn glass" href="/resume">看简历</a>`}</div>
    </section>
    <section class="sec"><div class="sec-head"><div><p class="eyebrow">Selected work</p><h2>精选作品</h2></div><a class="more" href="/portfolio">全部作品 →</a></div>
      ${featured.length ? `<div class="grid">${featured.map(workCard).join('')}</div>` : '<div class="empty">还没有作品，去 data.js 里加。</div>'}</section>
    <section class="sec"><div class="sec-head"><div><p class="eyebrow">Trips</p><h2>旅游计划</h2></div><a class="more" href="/trips">全部 →</a></div>
      <div class="grid wide">${trips.slice(0, 3).map((t, i) => tripCard(t, i === 0)).join('')}</div></section>
    <section class="sec"><div class="sec-head"><div><p class="eyebrow">Tools</p><h2>工具箱</h2></div><a class="more" href="/tools">全部 →</a></div>
      <div class="rows">${S.tools.slice(0, 3).map(toolRow).join('')}</div></section>`;
  };

  R.portfolio = () => {
    const cats = ['全部', ...new Set(S.portfolio.map(w => w.category))];
    return `
    <section class="page-head"><h1>作品集</h1><p>做过的项目，按类别筛选。点开看详情。</p></section>
    <div class="filters" id="filters">${cats.map((c, i) => `<button data-c="${esc(c)}" aria-pressed="${i === 0}">${esc(c)}</button>`).join('')}</div>
    <div class="grid" id="works">${S.portfolio.map(workCard).join('')}</div>
    <dialog id="dlg"><div class="modal-wrap"><div class="modal" id="modal"></div></div></dialog>`;
  };

  R.resume = () => {
    const r = S.resume, m = S.me;
    return `
    <section class="page-head"><h1>${esc(m.fullName)}</h1><p>${esc(m.title)}</p>
      <div class="cta" style="margin-top:22px">${r.pdf ? `<a class="btn solid" href="${esc(r.pdf)}" download>下载 PDF 简历</a>` : `<span class="btn glass" aria-disabled="true">PDF 简历 · 待上传</span>`}
        ${m.email ? `<a class="btn glass" href="mailto:${esc(m.email)}">写邮件</a>` : ''}</div></section>
    <div class="resume">
      <div>
        <div class="rbox"><h2>关于我</h2><p style="color:var(--muted);font-size:15.5px">${esc(r.summary)}</p></div>
        <div class="rbox"><h2>经历</h2>${r.experience.map(x => `<div class="xp">
          <div class="hd"><div><h3>${esc(x.org)}</h3><span class="role">${esc(x.role)}</span></div><span class="period">${esc(x.period)}</span></div>
          <ul>${x.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>`).join('')}</div>
        <div class="rbox"><h2>教育</h2>${r.education.map(e => `<div class="xp"><div class="hd"><div><h3>${esc(e.school)}</h3><span class="role">${esc(e.major)}</span></div><span class="period">${esc(e.period)}</span></div></div>`).join('')}</div>
      </div>
      <aside>
        <div class="rbox skills"><h2>技能</h2>${r.skills.map(g => `<div class="g"><b>${esc(g.group)}</b><div class="pills" style="margin-top:0">${g.items.map(i => `<span class="pill">${esc(i)}</span>`).join('')}</div></div>`).join('')}</div>
        <div class="rbox"><h2>联系</h2><div class="contact">
          ${m.location ? `📍 ${esc(m.location)}<br>` : ''}${m.email ? `✉️ <a href="mailto:${esc(m.email)}">${esc(m.email)}</a><br>` : ''}
          ${m.links.map(l => `🔗 <a href="${esc(l.url)}" target="_blank" rel="noreferrer">${esc(l.label)}</a><br>`).join('')}
          ${!m.location && !m.email && !m.links.length ? '<span style="color:var(--faint)">在 data.js 里填联系方式</span>' : ''}</div></div>
      </aside></div>`;
  };

  R.trips = () => `
    <section class="page-head"><h1>旅游计划</h1><p>去过的、在走的、想去的。有独立行程站的会直接跳过去。</p></section>
    ${S.trips.map(c => `<section class="sec" style="padding-top:34px"><div class="sec-head"><h2 style="font-size:24px">${esc(c.category)}</h2><span class="pill dim">${c.items.length} 次</span></div>
      ${c.items.length ? `<div class="grid wide">${c.items.map(t => tripCard(t, false)).join('')}</div>` : '<div class="empty">这个分类还是空的</div>'}</section>`).join('')}`;

  R.tools = () => `
    <section class="page-head"><h1>工具箱</h1><p>自己做的小工具，和一些常用的东西。</p></section>
    <div class="rows" style="margin-top:26px">${S.tools.map(toolRow).join('') || '<div class="empty">还没有工具</div>'}</div>`;

  R.bookmarks = () => `
    <section class="page-head"><h1>收藏</h1><p>看到的好东西。</p></section>
    ${S.bookmarks.map(c => `<section class="sec" style="padding-top:34px"><div class="sec-head"><h2 style="font-size:24px">${esc(c.category)}</h2></div>
      ${c.items.length ? `<div class="rows">${c.items.map(b => b.url
        ? `<a class="row" href="${esc(b.url)}" target="_blank" rel="noreferrer"><span class="t"><h3>${esc(b.title)}</h3><p>${esc(b.note)}</p></span><span class="arrow">↗</span></a>`
        : `<div class="row"><span class="t"><h3>${esc(b.title)}</h3><p>${esc(b.note)}</p></span></div>`).join('')}</div>` : '<div class="empty">这个分类还是空的</div>'}</section>`).join('')}`;

  // 静态内页（如 /knowledge）自带内容，不走 R 渲染
  if (page === 'home' || R[page]) $('main').innerHTML = (R[page] || R.home)();

  /* ---------- 作品集：筛选 + 详情弹窗 ---------- */
  if (page === 'portfolio') {
    $('#filters').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      $('#filters').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
      const c = b.dataset.c;
      $('#works').innerHTML = S.portfolio.filter(w => c === '全部' || w.category === c).map(workCard).join('');
    });
    const open = id => {
      const w = S.portfolio.find(x => x.id === id); if (!w) return;
      $('#modal').innerHTML = `<button class="close" data-close aria-label="关闭">✕</button>
        <div class="k">${esc(w.category)} · ${esc(w.year)}</div><h2>${esc(w.title)}</h2>
        ${w.tags?.length ? `<div class="pills" style="margin-top:0">${w.tags.map(t => `<span class="pill">${esc(t)}</span>`).join('')}</div>` : ''}
        <div class="prose">${esc(w.body)}</div>
        ${w.images?.length ? `<div class="imgs">${w.images.map(i => `<img src="${esc(i)}" alt="" loading="lazy">`).join('')}</div>` : ''}
        ${w.links?.length ? `<div class="cta" style="margin-top:14px">${w.links.map(l => `<a class="btn glass sm" href="${esc(l.url)}" target="_blank" rel="noreferrer">${esc(l.label)} ↗</a>`).join('')}</div>` : ''}`;
      $('#dlg').showModal(); history.replaceState(null, '', '#' + id);
    };
    document.addEventListener('click', e => {
      const c = e.target.closest('[data-work]'); if (c) return open(c.dataset.work);
      if (e.target.closest('[data-close]') || e.target.id === 'dlg') { $('#dlg').close(); history.replaceState(null, '', location.pathname); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset?.work) open(e.target.dataset.work); });
    if (location.hash.length > 1) open(location.hash.slice(1));
  }
})();
