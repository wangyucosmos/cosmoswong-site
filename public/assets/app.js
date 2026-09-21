/* cosmoswong.com · 页面行为。内容全部来自 data.js（window.SITE），HTML 模板全部在 render.js（window.RENDER）。
   每个页面的 <body data-page="…"> 决定渲染哪个板块。
   构建时 tools/build_pages.mjs 已经用同一套 render.js 把导航、页脚和正文预渲染进 HTML；
   这里的接管是幂等的：骨架已存在就不再插，<main data-prerendered> 就不再重画，但事件绑定无条件执行。 */
(() => {
  const S = window.SITE, RENDER = window.RENDER;
  const $ = (s, r = document) => r.querySelector(s);
  const { workCard, workModal } = RENDER;
  const page = document.body.dataset.page || 'home';

  /* ---------- 公共骨架：背景、导航、页脚（没预渲染时才插） ---------- */
  const here = location.pathname.replace(/\/$/, '') || '/';
  if (!$('.mesh')) document.body.insertAdjacentHTML('afterbegin', RENDER.renderHeader(S, here));
  if (!$('footer')) document.body.insertAdjacentHTML('beforeend', RENDER.renderFooter(S, new Date().getFullYear()));
  if (!$('.menu-backdrop')) document.body.insertAdjacentHTML('beforeend', '<div class="menu-backdrop" aria-hidden="true"></div>');
  /* 手机菜单：打开时锁住页面滚动（记住位置，关掉后还原），点遮罩或链接关闭 */
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

  /* ---------- 卡片 3D 倾斜（只在精细指针 + 允许动效时启用；触屏和减少动效下整个不注册） ---------- */
  if (!matchMedia('(prefers-reduced-motion:reduce)').matches && matchMedia('(hover:hover) and (pointer:fine)').matches) {
    let card = null, rect = null, raf = 0, px = 0, py = 0;
    const paint = () => {
      raf = 0; if (!card || !rect) return;
      const x = (px - rect.left) / rect.width - .5, y = (py - rect.top) / rect.height - .5;
      card.style.transform = `translateY(-6px) rotateX(${-y * 8}deg) rotateY(${x * 8}deg)`;
    };
    // 进卡片时量一次 rect，之后 move 只读缓存；一帧最多写一次 transform
    document.addEventListener('pointerover', e => {
      const c = e.target.closest('.card'); if (!c || c === card) return;
      card = c; rect = c.getBoundingClientRect();
    });
    document.addEventListener('pointermove', e => {
      if (!card) return;
      px = e.clientX; py = e.clientY;
      if (!raf) raf = requestAnimationFrame(paint);
    }, { passive: true });
    document.addEventListener('pointerout', e => {
      if (!card || card.contains(e.relatedTarget)) return;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      card.style.transform = ''; card = null; rect = null;
    });
    // clientX/Y 是视口坐标，页面滚动后缓存的 rect 会失效
    window.addEventListener('scroll', () => { if (card) rect = card.getBoundingClientRect(); }, { passive: true });
  }

  /* ---------- 正文：没预渲染时才在客户端画 ---------- */
  // 静态内页（如 /knowledge、404）自带内容，不走 RENDER.pages
  const main = $('main');
  const render = RENDER.pages[page] || (page === 'home' ? RENDER.pages.home : null);
  if (render && !main.dataset.prerendered) main.innerHTML = render(S);

  /* ---------- 作品集：筛选 + 详情弹窗 ---------- */
  if (page === 'portfolio') {
    $('#filters').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      $('#filters').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
      const c = b.dataset.c;
      $('#works').innerHTML = S.portfolio.filter(w => c === '全部' || w.category === c).map(workCard).join('');
    });
    /* 弹窗进历史：打开 pushState，关闭走 history.back()，这样手机返回键关的是弹窗而不是离开页面。
       Esc / 点遮罩 / 点关闭按钮三条路径都只调 close()，统一由 dialog 的 close 事件回退历史。
       popstate 里关弹窗也会触发 close 事件，用 navigating 标志跳过那一次 back()，否则会连环后退。 */
    const dlg = $('#dlg');
    let navigating = false;
    const open = (id, push = true) => {
      const w = S.portfolio.find(x => x.id === id); if (!w) return;
      $('#modal').innerHTML = workModal(w);
      if (push) history.pushState({ work: id }, '', '#' + id);
      if (!dlg.open) dlg.showModal();
    };
    dlg.addEventListener('close', () => {
      // dialog 的 close 事件是异步派发的，所以标志在这里消费，不能在 popstate 里同步复位
      if (navigating) { navigating = false; return; }
      if (history.state?.work) history.back();
      else history.replaceState(null, '', location.pathname);   // 直接带 hash 进来的，没有可回退的一步
    });
    window.addEventListener('popstate', () => {
      const id = location.hash.slice(1);
      if (id && S.portfolio.some(x => x.id === id)) { open(id, false); return; }
      if (dlg.open) { navigating = true; dlg.close(); }
    });
    document.addEventListener('click', e => {
      const c = e.target.closest('[data-work]'); if (c) return open(c.dataset.work);
      if (e.target.closest('[data-close]') || e.target.id === 'dlg') dlg.close();
    });
    // 卡片是 role="button"，Enter 和空格都要能打开；空格要拦掉默认的翻页滚动
    document.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset?.work) { e.preventDefault(); open(e.target.dataset.work); }
    });
    if (location.hash.length > 1) open(location.hash.slice(1), false);
  }
})();
