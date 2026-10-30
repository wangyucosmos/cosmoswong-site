/* cosmoswong.com · 页面行为。内容全部来自 data.js（window.SITE），HTML 模板全部在 render.js（window.RENDER）。
   每个页面的 <body data-page="…"> 决定渲染哪个板块。
   构建时 tools/build_pages.mjs 已经用同一套 render.js 把导航、页脚和正文预渲染进 HTML；
   这里的接管是幂等的：骨架已存在就不再插，<main data-prerendered> 就不再重画，但事件绑定无条件执行。 */
(() => {
  const S = window.SITE, RENDER = window.RENDER;
  // 本脚本的 ?v= 版本号，按需加载的脚本沿用它（/assets 是长缓存）
  const VQ = (document.currentScript && /\?v=\d+/.exec(document.currentScript.src) || [''])[0];
  const $ = (s, r = document) => r.querySelector(s);
  const { workModal, workGallery, workIndex } = RENDER;
  const page = document.body.dataset.page || 'home';

  /* ---------- 公共骨架：导航、更多菜单、页脚（没预渲染时才插） ---------- */
  const here = location.pathname.replace(/\/$/, '') || '/';
  if (!$('header.top')) document.body.insertAdjacentHTML('afterbegin', RENDER.renderHeader(S, here));
  if (!$('footer.foot')) document.body.insertAdjacentHTML('beforeend', RENDER.renderFooter(S, new Date().getFullYear()));
  if (page !== 'home') document.body.classList.add('inner');
  const root = document.documentElement, nav = $('#nav'), menu = $('#menu'), more = $('#moreBtn');
  const MOTION = !matchMedia('(prefers-reduced-motion:reduce)').matches;
  const FINE = matchMedia('(hover:hover) and (pointer:fine)').matches;
  if (MOTION) root.classList.add('fx');

  /* ⋯ 菜单：点外面、点链接、按 Esc 都关 */
  const setMenu = o => { menu.classList.toggle('open', o); more.setAttribute('aria-expanded', String(o)); };
  more.addEventListener('click', e => { e.stopPropagation(); setMenu(!menu.classList.contains('open')); });
  document.addEventListener('click', e => { if (!menu.contains(e.target) || e.target.closest('a')) setMenu(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

  /* 导航：压在纸面上变纸色毛玻璃；往下滚收起、往上滚出现（同首页） */
  const head = $('.page-head'), foot = $('footer.foot'), paper = document.body.classList.contains('paper');
  let lastY = scrollY;
  const navState = () => {
    const y = scrollY, hb = head ? head.getBoundingClientRect().bottom : 0, ft = foot ? foot.getBoundingClientRect().top : Infinity;
    nav.classList.toggle('solid', paper && hb < 64 && ft > 64);
    nav.classList.toggle('dim', !paper && y > 40 && ft > 64);
    if (Math.abs(y - lastY) > 6) { nav.classList.toggle('hide', y > lastY && y > 320 && !menu.classList.contains('open')); lastY = y; }
    document.body.classList.toggle('nav-hidden', nav.classList.contains('hide'));   // 吸顶的筛选条跟着顶到最上面
  };

  /* ---------- 页头 / 页脚：星点 + 这一页的星球 ---------- */
  const PLANET = { portfolio: 'earth', tools: 'jupiter', knowledge: 'saturn', resume: 'mars', bookmarks: 'moon', trips: 'moon', workbench: 'earth' };
  function sky(host, density) {
    const cv = document.createElement('canvas'); cv.className = 'sky'; cv.setAttribute('aria-hidden', 'true'); host.prepend(cv);
    const g = cv.getContext('2d'), tint = ['#cfe0ff', '#f4f2ed', '#fff3d6', '#ffd9b0', '#b9d2ff'];
    let W = 0, H = 0, stars = [], on = true;
    const size = () => {
      const d = Math.min(2, devicePixelRatio || 1); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * d; cv.height = H * d; g.setTransform(d, 0, 0, d, 0, 0);
      stars = Array.from({ length: Math.round(density * W * H / 1e6) }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() < .9 ? Math.random() * .9 + .3 : Math.random() * 1.4 + 1, c: tint[(Math.random() * tint.length) | 0], p: Math.random() * 6.28, s: .6 + Math.random() * 1.8 }));
    };
    const draw = t => {
      g.clearRect(0, 0, W, H);
      for (const s of stars) { g.globalAlpha = MOTION ? .45 + .55 * (.5 + .5 * Math.sin(t / 1000 * s.s + s.p)) : .8; g.fillStyle = s.c; g.beginPath(); g.arc(s.x, s.y, s.r, 0, 6.283); g.fill(); }
      if (on && MOTION) requestAnimationFrame(draw);
    };
    new IntersectionObserver(([e]) => { const was = on; on = e.isIntersecting; if (on && !was && MOTION) requestAnimationFrame(draw); }).observe(cv);
    addEventListener('resize', () => { size(); if (!MOTION) draw(0); });
    size(); requestAnimationFrame(draw);
  }
  if (head) {
    const pl = head.dataset.planet || PLANET[page];
    if (pl && page !== 'subs') {
      head.dataset.planet = pl; head.insertAdjacentHTML('afterbegin', '<div class="planet" aria-hidden="true"></div>');
      // 真实星球：按需加载 three.min.js + planet.js（和首页同一套贴图与光照）；失败时保留 CSS 版
      const load = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.body.appendChild(s); });
      (window.THREE ? Promise.resolve() : load('/assets/home/three.min.js' + VQ)).then(() => load('/assets/home/planet.js' + VQ)).catch(() => {});
    }
    sky(head, 520);
  }
  if (foot) sky(foot, 420);

  /* ---------- 复制邮箱 ---------- */
  const copy = $('#copyMail');
  if (copy) copy.addEventListener('click', () => {
    const st = $('#copyState'), mail = $('#mailText').textContent;
    const done = ok => { st.textContent = ok ? '已复制' : '已选中，按 ⌘C'; setTimeout(() => (st.textContent = '复制'), 1800); };
    const sel = () => { const rg = document.createRange(); rg.selectNodeContents($('#mailText')); const s = getSelection(); s.removeAllRanges(); s.addRange(rg); };
    try { navigator.clipboard.writeText(mail).then(() => done(true), () => { sel(); done(false); }); } catch (e) { sel(); done(false); }
  });

  /* ---------- 动效：逐字升起、依次浮现、页头随滚动淡出、数字滚动（只在允许动效时） ---------- */
  // 把元素里的文字拆成一个个字（标签和图标原样保留），配合 .fx .split 的 CSS 从下往上升起
  function split(el, d0 = 0) {
    if (!el || el.classList.contains('split')) return;
    const heading = el.closest('h1,h2,h3,h4,h5,h6');
    if (heading && !heading.hasAttribute('aria-label')) heading.setAttribute('aria-label', heading.textContent.trim());
    let i = 0;
    const walk = n => [...n.childNodes].forEach(c => {
      if (c.nodeType === 3) {
        if (!c.textContent.trim()) return;
        // 整段文字包在一个 .sw 里：父元素是 flex 时（如带圆点的组标题）不会把每个字变成一个 flex 项
        const f = document.createElement('span'); f.className = 'sw';
        for (const ch of c.textContent) {
          if (/\s/.test(ch)) { f.append(ch); continue; }
          const w = document.createElement('span'); w.className = 'w';
          const s = document.createElement('span'); s.className = 'ch'; s.style.setProperty('--i', i++); s.textContent = ch;
          w.append(s); f.append(w);
        }
        c.replaceWith(f);
      } else if (c.nodeType === 1 && !c.matches('svg,i,.dot')) walk(c);
    });
    walk(el); el.classList.add('split'); el.style.setProperty('--d0', d0 + 'ms');
  }
  const io = MOTION && 'IntersectionObserver' in window ? new IntersectionObserver(es => {
    let k = 0;
    es.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left)
      .forEach(e => { const el = e.target; if (el.classList.contains('rv')) el.style.setProperty('--rd', Math.min(k++, 8) * 70 + 'ms'); el.classList.add('in'); io.unobserve(el); });
  }, { rootMargin: '0px 0px -6% 0px', threshold: .08 }) : null;
  const RV = '.tcard,.wrow,.wcard,.row,.rbox,.card,.tg-head,.chips,.pbar,.kb>p,.kb>ul,.kb>ol,.kb>figure,.kb>.thesis,.kb>table,.case>p,.case>.shot,.case>.facts,.case>.three,.case>.pair,.case>.tl,.case>blockquote,.case>.end,.foot-links>*,.foot-row,.empty';
  const SPLIT = '.tg-head h2,.kb>h2,.case>h2,.sec h2,.foot-title>span';
  function scan(rootEl = document) {
    if (!io) return;
    rootEl.querySelectorAll(RV).forEach(el => { if (el.closest('dialog') || el.classList.contains('rv')) return; el.classList.add('rv'); io.observe(el); });
    rootEl.querySelectorAll(SPLIT).forEach((el, n) => { if (el.closest('dialog') || el.classList.contains('split')) return; split(el, el.matches('.foot-title>span') ? n % 2 * 120 : 0); io.observe(el); });
  }
  window.CWFX = { scan };
  if (io) {
    // 页头标题：字体就绪后整体升起
    const ph = head ? [...head.querySelectorAll('h1 .en, h1 .cn')] : [];
    if (head && !ph.length) ph.push(head.querySelector('h1'));
    ph.forEach((el, n) => split(el, n * 160));
    // 不用 rAF：后台标签页里 rAF 会暂停，标题就一直藏着；先读一次布局让起始状态生效，再加 .in
    const go = () => ph.forEach(el => { if (el && !el.classList.contains('in')) { el.getBoundingClientRect(); el.classList.add('in'); } });
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(go); setTimeout(go, 1200);
    scan();
    // 数字从 0 滚到目标值
    document.querySelectorAll('[data-count]').forEach(el => {
      const n = +el.dataset.count, t0 = performance.now();
      const step = t => { const k = Math.min(1, (t - t0) / 1200); el.textContent = Math.round(n * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }
  // 页头：滚动时内容淡出上移、星球慢一拍（视差）
  const headKids = head ? [...head.children].filter(el => !el.matches('.planet,.sky')) : [];
  const planetEl = head && head.querySelector('.planet');
  const onScroll = () => {
    navState();
    if (!head || !MOTION) return;
    const h = head.offsetHeight, p = Math.min(1, Math.max(0, scrollY / (h * .8)));
    headKids.forEach((el, i) => { el.style.opacity = String(1 - p * 1.15); el.style.transform = `translateY(${(-p * (40 + i * 12)).toFixed(1)}px)`; });
    if (planetEl) planetEl.style.setProperty('--py', (scrollY * .22).toFixed(1) + 'px');
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* ---------- 精细指针才有：卡片 3D 倾斜 + 光斑、按钮磁吸、金色光标（同首页） ---------- */
  if (MOTION && FINE) {
    const TILT = '.tcard,.wcard,a.row,.card';
    let card = null, rect = null, raf = 0, px = 0, py = 0;
    const paint = () => {
      raf = 0; if (!card || !rect) return;
      const x = (px - rect.left) / rect.width - .5, y = (py - rect.top) / rect.height - .5;
      card.style.transform = `perspective(900px) translateY(-6px) rotateX(${(-y * 7).toFixed(2)}deg) rotateY(${(x * 7).toFixed(2)}deg)`;
      card.style.setProperty('--mx', (px - rect.left).toFixed(0) + 'px'); card.style.setProperty('--my', (py - rect.top).toFixed(0) + 'px');
    };
    document.addEventListener('pointerover', e => { const c = e.target.closest(TILT); if (!c || c === card || c.closest('dialog')) return; card = c; rect = c.getBoundingClientRect(); });
    document.addEventListener('pointerout', e => {
      if (!card || card.contains(e.relatedTarget)) return;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      card.style.transform = ''; card = null; rect = null;
    });
    addEventListener('scroll', () => { if (card) rect = card.getBoundingClientRect(); }, { passive: true });
    // 磁吸按钮：用 translate 属性，不和 transform 动画打架
    const MAG = '.mag,.btn,.chip,.more,.vtoggle button,.filters button';
    let magEl = null;
    document.addEventListener('pointermove', e => {
      px = e.clientX; py = e.clientY;
      if (card && !raf) raf = requestAnimationFrame(paint);
      const m = e.target.closest && e.target.closest(MAG);
      if (magEl && magEl !== m) { magEl.style.translate = ''; magEl = null; }
      if (m) { const r = m.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); m.style.translate = `${(dx * .22).toFixed(1)}px ${(dy * .3).toFixed(1)}px`; magEl = m; }
    }, { passive: true });
    // 光标：金色小点跟手，悬停在 data-cursor 上变成带字的胶囊
    document.body.insertAdjacentHTML('beforeend', '<div class="cursor" aria-hidden="true"><div class="cursor__dot"></div><div class="cursor__pill"></div></div>');
    root.classList.add('has-cursor');
    const cur = $('.cursor'), pill = $('.cursor__pill');
    let cx = innerWidth / 2, cy = innerHeight / 2, tx = cx, ty = cy;
    document.addEventListener('pointermove', e => {
      tx = e.clientX; ty = e.clientY;
      const host = e.target.closest && e.target.closest('[data-cursor]'), label = host ? host.dataset.cursor : '';
      cur.classList.toggle('label', !!label); if (label) pill.textContent = label;
      cur.classList.toggle('over', !label && !!(e.target.closest && e.target.closest('a,button,[role="button"]')));
    }, { passive: true });
    (function loop() { cx += (tx - cx) * .22; cy += (ty - cy) * .22; cur.style.transform = `translate(${cx.toFixed(1)}px,${cy.toFixed(1)}px)`; requestAnimationFrame(loop); })();
  }

  /* ---------- 工具箱：按用途筛选；带 #travel 这类地址进来时定位到那一组 ---------- */
  if (page === 'tools' && $('#chips')) {
    const setF = f => {
      document.querySelectorAll('#chips .chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === f)));
      document.querySelectorAll('.tgroup').forEach(s => { s.hidden = f !== 'all' && s.dataset.g !== f; });
    };
    $('#chips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; setF(b.dataset.f); const t = $('#chips').getBoundingClientRect().top; if (t < 80) scrollTo({ top: scrollY + t - 72, behavior: MOTION ? 'smooth' : 'auto' }); });
    const h = location.hash.slice(1);
    if (h && $('#' + CSS.escape(h) + '.tgroup')) setTimeout(() => $('#' + CSS.escape(h)).scrollIntoView({ behavior: 'auto' }), 60);
  }

  /* ---------- 正文：没预渲染时才在客户端画 ---------- */
  // 静态内页（如 /knowledge、404）自带内容，不走 RENDER.pages
  const main = $('main');
  const render = RENDER.pages[page] || (page === 'home' ? RENDER.pages.home : null);
  if (render && !main.dataset.prerendered) main.innerHTML = render(S);

  /* ---------- 首页精选作品：点开跳到作品集里对应的案例 ---------- */
  if (page !== 'portfolio') {
    const go = id => { location.href = '/portfolio#' + encodeURIComponent(id); };
    document.addEventListener('click', e => { const c = e.target.closest('[data-work]'); if (c) go(c.dataset.work); });
    document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset?.work) { e.preventDefault(); go(e.target.dataset.work); } });
  }

  /* ---------- 作品集：筛选 + 目录 / 画廊 + 案例详情 ---------- */
  if (page === 'portfolio') {
    let cat = '全部', view = 'index';
    try { if (localStorage.getItem('portfolio.view') === 'gallery') view = 'gallery'; } catch (e) { }   // 只记这台设备的偏好
    const list = () => S.portfolio.filter(w => cat === '全部' || w.category === cat);
    const paint = () => {
      $('#windex').innerHTML = workIndex(list()); $('#wgallery').innerHTML = workGallery(list());
      $('#windex').hidden = view !== 'index'; $('#wgallery').hidden = view !== 'gallery';
      $('#views').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === view));
      window.CWFX.scan($('main'));   // 新画出来的卡片 / 行也依次浮现
    };
    if (view !== 'index') paint();
    $('#filters').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      $('#filters').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
      cat = b.dataset.c; paint();
    });
    $('#views').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      view = b.dataset.v; try { localStorage.setItem('portfolio.view', view); } catch (err) { }
      paint();
    });
    // 画廊卡片：有视频的，鼠标放上去原地播放
    document.addEventListener('pointerover', e => { const c = e.target.closest('.wcard'); const v = c && c.querySelector('.shot video'); if (v && v.paused) v.play().catch(() => {}); });
    document.addEventListener('pointerout', e => { const c = e.target.closest('.wcard'); if (c && !c.contains(e.relatedTarget)) { const v = c.querySelector('.shot video'); if (v) v.pause(); } });

    /* 弹窗进历史：打开 pushState，关闭走 history.back()，这样手机返回键关的是弹窗而不是离开页面。
       Esc / 点遮罩 / 点关闭按钮三条路径都只调 close()，统一由 dialog 的 close 事件回退历史。
       popstate 里关弹窗也会触发 close 事件，用 navigating 标志跳过那一次 back()，否则会连环后退。
       弹窗里翻上一个 / 下一个用 replaceState：不管翻了几个，返回一次就关掉。 */
    const dlg = $('#dlg');
    let navigating = false;
    const open = (id, how = 'push') => {
      const w = S.portfolio.find(x => x.id === id); if (!w) return;
      const L = list().some(x => x.id === id) ? list() : S.portfolio, i = L.findIndex(x => x.id === id);
      const prev = L.length > 1 ? L[(i - 1 + L.length) % L.length] : null, next = L.length > 1 ? L[(i + 1) % L.length] : null;
      $('#sheet').innerHTML = workModal(w, prev, next);
      if (how === 'push') history.pushState({ work: id }, '', '#' + id);
      else if (how === 'replace') history.replaceState({ work: id }, '', '#' + id);
      if (!dlg.open) dlg.showModal();
      $('#sheet').scrollTop = 0;
    };
    dlg.addEventListener('close', () => {
      dlg.querySelectorAll('video').forEach(v => v.pause());
      // dialog 的 close 事件是异步派发的，所以标志在这里消费，不能在 popstate 里同步复位
      if (navigating) { navigating = false; return; }
      if (history.state?.work) history.back();
      else history.replaceState(null, '', location.pathname);   // 直接带 hash 进来的，没有可回退的一步
    });
    window.addEventListener('popstate', () => {
      const id = location.hash.slice(1);
      if (id && S.portfolio.some(x => x.id === id)) { open(id, 'none'); return; }
      if (dlg.open) { navigating = true; dlg.close(); }
    });
    const lb = $('#lb');
    document.addEventListener('click', e => {
      if (!lb.hidden) { lb.hidden = true; return; }
      const z = e.target.closest('[data-zoom]'); if (z) { lb.querySelector('img').src = z.querySelector('img').src; lb.hidden = false; return; }
      const g = e.target.closest('[data-go]'); if (g) return open(g.dataset.go, history.state?.work ? 'replace' : 'push');
      const c = e.target.closest('[data-work]'); if (c) return open(c.dataset.work);
      if (e.target.closest('[data-close]') || e.target.id === 'dlg') dlg.close();
    });
    // 新旧对比：拖动滑杆
    document.addEventListener('input', e => {
      const c = e.target.closest('.b-compare'); if (!c) return;
      const v = +e.target.value; c.querySelector('.top').style.clipPath = `inset(0 ${100 - v}% 0 0)`; c.querySelector('.knob').style.left = v + '%';
    });
    // 卡片 / 目录行是 role="button"，Enter 和空格都要能打开；空格要拦掉默认的翻页滚动
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !lb.hidden) { lb.hidden = true; e.preventDefault(); return; }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset?.work) { e.preventDefault(); open(e.target.dataset.work); }
    });
    if (location.hash.length > 1) open(location.hash.slice(1), 'none');
  }
})();
