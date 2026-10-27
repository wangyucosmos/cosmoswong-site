/* cosmoswong.com · 纯字符串渲染层。
   这里的每个函数都只吃 S（= window.SITE）和几个显式参数，不碰 document / location / Date，
   所以浏览器（app.js）和构建脚本（tools/build_pages.mjs 预渲染）能跑出一模一样的 HTML。
   要改页面结构改这里；要改内容改 data.js。 */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- 公共骨架：背景、导航、页脚 ---------- */
  // 导航按数据过滤：数据为空的板块不给入口（页面本身保留，直链仍可访问）
  const navItems = S => [
    ['/', '首页'], ['/portfolio', '作品集'], ['/resume', '简历'],
    ['/trips', '旅游计划', S.trips.some(c => c.items.length)],
    ['/tools', '工具箱', S.tools.length > 0],
    ['/knowledge', '知识库'],
    ['/bookmarks', '收藏', S.bookmarks.some(c => c.items.length)],
    ['/subs', '订阅'],   // 入口公开，页面内容要密码（src/worker.js）
    ['/toolmap', '工具地图'],   // 2026-10-27 取代「KOL 工作台」入口（/kol 页面照常可直接访问）；内容走工具箱口令门、noindex、不进 sitemap
    ['/desk', '我的工作台'],   // 同上（用户 2026-10-04 要求加，名字要和 KOL 工作台区分开）；页面仍 noindex、不进 sitemap
    ['/go/fitness', '我的健身计划']
  ].filter(([, , show]) => show !== false);
  // here：当前路径（无尾斜杠，首页为 '/'）
  const renderHeader = (S, here) => `
    <div class="mesh" aria-hidden="true"><i></i><i></i><i></i></div>
    <header class="top"><div class="wrap"><nav class="nav">
      <a class="logo" href="/">${esc(S.me.name).toUpperCase()}</a>
      <ul id="menu">${navItems(S).map(([h, t]) => `<li><a href="${h}" class="${(h === '/' ? here === '/' : here.startsWith(h)) ? 'on' : ''}">${t}</a></li>`).join('')}</ul>
      <button class="burger" aria-label="菜单" aria-expanded="false">☰</button>
    </nav></div></header>`;
  // year 由调用方传入：浏览器传 new Date().getFullYear()，构建脚本传构建时年份
  const renderFooter = (S, year) => `
    <div class="wrap"><footer>
      <span>© ${esc(year)} ${esc(S.me.name)}</span>
      <span>${S.me.email ? `<a href="mailto:${esc(S.me.email)}">${esc(S.me.email)}</a>` : ''}${S.me.links.map(l => ` · <a href="${esc(l.url)}" target="_blank" rel="noreferrer">${esc(l.label)}</a>`).join('')}</span>
    </footer></div>
    <div class="menu-backdrop" aria-hidden="true"></div>`;

  /* ---------- 渲染小工具 ---------- */
  /* ---------- 作品集（2026-10-12 重构）：画廊卡片 / 目录行 / 案例详情（内容块） ---------- */
  const WICON = {
    '产品与工具': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="2.5"/><path d="M3 8.5h18M7 13h4M7 15.5h7"/></svg>',
    '活动策划': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="9" width="17" height="11" rx="2"/><path d="M2.5 9h19v-3h-19zM12 6v14M12 6c-1.5-3-5-3.2-5-1s3.5 1 5 1zm0 0c1.5-3 5-3.2 5-1s-3.5 1-5 1z"/></svg>',
    '知识与流程': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8.2 7.3l2.6 8.4M15.8 7.3l-2.6 8.4M8.5 6h7"/></svg>',
    '游戏运营': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8h10a4.5 4.5 0 014.4 5.4l-.8 3.6a2 2 0 01-3.4.9L15 15.6H9l-2.2 2.3a2 2 0 01-3.4-.9l-.8-3.6A4.5 4.5 0 017 8z"/><path d="M7.5 11v3M6 12.5h3"/></svg>'
  };
  const wicon = c => WICON[c] || WICON['产品与工具'];
  const PLAY = '<svg viewBox="0 0 12 12" fill="currentColor"><path d="M3 2l7 4-7 4z"/></svg>';
  const PIC = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="1" y="2" width="10" height="8" rx="1.5"/><path d="M1.5 9l3-3 2 2 1.5-1.5L11 9"/></svg>';
  // 作品详情 = 一串「内容块」。data.js 里的作品不用改写：封面 / 视频 → 头图，body 按段落 → 正文块，images → 大图 / 多图，links → 按钮；
  // 想加视频、对比、手机截图、数字等，在作品里写 blocks: [...]（stats 放在第一段正文后面，其余放在正文之后、配图之前）。
  // 以后加新的展示方式：在 BLOCK 里加一种渲染即可，旧作品不受影响。
  const workBlocks = w => {
    const out = [], extra = w.blocks || [];
    if (w.video) out.push({ type: 'video', src: w.video, poster: w.poster || w.cover, hero: true });
    else if (w.cover) out.push({ type: 'hero', src: w.cover });
    String(w.body || '').split(/\n\s*\n|\n/).filter(x => x.trim()).forEach((p, i) => {
      const m = p.match(/^([^：:\n]{1,10})[：:]([\s\S]*)$/);
      out.push({ type: 'text', label: m ? m[1] : (i ? '' : '概述'), body: m ? m[2].trim() : p });
      if (i === 0) out.push(...extra.filter(b => b.type === 'stats'));
    });
    out.push(...extra.filter(b => b.type !== 'stats'));
    const imgs = (w.images || []).filter(Boolean);
    if (imgs.length === 1) out.push({ type: 'image', src: imgs[0] });
    else if (imgs.length > 1) out.push({ type: 'gallery', items: imgs.map(src => ({ src })) });
    if (w.links?.length) out.push({ type: 'links', items: w.links });
    return out;
  };
  const workMedia = w => {
    const bs = workBlocks(w);
    return { img: bs.reduce((n, b) => n + (b.type === 'hero' || b.type === 'image' ? 1 : b.type === 'gallery' ? b.items.length : 0), 0),
             vid: bs.filter(b => b.type === 'video').length };
  };
  const BLOCK = {
    hero: b => `<div class="b-frame"><img src="${esc(b.src)}" alt=""></div>`,
    image: b => `<div class="b-frame"><img src="${esc(b.src)}" alt="" loading="lazy"></div>${b.cap ? `<p class="b-cap">${esc(b.cap)}</p>` : ''}`,
    video: b => `<div class="b-frame"><video src="${esc(b.src)}"${b.poster ? ` poster="${esc(b.poster)}"` : ''} ${b.hero ? 'autoplay muted loop playsinline' : 'controls playsinline preload="metadata"'}></video></div>${b.cap ? `<p class="b-cap">${esc(b.cap)}</p>` : ''}`,
    text: b => `<div class="b-text"><h4>${esc(b.label)}</h4><p>${esc(b.body)}</p></div>`,
    stats: b => `<div class="b-stats">${b.items.map(i => `<div><strong>${esc(i.value)}</strong><span>${esc(i.label)}</span></div>`).join('')}</div>`,
    gallery: b => `<div class="b-gallery">${b.items.map(i => `<figure data-zoom><img src="${esc(i.src)}" alt="" loading="lazy">${i.cap ? `<figcaption>${esc(i.cap)}</figcaption>` : ''}</figure>`).join('')}</div>`,
    phone: b => `<div class="b-phone"><div class="phone"><img src="${esc(b.src)}" alt="" loading="lazy"></div><div><h4>${esc(b.title)}</h4><p>${esc(b.body)}</p></div></div>`,
    compare: b => `<div class="b-compare"><img src="${esc(b.after)}" alt="" loading="lazy"><img class="top" src="${esc(b.before)}" alt="" loading="lazy"><div class="knob"></div>
      <span class="lb l">${esc(b.beforeLabel || '之前')}</span><span class="lb r">${esc(b.afterLabel || '之后')}</span><input type="range" min="0" max="100" value="50" aria-label="拖动对比"></div>${b.cap ? `<p class="b-cap">${esc(b.cap)}</p>` : ''}`,
    quote: b => `<blockquote class="b-quote">${esc(b.text)}</blockquote>`,
    links: b => `<div class="b-links">${b.items.map((l, i) => `<a class="btn ${i ? 'glass' : 'solid'} sm" href="${esc(l.url)}" target="_blank" rel="noreferrer">${esc(l.label)} ↗</a>`).join('')}</div>`
  };
  const workCover = w => {
    const m = workMedia(w);
    const badges = `<div class="badges">${m.vid ? `<span class="badge">${PLAY}视频</span>` : ''}${m.img ? `<span class="badge">${PIC}${m.img}</span>` : ''}</div>`;
    if (w.cover) return `<div class="mat"><div class="shot"><img src="${esc(w.cover)}" alt="" loading="lazy">${w.video ? `<video src="${esc(w.video)}" muted loop playsinline preload="none"></video>` : ''}</div>${badges}</div>`;
    return `<div class="mat"><div class="glyph"><span class="ic">${wicon(w.category)}</span><span class="big">${esc(w.category)}</span></div>${badges}</div>`;
  };
  const workCard = (w, wide) => `
    <article class="wcard${wide ? ' wide' : ''}" data-work="${esc(w.id)}" data-cat="${esc(w.category)}" tabindex="0" role="button" aria-label="查看 ${esc(w.title)}">${workCover(w)}
      <div class="txt"><div class="wmeta"><span class="cat">${esc(w.category)}</span><span>·</span><span>${esc(w.year)}</span></div>
        <h3>${esc(w.title)}</h3><p class="sum">${esc(w.summary)}</p><div class="go">查看案例 <i>→</i></div></div></article>`;
  const workRow = (w, i) => `
    <div class="wrow" data-work="${esc(w.id)}" data-cat="${esc(w.category)}" tabindex="0" role="button" aria-label="查看 ${esc(w.title)}"><span class="no">${String(i + 1).padStart(2, '0')}</span>
      <span class="th">${w.cover ? `<img src="${esc(w.cover)}" alt="" loading="lazy">` : wicon(w.category)}</span>
      <span class="tt"><h3>${esc(w.title)}</h3><p>${esc(w.summary)}</p></span><span class="c">${esc(w.category)}</span><span class="y">${esc(w.year)}</span><span class="ar">→</span></div>`;
  // 画廊：第一个有封面的精选作品做成横跨两列的大卡片
  const workGallery = list => { let big = false; return list.map(w => { const wide = !big && w.featured && w.cover && (big = true); return workCard(w, wide); }).join(''); };
  const workIndex = list => list.map(workRow).join('');
  const STATUS = { 进行中: 'live', 规划中: 'dim', 已完成: 'ok' };
  const tripCard = (t, big) => {
    const inner = `<div class="cover ph"></div><div class="body">
      <div class="k">${esc(t.dates)}</div><h3>${esc(t.title)}</h3><p>${esc(t.summary)}</p>
      <div class="pills"><span class="pill ${STATUS[t.status] || ''}">${esc(t.status)}</span>${t.url ? `<span class="pill">${esc(t.cta || '打开行程站 →')}</span>` : ''}</div></div>`;
    return t.url ? `<a class="card link${big ? ' big' : ''}" href="${esc(t.url)}" target="_blank" rel="noreferrer">${inner}</a>`
                 : `<article class="card${big ? ' big' : ''}">${inner}</article>`;
  };
  const toolRow = t => t.url
    ? `<a class="row" href="${esc(t.url)}" target="_blank" rel="noreferrer"><span class="ic">${esc(t.icon)}</span><span class="t"><h3>${esc(t.name)}</h3><p>${esc(t.desc)}</p></span><span class="arrow">→</span></a>`
    : `<div class="row"><span class="ic">${esc(t.icon)}</span><span class="t"><h3>${esc(t.name)}</h3><p>${esc(t.desc)}</p></span><span class="pill dim">筹备中</span></div>`;

  /* ---------- 各页面 ---------- */
  const R = {};

  R.home = S => {
    const featured = S.portfolio.filter(w => w.featured).slice(0, 3);
    // 首页去重：精选作品已经链到的地址（如印尼行程站），Trips / Tools 里不再重复出现；/trips /tools 页照常全量
    const norm = u => (u || '').replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
    const shown = new Set(featured.flatMap(w => (w.links || []).map(l => norm(l.url))));
    const trips = S.trips.flatMap(c => c.items.map(t => ({ ...t, category: c.category }))).filter(t => !shown.has(norm(t.url)));
    const tools = S.tools.filter(t => !shown.has(norm(t.url)));
    return `
    <section class="hero">
      <h1 class="up"><span class="pre">Hello, I'm</span><span>${esc(S.me.name)}.</span></h1>
      <p class="sub up d1"><b>${esc(S.me.title)}</b>${S.me.tagline ? `<br>${esc(S.me.tagline)}` : ''}</p>
      <div class="cta up d2"><a class="btn solid" href="/portfolio">看作品集 →</a>
        ${S.resume.pdf ? `<a class="btn glass" href="${esc(S.resume.pdf)}">下载简历</a>` : `<a class="btn glass" href="/resume">看简历</a>`}</div>
    </section>
    <section class="sec"><div class="sec-head"><div><p class="eyebrow">Selected work</p><h2>精选作品</h2></div><a class="more" href="/portfolio">全部作品 →</a></div>
      ${featured.length ? `<div class="wgrid">${featured.map(w => workCard(w)).join('')}</div>` : '<div class="empty">还没有作品，去 data.js 里加。</div>'}</section>
    ${trips.length ? `<section class="sec"><div class="sec-head"><div><p class="eyebrow">Trips</p><h2>旅游计划</h2></div><a class="more" href="/trips">全部 →</a></div>
      <div class="grid wide">${trips.slice(0, 3).map((t, i) => tripCard(t, i === 0)).join('')}</div></section>` : ''}
    ${tools.length ? `<section class="sec"><div class="sec-head"><div><p class="eyebrow">Tools</p><h2>工具箱</h2></div><a class="more" href="/tools">全部 →</a></div>
      <div class="rows">${tools.slice(0, 3).map(toolRow).join('')}</div></section>` : ''}`;
  };

  R.portfolio = S => {
    const W = S.portfolio, cats = ['全部', ...new Set(W.map(w => w.category))];
    const n = c => c === '全部' ? W.length : W.filter(w => w.category === c).length;
    return `
    <section class="page-head"><p class="eyebrow">Selected work</p><h1>作品集</h1><p>做过的项目和小工具。按类别筛选，点开看完整案例。</p></section>
    <div class="pbar"><div class="filters" id="filters">${cats.map((c, i) => `<button data-c="${esc(c)}" aria-pressed="${i === 0}">${esc(c)}<b>${n(c)}</b></button>`).join('')}</div>
      <div class="vtoggle" id="views" role="group" aria-label="显示方式">
        <button data-v="index" aria-pressed="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 3.5h9.5M5 8h9.5M5 12.5h9.5"/><circle cx="2" cy="3.5" r=".8" fill="currentColor"/><circle cx="2" cy="8" r=".8" fill="currentColor"/><circle cx="2" cy="12.5" r=".8" fill="currentColor"/></svg>目录</button>
        <button data-v="gallery" aria-pressed="false"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.2"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1.2"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1.2"/><rect x="9" y="9" width="5.5" height="5.5" rx="1.2"/></svg>画廊</button></div></div>
    <div class="windex" id="windex">${workIndex(W)}</div>
    <div class="wgrid" id="wgallery" hidden>${workGallery(W)}</div>
    <dialog id="dlg" class="case-dlg"><div class="sheet" id="sheet"></div></dialog>
    <div class="lightbox" id="lb" hidden><img alt=""></div>`;
  };

  R.resume = S => {
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

  R.trips = S => `
    <section class="page-head"><h1>旅游计划</h1><p>去过的、在走的、想去的。有独立行程站的会直接跳过去。</p></section>
    ${S.trips.map(c => `<section class="sec" style="padding-top:34px"><div class="sec-head"><h2 style="font-size:24px">${esc(c.category)}</h2><span class="pill dim">${c.items.length} 次</span></div>
      ${c.items.length ? `<div class="grid wide">${c.items.map(t => tripCard(t, false)).join('')}</div>` : '<div class="empty">这个分类还是空的</div>'}</section>`).join('')}`;

  R.tools = S => `
    <section class="page-head"><h1>工具箱</h1><p>自己做的小工具，和一些常用的东西。</p></section>
    <div class="rows" style="margin-top:26px">${S.tools.map(toolRow).join('') || '<div class="empty">还没有工具</div>'}</div>`;

  R.bookmarks = S => `
    <section class="page-head"><h1>收藏</h1><p>看到的好东西。</p></section>
    ${S.bookmarks.map(c => `<section class="sec" style="padding-top:34px"><div class="sec-head"><h2 style="font-size:24px">${esc(c.category)}</h2></div>
      ${c.items.length ? `<div class="rows">${c.items.map(b => b.url
        ? `<a class="row" href="${esc(b.url)}" target="_blank" rel="noreferrer"><span class="t"><h3>${esc(b.title)}</h3><p>${esc(b.note)}</p></span><span class="arrow">↗</span></a>`
        : `<div class="row"><span class="t"><h3>${esc(b.title)}</h3><p>${esc(b.note)}</p></span></div>`).join('')}</div>` : '<div class="empty">这个分类还是空的</div>'}</section>`).join('')}`;

  // 作品详情（只在浏览器里用，但同样是纯函数，放这里便于统一维护）。prev / next：当前筛选下的上一个、下一个
  const workModal = (w, prev, next) => {
    const m = workMedia(w);
    const content = [m.img ? m.img + ' 张图' : '', m.vid ? m.vid + ' 段视频' : ''].filter(Boolean).join(' · ') || '文字';
    return `
    <div class="sheet-top"><span class="crumb">作品集 / ${esc(w.category)} / <b>${esc(w.title)}</b></span>
      <span class="navs">${prev ? `<button class="iconbtn" data-go="${esc(prev.id)}" aria-label="上一个">‹</button><button class="iconbtn" data-go="${esc(next.id)}" aria-label="下一个">›</button>` : ''}<button class="iconbtn" data-close aria-label="关闭">✕</button></span></div>
    <article class="case" data-cat="${esc(w.category)}">
      <div class="wmeta"><span class="cat">${esc(w.category)}</span><span>·</span><span>${esc(w.year)}</span></div>
      <h2>${esc(w.title)}</h2><p class="intro">${esc(w.summary)}</p>
      <div class="facts"><div><span>类别</span><strong>${esc(w.category)}</strong></div><div><span>时间</span><strong>${esc(w.year)}</strong></div>
        <div><span>内容</span><strong>${esc(content)}</strong></div>
        <div><span>关键词</span><div class="ftags">${(w.tags || []).map(t => `<em>${esc(t)}</em>`).join('')}</div></div></div>
      ${workBlocks(w).map(b => BLOCK[b.type] ? `<section class="blk blk-${b.type}">${BLOCK[b.type](b)}</section>` : '').join('')}
      ${prev && prev.id !== w.id ? `<div class="nextcase"><button data-go="${esc(prev.id)}">← 上一个<b>${esc(prev.title)}</b></button><button data-go="${esc(next.id)}">下一个 →<b>${esc(next.title)}</b></button></div>` : ''}
    </article>`;
  };

  // 同时兼容浏览器和 Node（build_pages.mjs 用 vm 跑这个文件，window 由它注入）
  (typeof window !== 'undefined' ? window : globalThis).RENDER = { esc, navItems, renderHeader, renderFooter, workCard, workRow, workGallery, workIndex, workBlocks, tripCard, toolRow, workModal, pages: R };
})();
