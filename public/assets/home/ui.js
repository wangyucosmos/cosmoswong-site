/* 页面交互：入场序列、平滑滚动值、导航、逐行升起、纸面板盖上来、演示带（收缩成第一张作品卡片）、
   WebGL 作品带（拖拽弯曲 + 依次滑入）、作品总表、光标胶囊、小月亮彩蛋、视频浮层、底部按钮。 */
(function () {
  const CW = window.CW, S = CW.state;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  root.classList.add('js');
  const LOW = S.tier === 'low';
  const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;

  const E = {
    expoOut: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    p4InOut: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
    elastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1)
  };
  function tween(ms, ease, fn) {
    return new Promise((res) => {
      const t0 = performance.now();
      (function step(now) { const t = Math.min(1, (now - t0) / ms); fn(ease(t)); t < 1 ? requestAnimationFrame(step) : res(); })(t0);
    });
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pad = (n) => String(n).padStart(2, '0');

  // ---------- 作品：读 /assets/data.js 的 portfolio（标题按「 · 」拆成主副标题；点开去作品集详情） ----------
  // 没有封面的作品画示意图：印尼行程站画太阳、五省福利中心画地图，其余画通用图
  const ART = { 'indonesia-trip-app': 'sun', 'five-province-welfare': 'map' };
  // 首页卡片和列表用的短标题（和改版样稿一致）；新加的作品没写在这里时，按「 · 」自动拆
  const NAME = {
    'my-workbench': ['我的工作台', '和 AI 一起给自己搭的工作台'], 'case-gallery': ['案例展厅', '四个运营案例的交互式原型'],
    'indonesia-trip-app': ['国庆印尼旅游', '多人协作行程站'], 'migu-monthly-oct': ['咪咕视频月度促活', '十月会员活动'],
    'sichuan-welfare': ['四川福利中心', '蜀地专属，“移”起抽好礼'], 'guiba-vote': ['“桂BA”投票页', '广西城市篮球联赛'],
    'guizhou-nba': ['NBA 中国赛门票抽奖页', '贵州'], 'five-province-welfare': ['五省福利中心', '本地化策划与原型'],
    'cosmos-os': ['Cosmos OS', 'macOS 个人工作系统'], 'multi-agent-workflow': ['多智能体协作知识库', '工作流'],
    'stefani-portfolio': ['Stefani 作品集网页', '社媒运营作品集'], 'xianjian-webgame': ['《新仙剑奇侠传》页游', '综合运营'],
    'mobile-games-ops': ['《次元之战》《暴走英雄坛》', '手游产品运营']
  };
  const WORKS = ((window.SITE && window.SITE.portfolio) || []).map((p) => {
    const [t, ...rest] = NAME[p.id] || p.title.split(' · ');
    return { id: p.id, t, s: rest.join(' · '), c: p.category, y: p.year, l: '/portfolio#' + p.id, cover: p.cover || '', video: p.video || '', art: ART[p.id], f: p.featured ? 1 : 0, d: p.summary };
  });
  const href = (l) => l || '';
  const ext = (l) => (/^https?:/.test(l) ? ' target="_blank" rel="noopener"' : '');
  const FEATURED = WORKS.filter((w) => w.f);

  // 没有截图的作品画一张示意图
  function drawArt(w, i, reuse) {
    const cv = reuse || document.createElement('canvas'); cv.width = 1200; cv.height = 800;
    const g = cv.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 1200, 800);
    gr.addColorStop(0, i % 2 ? '#1a1b3f' : '#122a3a'); gr.addColorStop(1, i % 2 ? '#5a2b5e' : '#2a5a6a');
    g.fillStyle = gr; g.fillRect(0, 0, 1200, 800);
    g.strokeStyle = '#ffd27a'; g.fillStyle = '#ffd27a'; g.lineWidth = 3;
    if (w.art === 'sun') {
      g.beginPath(); g.arc(880, 260, 150, 0, 7); g.fill();
      g.globalAlpha = 0.7; for (let k = 0; k < 6; k++) { g.beginPath(); for (let x = 560; x < 1200; x += 8) g.lineTo(x, 440 + k * 26 + Math.sin(x / 40 + k) * 8); g.stroke(); }
    } else {
      const pts = [[700, 220], [860, 160], [1000, 260], [760, 380], [940, 420]];
      g.globalAlpha = 0.5; g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke();
      g.globalAlpha = 1; pts.forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 14, 0, 7); g.fill(); });
    }
    g.globalAlpha = 1; g.fillStyle = '#f4f2ed';
    g.font = '500 22px "JetBrains Mono", monospace'; g.globalAlpha = 0.7; g.fillText(`${pad(i + 1)} · ${w.c} · ${w.y}`, 92, 100);
    g.globalAlpha = 1; g.font = '900 92px "Noto Sans SC", sans-serif'; g.fillText(w.t, 88, 650);
    g.font = '500 34px "Noto Sans SC", sans-serif'; g.globalAlpha = 0.75; g.fillText(w.s, 92, 712);
    return cv;
  }

  // ---------- 作品带 DOM ----------
  const track = $('#track'), viewport = $('#viewport');
  track.innerHTML = FEATURED.map((w, i) => `
    <a class="card${i ? ' pre' : ''}" data-i="${i}" ${w.l ? `href="${href(w.l)}"${ext(w.l)}` : 'role="group"'} data-cursor="${w.l ? '拖动 / 点开' : '拖动'}" draggable="false">
      <div class="card__media" role="img" aria-label="${w.t}：${w.s}">${w.video ? `<video muted loop playsinline preload="none" src="${w.video}"></video>` : ''}</div>
      <div class="card__cap"><span class="n">${pad(i + 1)}</span><span><b>${w.t}</b> <span class="c">${w.c}</span></span><span class="n">${w.y}</span></div>
    </a>`).join('');
  const cards = $$('.card'), medias = $$('.card__media');
  const sources = FEATURED.map((w, i) => {
    if (w.cover) { const img = new Image(); img.src = w.cover; return img; }
    return drawArt(w, i);
  });
  sources.forEach((s, i) => {
    const set = () => (medias[i].style.backgroundImage = `url(${s.src || s.toDataURL('image/jpeg', 0.85)})`);
    s instanceof HTMLImageElement ? (s.complete ? set() : s.addEventListener('load', set)) : set();
  });
  cards.forEach((c, i) => {
    const v = $('video', c);
    if (v) { c.addEventListener('pointerenter', () => v.play().catch(() => {})); c.addEventListener('pointerleave', () => v.pause()); }
    c.addEventListener('click', (e) => { e.preventDefault(); if (D.moved > 6) return; openCase(i); });
    c.addEventListener('pointerenter', () => (D.hover = i)); c.addEventListener('pointerleave', () => (D.hover = -1));
  });

  // ---------- 作品总表 ----------
  $('#rows').innerHTML = WORKS.map((w, i) => `
    <div class="row" data-i="${i}">
      <button class="row__main" type="button" aria-expanded="false" data-cursor="展开">
        <span class="n"><i style="--k:0">${pad(i + 1)}</i></span><span class="t"><i style="--k:1">${w.t}</i></span><span class="c"><i style="--k:2">${w.c}</i></span><span class="y"><i style="--k:3">${w.y}</i></span><span class="ar" aria-hidden="true"><i style="--k:4">▾</i></span>
      </button>
      <i class="row__line" aria-hidden="true"></i>
      <div class="row__more"><div><p>${w.d}${w.l ? ` <a href="${href(w.l)}"${ext(w.l)}>查看详情 →</a>` : ''}</p></div></div>
    </div>`).join('');
  $$('.row__main').forEach((b) => b.addEventListener('click', () => {
    const row = b.parentElement, open = !row.classList.contains('open');
    row.classList.toggle('open', open); b.setAttribute('aria-expanded', open);
  }));

  // ---------- WebGL 作品平面 ----------
  const texs = [];
  const works = (function () {
    if (!CW.gl || LOW) return null;
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(45, 1, 1, 6000);
    const geo = new THREE.PlaneGeometry(1, 1, 40, 20);
    const meshes = medias.map((el, i) => {
      const src = sources[i];
      const t = new THREE.Texture(src); t.anisotropy = 4; texs[i] = t;
      if (src instanceof HTMLImageElement) { if (src.complete) t.needsUpdate = true; else src.addEventListener('load', () => (t.needsUpdate = true)); } else t.needsUpdate = true;
      const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
        transparent: true,
        uniforms: { uTex: { value: t }, uSize: { value: new THREE.Vector2(1, 1) }, uTexSize: { value: new THREE.Vector2(src.naturalWidth || src.width || 3, src.naturalHeight || src.height || 2) },
          uPar: { value: 0 }, uDrag: { value: 0 }, uR: { value: 14 }, uHover: { value: 0 }, uVw: { value: 1 },
          uTilt: { value: new THREE.Vector2() }, uGlare: { value: new THREE.Vector2(0.5, 0.5) } },
        vertexShader: `uniform float uDrag; uniform float uVw; uniform vec2 uSize; uniform vec2 uTilt; varying vec2 vUv;
          void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.);
            float nx=w.x/(uVw*.5); float d=smoothstep(0.,1.5,abs(nx));
            w.z-=d*d*abs(uDrag)*520.; w.y-=sin(uv.x*3.14159)*abs(uDrag)*30.; w.x+=nx*abs(uDrag)*-40.;
            w.z+=(uv.x-.5)*uSize.x*sin(uTilt.x)+(uv.y-.5)*uSize.y*sin(uTilt.y); // 悬停 3D 倾斜
            gl_Position=projectionMatrix*viewMatrix*w; }`,
        fragmentShader: `uniform sampler2D uTex; uniform vec2 uSize; uniform vec2 uTexSize; uniform float uPar; uniform float uDrag; uniform float uR; uniform float uHover; uniform vec2 uGlare; varying vec2 vUv;
          float rbox(vec2 p, vec2 b, float r){ vec2 q=abs(p)-b+r; return length(max(q,0.))+min(max(q.x,q.y),0.)-r; }
          void main(){
            vec2 ratio=vec2(min((uSize.x/uSize.y)/(uTexSize.x/uTexSize.y),1.), min((uSize.y/uSize.x)/(uTexSize.y/uTexSize.x),1.));
            vec2 uv=vec2(vUv.x*ratio.x+(1.-ratio.x)*.5, vUv.y*ratio.y+(1.-ratio.y)*.5);
            uv=(uv-.5)/(1.1+uHover*.05)+.5; uv.x+=uPar*.05;
            float s=uDrag*.014;
            vec3 c=vec3(texture2D(uTex,uv+vec2(s,0.)).r, texture2D(uTex,uv).g, texture2D(uTex,uv-vec2(s,0.)).b);
            c*=1.-abs(uDrag)*.12;
            // 高光：跟着鼠标位置的柔光 + 一道斜向的光带
            float g=smoothstep(.7,0.,distance(vUv*vec2(uSize.x/uSize.y,1.),uGlare*vec2(uSize.x/uSize.y,1.)));
            float band=smoothstep(.12,0.,abs((vUv.x+vUv.y)*.5-uGlare.x*.7-.15));
            c+=vec3(1.,.97,.92)*(g*.22+band*.12)*uHover;
            float d=rbox((vUv-.5)*uSize, uSize*.5, uR);
            gl_FragColor=vec4(c, 1.-smoothstep(-1.,.5,d)); }`
      }));
      if (src instanceof HTMLImageElement) src.addEventListener('load', () => m.material.uniforms.uTexSize.value.set(src.naturalWidth, src.naturalHeight));
      scene.add(m);
      return { m, px: null, v: 0 };
    });
    viewport.classList.add('gl-on');
    CW.gl.addRegion({
      rect() { const r = viewport.getBoundingClientRect(); return { left: r.left, top: r.top - 90, width: r.width, height: r.height + 180, bottom: r.bottom + 90, right: r.right }; },
      draw(cr) {
        const W = cr.width, H = cr.height;
        cam.aspect = W / H; cam.position.set(0, 0, 900); cam.fov = (2 * Math.atan(H / 2 / 900) * 180) / Math.PI; cam.updateProjectionMatrix();
        medias.forEach((el, i) => {
          const b = el.getBoundingClientRect(), o = meshes[i], u = o.m.material.uniforms;
          const cx = b.left + b.width / 2;
          if (o.px !== null) o.v = lerp(o.v, (cx - o.px) / S.vw, 0.25);
          o.px = cx;
          o.m.scale.set(b.width, b.height, 1);
          o.m.position.set(cx - cr.left - W / 2, H / 2 - (b.top + b.height / 2 - cr.top), 0);
          u.uSize.value.set(b.width, b.height); u.uVw.value = W;
          u.uDrag.value = clamp(o.v * -9, -1, 1);
          u.uPar.value = clamp((cx - W / 2) / W, -1, 1);
          u.uHover.value = lerp(u.uHover.value, D.hover === i ? 1 : 0, 0.12);
          const hx = D.hover === i && !D.dragging ? clamp((C.tx - b.left) / b.width, 0, 1) : 0.5, hy = D.hover === i && !D.dragging ? clamp((C.ty - b.top) / b.height, 0, 1) : 0.5;
          u.uTilt.value.x = lerp(u.uTilt.value.x, (hx - 0.5) * -0.32, 0.12); u.uTilt.value.y = lerp(u.uTilt.value.y, (hy - 0.5) * 0.26, 0.12);
          u.uGlare.value.set(lerp(u.uGlare.value.x, hx, 0.2), lerp(u.uGlare.value.y, 1 - hy, 0.2));
        });
        CW.gl.R.render(scene, cam);
      }
    });
    return true;
  })();

  // 拖拽物理
  const D = { x: 0, target: 0, min: 0, dragging: false, sx: 0, st: 0, lx: 0, v: 0, hover: -1, moved: 0 };
  function measure() { D.min = Math.min(0, viewport.clientWidth - track.scrollWidth); }
  viewport.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    D.dragging = true; D.sx = D.lx = e.clientX; D.st = D.target; D.v = 0; D.moved = 0;
  });
  addEventListener('pointermove', (e) => {
    if (!D.dragging) return;
    D.target = D.st + (e.clientX - D.sx); D.v = e.clientX - D.lx; D.lx = e.clientX; D.moved += Math.abs(D.v);
    if (D.moved > 6) track.classList.add('dragging');
  });
  const endDrag = () => { if (!D.dragging) return; D.dragging = false; D.target += D.v * 16; track.classList.remove('dragging'); };
  addEventListener('pointerup', endDrag); addEventListener('pointercancel', endDrag);
  viewport.addEventListener('wheel', (e) => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { e.preventDefault(); D.target -= e.deltaX; } }, { passive: false });
  viewport.tabIndex = 0;
  viewport.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') D.target -= 320; if (e.key === 'ArrowLeft') D.target += 320; });
  let cardsIn = false;
  function updateWorks(dt) {
    if (!D.dragging) {
      if (D.target > 0) D.target = lerp(D.target, 0, 0.18);
      if (D.target < D.min) D.target = lerp(D.target, D.min, 0.18);
    }
    D.x = lerp(D.x, D.target, LOW ? 1 : 1 - Math.pow(0.002, dt));
    track.style.transform = `translate3d(${D.x.toFixed(2)}px,0,0)`;
    const cw = cards[0].offsetWidth + 20;
    $('#worksIdx').textContent = `${pad(clamp(Math.round(-D.x / cw) + 1, 1, FEATURED.length))} / ${pad(FEATURED.length)}`;
    if (!cardsIn && viewport.getBoundingClientRect().top < S.vh * 0.8) {
      cardsIn = true;
      cards.forEach((c, i) => { c.style.transitionDelay = `${i * 90}ms`; c.classList.remove('pre'); });
      setTimeout(() => cards.forEach((c) => (c.style.transitionDelay = '')), 1800);
    }
  }

  // ---------- 文字逐步出现 ----------
  // 把元素里的文字拆成单字 span（保留嵌套结构，比如 "Tools" 的英文字体）
  function splitChars(el) {
    let n = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((c) => {
        if (c.nodeType === 3) {
          if (!c.textContent.trim()) return; // 标签之间的换行缩进不拆（上一版的大块空白就是它们造成的）
          const frag = document.createDocumentFragment();
          [...c.textContent].forEach((ch) => {
            if (/[ \t\n\r]/.test(ch)) { frag.appendChild(document.createTextNode(' ')); return; } // 全角空格照常拆成字，保留宽度
            const s = document.createElement('span'); s.className = 'ch'; s.textContent = ch; s.style.setProperty('--c', n++); frag.appendChild(s);
          });
          c.replaceWith(frag);
        } else if (c.nodeType === 1 && !c.classList.contains('ch') && c.id !== 'feedCount') walk(c);
      });
    };
    walk(el);
    return $$('.ch', el);
  }
  $$('.rv').forEach(splitChars);
  const io = new IntersectionObserver((ents) => ents.forEach((e) => {
    if (e.isIntersecting) e.target.classList.remove('wait');
    else if (e.boundingClientRect.top > 0) e.target.classList.add('wait');
  }), { rootMargin: '0px 0px -10% 0px' });
  const footRv = $$('#contact .rv'), footStag = $$('#contact .stag');
  if (!LOW) $$('.rv, .fade').forEach((el) => { if (el.closest('#hero')) return; el.classList.add('wait'); if (!el.closest('#contact')) io.observe(el); });
  if (LOW) footStag.forEach((el) => el.classList.add('in'));
  // 作品总表：逐行滑入 + 每格文字从下方升起 + 分隔线从左往右画出；同一批进来的行依次错开
  const rowIO = new IntersectionObserver((ents) => {
    let k = 0;
    ents.forEach((e) => {
      const r = e.target;
      if (e.isIntersecting) { const d = (k++) * 80; r.style.transitionDelay = `${d}ms`; r.style.setProperty('--rd', `${d}ms`); r.classList.remove('wait'); r.classList.add('drawn'); }
      else if (e.boundingClientRect.top > 0) { r.style.transitionDelay = '0ms'; r.style.setProperty('--rd', '0ms'); r.classList.add('wait'); r.classList.remove('drawn'); }
    });
  }, { rootMargin: '0px 0px -6% 0px' });
  if (!LOW) $$('.row').forEach((r) => { r.classList.add('wait'); rowIO.observe(r); }); else $$('.row').forEach((r) => r.classList.add('drawn'));
  // 尾页：跟银河缩放进度走——拉开到七成时文字升起、按钮浮现；往回滚到三成以下复位，下次再看还会重播
  let footShown = false;
  function updateFoot() {
    if (LOW) return;
    const e = S.footE || 0;
    if (!footShown && e > 0.7) { footShown = true; footRv.forEach((el) => el.classList.remove('wait')); setTimeout(() => footShown && footStag.forEach((el) => el.classList.add('in')), 450); }
    else if (footShown && e < 0.3) { footShown = false; footRv.forEach((el) => el.classList.add('wait')); footStag.forEach((el) => el.classList.remove('in')); }
  }
  // 文字靠近屏幕上下边缘时稍微模糊
  const edgeEls = LOW ? [] : [...$$('#intro .ln'), ...$$('#intro .intro__meta, #intro .intro__feed, #intro .intro__aside p'), ...$$('.works__head'), ...$$('.list h3, .list__head'), ...$$('.row')];
  const edgeVal = new Map();
  function updateEdgeBlur() {
    const zone = S.vh * 0.16, top = 64;
    edgeEls.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < -40 || r.top > S.vh + 40) return;
      const c = r.top + r.height / 2, d = Math.min(c - top, S.vh - c);
      const b = Math.round(Math.max(0, Math.min(1, (zone - d) / zone)) * 40) / 10;
      if (edgeVal.get(el) === b) return;
      edgeVal.set(el, b); el.style.filter = b > 0 ? `blur(${b}px)` : '';
    });
  }


  // ---------- 纸面板盖上来 ----------
  const introInner = $('#introInner');
  function updateCover() {
    const e = S.exit;
    if (e >= 1) { if (introInner.style.filter) { introInner.style.filter = ''; introInner.style.opacity = ''; } return; }
    const b = (1 - e) * 14;
    introInner.style.filter = LOW || S.tier === 'mid' ? '' : `blur(${b.toFixed(2)}px)`;
    introInner.style.opacity = String(lerp(0.15, 1, E.expoOut(e)));
  }

  // ---------- 演示带 ----------
  const reel = $('#reel'), panel = $('#reelPanel'), rowsBox = $('#reelRows'), cta = $('.reel__cta'), glow = $('#reelGlow');
  const mqs = $$('.mq').map((el) => ({ el, dir: +el.dataset.dir, x: 0 }));
  // 演示带里的数字：进入画面时从 0 跳到目标值；离开到下方后复位，下次再跳
  const nums = $$('.mq.cn b').filter((b) => /^\d+$/.test(b.textContent.trim())).map((b) => ({ b, to: +b.textContent.trim() }));
  let counted = false;
  if (!LOW) nums.forEach((n) => (n.b.textContent = '0'));
  function countUp() { counted = true; nums.forEach((n) => tween(1400, E.expoOut, (t) => (n.b.textContent = String(Math.round(n.to * t))))); }
  function updateReel(dt) {
    const rect = reel.getBoundingClientRect();
    if (counted && rect.top > S.vh) { counted = false; nums.forEach((n) => (n.b.textContent = '0')); }
    if (rect.bottom < -S.vh || rect.top > S.vh) return;
    const q = clamp(-rect.top / (reel.offsetHeight - S.vh), 0, 1);
    if (!counted && !LOW && rect.top < S.vh * 0.3) countUp();
    const eIn = E.p4InOut(clamp(q / 0.28, 0, 1));
    const eOut = E.p4InOut(clamp((q - 0.6) / 0.36, 0, 1));
    let t = lerp(S.vh * 0.12, 0, eIn), l = lerp(S.vw * 0.06, 0, eIn), r = l, b = t, rad = lerp(24, 0, eIn);
    if (eOut > 0) {
      // 目标 = 演示带结束那一刻第一张卡片所在的位置（当前位置再往上挪剩余滚动距离）
      const cr = medias[0].getBoundingClientRect(), rest = rect.bottom - S.vh;
      const ct = cr.top - rest, cb = S.vh - (cr.bottom - rest);
      t = lerp(t, ct, eOut); l = lerp(l, cr.left, eOut); r = lerp(r, S.vw - cr.right, eOut); b = lerp(b, cb, eOut); rad = lerp(rad, 14, eOut);
    }
    panel.style.clipPath = `inset(${t.toFixed(1)}px ${r.toFixed(1)}px ${b.toFixed(1)}px ${l.toFixed(1)}px round ${rad.toFixed(1)}px)`;
    const fadeTxt = 1 - clamp((q - 0.6) / 0.16, 0, 1);
    rowsBox.style.opacity = cta.style.opacity = String(fadeTxt);
    panel.style.opacity = String(1 - clamp((q - 0.8) / 0.18, 0, 1));
    panel.style.pointerEvents = q > 0.85 ? 'none' : '';
    glow.style.transform = `translate3d(${(Math.sin(S.time * 0.25) * 4).toFixed(2)}%,${((1 - q) * 22 - 6).toFixed(2)}%,0) scale(${(1 + q * 0.25).toFixed(3)})`;
    const boost = LOW ? 0 : Math.min(30, Math.abs(S.vy) * 1.2);
    mqs.forEach((m) => {
      const w = m.el.firstElementChild.offsetWidth || 1;
      m.x = (((m.x + (LOW ? 0 : 38 + boost * 40) * dt * m.dir) % w) + w) % w;
      m.el.style.transform = `translate3d(${(-m.x).toFixed(1)}px,0,0) skewX(${(LOW ? 0 : clamp(S.vy * 0.25, -8, 8)).toFixed(2)}deg)`;
    });
  }

  // ---------- 视频浮层 ----------
  const vbox = $('#video'), vel = $('#videoEl');
  const openVideo = () => { vbox.classList.add('open'); vbox.setAttribute('aria-hidden', 'false'); vel.play().catch(() => {}); $('#videoClose').focus(); };
  const closeVideo = () => { vbox.classList.remove('open'); vbox.setAttribute('aria-hidden', 'true'); vel.pause(); };
  $('#playBtn').addEventListener('click', openVideo);
  $('#videoClose').addEventListener('click', closeVideo);
  vbox.addEventListener('click', (e) => { if (e.target === vbox) closeVideo(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeVideo(); closeMenu(); } });

  // ---------- 导航 ----------
  const nav = $('#nav'), menu = $('#menu'), moreBtn = $('#moreBtn');
  const closeMenu = () => { menu.classList.remove('open'); moreBtn.setAttribute('aria-expanded', 'false'); };
  moreBtn.addEventListener('click', (e) => { e.stopPropagation(); const o = !menu.classList.contains('open'); menu.classList.toggle('open', o); moreBtn.setAttribute('aria-expanded', String(o)); });
  document.addEventListener('click', (e) => { if (!menu.contains(e.target)) closeMenu(); });
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) closeMenu(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('open')) { closeMenu(); moreBtn.focus(); } });
  let navY = 0;
  function updateNav() {
    const past = $('#intro').getBoundingClientRect().top <= 40;
    nav.classList.toggle('solid', past);
    const y = S.sy;
    if (past && Math.abs(y - navY) > 6) { nav.classList.toggle('hide', y > navY && !menu.classList.contains('open')); navY = y; }
    if (!past) { nav.classList.remove('hide'); navY = y; }
  }

  // ---------- 光标胶囊 ----------
  const cur = $('.cursor'), pill = $('.cursor__pill');
  const C = { x: -100, y: -100, tx: -100, ty: -100, label: '' };
  if (FINE) root.classList.add('has-cursor');
  function setLabel(target) {
    const host = target && target.closest && target.closest('[data-cursor]');
    const label = host ? host.dataset.cursor : '';
    if (label !== C.label) { C.label = label; cur.classList.toggle('label', !!label); if (label) pill.textContent = label; }
  }
  addEventListener('pointermove', (e) => {
    C.tx = e.clientX; C.ty = e.clientY;
    S.mx = (e.clientX / S.vw) * 2 - 1; S.my = (e.clientY / S.vh) * 2 - 1;
    setLabel(e.target);
  }, { passive: true });
  let labelQueued = false;
  addEventListener('scroll', () => {
    if (!FINE || labelQueued) return;
    labelQueued = true;
    requestAnimationFrame(() => { labelQueued = false; setLabel(document.elementFromPoint(C.tx, C.ty)); });
  }, { passive: true });
  function updateCursor(dt) {
    const k = 1 - Math.pow(0.000004, dt);
    C.x = lerp(C.x, C.tx, k); C.y = lerp(C.y, C.ty, k);
    cur.style.transform = `translate3d(${C.x}px,${C.y}px,0)`;
  }

  // ---------- 小月亮彩蛋 ----------
  const intro = $('#intro'), moon = $('#moon'), feed = $('.intro__feed');
  const B = { x: S.vw / 2, y: S.vh / 2, vx: 0, vy: 0, n: 0, s: 1 };
  intro.addEventListener('click', (e) => {
    if (e.target.closest('a,button')) return;
    B.n++; $('#feedCount').textContent = `已喂 ${B.n} 颗`;
    if (LOW) return;
    for (let i = 0; i < 10; i++) {
      const c = document.createElement('i'); c.className = 'crumb'; document.body.appendChild(c);
      const a = (i / 10) * Math.PI * 2, d = 40 + Math.random() * 50, x0 = e.clientX, y0 = e.clientY, x1 = x0 + Math.cos(a) * d, y1 = y0 + Math.sin(a) * d;
      tween(420, E.expoOut, (t) => { c.style.transform = `translate(${lerp(x0, x1, t)}px,${lerp(y0, y1, t)}px)`; })
        .then(() => tween(380, (t) => t * t, (t) => { c.style.transform = `translate(${lerp(x1, B.x, t)}px,${lerp(y1, B.y, t)}px) scale(${1 - t * 0.7})`; }))
        .then(() => c.remove());
    }
    setTimeout(() => tween(700, E.elastic, (t) => { B.s = 1 + (1 - t) * 0.6; }), 760);
  });
  function updateMoon(dt) {
    const r = intro.getBoundingClientRect();
    const inside = S.exit > 0.95 && r.top < S.vh * 0.5 && r.bottom > S.vh * 0.45;
    moon.classList.toggle('on', inside);
    if (!inside) return;
    let tx, ty;
    if (FINE && C.ty > r.top && C.ty < r.bottom) { tx = C.tx + 36; ty = C.ty + 28; }
    else { const f = feed.getBoundingClientRect(); tx = f.left + f.width / 2 + Math.cos(S.time * 1.1) * 110; ty = f.top - 34 + Math.sin(S.time * 2.2) * 12; }
    const n = dt * 60;
    B.vx += (tx - B.x) * 0.045 * n; B.vy += (ty - B.y) * 0.045 * n;
    B.vx *= Math.pow(0.84, n); B.vy *= Math.pow(0.84, n);
    B.x += B.vx * n; B.y += B.vy * n;
    const sp = Math.min(0.3, Math.hypot(B.vx, B.vy) * 0.01), ang = Math.atan2(B.vy, B.vx);
    moon.style.transform = `translate3d(${B.x.toFixed(1)}px,${B.y.toFixed(1)}px,0) rotate(${ang}rad) scale(${(B.s * (1 + sp)).toFixed(3)},${(B.s * (1 - sp * 0.6)).toFixed(3)}) rotate(${-ang}rad)`;
  }

  // ---------- 作品总表悬停预览 ----------
  const peek = $('#peek');
  const P = { x: 0, y: 0, idx: -1, rot: 0 };
  if (FINE) $$('.row').forEach((row) => {
    row.addEventListener('pointerenter', () => {
      const w = WORKS[+row.dataset.i];
      const fi = FEATURED.indexOf(w);
      const src = w.cover || (fi >= 0 ? sources[fi].toDataURL('image/jpeg', 0.7) : '');
      if (!src) return;
      P.idx = +row.dataset.i; peek.style.backgroundImage = `url(${src})`; peek.classList.add('on');
    });
    row.addEventListener('pointerleave', () => { P.idx = -1; peek.classList.remove('on'); });
  });
  function updatePeek() {
    if (P.idx < 0) return;
    const nx = lerp(P.x, C.tx + 24, 0.14), ny = lerp(P.y, C.ty - 96, 0.14);
    P.rot = lerp(P.rot, clamp((nx - P.x) * 0.4, -10, 10), 0.2);
    P.x = nx; P.y = ny;
    peek.style.transform = `translate3d(${P.x}px,${P.y}px,0) rotate(${P.rot}deg)`;
  }

  // ---------- 底部按钮 ----------
  $('#copyMail').addEventListener('click', () => {
    const mail = $('#mailText').textContent, st = $('#copyState');
    const done = (ok) => { st.textContent = ok ? '已复制' : '已选中，按 ⌘C'; setTimeout(() => (st.textContent = '复制'), 1800); };
    const sel = () => { const rg = document.createRange(); rg.selectNodeContents($('#mailText')); const s = getSelection(); s.removeAllRanges(); s.addRange(rg); };
    try { navigator.clipboard.writeText(mail).then(() => done(true), () => { sel(); done(false); }); } catch (e) { sel(); done(false); }
  });
  // 回到地球：跃迁 → 白闪 → 切回开场太阳系 → 镜头从远处推进 → 自动落到地球（作品）
  const flash = $('#flash');
  let homing = false;
  // 图片来源：小按钮点开一张卡片
  const creditBtn = $('#creditBtn'), credits = $('#credits');
  const setCredits = (o) => { credits.classList.toggle('open', o); creditBtn.setAttribute('aria-expanded', String(o)); };
  creditBtn.addEventListener('click', (e) => { e.stopPropagation(); setCredits(!credits.classList.contains('open')); });
  document.addEventListener('click', (e) => { if (!credits.contains(e.target)) setCredits(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') setCredits(false); });
  // 回到太阳系：同一套跃迁 + 白闪，但停在开场全景，不再自动落到地球
  async function goHome(landOnEarth) {
    if (LOW) { scrollTo(0, 0); return; }
    if (homing) return; homing = true;
    tween(650, (t) => t * t, (t) => { S.warpBoost = t; flash.style.opacity = String(Math.max(0, (t - 0.45) / 0.55)); });
    await wait(660);
    scrollTo(0, 0); S.sys = 0; S.vy = 0; S.intro = 0; prevY = 0;
    tween(2200, E.expoOut, (t) => (S.intro = t));
    tween(900, E.expoOut, (t) => { flash.style.opacity = String(1 - t); S.warpBoost = 1 - t; });
    if (landOnEarth) { await wait(1500); scrollTo({ top: $('#hero').offsetTop + S.vh, behavior: 'smooth' }); }
    else await wait(900);
    homing = false;
  }
  // 点首屏彗星：跃迁 + 白闪 → 落到尾页「等你来信」，邮箱按钮亮一下
  CW.world.onComet = async () => {
    if (homing) return; homing = true;
    const toFoot = () => { scrollTo(0, document.documentElement.scrollHeight); S.vy = 0; prevY = scrollY; };
    if (LOW) { toFoot(); homing = false; return; }
    tween(650, (t) => t * t, (t) => { S.warpBoost = t; flash.style.opacity = String(Math.max(0, (t - 0.45) / 0.55)); });
    await wait(660);
    // 尾页文字复位，落地后重新升起
    footShown = false; footRv.forEach((el) => el.classList.add('wait')); footStag.forEach((el) => el.classList.remove('in'));
    toFoot();
    tween(900, E.expoOut, (t) => { flash.style.opacity = String(1 - t); S.warpBoost = 1 - t; });
    await wait(650);
    await courier($('#copyMail'));
    homing = false;
  };
  // 信使彗星：从左上角飞进银河，拖着青绿色的尾巴减速落到邮箱按钮上，溅起火花，按钮亮起并提示可以复制
  const cv = document.createElement('canvas'); cv.className = 'courier'; document.body.appendChild(cv);
  const cx = cv.getContext('2d');
  function courier(btn) {
    return new Promise((done) => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = S.vw * dpr; cv.height = S.vh * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const p0 = { x: -60, y: S.vh * 0.12 }, dur = 1350, t0 = performance.now();
      const parts = [], sparks = []; let landed = false, endT = 0;
      const bez = (a, c, b, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;
      function frame(now) {
        const r = btn.getBoundingClientRect(), p2 = { x: r.left + 26, y: r.top + r.height / 2 };
        const p1 = { x: S.vw * 0.62, y: S.vh * 0.05 };
        const k = Math.min(1, (now - t0) / dur), t = 1 - Math.pow(1 - k, 3);
        const hx = bez(p0.x, p1.x, p2.x, t), hy = bez(p0.y, p1.y, p2.y, t);
        cx.clearRect(0, 0, S.vw, S.vh); cx.globalCompositeOperation = 'lighter';
        if (!landed) {
          for (let i = 0; i < 6; i++) parts.push({ x: hx, y: hy, vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5, a: 1, s: 1 + Math.random() * 2.2 });
          if (k >= 1) {
            landed = true; endT = now;
            for (let i = 0; i < 46; i++) { const ang = Math.random() * 6.283, v = 1.5 + Math.random() * 5; sparks.push({ x: p2.x, y: p2.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, a: 1, s: 1 + Math.random() * 1.8 }); }
            btn.classList.remove('ping'); void btn.offsetWidth; btn.classList.add('ping', 'lit');
            btn.dataset.tip = '信使已送到 · 点一下复制邮箱';
            setTimeout(() => { btn.classList.remove('lit'); delete btn.dataset.tip; }, 4200);
          }
        }
        parts.forEach((q) => { q.x += q.vx; q.y += q.vy; q.a *= 0.94; });
        while (parts.length && parts[0].a < 0.02) parts.shift();
        parts.forEach((q) => { cx.fillStyle = `rgba(150,235,215,${(q.a * 0.55).toFixed(3)})`; cx.beginPath(); cx.arc(q.x, q.y, q.s * q.a + 0.4, 0, 6.283); cx.fill(); });
        sparks.forEach((q) => { q.x += q.vx; q.y += q.vy; q.vx *= 0.93; q.vy = q.vy * 0.93 + 0.06; q.a *= 0.955; cx.fillStyle = `rgba(255,${200 + Math.round(40 * q.a)},150,${q.a.toFixed(3)})`; cx.beginPath(); cx.arc(q.x, q.y, q.s, 0, 6.283); cx.fill(); });
        if (landed) {
          const e = Math.min(1, (now - endT) / 700);
          cx.strokeStyle = `rgba(170,240,220,${(1 - e) * 0.8})`; cx.lineWidth = 2 * (1 - e) + 0.5;
          cx.beginPath(); cx.arc(p2.x, p2.y, 8 + e * 120, 0, 6.283); cx.stroke();
          const g = cx.createRadialGradient(p2.x, p2.y, 0, p2.x, p2.y, 60); g.addColorStop(0, `rgba(230,255,245,${(1 - e) * 0.9})`); g.addColorStop(1, 'rgba(120,220,200,0)');
          cx.fillStyle = g; cx.beginPath(); cx.arc(p2.x, p2.y, 60, 0, 6.283); cx.fill();
        } else {
          const g = cx.createRadialGradient(hx, hy, 0, hx, hy, 26); g.addColorStop(0, 'rgba(240,255,250,1)'); g.addColorStop(0.25, 'rgba(160,240,220,.55)'); g.addColorStop(1, 'rgba(80,200,180,0)');
          cx.fillStyle = g; cx.beginPath(); cx.arc(hx, hy, 26, 0, 6.283); cx.fill();
        }
        if (landed && now - endT > 1100 && !parts.length) { cx.clearRect(0, 0, S.vw, S.vh); done(); return; }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }
  $('#toTop').addEventListener('click', () => goHome(true));
  $('#toSun').addEventListener('click', () => goHome(false));

  // ---------- 作品卡片：原地放大成案例页头图 ----------
  const caseEl = $('#case'), caseImg = $('#caseImg');
  let caseFrom = null, caseFly = null;
  function coverOf(i) { const s = sources[i]; return s.src || s.toDataURL('image/jpeg', 0.85); }
  function flyBox(el, r, rad) { el.style.left = `${r.left}px`; el.style.top = `${r.top}px`; el.style.width = `${r.width}px`; el.style.height = `${r.height}px`; el.style.borderRadius = `${rad}px`; }
  async function openCase(i) {
    const w = FEATURED[i], from = medias[i].getBoundingClientRect(); caseFrom = i;
    $('#caseMeta').textContent = `${pad(i + 1)} · ${w.c} · ${w.y}`; $('#caseTitle').textContent = `${w.t}：${w.s}`; $('#caseDesc').textContent = w.d;
    const link = $('#caseLink'); if (w.l) { link.href = href(w.l); link.hidden = false; } else link.hidden = true;
    caseImg.style.backgroundImage = `url(${coverOf(i)})`;
    caseEl.scrollTop = 0; caseEl.setAttribute('aria-hidden', 'false'); document.body.classList.add('locked');
    if (LOW) { caseEl.classList.add('open', 'shown'); return; }
    caseFly = document.createElement('div'); caseFly.className = 'case__fly'; caseFly.style.backgroundImage = caseImg.style.backgroundImage; document.body.appendChild(caseFly);
    const to = { left: 0, top: 0, width: S.vw, height: caseImg.offsetHeight || S.vh * 0.62 };
    caseImg.style.visibility = 'hidden';
    caseEl.classList.add('open');
    await tween(900, E.p4InOut, (t) => flyBox(caseFly, { left: lerp(from.left, to.left, t), top: lerp(from.top, to.top, t), width: lerp(from.width, to.width, t), height: lerp(from.height, to.height, t) }, 14 * (1 - t)));
    caseImg.style.visibility = ''; caseFly.remove(); caseFly = null;
    caseEl.classList.add('shown'); $('#caseClose').focus();
  }
  async function closeCase() {
    if (caseFrom === null || !caseEl.classList.contains('open')) return;
    const i = caseFrom; caseFrom = null;
    caseEl.classList.remove('shown'); caseEl.setAttribute('aria-hidden', 'true');
    if (LOW) { caseEl.classList.remove('open'); document.body.classList.remove('locked'); return; }
    const imgR = caseImg.getBoundingClientRect(), to = medias[i].getBoundingClientRect();
    caseFly = document.createElement('div'); caseFly.className = 'case__fly'; caseFly.style.backgroundImage = caseImg.style.backgroundImage; document.body.appendChild(caseFly);
    flyBox(caseFly, imgR, 0); caseImg.style.visibility = 'hidden';
    caseEl.classList.remove('open');
    await tween(800, E.p4InOut, (t) => flyBox(caseFly, { left: lerp(imgR.left, to.left, t), top: lerp(imgR.top, to.top, t), width: lerp(imgR.width, to.width, t), height: lerp(imgR.height, to.height, t) }, 14 * t));
    caseFly.remove(); caseFly = null; caseImg.style.visibility = ''; document.body.classList.remove('locked');
  }
  $('#caseClose').addEventListener('click', closeCase);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCase(); });

  // ---------- 磁吸按钮 ----------
  const mags = $$('.pill, .go, .foot__links > *, .skip, .nav__more, .case__close');
  mags.forEach((m) => m.classList.add('mag'));
  function updateMagnet() {
    mags.forEach((m) => {
      const r = m.getBoundingClientRect();
      if (r.bottom < 0 || r.top > S.vh || !r.width) return;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, dx = C.tx - cx, dy = C.ty - cy;
      const near = Math.abs(dx) < r.width / 2 + 40 && Math.abs(dy) < r.height / 2 + 30;
      const v = near ? `${(dx * 0.28).toFixed(1)}px ${(dy * 0.35).toFixed(1)}px` : '0px 0px';
      if (m.style.translate !== v) m.style.translate = v;
    });
  }

  // ---------- 标志随滚动进度点亮 ----------
  const navStars = $$('#nav .lg-stars circle'), navGold = $('#nav .lg-gold');
  let lastLit = -1;
  function updateLogo() {
    const p = scrollY / Math.max(1, document.documentElement.scrollHeight - S.vh);
    const lit = Math.min(navStars.length, Math.floor(p * (navStars.length + 0.5)) + 1);
    const gold = p > 0.97;
    const key = lit * 2 + (gold ? 1 : 0);
    if (key === lastLit) return; lastLit = key;
    navStars.forEach((c, i) => c.classList.toggle('on', i < lit));
    navGold.classList.toggle('on', gold);
  }

  // ---------- 手机重力感应：倾斜手机，太阳系视角跟着转 ----------
  const gyroBtn = $('#gyroBtn');
  let gyroOn = false;
  function onTilt(e) {
    if (e.gamma == null) return;
    gyroOn = true;
    S.mx = clamp(e.gamma / 30, -1, 1); S.my = clamp((e.beta - 45) / 30, -1, 1);
  }
  if (!FINE && !LOW && 'DeviceOrientationEvent' in window) {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      gyroBtn.classList.add('show'); // iPhone 要用户点一下授权
      gyroBtn.addEventListener('click', () => DeviceOrientationEvent.requestPermission().then((r) => {
        if (r === 'granted') { addEventListener('deviceorientation', onTilt); gyroBtn.textContent = '重力感应已开'; setTimeout(() => gyroBtn.classList.remove('show'), 1500); }
        else gyroBtn.textContent = '没有授权';
      }).catch(() => (gyroBtn.textContent = '这里不能开启')));
    } else addEventListener('deviceorientation', onTilt);
  }

  // ---------- 章节小标题里的数量跟 data.js 走 ----------
  (function () {
    const D = window.SITE || {}, no = (k) => $(`.chapter__item[data-k="${k}"] .no`);
    const going = (D.trips || []).reduce((n, c) => n + c.items.filter((x) => x.status === '进行中').length, 0);
    const set = (k, re, v) => { const el = no(k); if (el && v) el.textContent = el.textContent.replace(re, v); };
    set(1, /\d+ 个作品/, WORKS.length && `${WORKS.length} 个作品`);
    set(2, /\d+ 条进行中/, going && `${going} 条进行中`);
    set(3, /\d+ 个工具/, (D.tools || []).length && `${D.tools.length} 个工具`);
  })();

  // ---------- 流星：首屏全景和尾页偶尔划过一颗 ----------
  function meteor(box, seed) {
    const el = document.createElement('i'); el.className = 'meteor'; box.appendChild(el);
    const w = box.clientWidth, h = box.clientHeight;
    const x = seed ? seed.x : w * (0.35 + Math.random() * 0.6), y = seed ? seed.y : h * (0.05 + Math.random() * 0.4), a = seed ? seed.a : 150 + Math.random() * 25, len = 220 + Math.random() * 320;
    el.style.width = `${120 + Math.random() * 160}px`; el.style.opacity = '0'; el.style.filter = `drop-shadow(0 0 ${3 + Math.random() * 4}px rgba(170,200,255,.9)) brightness(${0.7 + Math.random() * 0.6})`;
    const rad = (a * Math.PI) / 180, dx = Math.cos(rad) * len, dy = Math.sin(rad) * len;
    const anim = el.animate([
      { transform: `translate(${x}px,${y}px) rotate(${a}deg) scaleX(.2)`, opacity: 0 },
      { opacity: 1, offset: 0.2 },
      { transform: `translate(${x + dx}px,${y + dy}px) rotate(${a}deg) scaleX(1)`, opacity: 0 }
    ], { duration: 800 + Math.random() * 900, delay: seed ? seed.delay : 0, easing: 'cubic-bezier(.25,.6,.35,1)', fill: 'backwards' });
    anim.onfinish = () => el.remove();
  }
  (function loop() {
    setTimeout(() => {
      if (!LOW && document.visibilityState === 'visible') {
        const st = $('#stage'), ft = $('#contact');
        const sr = st.getBoundingClientRect(), fr = ft.getBoundingClientRect();
        const box = S.intro > 0.9 && sr.bottom > 0 && S.exit < 0.5 && (S.sys - $('#hero').offsetTop) / S.vh < 0.6 ? st : fr.top < S.vh * 0.5 && fr.bottom > 0 ? ft : null;
        if (box) {
          if (Math.random() < 0.35) { // 小流星雨：2–3 颗大致平行
            const n = 2 + (Math.random() < 0.5 ? 1 : 0), w = box.clientWidth, h = box.clientHeight, a = 148 + Math.random() * 22;
            const x0 = w * (0.45 + Math.random() * 0.45), y0 = h * (0.05 + Math.random() * 0.3);
            for (let i = 0; i < n; i++) meteor(box, { x: x0 + i * (40 + Math.random() * 60), y: y0 + i * (30 + Math.random() * 50), a: a + (Math.random() - 0.5) * 4, delay: i * (120 + Math.random() * 260) });
          } else meteor(box);
        }
      }
      loop();
    }, 3000 + Math.random() * 3000);
  })();

  // ---------- 主循环 ----------
  let prevY = scrollY, last = performance.now(), labelTick = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    S.time += dt;
    const y = scrollY;
    S.vy = lerp(S.vy, (y - prevY) / Math.max(dt * 60, 0.5), 0.2); prevY = y;
    S.sys = LOW ? y : lerp(S.sys, y, 1 - Math.pow(0.0008, dt));
    S.sy = y;
    const pmx = S.mxs, pmy = S.mys;
    S.mxs = lerp(S.mxs, S.mx, 0.06); S.mys = lerp(S.mys, S.my, 0.06);
    S.mvx = lerp(S.mvx, S.mxs - pmx, 0.3); S.mvy = lerp(S.mvy, S.mys - pmy, 0.3);
    updateWorks(dt);
    CW.world.update(dt);
    updateCover(); updateReel(dt); updateNav(); updateMoon(dt); updateFoot(); updateEdgeBlur(); updateLogo();
    if (FINE && !LOW) updateMagnet();
    if (FINE) { updateCursor(dt); updatePeek(); if ((++labelTick & 7) === 0) setLabel(document.elementFromPoint(C.tx, C.ty)); }
    requestAnimationFrame(frame);
  }
  function resize() { S.vw = innerWidth; S.vh = innerHeight; CW.world.resize(); measure(); }
  addEventListener('resize', resize);

  // ---------- 入场 ----------
  async function enter() {
    const loader = $('#loader'), pct = $('#loaderPct'), h1 = $('#heroCopy h1'), lg = $('#loaderLogo');
    // 星座 CW：星点先散在四周，按加载进度一颗颗飞到位置上
    const ST = [[29, 19.9, 2.5], [15, 19.9, 1.9], [8, 32, 2.8], [15, 44.1, 1.9], [29, 44.1, 2.3], [35, 20, 2.3], [40, 44, 2], [52, 44, 2], [57, 20, 2.6]];
    lg.innerHTML = '<g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" opacity=".45"><polyline pathLength="1" points="29,19.9 15,19.9 8,32 15,44.1 29,44.1"/><polyline pathLength="1" points="35,20 40,44 46,31 52,44 57,20"/></g>' +
      ST.map(([x, y, r]) => { const a = Math.random() * 6.283, d = 60 + Math.random() * 60; return `<circle class="s" cx="${x}" cy="${y}" r="${r + 0.8}" fill="currentColor" style="--x:${(Math.cos(a) * d).toFixed(1)}px;--y:${(Math.sin(a) * d).toFixed(1)}px"/>`; }).join('') +
      '<g class="g"><circle cx="46" cy="31" r="7.5" fill="#ffc04a" opacity=".25"/><path d="M46 23.2 47 30 53.8 31 47 32 46 38.8 45 32 38.2 31 45 30Z" fill="#ffd27a"/><circle cx="46" cy="31" r="4" fill="#ffc04a"/></g>';
    const lgStars = $$('.s', lg);
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    scrollTo(0, 0);
    // <html class="boot">：开场前藏住首屏文字、星球标签和按钮；遮罩完全展开后再一起淡入（.unboot 只在淡入那 0.8 秒加过渡）
    const unboot = () => { root.classList.add('unboot'); root.classList.remove('boot'); setTimeout(() => root.classList.remove('unboot'), 900); };
    if (LOW) { S.clip = { t: 0, r: 0, b: 0, l: 0, rad: 0 }; loader.remove(); nav.classList.remove('pre'); S.intro = 1; unboot(); return; }
    h1.classList.add('wait');
    document.body.classList.add('locked');
    await wait(60);
    loader.classList.add('show');
    let shown = 0, done = false;
    const t0 = performance.now();
    CW.world.ready.then(() => (done = true));
    await new Promise((res) => {
      (function step() {
        const minT = Math.min(1, (performance.now() - t0) / 900);
        const goal = Math.min(minT, done ? 1 : Math.max(CW.world.progress, 0.05) * 0.95);
        shown = lerp(shown, goal, 0.12);
        if (done && minT >= 1 && shown > 0.995) shown = 1;
        pct.textContent = String(Math.round(shown * 100)).padStart(3, '0');
        lgStars.forEach((s, i) => s.classList.toggle('in', shown >= (i + 1) / (lgStars.length + 1)));
        shown >= 1 ? res() : requestAnimationFrame(step);
      })();
    });
    lgStars.forEach((s) => s.classList.add('in'));
    lg.classList.add('done'); pct.style.opacity = '0';
    await wait(720);
    // 星座 CW 变成窗口：太阳系先出现在字母笔画里，再以金星为中心向外扩散，金星铺满屏幕
    const lr = lg.getBoundingClientRect(), base = lr.width;
    const gx = lr.left + (46 / 64) * base, gy = lr.top + (31 / 64) * base;
    const far = Math.hypot(Math.max(gx, S.vw - gx), Math.max(gy, S.vh - gy));
    const endSize = (far / (7.2 / 64)) * 1.15;
    S.mask = { on: true, x: gx, y: gy, size: base };
    S.clip = { t: 0, r: 0, b: 0, l: 0, rad: 0 };
    loader.classList.add('out');
    await wait(460);
    tween(2100, E.expoOut, (t) => (S.intro = t));
    await tween(1150, (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2), (t) => (S.mask.size = base * Math.pow(endSize / base, t)));
    S.mask = { on: false };
    unboot();
    loader.remove();
    nav.classList.remove('pre');
    h1.classList.remove('wait');
    document.body.classList.remove('locked');
  }

  S.clip = LOW ? { t: 0, r: 0, b: 0, l: 0, rad: 0 } : { t: innerHeight / 2, b: innerHeight / 2, l: innerWidth / 2, r: innerWidth / 2, rad: 18 };
  resize();
  requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => {
    sources.forEach((s, i) => { if (!(s instanceof HTMLImageElement)) { drawArt(FEATURED[i], i, s); medias[i].style.backgroundImage = `url(${s.toDataURL('image/jpeg', 0.85)})`; if (texs[i]) texs[i].needsUpdate = true; } });
    measure();
  });
  enter();
})();
