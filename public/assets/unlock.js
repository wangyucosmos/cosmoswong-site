import { safeNext, nextLocation, toolmapReturn, resumePath } from './tools-next.mjs';
// 口令页：输对口令后跳回 next（服务端校验见 src/tools-gate.js）。2026-10-31 起和首屏同一套深空：
// 每输一个字点亮「CW 星座」的一颗星；输对 → 星座变金、星空跃迁、朝目的地星球飞过去再跳转；输错 → 星星散开再归位。
(() => {
  if (location.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(location.hostname)) {
    location.replace('https://' + location.host + location.pathname + location.search + location.hash);
    return;
  }
  const $ = id => document.getElementById(id);
  const STILL = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const next = new URLSearchParams(location.search).get('next') || '';
  const destination = nextLocation(next);
  const validNext = !next || safeNext(next) !== null;
  const f = $('f'), pw = $('pw'), btn = $('go'), err = $('err'), card = $('card'), cons = $('cons');

  // 目的地：简历 → 火星，知识库 → 土星，其余（工具箱里的工具）→ 木星，和二级页面页头的星球一致
  const path = (destination || '').split(/[?#]/)[0];
  const [planet, dest, title, lede] = resumePath(path) ? ['mars', '目的地 · 火星 / 简历', '简历需要口令', '简历只给我发过口令的人看。每输一个字，点亮一颗星。']
    : path === '/knowledge' || path.startsWith('/knowledge/') ? ['saturn', '目的地 · 土星 / 知识库', '知识库需要口令', '这里的笔记只对自己人开放。每输一个字，点亮一颗星。']
    : ['jupiter', '目的地 · 木星 / 工具箱', '需要口令', '这个工具只对自己人开放。每输一个字，点亮一颗星。'];
  document.querySelector('.page-head').dataset.planet = planet;
  $('dest').textContent = dest; $('lede').textContent = lede; document.title = title;
  $('h1').innerHTML = [...title].map((c, i) => `<span class="sp"><span class="ch" style="--i:${i}">${c}</span></span>`).join('');

  /* ---------- 星座：CW 标志的十颗星（第 8 颗是金星），按 C → W 的笔顺 ---------- */
  const P = [[29, 19.9, 3.2], [15, 19.9, 2.6], [8, 32, 3.5], [15, 44.1, 2.6], [29, 44.1, 3], [35, 20, 3], [40, 44, 2.7], [46, 31, 3.6, 1], [52, 44, 2.7], [57, 20, 3.3]];
  cons.innerHTML = P.slice(1).map((p, i) => i === 4 ? '' : `<line pathLength="1" x1="${P[i][0]}" y1="${P[i][1]}" x2="${p[0]}" y2="${p[1]}" data-k="${i + 1}"/>`).join('') +
    P.map(([x, y, r, g]) => `<g class="st${g ? ' gold' : ''}"><circle class="halo" cx="${x}" cy="${y}" r="${r * 1.15}"/><circle class="core" cx="${x}" cy="${y}" r="${r * .4}"/></g>`).join('');
  const stars = [...cons.querySelectorAll('.st')], lines = [...cons.querySelectorAll('line')];
  let lit = 0;
  const light = len => {
    const n = Math.min(len, P.length);
    stars.forEach((s, i) => s.classList.toggle('on', i < n));
    lines.forEach(l => l.classList.toggle('on', +l.dataset.k < n));
    if (n > lit) sky.burst(stars[n - 1]);
    if (len > P.length) { cons.classList.remove('more'); void cons.offsetWidth; cons.classList.add('more'); }
    lit = n;
  };

  /* ---------- 星空：三层视差 + 闪烁 + 流星 + 跃迁 ---------- */
  const sky = (() => {
    const c = $('sky'), x = c.getContext('2d'), pl = document.querySelector('.planet');
    let W, H, dpr, st = [], fx = [], warp = 0, mx = 0, my = 0, tx = 0, ty = 0, shake = 0;
    const size = () => {
      dpr = Math.min(2, devicePixelRatio || 1); W = c.width = innerWidth * dpr; H = c.height = innerHeight * dpr;
      st = Array.from({ length: Math.round(innerWidth * innerHeight / 2600) }, () => {
        const z = Math.random() ** 1.8, r = Math.random();
        return { x: Math.random() * W, y: Math.random() * H, z, r: (.35 + z * 1.5) * dpr, p: Math.random() * 6.28, s: .4 + Math.random() * 1.8, hue: r < .06 ? '#ffd9a8' : r < .12 ? '#bcd4ff' : '#f4f2ed' };
      });
    };
    size(); addEventListener('resize', size);
    addEventListener('pointermove', e => { tx = e.clientX / innerWidth - .5; ty = e.clientY / innerHeight - .5; }, { passive: true });
    const shoot = (sx, sy) => { const a = Math.PI * (.15 + Math.random() * .2); fx.push({ x: sx * dpr, y: sy * dpr, vx: Math.cos(a) * 14 * dpr, vy: Math.sin(a) * 14 * dpr, life: 1 }); };
    addEventListener('pointerdown', e => { if (!e.target.closest('.card,.brand')) shoot(e.clientX, e.clientY); });
    if (!STILL) setInterval(() => { if (!document.hidden && Math.random() < .5) shoot(Math.random() * innerWidth * .7, Math.random() * innerHeight * .3); }, 4200);
    const frame = t => {
      mx += (tx - mx) * .05; my += (ty - my) * .05;
      pl.style.setProperty('--px', (-mx * 22).toFixed(1) + 'px'); pl.style.setProperty('--py', (-my * 22).toFixed(1) + 'px');
      if (warp) warp = Math.min(1, warp + .012);
      const sp = warp ** 2 * 60 * dpr, cx = W / 2, cy = H / 2;
      x.globalAlpha = 1; x.fillStyle = warp ? `rgba(5,6,13,${.35 - warp * .2})` : '#05060d'; x.fillRect(0, 0, W, H);
      for (const s of st) {
        let px = s.x - mx * 40 * dpr * s.z, py = s.y - my * 40 * dpr * s.z;
        if (shake) { px += (Math.random() - .5) * shake * 30 * dpr * s.z; py += (Math.random() - .5) * shake * 30 * dpr * s.z; }
        if (warp) {   // 跃迁：每颗星沿离开中心的方向拉成光线
          const dx = s.x - cx, dy = s.y - cy, d = Math.hypot(dx, dy) || 1;
          s.x += dx / d * sp * (.3 + s.z); s.y += dy / d * sp * (.3 + s.z);
          x.globalAlpha = Math.min(1, .5 + warp); x.strokeStyle = s.hue; x.lineWidth = s.r;
          x.beginPath(); x.moveTo(px, py); x.lineTo(px - dx / d * sp * 2.2, py - dy / d * sp * 2.2); x.stroke();
          if (s.x < -50 || s.x > W + 50 || s.y < -50 || s.y > H + 50) { s.x = cx + (Math.random() - .5) * 80 * dpr; s.y = cy + (Math.random() - .5) * 80 * dpr; }
        } else {
          x.globalAlpha = (.25 + .75 * s.z) * (.55 + .45 * Math.sin(s.p + t / 1000 * s.s) ** 2);
          x.fillStyle = s.hue; x.beginPath(); x.arc(px, py, s.r, 0, 6.28); x.fill();
        }
      }
      shake = shake > .01 ? shake * .9 : 0;
      fx = fx.filter(m => (m.life -= m.spark ? .03 : .018) > 0);
      x.globalAlpha = 1;
      for (const m of fx) {   // 流星和点亮时迸出的金色光点
        m.x += m.vx; m.y += m.vy; if (m.spark) { m.vx *= .94; m.vy *= .94; }
        const k = m.spark ? 3 : 8, g = x.createLinearGradient(m.x, m.y, m.x - m.vx * k, m.y - m.vy * k);
        g.addColorStop(0, m.spark ? `rgba(255,210,122,${m.life})` : `rgba(255,255,255,${m.life})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.strokeStyle = g; x.lineWidth = (m.spark ? 1.4 : 1.8) * dpr; x.beginPath(); x.moveTo(m.x, m.y); x.lineTo(m.x - m.vx * k, m.y - m.vy * k); x.stroke();
      }
      if (!STILL || warp) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    return {
      burst: el => {   // 新点亮的那颗星往外迸一圈小光点
        if (STILL) return;
        const b = el.getBoundingClientRect(), bx = (b.left + b.width / 2) * dpr, by = (b.top + b.height / 2) * dpr;
        for (let i = 0; i < 10; i++) { const a = Math.random() * 6.28, v = (1 + Math.random() * 2.5) * dpr; fx.push({ x: bx, y: by, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, spark: 1 }); }
      },
      scatter: () => { shake = 1; },
      warp: () => { warp = .001; if (STILL) requestAnimationFrame(frame); }
    };
  })();

  // 星球：按需加载和二级页面同一套 three.js + planet.js（失败就只有星空）
  const VQ = new URL(import.meta.url).search;
  const load = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src + VQ; s.onload = ok; s.onerror = no; document.head.append(s); });
  load('/assets/home/three.min.js').then(() => load('/assets/home/planet.js')).catch(() => {});

  /* ---------- 登录 ---------- */
  setTimeout(() => pw.focus(), STILL ? 0 : 900);
  if (!validNext) { err.textContent = '返回地址不受支持，请从站内入口重新打开'; btn.disabled = true; }
  pw.addEventListener('input', () => { err.textContent = ''; cons.classList.remove('bad'); light(pw.value.length); });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (!validNext) return;
    err.textContent = '';
    if (!pw.value) { err.textContent = '请输入口令'; return; }
    btn.disabled = true;
    try {
      const r = await fetch('/api/tools/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-tools-request': '1' }, credentials: 'same-origin', body: JSON.stringify({ password: pw.value, next }) });
      if (r.ok) {
        const d = await r.json(); if (d.redirect !== destination) throw new Error('返回地址不正确');
        const to = toolmapReturn(destination, location.hash);
        light(P.length); cons.classList.add('win'); pw.blur();
        if (STILL) { location.replace(to); return; }
        setTimeout(() => { card.classList.add('leave'); document.body.classList.add('warp'); $('note').textContent = '正在进入 …'; sky.warp(); }, 650);
        setTimeout(() => location.replace(to), 2300);
        return;
      }
      const d = await r.json().catch(() => ({}));
      err.textContent = r.status === 401 ? '口令不对，星星散开了' : (d.error || '出错了，请稍后再试');
      cons.classList.add('bad'); card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); sky.scatter();
      setTimeout(() => { pw.select(); light(0); cons.classList.remove('bad'); }, 650);
    } catch { err.textContent = '网络不通，请稍后再试'; }
    btn.disabled = false;
  });
})();
