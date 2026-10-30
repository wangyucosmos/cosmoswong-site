/* WebGL 核心：一块固定在页面最底层的画布，按页面上的占位框分区绘制。
   - 首屏：太阳系全景（太阳 + 八大行星绕日公转 + 月球绕地球），可以拖动行星、转动视角、长按加速时间、点太阳放光波；
     往下滑镜头锁定地球放大，再依次飞到火星、木星、土星
   - 尾页：从地球拉远到整个太阳系，再融进旋转的银河系全景（差速旋转 + 星点粒子），标出"我们在这"
   - 背景：NASA 全天星图（提高饱和度、缓慢自转）+ 按恒星温度上色的三层闪烁星点 + 可开关的韦伯星云
   - 其他区域（作品卡片）由 ui.js 通过 CW.gl.addRegion 注册
   素材：行星贴图 Solar System Scope（CC BY 4.0）；星图 NASA/Goddard SVS（Gaia DR2: ESA/Gaia/DPAC）；
   银河系 NASA/JPL-Caltech（PIA10748）；星云 NASA, ESA, CSA, and STScI（韦伯船底座星云，CC BY 4.0）。 */
(function () {
  const CW = (window.CW = window.CW || {});
  const S = (CW.state = CW.state || {
    sy: 0, sys: 0, vy: 0, vh: innerHeight, vw: innerWidth,
    mx: 0, my: 0, mxs: 0, mys: 0, mvx: 0, mvy: 0,
    tier: 'high', time: 0, intro: 0, exit: 0,
    clip: { t: 0, r: 0, b: 0, l: 0, rad: 0 }
  });
  (function () {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = matchMedia('(pointer: coarse)').matches;
    const mem = navigator.deviceMemory || 8;
    S.tier = reduce ? 'low' : (coarse || innerWidth < 760 || mem < 4) ? 'mid' : 'high';
  })();

  const $ = (s) => document.querySelector(s);
  const stage = $('#stage'), hero = $('#hero'), intro = $('#intro'), foot = $('#contact'), here = $('#here');
  const chapterEls = [...document.querySelectorAll('.chapter__item')];
  const dotBtns = [...document.querySelectorAll('#dots button')];
  const heroCopy = $('#heroCopy'), scrim = $('#scrim'), labelsBox = $('#satLabels'), pcard = $('#pcard'), warpHint = $('#warpHint');

  // 行星（轨道和大小是压缩过的艺术比例，公转周期按真实比例再压缩；卡片上的数据是真实值）
  const PLANETS = [
    { key: 'mercury', name: '水星', tex: 'mercury.webp', a: 7.6, r: 0.42, period: 0.24, ph: 0.9, info: ['直径 4,879 km', '公转一圈 88 天'] },
    { key: 'venus', name: '金星', tex: 'venus.webp', a: 10.6, r: 0.9, period: 0.62, ph: 2.7, info: ['直径 12,104 km', '公转一圈 225 天'] },
    { key: 'earth', name: '地球', tag: '作品', k: 1, a: 14.2, r: 1.0, period: 1, ph: 4.25, d: 3.7, dm: 5.6, up: 0.55, info: ['直径 12,742 km', '公转一圈 365 天', '这里放着：13 个作品'] },
    { key: 'mars', name: '火星', tag: '旅行', k: 2, tex: 'mars_1k.webp', hi: 'mars.webp', a: 18.4, r: 0.62, period: 1.88, ph: 5.35, d: 4.6, dm: 6.6, up: 0.15, info: ['直径 6,779 km', '公转一圈 687 天', '这里放着：2 条旅行计划'] },
    { key: 'jupiter', name: '木星', tag: '工具箱', k: 3, tex: 'jupiter_1k.webp', hi: 'jupiter.webp', a: 25.5, r: 2.6, period: 11.9, ph: 1.35, d: 3.5, dm: 5.2, up: 0.12, info: ['直径 139,820 km', '公转一圈 11.9 年', '这里放着：7 个工具'] },
    { key: 'saturn', name: '土星', tag: '知识库', k: 4, tex: 'saturn_1k.webp', hi: 'saturn.webp', a: 33, r: 2.15, period: 29.5, ph: 3.3, d: 5.4, dm: 7.8, up: 0.85, ring: [2.75, 5.1], info: ['直径 116,460 km', '公转一圈 29.5 年', '这里放着：知识库笔记'] },
    { key: 'uranus', name: '天王星', tex: 'uranus.webp', a: 39, r: 1.25, period: 84, ph: 0.35, info: ['直径 50,724 km', '公转一圈 84 年'] },
    { key: 'neptune', name: '海王星', tex: 'neptune.webp', a: 44, r: 1.2, period: 165, ph: 5.95, info: ['直径 49,244 km', '公转一圈 165 年'] }
  ];
  const CHAP = [null, PLANETS[2], PLANETS[3], PLANETS[4], PLANETS[5]];

  let R = null;
  try {
    if (window.THREE) R = new THREE.WebGLRenderer({ canvas: $('#gl'), antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { console.warn('[world] WebGL 不可用', e); R = null; }
  if (!R) document.documentElement.classList.add('no-gl');

  let readyResolve; const ready = new Promise((r) => (readyResolve = r));
  const world = (CW.world = { ok: !!R, ready, progress: 0, onProgress: null, update() {}, resize() {}, chapterTo() {}, setNebula() {} });

  // ---------- 章节 DOM（不依赖 WebGL） ----------
  const labels = PLANETS.map((p) => {
    const el = document.createElement(p.k ? 'button' : 'div');
    el.className = 'sat-label' + (p.k ? ' sat-label--go' : '');
    el.innerHTML = p.tag ? `${p.name}<b>${p.tag}</b>` : p.name;
    if (p.k) { el.type = 'button'; el.setAttribute('aria-label', `飞到${p.name}：${p.tag}`); el.addEventListener('click', () => world.chapterTo(p.k)); }
    labelsBox.appendChild(el);
    return el;
  });
  let lastK = -2;
  function heroU() { return Math.min(4, Math.max(0, (S.sys - hero.offsetTop) / S.vh)); }
  function updateDom(u) {
    const k = Math.round(u), active = Math.abs(u - k) < 0.3 && k >= 1 ? k : -1;
    if (active !== lastK) {
      chapterEls.forEach((el) => el.classList.toggle('on', +el.dataset.k === active));
      scrim.classList.toggle('on', active > 0);
      lastK = active;
    }
    dotBtns.forEach((d, i) => d.classList.toggle('on', i === k));
    if (swipeHint) swipeHint.classList.toggle('on', active > 0 && !swiped);
    heroCopy.style.opacity = String(Math.max(0, 1 - u * 3.2) * S.intro);
    heroCopy.style.transform = `translateY(${(-u * 60).toFixed(1)}px)`;
    stage.style.opacity = String(1 - Math.min(1, S.exit * 1.4));
    stage.style.filter = S.tier === 'high' && S.exit > 0.01 ? `blur(${(S.exit * 8).toFixed(1)}px)` : '';
    return active;
  }
  world.chapterTo = (k) => scrollTo({ top: hero.offsetTop + k * S.vh, behavior: S.tier === 'low' ? 'auto' : 'smooth' });
  dotBtns.forEach((b, i) => b.addEventListener('click', () => world.chapterTo(i)));
  // 手机：在各星球章节里左右滑动换星球（向左 = 下一颗，向右 = 上一颗；在地球往右滑回到太阳系全景）。全景页仍是拖动转视角；电脑不变
  const TOUCH = matchMedia('(hover: none) and (pointer: coarse)').matches;
  let swipe = null, swiped = false, swipeHint = null;
  try { swiped = localStorage.getItem('cw-swiped') === '1'; } catch (e) {}
  if (TOUCH) {
    swipeHint = document.createElement('div'); swipeHint.className = 'swipe-hint'; swipeHint.setAttribute('aria-hidden', 'true');
    swipeHint.innerHTML = '<i>←</i>左右滑动换星球<i>→</i>'; stage.appendChild(swipeHint);
    stage.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) { swipe = null; return; }
      const t = e.touches[0]; swipe = { x: t.clientX, y: t.clientY, t: performance.now(), u: heroU() };
    }, { passive: true });
    stage.addEventListener('touchend', (e) => {
      if (!swipe) return;
      const t = e.changedTouches[0], dx = t.clientX - swipe.x, dy = t.clientY - swipe.y, dt = performance.now() - swipe.t, u = swipe.u;
      swipe = null;
      if (u < 0.6 || dt > 800 || Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      const k = Math.round(u), to = Math.max(0, Math.min(4, k + (dx < 0 ? 1 : -1)));
      if (to === k) return;
      world.chapterTo(to);
      if (!swiped) { swiped = true; try { localStorage.setItem('cw-swiped', '1'); } catch (er) {} }
    }, { passive: true });
  }
  $('#skip').addEventListener('click', () => scrollTo({ top: intro.offsetTop, behavior: S.tier === 'low' ? 'auto' : 'smooth' }));

  if (!R) {
    world.update = () => { updateDom(heroU()); };
    readyResolve();
    return;
  }

  // =====================================================================
  const V3 = THREE.Vector3, UP = new V3(0, 1, 0), ORIGIN = new V3();
  const isWGL2 = R.capabilities.isWebGL2;
  const LOW = S.tier === 'low';
  R.setClearColor(0x000000, 0);
  const regions = [];
  let W = 1, H = 1, PR = 1;
  function setRegion(x, y, w, h) {
    R.setViewport(x, H - y - h, w, h);
    R.setScissor(x, H - y - h, w, h);
    R.setScissorTest(true);
  }
  CW.gl = { R, setRegion, addRegion: (r) => regions.push(r) };
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  // ---------- 贴图 ----------
  const mgrA = new THREE.LoadingManager();
  mgrA.onProgress = (url, n, total) => { world.progress = n / total; world.onProgress && world.onProgress(world.progress); };
  mgrA.onLoad = () => { world.progress = 1; world.onProgress && world.onProgress(1); readyResolve(); };
  mgrA.onError = (url) => console.warn('[world] 贴图加载失败', url);
  setTimeout(readyResolve, 15000);
  const maxAniso = Math.min(8, R.capabilities.getMaxAnisotropy());
  const LA = new THREE.TextureLoader(mgrA);
  const T = {};
  function tex(key, file) { const t = LA.load('/assets/home/tex/' + file); t.anisotropy = maxAniso; T[key] = t; return t; }
  tex('stars', 'starmap_2k.webp'); tex('sun', 'sun.webp');
  tex('day', 'earth_day.webp'); tex('night', 'earth_night.webp'); tex('clouds', 'earth_clouds.webp');
  tex('moon', 'moon.webp'); tex('ring', 'saturn_ring.webp');
  PLANETS.forEach((p) => p.tex && tex(p.key, p.tex));
  const lateHooks = [];
  const LB = new THREE.TextureLoader();
  function lateLoad(k, f) { LB.load('/assets/home/tex/' + f, (t) => { t.anisotropy = maxAniso; T[k] = t; lateHooks.forEach((h) => h(k, t)); }); }
  ready.then(() => {
    PLANETS.filter((p) => p.hi).forEach((p) => lateLoad(p.key, p.hi));
    lateLoad('nebA', 'nebula_a.webp');
    lateLoad('galaxy', 'galaxy.webp');
    if (S.tier === 'high') lateLoad('stars', 'starmap_4k.webp');
  });
  let galaxy4kAsked = false;
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat); blank.needsUpdate = true;

  // ---------- 着色器 ----------
  const VERT = `varying vec2 vUv; varying vec3 vNw; varying vec3 vPw;
    void main(){ vUv=uv; vNw=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.); vPw=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
  const LIN = `vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }`;

  function earthMat() {
    return new THREE.ShaderMaterial({
      uniforms: { uDay: { value: T.day }, uNight: { value: T.night }, uClouds: { value: T.clouds }, uSun: { value: new V3() }, uCloudShift: { value: 0 } },
      vertexShader: VERT,
      fragmentShader: `uniform sampler2D uDay; uniform sampler2D uNight; uniform sampler2D uClouds; uniform vec3 uSun; uniform float uCloudShift;
        varying vec2 vUv; varying vec3 vNw; varying vec3 vPw; ${LIN}
        void main(){
          vec3 N=normalize(vNw); vec3 L=normalize(uSun-vPw); vec3 V=normalize(cameraPosition-vPw);
          float ndl=dot(N,L);
          vec3 day=lin(texture2D(uDay,vUv).rgb); vec3 night=lin(texture2D(uNight,vUv).rgb);
          float cl=texture2D(uClouds,vec2(vUv.x+uCloudShift,vUv.y)).r;
          float dayK=smoothstep(-.12,.24,ndl);
          vec3 col=day*max(ndl,0.)*2.1*(1.-cl*.4);
          col+=night*(1.-dayK)*2.6*(1.-cl*.8);
          col+=vec3(1.,.42,.18)*day*smoothstep(.22,0.,abs(ndl))*.5;
          float fres=pow(1.-max(dot(N,V),0.),3.);
          col+=vec3(.22,.5,1.)*fres*smoothstep(-.3,.5,ndl)*1.3;
          gl_FragColor=vec4(col,1.);
        }`
    });
  }
  function cloudMat() {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uClouds: { value: T.clouds }, uSun: { value: new V3() } },
      vertexShader: VERT,
      fragmentShader: `uniform sampler2D uClouds; uniform vec3 uSun; varying vec2 vUv; varying vec3 vNw; varying vec3 vPw;
        void main(){ vec3 N=normalize(vNw); vec3 L=normalize(uSun-vPw); float ndl=dot(N,L);
          float a=smoothstep(.08,.9,texture2D(uClouds,vUv).r);
          vec3 c=vec3(1.,.98,.95)*max(ndl,0.)*2.2+vec3(1.,.5,.25)*smoothstep(.2,0.,abs(ndl))*.6+vec3(.01,.012,.02);
          gl_FragColor=vec4(c,a*smoothstep(-.3,.1,ndl)*.92); }`
    });
  }
  function atmoMat(color) {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uC: { value: new V3() }, uR: { value: 1 }, uRs: { value: 1.1 }, uSun: { value: new V3() }, uCol: { value: new THREE.Color(color) } },
      vertexShader: VERT,
      fragmentShader: `uniform vec3 uC; uniform float uR; uniform float uRs; uniform vec3 uSun; uniform vec3 uCol; varying vec3 vPw;
        void main(){
          vec3 ro=cameraPosition; vec3 rd=normalize(vPw-ro);
          vec3 oc=uC-ro; float t=dot(oc,rd); vec3 p=ro+rd*t; float d=length(p-uC);
          float g = d>uR ? pow(clamp(1.-(d-uR)/(uRs-uR),0.,1.),3.) : pow(d/uR,12.)*.8;
          vec3 L=normalize(uSun-uC); vec3 n=normalize(p-uC);
          float lit=smoothstep(-.35,.45,dot(n,L));
          float fwd=pow(max(dot(rd,L),0.),8.)*3.;
          gl_FragColor=vec4(uCol*g*(lit*1.5+fwd),1.);
        }`
    });
  }
  function planetMat(key, rim, rimCol) {
    const m = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: T[key] || blank }, uSun: { value: new V3() }, uRim: { value: rim }, uRimC: { value: new THREE.Color(rimCol) }, uAmb: { value: 0.003 },
        uRingC: { value: new V3() }, uRingN: { value: new V3(0, 1, 0) }, uRingIn: { value: 0 }, uRingOut: { value: 0 } },
      vertexShader: VERT,
      fragmentShader: `uniform sampler2D uMap; uniform vec3 uSun; uniform float uRim; uniform vec3 uRimC; uniform float uAmb;
        uniform vec3 uRingC; uniform vec3 uRingN; uniform float uRingIn; uniform float uRingOut;
        varying vec2 vUv; varying vec3 vNw; varying vec3 vPw; ${LIN}
        void main(){
          vec3 N=normalize(vNw); vec3 L=normalize(uSun-vPw); vec3 V=normalize(cameraPosition-vPw);
          float ndl=dot(N,L);
          vec3 a=lin(texture2D(uMap,vUv).rgb);
          float sh=1.;
          if(uRingOut>0.){ float den=dot(L,uRingN); if(abs(den)>1e-4){ float s=dot(uRingC-vPw,uRingN)/den; if(s>0.){ float r=length(vPw+L*s-uRingC); sh=1.-.55*smoothstep(uRingIn,uRingIn+.15,r)*(1.-smoothstep(uRingOut-.15,uRingOut,r)); } } }
          vec3 col=a*max(ndl,0.)*2.4*sh+a*uAmb;
          col+=uRimC*pow(1.-max(dot(N,V),0.),3.)*smoothstep(-.2,.5,ndl)*uRim;
          gl_FragColor=vec4(col,1.);
        }`
    });
    lateHooks.push((k, t) => { if (k === key) m.uniforms.uMap.value = t; });
    return m;
  }
  function ringMat() {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uRing: { value: T.ring }, uSun: { value: new V3() }, uC: { value: new V3() }, uR: { value: 1 }, uIn: { value: 1 }, uOut: { value: 2 } },
      vertexShader: `varying float vRad; varying vec3 vPw; void main(){ vRad=length(position.xy); vec4 w=modelMatrix*vec4(position,1.); vPw=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform sampler2D uRing; uniform vec3 uSun; uniform vec3 uC; uniform float uR; uniform float uIn; uniform float uOut; varying float vRad; varying vec3 vPw;
        void main(){ float t=(vRad-uIn)/(uOut-uIn); vec4 tx=texture2D(uRing,vec2(t,.5));
          vec3 L=normalize(uSun-vPw); vec3 oc=uC-vPw; float b=dot(oc,L); float c=dot(oc,oc)-uR*uR;
          float sh=(b>0. && b*b-c>0.)?.06:1.;
          gl_FragColor=vec4(pow(tx.rgb,vec3(2.2))*1.9*sh, tx.a*.95); }`
    });
  }

  // ---------- 天空 ----------
  const skyGeo = new THREE.SphereGeometry(1500, 64, 32);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uMap: { value: T.stars }, uInt: { value: 0.42 }, uSat: { value: 1.65 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform sampler2D uMap; uniform float uInt; uniform float uSat; varying vec2 vUv;
      void main(){ vec3 c=pow(texture2D(uMap,vec2(1.-vUv.x,vUv.y)).rgb,vec3(2.2)); float l=dot(c,vec3(.2126,.7152,.0722));
        c=max(mix(vec3(l),c,uSat),0.); gl_FragColor=vec4(c*uInt,1.); }`
  });
  lateHooks.push((k, t) => { if (k === 'stars') skyMat.uniforms.uMap.value = t; });
  // 星点：按恒星温度上色（蓝 / 蓝白 / 白 / 黄 / 橙 / 红），三层远近
  const STAR_COLS = [[0.62, 0.74, 1.3, 0.1], [0.82, 0.88, 1.15, 0.2], [1, 1, 1, 0.25], [1.1, 0.95, 0.72, 0.24], [1.15, 0.78, 0.5, 0.13], [1.15, 0.56, 0.42, 0.08]];
  function starColor() { let r = Math.random(); for (const c of STAR_COLS) { if ((r -= c[3]) <= 0) return c; } return STAR_COLS[2]; }
  function makeStars(n, shells) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), size = new Float32Array(n), ph = new Float32Array(n), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const sh = shells[Math.random() < 0.2 ? 0 : Math.random() < 0.45 ? 1 : 2] || shells[0];
      const u = Math.random() * 2 - 1, th = Math.random() * 6.283, r = sh[0] + Math.random() * (sh[1] - sh[0]), s = Math.sqrt(1 - u * u);
      pos.set([Math.cos(th) * s * r, u * r, Math.sin(th) * s * r], i * 3);
      size[i] = (0.7 + Math.pow(Math.random(), 5) * 3.2) * sh[2]; ph[i] = Math.random() * 100;
      const c = starColor(); col.set([c[0], c[1], c[2]], i * 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    return g;
  }
  const starMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uInt: { value: 1 } },
    vertexShader: `attribute float aSize; attribute float aPh; attribute vec3 aCol; uniform float uTime; uniform float uPx; varying float vA; varying vec3 vTint;
      void main(){
        float fl=step(.45,fract(aPh*.731));
        float tw=.5+.5*sin(uTime*(.7+fract(aPh*.37)*3.)+aPh);
        vA=mix(.78+.22*tw, .08+.92*pow(tw,3.), fl);
        vTint=aCol;
        gl_PointSize=aSize*uPx*1.7*(.85+.35*tw*fl);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float uInt; varying float vA; varying vec3 vTint;
      void main(){ vec2 c=gl_PointCoord-.5; float d=length(c);
        float core=smoothstep(.5,.0,d); float spike=max(0.,1.-abs(c.x)*16.)*max(0.,1.-abs(c.y)*2.2)+max(0.,1.-abs(c.y)*16.)*max(0.,1.-abs(c.x)*2.2);
        gl_FragColor=vec4(vTint*(core+spike*.35)*vA*1.5*uInt,1.); }`
  });
  const NSTAR = S.tier === 'high' ? 3200 : 1400;
  const starGeo = makeStars(NSTAR, [[280, 420, 1.25], [600, 850, 1], [900, 1300, 0.85]]);
  function canvasTex(draw, size = 256) { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); return new THREE.CanvasTexture(c); }
  const GLOW = canvasTex((g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,240,215,.75)'); gr.addColorStop(0.35, 'rgba(255,190,120,.22)'); gr.addColorStop(1, 'rgba(255,160,80,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s); });
  const RING = canvasTex((g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,200,120,0)'); gr.addColorStop(0.75, 'rgba(255,220,160,.9)'); gr.addColorStop(0.85, 'rgba(255,170,90,.35)'); gr.addColorStop(1, 'rgba(255,140,60,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s); });
  const SMUDGE = canvasTex((g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,245,230,.9)'); gr.addColorStop(0.25, 'rgba(200,210,255,.35)'); gr.addColorStop(1, 'rgba(160,170,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s); }, 128);
  function sprite(map, size, color) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sp.scale.set(size, size, 1); return sp;
  }

  // ---------- 入场遮罩：星座 CW 形状（粗笔画 + 星点 + 金星），镜头朝金星放大时整个字形向外扩散 ----------
  const MASK = canvasTex((g, s) => {
    const k = s / 64; g.clearRect(0, 0, s, s); g.fillStyle = g.strokeStyle = '#fff'; g.lineCap = g.lineJoin = 'round'; g.lineWidth = 4.6 * k;
    [[[29, 19.9], [15, 19.9], [8, 32], [15, 44.1], [29, 44.1]], [[35, 20], [40, 44], [46, 31], [52, 44], [57, 20]]].forEach((pl) => { g.beginPath(); pl.forEach(([x, y], i) => (i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k))); g.stroke(); });
    [[29, 19.9, 2.5], [15, 19.9, 1.9], [8, 32, 2.8], [15, 44.1, 1.9], [29, 44.1, 2.3], [35, 20, 2.3], [40, 44, 2], [52, 44, 2], [57, 20, 2.6]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x * k, y * k, (r + 2.4) * k, 0, 7); g.fill(); });
    g.beginPath(); g.arc(46 * k, 31 * k, 7.2 * k, 0, 7); g.fill();
  }, 1024);
  MASK.flipY = true;

  // ---------- 后期：拖影 / 退场模糊 / 两画面交叉 / 太阳光波折射 / 圆角遮罩 / 星座遮罩 ----------
  function makePost() {
    const opt = { type: isWGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: true };
    const rt = new THREE.WebGLRenderTarget(4, 4, opt), rtB = new THREE.WebGLRenderTarget(4, 4, opt);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: { tDiffuse: { value: rt.texture }, tB: { value: rtB.texture }, uMix: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uSize: { value: new THREE.Vector2(1, 1) }, uVel: { value: new THREE.Vector2() },
        uTime: { value: 0 }, uExit: { value: 0 }, uClip: { value: new THREE.Vector4() }, uRad: { value: 0 }, uExpo: { value: 1 }, uGrain: { value: 0.045 }, uVig: { value: 0.8 },
        uShockC: { value: new THREE.Vector2(0.5, 0.5) }, uShockT: { value: 0 }, uWarp: { value: 0 },
        uMask: { value: MASK }, uMaskOn: { value: 0 }, uMaskPivot: { value: new THREE.Vector2() }, uMaskPx: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
      fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tB; uniform float uMix; uniform vec2 uRes; uniform vec2 uSize; uniform vec2 uVel; uniform float uTime; uniform float uExit;
        uniform vec4 uClip; uniform float uRad; uniform float uExpo; uniform float uGrain; uniform float uVig; uniform vec2 uShockC; uniform float uShockT; uniform float uWarp; uniform sampler2D uMask; uniform float uMaskOn; uniform vec2 uMaskPivot; uniform float uMaskPx; varying vec2 vUv;
        float rnd(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
        vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
        float rbox(vec2 p, vec2 b, float r){ vec2 q=abs(p)-b+r; return length(max(q,0.))+min(max(q.x,q.y),0.)-r; }
        void main(){
          vec2 c=vUv-.5; float e=dot(c,c)*2.2; vec2 v=uVel; float m=length(v);
          vec2 asp=vec2(uRes.y/uRes.x,1.);
          vec2 uv=.5+c*(1.-uExit*.07);
          uv+=c*e*m*1.6+v*(.35+e)*.22;
          if(uShockT>0.){ vec2 d=(vUv-uShockC)/asp; float dist=length(d); float ring=uShockT*1.1; float k=smoothstep(.07,0.,abs(dist-ring))*(1.-uShockT);
            uv-=normalize(d+1e-5)*asp*k*.03; }
          float r0=rnd(vUv*uRes+uTime);
          float br=uExit*.02;
          vec3 acc=vec3(0.);
          for(int i=0;i<14;i++){
            float fi=(float(i)+r0)/14.; float a=fi*37.7+r0*6.283;
            vec2 o=v*(fi-.5)*(.35+e)+vec2(cos(a),sin(a))*br*sqrt(fi)*asp;
            vec2 uz=mix(uv,vec2(.5),fi*uWarp*.16); // 跃迁：沿着从画面中心向外的方向拉成光线
            acc.r+=texture2D(tDiffuse,uz+o*1.12+c*m*.012+c*uWarp*.004).r;
            acc.g+=texture2D(tDiffuse,uz+o).g;
            acc.b+=texture2D(tDiffuse,uz+o*.88-c*m*.012-c*uWarp*.004).b;
          }
          vec3 hdr=acc/14.*(1.+uWarp*.35);
          if(uMix>0.) hdr=mix(hdr,texture2D(tB,vUv).rgb,uMix);
          vec3 col=pow(aces(hdr*uExpo),vec3(1./2.2));
          col*=mix(1.,smoothstep(1.25,.2,length(c)*1.3),uVig);
          col=mix(col,vec3(dot(col,vec3(.299,.587,.114))),uExit*.35)*(1.-uExit*.5);
          col+=(rnd(vUv*uRes+fract(uTime*7.))-.5)*uGrain;
          vec2 px=vec2(vUv.x,1.-vUv.y)*uSize;
          vec2 lo=vec2(uClip.w,uClip.x), hi=uSize-vec2(uClip.y,uClip.z);
          vec2 hb=max((hi-lo)*.5,vec2(0.));
          float d=rbox(px-(lo+hi)*.5,hb,min(uRad,min(hb.x,hb.y)));
          float al=1.-smoothstep(-1.,.5,d);
          if(uMaskOn>.5){ vec2 mu=vec2(46./64.,31./64.)+(px-uMaskPivot)/uMaskPx; // 以金星为中心缩放
            float ma=(mu.x<0.||mu.y<0.||mu.x>1.||mu.y>1.)?0.:texture2D(uMask,vec2(mu.x,1.-mu.y)).a; al=min(al,ma); }
          gl_FragColor=vec4(col,al);
        }`
    });
    const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    function size(t, pw, ph) { if (t.width !== pw || t.height !== ph) t.setSize(pw, ph); }
    return {
      u: mat.uniforms,
      render(scene, camera, w, h, sceneB, cameraB, mix) {
        const pw = Math.max(2, Math.floor(w * PR)), ph = Math.max(2, Math.floor(h * PR));
        mat.uniforms.uRes.value.set(pw, ph); mat.uniforms.uSize.value.set(w, h);
        mat.uniforms.uMix.value = sceneB ? mix : 0;
        if (!sceneB || mix < 1) { size(rt, pw, ph); R.setRenderTarget(rt); R.render(scene, camera); }
        if (sceneB && mix > 0) { size(rtB, pw, ph); R.setRenderTarget(rtB); R.render(sceneB, cameraB); }
        if (sceneB && mix >= 1) { mat.uniforms.tDiffuse.value = rtB.texture; mat.uniforms.uMix.value = 0; }
        R.setRenderTarget(null); R.render(sc, cam);
        mat.uniforms.tDiffuse.value = rt.texture;
      }
    };
  }

  // ---------- 太阳系 ----------
  const hs = new THREE.Scene();
  const hc = new THREE.PerspectiveCamera(40, 1, 0.05, 4000);
  const sky = new THREE.Mesh(skyGeo, skyMat); sky.rotation.set(0.62, 0.4, 0.28); hs.add(sky);
  hs.add(new THREE.Points(starGeo, starMat));
  // 韦伯星云（可开关）
  const nebulae = [];
  // 船底座星云：左下一大块、上方一小块（创生之柱已按用户意见去掉）
  [['nebA', new V3(-0.55, -0.42, -0.72), 1050, 0.0], ['nebA', new V3(0.1, 0.55, -0.83), 760, 2.3]].forEach(([k, dir, size, rot], i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uMap: { value: blank }, uOp: { value: i === 1 ? 0.28 : 0.45 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform sampler2D uMap; uniform float uOp; varying vec2 vUv; void main(){ vec4 t=texture2D(uMap,vUv); gl_FragColor=vec4(pow(t.rgb,vec3(2.2))*t.a*uOp*1.6,1.); }`
    }));
    m.position.copy(dir.normalize().multiplyScalar(1350)); m.lookAt(ORIGIN); m.rotateZ(rot);
    lateHooks.push((kk, t) => { if (kk === k) m.material.uniforms.uMap.value = t; });
    hs.add(m); nebulae.push(m);
  });
  let nebulaOn = true;
  world.setNebula = (on) => { nebulaOn = on; nebulae.forEach((m) => (m.visible = on)); };

  const SUN_R = 3.6;
  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 64, 48), new THREE.ShaderMaterial({
    uniforms: { uMap: { value: T.sun }, uTime: { value: 0 }, uBoost: { value: 0 } }, vertexShader: VERT,
    fragmentShader: `uniform sampler2D uMap; uniform float uTime; uniform float uBoost; varying vec2 vUv; varying vec3 vNw; varying vec3 vPw;
      void main(){ vec3 V=normalize(cameraPosition-vPw); float mu=max(dot(normalize(vNw),V),0.);
        vec3 a=pow(texture2D(uMap,vUv+vec2(uTime*.004,0.)).rgb,vec3(2.2)); vec3 b=pow(texture2D(uMap,vUv*1.7-vec2(uTime*.006,0.)).rgb,vec3(2.2));
        vec3 c=mix(a,b,.35)*vec3(5.2,3.4,1.9)*(.35+.65*pow(mu,.6))*(1.+uBoost*1.5); gl_FragColor=vec4(c,1.); }`
  }));
  hs.add(sunMesh);
  const sunGlowA = sprite(GLOW, SUN_R * 3.4, new THREE.Color(1.8, 1.25, 0.7)), sunGlowB = sprite(GLOW, SUN_R * 8, new THREE.Color(0.38, 0.22, 0.1));
  hs.add(sunGlowA, sunGlowB);
  const flareRing = sprite(RING, 1, new THREE.Color(2.2, 1.5, 0.8)); flareRing.visible = false; hs.add(flareRing);

  const allMats = [];
  const orbitMat = new THREE.LineBasicMaterial({ color: new THREE.Color(0.55, 0.62, 0.8), transparent: true, opacity: 0.22, depthWrite: false });
  const orbitLines = [];
  const TRAIL_N = 140;
  const trailMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uOp: { value: 0 }, uCol: { value: new THREE.Color(0.7, 0.85, 1.4) } },
    vertexShader: `attribute float aI; varying float vI; void main(){ vI=aI; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float uOp; uniform vec3 uCol; varying float vI; void main(){ gl_FragColor=vec4(uCol*pow(1.-vI,1.6)*uOp,1.); }`
  });
  // 光尾的粗点（细线在高分屏上太细，叠一层由粗到细的光点）
  const trailPtsMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uOp: trailMat.uniforms.uOp, uCol: trailMat.uniforms.uCol, uPx: { value: 1 } },
    vertexShader: `attribute float aI; uniform float uPx; varying float vI; void main(){ vI=aI; gl_PointSize=uPx*mix(5.,1.,aI); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float uOp; uniform vec3 uCol; varying float vI; void main(){ float d=length(gl_PointCoord-.5); gl_FragColor=vec4(uCol*smoothstep(.5,0.,d)*pow(1.-vI,1.4)*uOp*.9,1.); }`
  });
  PLANETS.forEach((p) => {
    p.theta = p.ph; p.omega = 0.16 / Math.pow(p.period, 0.55); p.pos = new V3(); p.spin = 0; p.hov = 0;
    const pts = [];
    for (let i = 0; i <= 256; i++) { const a = (i / 256) * Math.PI * 2; pts.push(new V3(Math.cos(a) * p.a, 0, -Math.sin(a) * p.a)); }
    const ol = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), orbitMat); hs.add(ol); orbitLines.push(ol);
    // 时间加速时的光尾
    const tg = new THREE.BufferGeometry(), tp = new Float32Array(TRAIL_N * 3), ti = new Float32Array(TRAIL_N);
    for (let i = 0; i < TRAIL_N; i++) ti[i] = i / (TRAIL_N - 1);
    tg.setAttribute('position', new THREE.BufferAttribute(tp, 3)); tg.setAttribute('aI', new THREE.BufferAttribute(ti, 1));
    p.trail = new THREE.Line(tg, trailMat); p.trail.frustumCulled = false; p.trail.visible = false; hs.add(p.trail); p.trailFresh = true;
    p.trailPts = new THREE.Points(tg, trailPtsMat); p.trailPts.frustumCulled = false; p.trailPts.visible = false; hs.add(p.trailPts);
    p.group = new THREE.Group(); hs.add(p.group);
    if (p.key === 'earth') {
      p.group.rotation.z = 0.41;
      p.mesh = new THREE.Mesh(new THREE.SphereGeometry(p.r, 128, 96), earthMat()); p.group.add(p.mesh);
      p.clouds = new THREE.Mesh(new THREE.SphereGeometry(p.r * 1.012, 128, 96), cloudMat()); p.group.add(p.clouds);
      p.atmo = new THREE.Mesh(new THREE.SphereGeometry(p.r * 1.09, 96, 64), atmoMat('#5a9cff')); hs.add(p.atmo);
      p.atmo.material.uniforms.uR.value = p.r; p.atmo.material.uniforms.uRs.value = p.r * 1.09;
      allMats.push(p.mesh.material, p.clouds.material, p.atmo.material);
    } else {
      const rimCol = { mars: '#ff9a6a', jupiter: '#f2d3a8', saturn: '#f5deb0', venus: '#ffe2b0', uranus: '#9fe8ff', neptune: '#7fa8ff' }[p.key] || '#000';
      const rim = { mars: 0.35, jupiter: 0.25, saturn: 0.2, venus: 0.5, uranus: 0.45, neptune: 0.45 }[p.key] || 0;
      p.group.rotation.z = { saturn: 0.47, uranus: 1.7, jupiter: 0.05, mars: 0.44, neptune: 0.49 }[p.key] || 0.05;
      p.mesh = new THREE.Mesh(new THREE.SphereGeometry(p.r, 96, 64), planetMat(p.key, rim, rimCol)); p.group.add(p.mesh);
      allMats.push(p.mesh.material);
      if (p.key === 'mars') {
        p.atmo = new THREE.Mesh(new THREE.SphereGeometry(p.r * 1.05, 64, 48), atmoMat('#e8885a')); hs.add(p.atmo);
        p.atmo.material.uniforms.uR.value = p.r; p.atmo.material.uniforms.uRs.value = p.r * 1.05; allMats.push(p.atmo.material);
      }
      if (p.ring) {
        p.ringMat = ringMat();
        p.ringMesh = new THREE.Mesh(new THREE.RingGeometry(p.ring[0], p.ring[1], 256, 1), p.ringMat); p.ringMesh.rotation.x = -Math.PI / 2; p.group.add(p.ringMesh);
        p.ringMat.uniforms.uR.value = p.r; p.ringMat.uniforms.uIn.value = p.ring[0]; p.ringMat.uniforms.uOut.value = p.ring[1];
        p.mesh.material.uniforms.uRingIn.value = p.ring[0]; p.mesh.material.uniforms.uRingOut.value = p.ring[1];
        allMats.push(p.ringMat);
      }
    }
  });
  const EARTH = PLANETS[2];

  // ---------- 深空点缀：小行星带（火星—木星之间）、柯伊伯带星尘（海王星外）、彗星 ----------
  const dustMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uPx: { value: 1 } },
    vertexShader: `attribute float aSize; attribute vec3 aCol; uniform float uPx; varying vec3 vC;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vec3 wp=(modelMatrix*vec4(position,1.)).xyz;
        float lit=.35+.65*clamp(dot(normalize(-wp),normalize(cameraPosition-wp))*.5+.5,0.,1.);
        vC=aCol*lit; gl_PointSize=aSize*uPx*clamp(70./-mv.z,.5,3.); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; void main(){ float d=length(gl_PointCoord-.5); gl_FragColor=vec4(vC*smoothstep(.5,.1,d),1.); }`
  });
  function dustRing(n, rIn, rOut, h, tint, bright) {
    const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, r = rIn + (rOut - rIn) * (Math.random() + Math.random()) / 2;
      pos.set([Math.cos(a) * r, (Math.random() + Math.random() + Math.random() - 1.5) * h, -Math.sin(a) * r], i * 3);
      const k = (0.4 + Math.random() * 0.6) * bright; col.set([tint[0] * k, tint[1] * k, tint[2] * k], i * 3);
      size[i] = 0.8 + Math.pow(Math.random(), 4) * 2.2;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    const p = new THREE.Points(g, dustMat); p.frustumCulled = false; return p;
  }
  const belt = new THREE.Group(); hs.add(belt);
  belt.add(dustRing(S.tier === 'high' ? 3200 : 1200, 20.6, 23.6, 0.35, [0.95, 0.85, 0.72], 0.55));
  // 小行星岩块：不规则多面体，按太阳方向打光
  const rockGeo = new THREE.SphereGeometry(1, 14, 10);
  (function () { const p = rockGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const f = 1 + 0.22 * Math.sin(x * 4.1 + y * 2.3) * Math.cos(z * 3.7 + x * 1.9) + 0.08 * Math.sin(x * 11 + z * 9); p.setXYZ(i, x * f, y * f * 0.78, z * f * 0.92); } rockGeo.computeVertexNormals(); })();
  const rockMat = makeRockMat('vec3(.30,.27,.24)', 'vec3(.52,.47,.41)', 'vec3(1.)', '.15');
  function makeRockMat(albA, albB, rimC, rimK) { return new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vO; void main(){ vO=position; mat4 m=modelMatrix*instanceMatrix; vec4 w=m*vec4(position,1.); vP=w.xyz; vN=normalize(mat3(m)*normal); gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vP; varying vec3 vO;
      float h(vec3 p){ return fract(sin(dot(p,vec3(12.9,78.2,37.7)))*43758.5); }
      void main(){ vec3 N=normalize(vN); float l=dot(N,normalize(-vP)); float w=clamp(l*.8+.2,0.,1.);
        float n=h(floor(vO*6.)); vec3 alb=mix(${albA},${albB},n);
        vec3 V=normalize(cameraPosition-vP); float rim=pow(1.-max(dot(N,V),0.),3.)*${rimK};
        gl_FragColor=vec4(alb*w*w*1.5+alb*.05+${rimC}*rim,1.); }`
  }); }
  // 每块碎块记下自己的位置、大小、翻滚轴和速度，每帧更新
  function chunks(n, mat, rIn, rOut, h, s0, s1) {
    const mesh = new THREE.InstancedMesh(rockGeo, mat, n);
    mesh.userData.d = Array.from({ length: n }, () => { const a = Math.random() * 6.283, r = rIn + Math.random() * (rOut - rIn), sz = s0 + Math.pow(Math.random(), 3) * s1;
      return { pos: new V3(Math.cos(a) * r, (Math.random() - 0.5) * h, -Math.sin(a) * r), scl: new V3(sz, sz * (0.6 + Math.random() * 0.5), sz * (0.7 + Math.random() * 0.4)), axis: new V3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), ang: Math.random() * 6, spin: 0.15 + Math.random() * 0.6, bob: Math.random() * 6 }; });
    updateChunks(mesh, 0, 0); return mesh;
  }
  const rockObj = new THREE.Object3D();
  function updateChunks(mesh, dt, T0) {
    mesh.userData.d.forEach((d, i) => { d.ang += d.spin * dt; rockObj.position.copy(d.pos); rockObj.position.y += Math.sin(T0 * 0.4 + d.bob) * 0.04; rockObj.quaternion.setFromAxisAngle(d.axis, d.ang); rockObj.scale.copy(d.scl); rockObj.updateMatrix(); mesh.setMatrixAt(i, rockObj.matrix); });
    mesh.instanceMatrix.needsUpdate = true;
  }
  const rocks = chunks(S.tier === 'high' ? 110 : 50, rockMat, 20.8, 23.4, 0.6, 0.05, 0.2);
  belt.add(rocks);
  // 柯伊伯带（海王星外）：冰质，偏冷蓝，比内圈更宽更散；稀疏的冰块也在翻滚
  const kuiper = new THREE.Group(); hs.add(kuiper);
  kuiper.add(dustRing(S.tier === 'high' ? 3400 : 1300, 46.5, 62, 2.4, [0.6, 0.8, 1.08], 0.62));
  const ices = chunks(S.tier === 'high' ? 70 : 30, makeRockMat('vec3(.42,.5,.6)', 'vec3(.75,.84,.95)', 'vec3(.6,.8,1.)', '.35'), 47, 61, 2.0, 0.09, 0.3);
  kuiper.add(ices);
  // 彗星：约 20 秒绕太阳一圈；开场时正飞向太阳，开场后几秒就第一次掠过
  // 彗发淡青绿；两条尾巴：蓝色离子尾笔直背向太阳，暖白尘埃尾沿轨道往后弯
  const COMET_T = 20;
  const comet = { a: 26, e: 0.6, th: -2.72, slow: 1, incl: 0.42, node: 1.2, pos: new V3(), prev: new V3(), vel: new V3(), dir: new V3(1, 0, 0) };
  comet.b = comet.a * Math.sqrt(1 - comet.e * comet.e); comet.h = (2 * Math.PI * comet.a * comet.b) / COMET_T;
  const cometHead = sprite(GLOW, 0.7, new THREE.Color(1.3, 1.9, 1.7)), cometComa = sprite(GLOW, 2, new THREE.Color(0.1, 0.32, 0.27));
  hs.add(cometHead, cometComa);
  function makeTail(n, life, col) {
    const t = { n, life, head: 0, pos: new Float32Array(n * 3), vel: new Float32Array(n * 3), age: new Float32Array(n).fill(99), a: new Float32Array(n) };
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(t.pos, 3)); g.setAttribute('aA', new THREE.BufferAttribute(t.a, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uPx: { value: 1 } },
      vertexShader: `attribute float aA; uniform float uPx; varying float vA; void main(){ vA=aA; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=uPx*clamp(70./-mv.z,.7,3.5)*(.5+aA); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying float vA; void main(){ float d=length(gl_PointCoord-.5); gl_FragColor=vec4(vec3(${col})*smoothstep(.5,0.,d)*vA,1.); }`
    });
    t.geo = g; t.mat = m; const pts = new THREE.Points(g, m); pts.frustumCulled = false; hs.add(pts); return t;
  }
  const ionTail = makeTail(700, 2.2, '.5,.75,1.3'), dustTail = makeTail(600, 2.4, '1.05,.92,.75');
  const tailMats = [ionTail.mat, dustTail.mat];
  // 发射：v0 是初速度方向的组合（离子尾几乎只朝背向太阳，尘埃尾保留彗星自身速度所以会弯）
  function stepTail(t, rate, dt, ts, near, emit) {
    let spawn = Math.round(Math.min(30, rate * near * dt * Math.max(ts, 0.3)));
    while (spawn-- > 0) { const i = t.head; t.head = (t.head + 1) % t.n; t.pos.set([comet.pos.x, comet.pos.y, comet.pos.z], i * 3); emit(t.vel, i * 3); t.age[i] = 0; }
    const k = dt * Math.max(ts, 0.3);
    for (let i = 0; i < t.n; i++) {
      if (t.age[i] > t.life) { t.a[i] = 0; continue; }
      t.age[i] += k;
      t.pos[i * 3] += t.vel[i * 3] * k; t.pos[i * 3 + 1] += t.vel[i * 3 + 1] * k; t.pos[i * 3 + 2] += t.vel[i * 3 + 2] * k;
      t.a[i] = Math.max(0, 1 - t.age[i] / t.life) * (0.2 + near * 0.55);
    }
    t.geo.attributes.position.needsUpdate = true; t.geo.attributes.aA.needsUpdate = true;
  }
  function updateDeep(dt, tsc, warp) {
    belt.rotation.y += (0.07 * tsc + 0.012) * warp * dt; // 近景时也保持缓慢漂移
    if (S.tier !== 'low') { updateChunks(rocks, dt, S.time); updateChunks(ices, dt * 0.6, S.time); }
    kuiper.rotation.y += 0.012 * tsc * warp * dt;
    const sp = Math.max(tsc, 0.25) * warp;
    // 鼠标停在彗星上（或按住它）：约 0.3 秒平滑减到一成速度，像慢动作；尾巴照常流动
    const hold = IX.hoverComet || (IX.down && IX.down.p === 'comet');
    comet.slow = lerp(comet.slow, hold ? 0.1 : 1, 1 - Math.pow(hold ? 0.0001 : 0.02, dt));
    const r = (comet.a * (1 - comet.e * comet.e)) / (1 + comet.e * Math.cos(comet.th));
    comet.th += (comet.h / (r * r)) * sp * comet.slow * dt;
    const x = Math.cos(comet.th) * r, z = -Math.sin(comet.th) * r;
    comet.prev.copy(comet.pos);
    comet.pos.set(x, 0, z).applyAxisAngle(new V3(1, 0, 0), comet.incl).applyAxisAngle(UP, comet.node);
    const ts = Math.max(sp, 0.3);
    if (dt > 0) { comet.vel.subVectors(comet.pos, comet.prev).divideScalar(dt * ts); if (comet.vel.lengthSq() > 1e-6) comet.dir.copy(comet.vel).normalize(); }
    cometHead.position.copy(comet.pos); cometComa.position.copy(comet.pos);
    const near = Math.min(1.6, 14 / r);
    comet.near = near;
    const lit = 1 + (1 - comet.slow) * 0.45; // 慢下来时彗头稍微变亮变大，提示可以点
    cometHead.scale.setScalar((0.5 + near * 0.35) * lit);
    cometComa.scale.setScalar((0.9 + near * 1.3) * lit);
    const away = comet.pos.clone().normalize(), jit = () => (Math.random() - 0.5) * 0.18;
    stepTail(ionTail, 200, dt, ts, near, (v, o) => { const s = 3.2 + Math.random() * 2; v[o] = away.x * s + jit(); v[o + 1] = away.y * s + jit(); v[o + 2] = away.z * s + jit(); });
    stepTail(dustTail, 150, dt, ts, near, (v, o) => { const s = 0.5 + Math.random() * 0.9; v[o] = comet.vel.x * 0.7 + away.x * s + jit(); v[o + 1] = comet.vel.y * 0.7 + away.y * s + jit(); v[o + 2] = comet.vel.z * 0.7 + away.z * s + jit(); });
  }
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.27, 64, 48), planetMat('moon', 0, '#000')); hs.add(moon); allMats.push(moon.material);
  let moonTheta = 1.2;
  allMats.forEach((m) => m.uniforms.uSun && m.uniforms.uSun.value.set(0, 0, 0));

  // ---------- 互动状态 ----------
  const IX = { view: { az: 0, el: 0, vaz: 0, vel: 0 }, warp: 1, warpTarget: 1, hover: null, drag: null, rot: false,
    down: null, px: 0, py: 0, lastX: 0, lastY: 0, lastT: 0, holdTimer: 0, shockT: 0, shockOn: false };
  const ringN = new V3();
  // 自转（弧度/秒）：近景里看得出在慢慢转；相对快慢接近真实——木土最快，金星、天王星逆转
  const SPIN_RATE = { mercury: 0.006, venus: -0.004, earth: 0.015, mars: 0.015, jupiter: 0.035, saturn: 0.032, uranus: -0.022, neptune: 0.024 };
  let cloudDrift = 0;
  // 上海（31.23°N, 121.47°E）在地球贴图上的方向（Three 球体：u=0 在经度 -180°）
  const SH_LAT = (31.23 * Math.PI) / 180, SH_PHI = ((121.47 + 180) / 360) * Math.PI * 2;
  const SH_DIR = new V3(-Math.cos(SH_PHI) * Math.cos(SH_LAT), Math.sin(SH_LAT), Math.sin(SH_PHI) * Math.cos(SH_LAT));
  const SH_AZ = Math.atan2(SH_DIR.x, SH_DIR.z);
  // 上海闪光点：贴在地表、跟着地球转；转到背面自动隐去
  const shCore = sprite(GLOW, 0.075, new THREE.Color(2.4, 1.7, 0.75)), shRing = sprite(RING, 0.1, new THREE.Color(1.6, 1.15, 0.5));
  [shCore, shRing].forEach((m) => { m.material.depthTest = false; m.renderOrder = 20; m.position.copy(SH_DIR).multiplyScalar(EARTH.r * 1.004); EARTH.mesh.add(m); });
  const aimPose = { pos: new V3(), tgt: new V3() }, shW = new V3(), toCam = new V3();
  function placePlanets(dt, tsc, T0, u = 0) {
    const warp = IX.warp;
    PLANETS.forEach((p) => {
      if (IX.drag !== p) { p.theta += (p.omega * tsc * warp + p.spin) * dt; p.spin *= Math.exp(-dt * 0.9); }
      p.pos.set(Math.cos(p.theta) * p.a, 0, -Math.sin(p.theta) * p.a);
      p.group.position.copy(p.pos);
      p.hov = lerp(p.hov, IX.hover === p || IX.drag === p ? 1 : 0, 1 - Math.pow(0.001, dt));
      p.group.scale.setScalar(1 + p.hov * 0.22);
      // 自转：相对快慢接近真实（木土最快、金星逆转最慢），近景几乎停住，看不出大陆在滑
      if (p.spinAng === undefined) p.spinAng = p.ph;
      p.spinAng += dt * (SPIN_RATE[p.key] || 0.01) * (T0 ? 1 : 0) * (1 + (warp - 1) * 0.2);
      p.mesh.rotation.y = p.spinAng;
      if (p.atmo) { p.atmo.position.copy(p.pos); p.atmo.scale.setScalar(1 + p.hov * 0.22); p.atmo.material.uniforms.uC.value.copy(p.pos); p.atmo.material.uniforms.uR.value = p.r * (1 + p.hov * 0.22); p.atmo.material.uniforms.uRs.value = p.r * (p.key === 'earth' ? 1.09 : 1.05) * (1 + p.hov * 0.22); }
      if (p.ring) {
        p.group.updateMatrixWorld(true);
        ringN.set(0, 0, 1).transformDirection(p.ringMesh.matrixWorld);
        p.mesh.material.uniforms.uRingC.value.copy(p.pos); p.mesh.material.uniforms.uRingN.value.copy(ringN);
        p.ringMat.uniforms.uC.value.copy(p.pos); p.ringMat.uniforms.uR.value = p.r * (1 + p.hov * 0.22);
      }
      // 光尾
      const on = warp > 1.2 || trailMat.uniforms.uOp.value > 0.01;
      p.trail.visible = on; p.trailPts.visible = on;
      if (on) {
        const arr = p.trail.geometry.attributes.position.array;
        if (p.trailFresh) { for (let i = 0; i < TRAIL_N; i++) arr.set([p.pos.x, 0, p.pos.z], i * 3); p.trailFresh = false; }
        arr.copyWithin(3, 0, (TRAIL_N - 1) * 3); arr[0] = p.pos.x; arr[1] = 0; arr[2] = p.pos.z;
        p.trail.geometry.attributes.position.needsUpdate = true;
      } else p.trailFresh = true;
    });
    trailMat.uniforms.uOp.value = lerp(trailMat.uniforms.uOp.value, warp > 1.2 ? 0.9 : 0, 1 - Math.pow(0.02, dt));
    // 镜头还没到地球时，悄悄把地球转到「上海略偏西、正对地球章节镜头」；进入地球章节后再从这里慢慢自转，上海缓缓转到正中
    if (u < 0.5 || u > 1.5) {
      pose(1, aimPose);
      EARTH.spinAng = Math.atan2(aimPose.pos.x - EARTH.pos.x, aimPose.pos.z - EARTH.pos.z) - SH_AZ - 0.14;
      EARTH.mesh.rotation.y = EARTH.spinAng;
    }
    {
      const near = Math.max(0, 1 - Math.abs(u - 1) / 0.45);
      EARTH.mesh.updateMatrixWorld(true);
      shW.copy(SH_DIR).transformDirection(EARTH.mesh.matrixWorld);
      toCam.copy(hc.position).sub(EARTH.pos).normalize();
      const face = Math.min(1, Math.max(0, (shW.dot(toCam) - 0.08) / 0.2));
      const ph = (T0 * 0.6) % 1, blink = 0.65 + 0.35 * Math.sin(T0 * 5.2);
      shCore.material.opacity = near * face * blink; shCore.scale.setScalar(0.11 * (0.9 + 0.2 * blink));
      shRing.material.opacity = near * face * (1 - ph) * 0.9; shRing.scale.setScalar(0.08 + ph * 0.32);
      shCore.visible = shRing.visible = near * face > 0.003;
    }
    // 云层跟着地面一起转，只留极慢的相对飘移
    cloudDrift += dt * 0.0015 * Math.max(tsc, 0.1);
    EARTH.clouds.rotation.y = EARTH.mesh.rotation.y + cloudDrift;
    EARTH.mesh.material.uniforms.uCloudShift.value = -cloudDrift / 6.283;
    moonTheta += 0.55 * tsc * warp * dt;
    updateDeep(dt, tsc, warp);
    moon.position.set(EARTH.pos.x + Math.cos(moonTheta) * 2.6, 0.25 * Math.sin(moonTheta), EARTH.pos.z - Math.sin(moonTheta) * 2.6);
  }
  const heroPost = makePost();

  // ---------- 镜头 ----------
  const camPos = new V3(), camTgt = new V3();
  const pa = { pos: new V3(), tgt: new V3() }, pb = { pos: new V3(), tgt: new V3() };
  function pose(k, out) {
    const narrow = S.vw < 760;
    if (k === 0) { // 太阳系全景：斜上方俯视，可以拖动旋转
      const D = narrow ? 118 : 66;
      const el = Math.min(1.45, Math.max(0.1, (narrow ? 0.62 : 0.46) + IX.view.el));
      const az = 0.18 + S.mxs * 0.08 + S.time * 0.006 + IX.view.az;
      out.pos.set(Math.sin(az) * Math.cos(el) * D, Math.sin(el) * D - S.mys * 3, Math.cos(az) * Math.cos(el) * D);
      out.tgt.set(narrow ? 0 : -4, narrow ? -6 : -2.5, 0);
      return out;
    }
    const b = CHAP[k];
    const s = ORIGIN.clone().sub(b.pos).normalize(), side = new V3().crossVectors(s, UP).normalize();
    const dir = s.clone().multiplyScalar(0.62).addScaledVector(side, 0.8).addScaledVector(UP, b.up).normalize();
    out.pos.copy(b.pos).addScaledVector(dir, b.r * (S.vw < 760 ? b.dm : b.d));
    const view = b.pos.clone().sub(out.pos).normalize(), right = new V3().crossVectors(view, UP).normalize();
    out.tgt.copy(b.pos);
    if (S.vw < 760) out.tgt.addScaledVector(UP, -b.r * 0.75); else out.tgt.addScaledVector(right, b.r * 1.1);
    return out;
  }
  const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  placePlanets(0, 0, 0);
  pose(0, pa); camPos.copy(pa.pos).multiplyScalar(1.5); camTgt.copy(pa.tgt);

  // ---------- 首屏互动：拖行星 / 拖空白转视角 / 长按加速 / 点太阳 / 悬停卡片 ----------
  let curU = 0;
  const interactive = () => curU < 0.3 && S.intro > 0.95 && S.exit < 0.05;
  const tmpP = new V3();
  function screenOf(pos, rad, sr) {
    const v = tmpP.copy(pos).project(hc);
    const dist = pos.distanceTo(hc.position);
    const rpx = (rad / dist) / Math.tan((hc.fov * Math.PI) / 360) * (sr.height / 2);
    return { x: ((v.x + 1) / 2) * sr.width, y: ((1 - v.y) / 2) * sr.height, r: rpx, z: v.z };
  }
  function pick(x, y) {
    const sr = stage.getBoundingClientRect();
    let best = null, bd = 1e9;
    PLANETS.forEach((p) => {
      const s = screenOf(p.pos, p.r * (p.ring ? 1.6 : 1), sr);
      if (s.z > 1) return;
      const d = Math.hypot(s.x - x, s.y - y) - Math.max(s.r, 6);
      if (d < 14 && d < bd) { bd = d; best = p; }
    });
    const ss = screenOf(ORIGIN, SUN_R, sr);
    if (!best && Math.hypot(ss.x - x, ss.y - y) < ss.r + 10) return 'sun';
    if (!best) { const cs = screenOf(comet.pos, 0.6, sr); if (cs.z < 1 && Math.hypot(cs.x - x, cs.y - y) < Math.max(cs.r, 6) + 16) return 'comet'; }
    return best;
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new V3(0, 1, 0), 0), hit = new V3();
  function eclipticAngle(x, y) {
    const sr = stage.getBoundingClientRect();
    ndc.set((x / sr.width) * 2 - 1, -(y / sr.height) * 2 + 1);
    ray.setFromCamera(ndc, hc);
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    return Math.atan2(-hit.z, hit.x);
  }
  function setCursor(label) { if (stage.dataset.cursor !== label) stage.dataset.cursor = label; }
  function localXY(e) { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  stage.addEventListener('pointerdown', (e) => {
    if (!interactive() || IX.chase || e.target.closest('a,button') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const [x, y] = localXY(e);
    const p = pick(x, y);
    IX.down = { x, y, t: performance.now(), p, moved: 0, id: e.pointerId, type: e.pointerType };
    IX.lastX = x; IX.lastY = y; IX.lastT = performance.now();
    if (p && p !== 'sun' && p !== 'comet') { IX.drag = p; p.dragV = 0; p.spin = 0; try { stage.setPointerCapture(e.pointerId); } catch (er) {} }
    else if (!p && !LOW) {
      clearTimeout(IX.holdTimer);
      IX.holdTimer = setTimeout(() => { if (IX.down && IX.down.moved < 8) { IX.warpTarget = 24; warpHint.classList.add('on'); } }, 380);
    }
  });
  addEventListener('pointermove', (e) => {
    const [x, y] = localXY(e);
    if (IX.down) {
      const dx = x - IX.lastX, dy = y - IX.lastY, now = performance.now(), dtt = Math.max(1, now - IX.lastT) / 1000;
      IX.down.moved += Math.abs(dx) + Math.abs(dy);
      if (IX.drag) {
        const a = eclipticAngle(x, y);
        if (a !== null) { const d = wrapPi(a - IX.drag.theta); IX.drag.theta += d * 0.5; IX.drag.dragV = lerp(IX.drag.dragV, (d * 0.5) / dtt, 0.4); }
      } else if (!IX.down.p && IX.down.moved > 8 && IX.warpTarget === 1) {
        IX.rot = true;
        IX.view.az -= dx * 0.006; IX.view.vaz = (-dx * 0.006) / dtt;
        if (IX.down.type === 'mouse') { IX.view.el = Math.max(-0.36, Math.min(0.95, IX.view.el + dy * 0.004)); IX.view.vel = (dy * 0.004) / dtt; }
      }
      IX.lastX = x; IX.lastY = y; IX.lastT = now;
      return;
    }
    if (e.pointerType !== 'mouse') return;
    IX.mx = x; IX.my = y; IX.overUi = !!(e.target.closest && e.target.closest('a,button'));
    const sr = stage.getBoundingClientRect();
    IX.mouseIn = e.clientY <= sr.bottom && e.clientY >= sr.top;
  }, { passive: true });
  function endPointer() {
    if (!IX.down) return;
    clearTimeout(IX.holdTimer);
    const d = IX.down; IX.down = null;
    if (IX.drag) {
      const p = IX.drag; IX.drag = null;
      if (d.moved < 6) { if (p.k) world.chapterTo(p.k); }
      else p.spin = Math.max(-3.5, Math.min(3.5, p.dragV || 0)) - p.omega;
    } else if (d.p === 'sun' && d.moved < 6 && !LOW) {
      IX.shockT = 0.0001; IX.shockOn = true;
    } else if (d.p === 'comet' && d.moved < 6) {
      // 点彗星：镜头追上去跟拍一小段，再交给 ui 跃迁到尾页「等你来信」
      if (LOW) world.onComet && world.onComet(); else { IX.chase = 0.0001; IX.chaseSent = false; }
    }
    if (IX.warpTarget !== 1) { IX.warpTarget = 1; warpHint.classList.remove('on'); }
    IX.rot = false;
  }
  addEventListener('pointerup', endPointer); addEventListener('pointercancel', endPointer);
  stage.addEventListener('contextmenu', (e) => { if (interactive()) e.preventDefault(); });

  function updateInteraction(dt, sr) {
    const on = interactive();
    // 行星一直在动：每帧按鼠标当前位置重新判断悬停
    if (on && IX.mouseIn && !IX.overUi && !IX.down && !IX.chase) { const p = pick(IX.mx, IX.my); IX.hover = p && p !== 'sun' && p !== 'comet' ? p : null; IX.hoverSun = p === 'sun'; IX.hoverComet = p === 'comet'; }
    else if (!IX.down) { IX.hover = null; IX.hoverSun = false; IX.hoverComet = false; }
    if (!on) { IX.hover = null; IX.hoverSun = false; IX.hoverComet = false; if (!IX.down) setCursor(''); }
    else if (IX.chase) setCursor('');
    else if (IX.drag) setCursor(IX.drag.k ? '绕太阳拖动 · 松手' : '绕太阳拖动');
    else if (IX.hover) setCursor(IX.hover.k ? '拖动 · 点击进入' : '拖动它绕太阳跑');
    else if (IX.hoverSun) setCursor('点一下太阳');
    else if (IX.hoverComet) setCursor('搭上彗星');
    else setCursor(IX.warpTarget > 1 ? '时间加速中' : '拖动旋转 · 长按加速');
    // 视角惯性
    if (!IX.rot) {
      IX.view.az += IX.view.vaz * dt; IX.view.vaz *= Math.exp(-dt * 3);
      IX.view.el = Math.max(-0.36, Math.min(0.95, IX.view.el + IX.view.vel * dt)); IX.view.vel *= Math.exp(-dt * 3);
    }
    IX.warp = lerp(IX.warp, IX.warpTarget, 1 - Math.pow(IX.warpTarget > 1 ? 0.15 : 0.03, dt));
    // 太阳光波
    if (IX.shockOn) {
      IX.shockT += dt / 1.8;
      if (IX.shockT >= 1) { IX.shockOn = false; IX.shockT = 0; }
    }
    const st = IX.shockT;
    flareRing.visible = IX.shockOn;
    if (IX.shockOn) { const s = SUN_R * (1.4 + st * 16); flareRing.scale.set(s, s, 1); flareRing.material.opacity = 1 - st; }
    sunMesh.material.uniforms.uBoost.value = IX.shockOn ? Math.sin(Math.min(1, st * 3) * Math.PI) : 0;
    sunGlowA.scale.setScalar(SUN_R * 3.4 * (1 + (IX.shockOn ? Math.sin(Math.min(1, st * 2) * Math.PI) * 0.6 : 0)));
    // 悬停卡片
    const p = on ? IX.hover || IX.drag : null;
    if (p) {
      const s = screenOf(p.pos, p.r * (1 + p.hov * 0.22), sr);
      pcard.innerHTML = `<b>${p.name}${p.tag ? `<i>${p.tag}</i>` : ''}</b>${p.info.map((t) => `<span>${t}</span>`).join('')}`;
      const left = s.x + s.r + 18, flip = left + 200 > sr.width;
      pcard.style.transform = `translate(${(flip ? s.x - s.r - 18 - 200 : left).toFixed(1)}px,${(s.y - 30).toFixed(1)}px)`;
      pcard.classList.add('on');
    } else if (on && IX.hoverSun) {
      const s = screenOf(ORIGIN, SUN_R, sr);
      pcard.innerHTML = `<b>太阳</b><span>直径 139.2 万 km</span><span>点一下，放一圈日冕光波</span>`;
      pcard.style.transform = `translate(${(s.x + s.r + 18).toFixed(1)}px,${(s.y - 30).toFixed(1)}px)`;
      pcard.classList.add('on');
    } else if (on && IX.hoverComet) {
      const s = screenOf(comet.pos, 0.6, sr), left = s.x + 22, flip = left + 200 > sr.width;
      pcard.innerHTML = `<b>彗星<i>信使</i></b><span>每 ${COMET_T} 秒绕太阳一圈</span><span>点一下，搭它给我捎个信</span>`;
      pcard.style.transform = `translate(${(flip ? s.x - 22 - 200 : left).toFixed(1)}px,${(s.y - 30).toFixed(1)}px)`;
      pcard.classList.add('on');
    } else pcard.classList.remove('on');
    // 跟拍彗星：约 2.4 秒；过半时通知 ui 开始跃迁
    if (IX.chase) {
      IX.chase += dt / 2.4;
      if (IX.chase > 0.5 && !IX.chaseSent) { IX.chaseSent = true; world.onComet && world.onComet(); }
      if (IX.chase >= 1 || !on && IX.chaseSent) IX.chase = 0;
    }
  }

  // 调试用（只读）：行星当前在首屏里的屏幕坐标、公转角
  world.debug = (key) => { if (key === 'sh') { const sr = stage.getBoundingClientRect(), w = new V3(); shCore.getWorldPosition(w); const c = screenOf(w, 0.05, sr); return { x: c.x + sr.left, y: c.y + sr.top, op: shCore.material.opacity, vis: shCore.visible }; } if (key === 'comet') { const sr = stage.getBoundingClientRect(), c = screenOf(comet.pos, 0.6, sr); return { x: c.x + sr.left, y: c.y + sr.top, z: c.z, near: comet.near, chase: IX.chase, slow: comet.slow }; } const p = PLANETS.find((q) => q.key === key); const sr = stage.getBoundingClientRect(); const s = screenOf(p.pos, p.r, sr); return { x: s.x + sr.left, y: s.y + sr.top, r: s.r, theta: p.theta, warp: IX.warp, hover: IX.hover && IX.hover.key, shock: IX.shockOn }; };

  // ---------- 尾页：太阳系 → 银河系 ----------
  const fc = new THREE.PerspectiveCamera(40, 1, 0.05, 4000);
  const gs = new THREE.Scene();
  const gc = new THREE.PerspectiveCamera(40, 1, 1, 20000); gc.up.set(0, 0, -1);
  const G = 1000, SUN_GAL = new V3(0, 0, 0.19 * G); // NASA 标注版：太阳在银心正下方约 19% 图宽处（猎户臂）
  gs.add(new THREE.Points(makeStars(S.tier === 'high' ? 1800 : 900, [[6000, 9000, 1.3]]), starMat));
  // 远处的星系小光斑
  const smudges = [];
  for (let i = 0; i < 22; i++) {
    const sp = sprite(SMUDGE, 60 + Math.random() * 180, new THREE.Color().setHSL(0.55 + Math.random() * 0.2, 0.45, 0.35 + Math.random() * 0.3));
    sp.material.rotation = Math.random() * 3.14; sp.scale.y *= 0.35 + Math.random() * 0.4;
    sp.position.set((Math.random() - 0.5) * 9000, -5200 - Math.random() * 1500, (Math.random() - 0.5) * 9000); gs.add(sp);
    smudges.push({ sp, vx: (Math.random() - 0.5) * 30, vz: (Math.random() - 0.5) * 30, vr: (Math.random() - 0.5) * 0.06 });
  }
  const gStars = gs.children[0];
  // 整体匀速旋转：旋臂形状不变（之前的差速旋转会把图片越拧越紧，看起来像拖影）
  const SPIN = `float spinAng(float r, float t){ return t*.03; }`;
  const galMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uMap: { value: blank }, uT: { value: 0 }, uRot: { value: 0 }, uOp: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform sampler2D uMap; uniform float uT; uniform float uRot; uniform float uOp; varying vec2 vUv; ${SPIN}
      void main(){ vec2 p=vUv-.5; float r=length(p); float a=-spinAng(r*2.,uT)-uRot; float cs=cos(a), sn=sin(a);
        vec2 q=vec2(p.x*cs-p.y*sn, p.x*sn+p.y*cs)+.5;
        vec3 c=pow(texture2D(uMap,q).rgb,vec3(2.2)); float al=smoothstep(.5,.42,r);
        gl_FragColor=vec4(c*1.05,al*uOp); }`
  });
  lateHooks.push((k, t) => { if (k === 'galaxy' || k === 'galaxy4k') { galMat.uniforms.uMap.value = t; if (k === 'galaxy') buildGalaxyStars(t.image); } });
  const galPlane = new THREE.Mesh(new THREE.PlaneGeometry(G, G), galMat); galPlane.rotation.x = -Math.PI / 2; gs.add(galPlane);
  // 银心：立体发光球（精灵永远朝向镜头，从任何角度看都是圆鼓鼓的）
  const bulgeA = sprite(GLOW, 130, new THREE.Color(1.3, 1.05, 0.75)), bulgeB = sprite(GLOW, 230, new THREE.Color(0.32, 0.25, 0.17));
  bulgeA.renderOrder = bulgeB.renderOrder = 10; gs.add(bulgeA, bulgeB); // 在盘面之后画，叠在银心上
  const galStarMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uPx: { value: 1 }, uTime: { value: 0 }, uRot: { value: 0 } },
    vertexShader: `attribute vec3 aCol; attribute float aSize; attribute float aPh; uniform float uT; uniform float uPx; uniform float uTime; uniform float uRot; varying vec3 vC; varying float vA; ${SPIN}
      void main(){ float r=length(position.xz)/${G.toFixed(1)}*2.; float a=spinAng(r,uT)+uRot; float cs=cos(a), sn=sin(a);
        vec3 p=vec3(position.x*cs+position.z*sn, position.y, -position.x*sn+position.z*cs);
        vec4 mv=modelViewMatrix*vec4(p,1.);
        vA=.55+.45*sin(uTime*(1.+fract(aPh)*2.)+aPh*6.);
        vC=aCol; gl_PointSize=aSize*uPx*clamp(900./-mv.z,.6,2.2);
        gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-.5); gl_FragColor=vec4(vC*smoothstep(.5,0.,d)*vA,1.); }`
  });
  let galStars = null;
  function buildGalaxyStars(img) {
    if (galStars || !img) return;
    const N = S.tier === 'high' ? 55000 : 14000, SZ = 256;
    const NB = S.tier === 'high' ? 9000 : 2500, NH = S.tier === 'high' ? 1200 : 400;
    const c = document.createElement('canvas'); c.width = c.height = SZ;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, SZ, SZ);
    const d = g.getImageData(0, 0, SZ, SZ).data;
    const T3 = N + NB + NH, pos = new Float32Array(T3 * 3), col = new Float32Array(T3 * 3), size = new Float32Array(T3), ph = new Float32Array(T3);
    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    let n = 0, guard = 0;
    while (n < N && guard++ < N * 60) {
      const x = Math.random() * SZ, y = Math.random() * SZ;
      const rr = Math.hypot(x / SZ - 0.5, y / SZ - 0.5); if (rr > 0.47) continue;
      const i = ((y | 0) * SZ + (x | 0)) * 4, rC = d[i] / 255, gC = d[i + 1] / 255, bC = d[i + 2] / 255;
      const lum = 0.3 * rC + 0.6 * gC + 0.1 * bC;
      if (Math.pow(lum, 1.8) < Math.random()) continue;
      const th = 4 + 30 * Math.exp(-rr * 10);
      pos.set([(x / SZ - 0.5) * G, gauss() * th, (y / SZ - 0.5) * G], n * 3);
      col.set([Math.pow(rC, 1.6) * 1.1, Math.pow(gC, 1.6) * 1.1, Math.pow(bC, 1.6) * 1.3], n * 3);
      size[n] = 0.8 + Math.pow(Math.random(), 6) * 2.6; ph[n] = Math.random() * 50; n++;
    }
    // 银心核球：扁椭球、暖色
    for (let i = 0; i < NB; i++, n++) {
      pos.set([gauss() * 0.06 * G, gauss() * 0.036 * G, gauss() * 0.06 * G], n * 3);
      const k = 0.55 + Math.random() * 0.6; col.set([1.25 * k, 1.0 * k, 0.72 * k], n * 3);
      size[n] = 0.8 + Math.pow(Math.random(), 5) * 2.4; ph[n] = Math.random() * 50;
    }
    // 晕星：盘面外一圈稀疏的老恒星，倾斜时在上下方都看得到
    for (let i = 0; i < NH; i++, n++) {
      const u = Math.random() * 2 - 1, a = Math.random() * 6.283, r = (0.3 + Math.random() * 0.45) * G, s2 = Math.sqrt(1 - u * u);
      pos.set([Math.cos(a) * s2 * r, u * r * 0.55, Math.sin(a) * s2 * r], n * 3);
      const k = 0.3 + Math.random() * 0.5; col.set([1.1 * k, 0.95 * k, 0.8 * k], n * 3);
      size[n] = 0.7 + Math.random() * 1.2; ph[n] = Math.random() * 50;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, n * 3), 3));
    geo.setAttribute('aCol', new THREE.BufferAttribute(col.subarray(0, n * 3), 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size.subarray(0, n), 1));
    geo.setAttribute('aPh', new THREE.BufferAttribute(ph.subarray(0, n), 1));
    galStars = new THREE.Points(geo, galStarMat); galStars.frustumCulled = false; gs.add(galStars);
  }
  // 前景星尘：飘在镜头和银河盘面之间，镜头移动时和银河的移动速度不同，产生纵深感
  const fgMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uPx: { value: 1 }, uTime: { value: 0 } },
    vertexShader: `attribute float aSize; attribute float aPh; attribute vec3 aCol; uniform float uPx; uniform float uTime; varying vec3 vC; varying float vA;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vA=.45+.55*pow(.5+.5*sin(uTime*(.6+fract(aPh)*1.8)+aPh*5.),2.); vC=aCol;
        gl_PointSize=aSize*uPx*clamp(420./-mv.z,.6,5.); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-.5); gl_FragColor=vec4(vC*smoothstep(.5,.05,d)*vA,1.); }`
  });
  const fgDust = (function () {
    const n = S.tier === 'high' ? 1800 : 700, g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), size = new Float32Array(n), ph = new Float32Array(n), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos.set([(Math.random() - 0.5) * 2000, 120 + Math.pow(Math.random(), 0.7) * 1150, (Math.random() - 0.5) * 2000], i * 3);
      size[i] = 0.6 + Math.pow(Math.random(), 4) * 2.4; ph[i] = Math.random() * 60;
      const c = starColor(); col.set([c[0] * 0.8, c[1] * 0.8, c[2] * 0.8], i * 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(size, 1)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    const p = new THREE.Points(g, fgMat); p.frustumCulled = false; gs.add(p); return p;
  })();
  const hereGlow = sprite(GLOW, 26, new THREE.Color(3, 2.6, 1.8)); gs.add(hereGlow);
  const hereGlow2 = sprite(GLOW, 70, new THREE.Color(1.0, 0.8, 0.5)); gs.add(hereGlow2);
  const footPost = makePost(); footPost.u.uVig.value = 0.55;
  const tmpV = new V3(), sunG = new V3();
  let galT = 0;
  // 尾页银河可以拖：左右拖转动银河，上下拖改变俯视角度（松手有惯性）
  const GX = { rot: 0, tilt: 0.38, vr: 0, vt: 0, down: null, lx: 0, ly: 0, lt: 0, on: false };
  foot.addEventListener('pointerdown', (e) => {
    if (!GX.on || e.target.closest('a,button') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.pointerType === 'mouse') e.preventDefault(); // 拖银河时不要顺带选中页脚文字
    GX.down = { type: e.pointerType }; GX.lx = e.clientX; GX.ly = e.clientY; GX.lt = performance.now();
  });
  addEventListener('pointermove', (e) => {
    if (!GX.down) return;
    const now = performance.now(), dtt = Math.max(1, now - GX.lt) / 1000, dx = e.clientX - GX.lx, dy = e.clientY - GX.ly;
    GX.rot += dx * 0.006; GX.vr = (dx * 0.006) / dtt;
    GX.lx = e.clientX; GX.ly = e.clientY; GX.lt = now;
  }, { passive: true });
  const gxUp = () => { GX.down = null; };
  addEventListener('pointerup', gxUp); addEventListener('pointercancel', gxUp);

  // ---------- 每帧 ----------
  const satWorld = new V3();
  world.resize = () => {
    W = innerWidth; H = innerHeight;
    PR = Math.min(devicePixelRatio || 1, S.tier === 'high' ? 2 : 1.5);
    R.setPixelRatio(PR); R.setSize(W, H, false);
    starMat.uniforms.uPx.value = PR; galStarMat.uniforms.uPx.value = PR; trailPtsMat.uniforms.uPx.value = PR; dustMat.uniforms.uPx.value = PR; tailMats.forEach((m) => (m.uniforms.uPx.value = PR)); fgMat.uniforms.uPx.value = PR;
  };
  world.update = (dt) => {
    const u = heroU(); curU = u;
    const active = updateDom(u);
    const T0 = S.time, moving = !LOW;
    starMat.uniforms.uTime.value = moving ? T0 : 0;
    sunMesh.material.uniforms.uTime.value = moving ? T0 : 0;
    if (moving) sky.rotation.y += dt * 0.004;
    nebulae.forEach((m, i) => moving && m.rotateZ(dt * (i ? -0.004 : 0.003)));
    const tsc = moving ? 1 - smooth(0.04, 0.5, u) : 0;
    const fr = foot.getBoundingClientRect();
    const footOn = fr.top < H && fr.bottom > 0;
    const ir = intro.getBoundingClientRect();
    S.exit = Math.min(1, Math.max(0, 1 - ir.top / S.vh));
    const sr = stage.getBoundingClientRect();
    const heroOn = S.exit < 0.999 && sr.bottom > 0 && sr.top < H;
    updateInteraction(dt, sr);
    if (heroOn || footOn) placePlanets(dt, tsc, moving ? T0 : 0, u);

    R.setScissorTest(false); R.setRenderTarget(null); R.setViewport(0, 0, W, H); R.clear();

    // 首屏
    if (heroOn) {
      const k0 = Math.min(3, Math.floor(u)), f = u - k0;
      const ff = ease(Math.min(1, Math.max(0, (f - 0.22) / 0.56)));
      pose(k0, pa); pose(Math.min(4, k0 + 1), pb);
      const goal = pa.pos.clone().lerp(pb.pos, ff).addScaledVector(UP, Math.sin(ff * Math.PI) * pa.pos.distanceTo(pb.pos) * 0.12);
      const goalT = pa.tgt.clone().lerp(pb.tgt, ff);
      goal.addScaledVector(goalT.clone().sub(goal).normalize(), -(1 - S.intro) * 40);
      if (k0 > 0 || ff > 0.5) {
        const view = goalT.clone().sub(goal).normalize(), right = new V3().crossVectors(view, UP).normalize();
        goal.addScaledVector(right, S.mxs * 0.3).addScaledVector(UP, -S.mys * 0.18);
      }
      if (IX.chase) {
        // 跟拍：在彗星斜后上方，看向它前进的方向，越追越近
        const c = ease(Math.min(1, IX.chase * 1.6)), side = new V3().crossVectors(comet.dir, UP).normalize();
        const cp = comet.pos.clone().addScaledVector(comet.dir, -7 + c * 3).addScaledVector(UP, 2.2).addScaledVector(side, 1.6);
        goal.lerp(cp, c); goalT.lerp(comet.pos.clone().addScaledVector(comet.dir, 1.2), c);
      }
      const damp = LOW ? 1 : 1 - Math.pow(IX.rot ? 0.00001 : IX.chase ? 0.0004 : 0.002, dt);
      camPos.lerp(goal, damp); camTgt.lerp(goalT, damp);
      hc.position.copy(camPos); hc.lookAt(camTgt);
      hc.aspect = sr.width / sr.height; hc.fov = S.vw < 760 ? 52 : 40; hc.updateProjectionMatrix();
      const oo = 0.22 * (1 - smooth(0.05, 0.5, u));
      orbitMat.opacity = oo; orbitLines.forEach((l) => (l.visible = oo > 0.004));

      PLANETS.forEach((p, i) => {
        satWorld.copy(p.pos);
        const v = satWorld.clone().project(hc), el = labels[i];
        const dist = satWorld.distanceTo(hc.position);
        const show = v.z < 1 && Math.abs(v.x) < 0.94 && Math.abs(v.y) < 0.9 && active !== p.k && dist > p.r * 8 && S.intro > 0.9 && (u < 0.35 || p.k) && IX.hover !== p && IX.drag !== p;
        el.style.opacity = show ? (p.k ? '0.95' : '0.6') : '0';
        el.style.pointerEvents = show && p.k ? 'auto' : 'none';
        if (show) el.style.transform = `translate(${(((v.x + 1) / 2) * sr.width + p.r * 2 + 6).toFixed(1)}px,${(((1 - v.y) / 2) * sr.height - 9).toFixed(1)}px)`;
      });

      const pu = heroPost.u;
      const vy = Math.max(-0.12, Math.min(0.12, (-S.vy / S.vh) * 2.2));
      pu.uVel.value.set(LOW ? 0 : Math.max(-0.04, Math.min(0.04, S.mvx * 0.5)), LOW ? 0 : vy - S.mvy * 0.25);
      pu.uTime.value = T0; pu.uExit.value = LOW ? 0 : S.exit;
      const c = S.clip; pu.uClip.value.set(c.t, c.r, c.b, c.l); pu.uRad.value = c.rad;
      const mk = S.mask; pu.uMaskOn.value = mk && mk.on ? 1 : 0;
      if (mk && mk.on) { pu.uMaskPivot.value.set(mk.x - sr.left, mk.y - sr.top); pu.uMaskPx.value = mk.size; }
      pu.uExpo.value = 1.05;
      // 镜头在星球之间飞行时：滚得越快、越在半路上，星星拉得越长；返航时由 ui.js 给 S.warpBoost
      const flight = Math.sin(ff * Math.PI) * Math.min(1, Math.abs(S.vy) / S.vh * 9);
      pu.uWarp.value = LOW ? 0 : Math.min(1, Math.max(flight * 0.85, S.warpBoost || 0));
      if (IX.shockOn) { const sv = tmpV.set(0, 0, 0).project(hc); pu.uShockC.value.set((sv.x + 1) / 2, (sv.y + 1) / 2); pu.uShockT.value = IX.shockT; } else pu.uShockT.value = 0;
      setRegion(sr.left, sr.top, sr.width, sr.height);
      heroPost.render(hs, hc, sr.width, sr.height);
    } else labels.forEach((l) => { l.style.opacity = '0'; l.style.pointerEvents = 'none'; });

    // 其他注册区域（作品卡片）
    regions.forEach((rg) => {
      const r = rg.rect();
      if (!r || r.bottom < 0 || r.top > H || r.width < 2) return;
      setRegion(r.left, r.top, r.width, r.height);
      rg.draw(r, dt);
    });

    // 尾页：地球 → 太阳系 → 银河系
    if (!galaxy4kAsked && S.tier === 'high' && fr.top < H * 2.5) { galaxy4kAsked = true; lateLoad('galaxy4k', 'galaxy_4k.webp'); }
    if (footOn) {
      const e = Math.min(1, Math.max(0, 1 - fr.top / H));
      S.footE = e;
      const narrow = S.vw < 760;
      const s1 = smooth(0, 0.62, e);
      const d1 = 6 * Math.pow(420 / 6, s1);
      const el1 = 0.25 + s1 * 1.05, az1 = 0.9 + S.mxs * 0.05;
      tmpV.copy(EARTH.pos).lerp(ORIGIN, smooth(0.05, 0.45, e));
      fc.position.set(tmpV.x + Math.sin(az1) * Math.cos(el1) * d1, tmpV.y + Math.sin(el1) * d1, tmpV.z + Math.cos(az1) * Math.cos(el1) * d1);
      fc.lookAt(tmpV);
      fc.aspect = fr.width / fr.height; fc.fov = narrow ? 55 : 40; fc.updateProjectionMatrix();
      // 银河：正上方俯视（正圆），差速旋转
      galT += moving ? dt : 0;
      galMat.uniforms.uT.value = galT; galStarMat.uniforms.uT.value = galT; galStarMat.uniforms.uTime.value = T0;
      GX.on = e > 0.8;
      if (foot.dataset.cursor !== (GX.on ? '拖动旋转银河' : '')) foot.dataset.cursor = GX.on ? '拖动旋转银河' : '';
      if (!GX.down) { GX.rot += GX.vr * dt; GX.vr *= Math.exp(-dt * 2.5);  }
      galMat.uniforms.uRot.value = GX.rot; galStarMat.uniforms.uRot.value = GX.rot;
      fgMat.uniforms.uTime.value = T0;
      if (moving) { fgDust.rotation.y += dt * 0.02; gStars.rotation.y += dt * 0.012; smudges.forEach((s) => { s.sp.position.x += s.vx * dt; s.sp.position.z += s.vz * dt; s.sp.material.rotation += s.vr * dt; }); }
      const sunAng = galT * 0.03 + GX.rot;
      sunG.copy(SUN_GAL).applyAxisAngle(UP, sunAng).setY(2);
      hereGlow.position.copy(sunG); hereGlow2.position.copy(sunG);
      const s2 = smooth(0.5, 1, e);
      // 最后停在近景俯视：银心偏右（手机上偏下），放大到太阳系绕银心那一圈刚好完整留在屏幕里，银河外圈延伸到屏幕外
      const fov = (narrow ? 55 : 40) * Math.PI / 180, tn = Math.tan(fov / 2), asp = fr.width / fr.height, Rg = 0.19 * G * 1.1;
      let halfH, endT;
      if (narrow) { halfH = Math.max(Rg / (0.92 * asp), Rg / 0.77); endT = new V3(0, 0, -0.18 * halfH); }
      else { halfH = Math.max(Rg / 0.9, Rg / (0.65 * asp)); endT = new V3(-0.3 * halfH * asp, 0, 0); }
      const gT = sunG.clone().lerp(endT, smooth(0.15, 1, s2));
      const h2 = 14 * Math.pow((halfH / tn) / 14, s2);
      gc.position.set(gT.x + S.mxs * 0.012 * h2, gT.y + h2, gT.z + S.mys * 0.012 * h2);
      foot.style.setProperty('--scrim', smooth(0.62, 0.95, e).toFixed(3));
      gc.lookAt(gT);
      gc.aspect = fr.width / fr.height; gc.fov = narrow ? 55 : 40; gc.updateProjectionMatrix();
      const pulse = 1 + 0.25 * Math.sin(T0 * 2.4);
      hereGlow.scale.setScalar(h2 * 0.026 * pulse + 4); hereGlow2.scale.setScalar(h2 * 0.07 + 10);
      const mix = smooth(0.48, 0.64, e);
      gc.updateMatrixWorld();
      const hv = sunG.clone().project(gc);
      const hOn = mix > 0.9 && e > 0.72 && hv.z < 1;
      here.style.opacity = hOn ? String(smooth(0.72, 0.86, e)) : '0';
      here.classList.toggle('flip', hv.x > 0.3); // 标注转到右侧时文字放到左边，不会出屏
      if (hOn) here.style.transform = `translate(${(((hv.x + 1) / 2) * fr.width).toFixed(1)}px,${(((1 - hv.y) / 2) * fr.height).toFixed(1)}px)`;
      footPost.u.uTime.value = T0; footPost.u.uExpo.value = 1.0; footPost.u.uWarp.value = LOW ? 0 : S.warpBoost || 0;
      setRegion(fr.left, fr.top, fr.width, fr.height);
      footPost.render(hs, fc, fr.width, fr.height, gs, gc, mix);
    } else { here.style.opacity = '0'; galT = 0; S.footE = 0; }
    R.setScissorTest(false);
  };
  document.documentElement.classList.add('gl-ready');
  world.resize();
})();
