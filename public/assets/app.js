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

  /* ---------- 卡片 3D 倾斜 ---------- */
  document.addEventListener('mousemove', e => {
    const c = e.target.closest('.card'); if (!c) return;
    const r = c.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
    c.style.transform = `translateY(-6px) rotateX(${-y * 8}deg) rotateY(${x * 8}deg)`;
  });
  document.addEventListener('mouseout', e => { const c = e.target.closest('.card'); if (c && !c.contains(e.relatedTarget)) c.style.transform = ''; });

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
    const open = id => {
      const w = S.portfolio.find(x => x.id === id); if (!w) return;
      $('#modal').innerHTML = workModal(w);
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
