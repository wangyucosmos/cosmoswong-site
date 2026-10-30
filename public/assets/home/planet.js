/* 子页面页头的星球：和首页同一套贴图与光照（真实贴图 + 太阳光照 + ACES 色调），代替 CSS 平铺贴图。
   页头 <section class="page-head" data-planet="earth|jupiter|mars|saturn|moon"> 里的 .planet 由 app.js 插入，
   这个脚本也由 app.js 按需加载（先 three.min.js 再本文件）；没有 WebGL 时什么都不做，CSS 版照常显示。
   地球：昼夜两张图 + 云层 + 大气辉光，开场把上海转到正对镜头、略偏西，之后慢慢自转，上海有金色光点闪烁。 */
(function () {
  const host = document.querySelector('.page-head .planet'), head = host && host.closest('.page-head');
  if (!host || !window.THREE) return;
  const kind = head.dataset.planet;
  const THREE = window.THREE, V3 = THREE.Vector3;
  let R;
  try { R = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' }); } catch (e) { return; }
  if (!R.getContext()) return;
  const STILL = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const cv = R.domElement; cv.className = 'planet-gl'; cv.setAttribute('aria-hidden', 'true');
  R.setClearColor(0x000000, 0);

  // 画布比星球本体大 70%，留出大气辉光和土星环
  const PAD = kind === 'saturn' ? 2.55 : 1.7, scene = new THREE.Scene();   // 土星环外径是星球半径的 2.27 倍，画布要放得下整个环
  const cam = new THREE.PerspectiveCamera(22, 1, 0.1, 100);
  const DIST = 1 / Math.tan((22 * Math.PI) / 360) * PAD;   // 半径 1 的球正好占画布高度的 1/PAD
  cam.position.set(0, 0, DIST); cam.lookAt(0, 0, 0);
  const SUN = new V3(-6, 2.6, 5.5);   // 太阳在左上前方：亮面朝左，右下是夜面（和 CSS 版阴影方向一致）
  const TL = new THREE.TextureLoader(), base = '/assets/home/tex/';
  const tex = (f) => { const t = TL.load(base + f, () => draw()); t.anisotropy = Math.min(8, R.capabilities.getMaxAnisotropy()); return t; };

  const VERT = `varying vec2 vUv; varying vec3 vNw; varying vec3 vPw;
    void main(){ vUv=uv; vNw=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.); vPw=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
  // 线性空间算光照，最后 ACES + gamma（首页是在后期里做，这里直接在片元里做）
  const TONE = `vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
    vec4 outc(vec3 c, float a){ return vec4(pow(aces(c), vec3(1./2.2)), a); }`;
  const group = new THREE.Group(); scene.add(group);
  const spin = new THREE.Group(); group.add(spin);
  const geo = new THREE.SphereGeometry(1, 96, 64);
  let marker = null, ring = null, rate = 0.02;

  if (kind === 'earth') {
    const U = { uDay: { value: tex('earth_day.webp') }, uNight: { value: tex('earth_night.webp') }, uClouds: { value: tex('earth_clouds.webp') }, uSun: { value: SUN }, uShift: { value: 0 } };
    spin.add(new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT,
      fragmentShader: `uniform sampler2D uDay; uniform sampler2D uNight; uniform sampler2D uClouds; uniform vec3 uSun; uniform float uShift;
        varying vec2 vUv; varying vec3 vNw; varying vec3 vPw; ${TONE}
        void main(){
          vec3 N=normalize(vNw); vec3 L=normalize(uSun-vPw); vec3 V=normalize(cameraPosition-vPw); float ndl=dot(N,L);
          vec3 day=lin(texture2D(uDay,vUv).rgb); vec3 night=lin(texture2D(uNight,vUv).rgb);
          float cl=texture2D(uClouds,vec2(vUv.x+uShift,vUv.y)).r; float dayK=smoothstep(-.12,.24,ndl);
          vec3 col=day*max(ndl,0.)*2.1*(1.-cl*.4);
          col+=night*(1.-dayK)*2.6*(1.-cl*.8);
          col+=vec3(1.,.42,.18)*day*smoothstep(.22,0.,abs(ndl))*.5;
          float fres=pow(1.-max(dot(N,V),0.),3.); col+=vec3(.22,.5,1.)*fres*smoothstep(-.3,.5,ndl)*1.3;
          gl_FragColor=outc(col,1.); }` })));
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, 96, 64), new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
      uniforms: { uClouds: U.uClouds, uSun: U.uSun }, vertexShader: VERT,
      fragmentShader: `uniform sampler2D uClouds; uniform vec3 uSun; varying vec2 vUv; varying vec3 vNw; varying vec3 vPw; ${TONE}
        void main(){ vec3 N=normalize(vNw); vec3 L=normalize(uSun-vPw); float ndl=dot(N,L);
          float a=smoothstep(.08,.9,texture2D(uClouds,vUv).r);
          vec3 c=vec3(1.,.98,.95)*max(ndl,0.)*2.2+vec3(1.,.5,.25)*smoothstep(.2,0.,abs(ndl))*.6+vec3(.01,.012,.02);
          gl_FragColor=outc(c,a*smoothstep(-.3,.1,ndl)*.92); }` }));
    spin.add(clouds);
    // 大气层：贴着地表的一道细蓝边（真实大气只有地球半径的 1% 多，这里取 2.5%），越靠边越亮，夜面暗下去
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.025, 96, 64), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
      uniforms: { uSun: U.uSun }, vertexShader: VERT,
      fragmentShader: `uniform vec3 uSun; varying vec3 vNw; varying vec3 vPw;
        void main(){ vec3 N=normalize(vNw); vec3 V=normalize(cameraPosition-vPw); float e=pow(clamp(1.-abs(dot(N,V))*1.02,0.,1.),3.);
          float lit=smoothstep(-.4,.6,dot(N,normalize(uSun-vPw)));
          gl_FragColor=vec4(vec3(.35,.62,1.)*e*lit*.85,1.); }` })));
    // 上海（31.23°N, 121.47°E）：Three 球体 u=0 在经度 -180°
    const lat = (31.23 * Math.PI) / 180, phi = ((121.47 + 180) / 360) * Math.PI * 2;
    const SH = new V3(-Math.cos(phi) * Math.cos(lat), Math.sin(lat), Math.sin(phi) * Math.cos(lat));
    const glow = (c) => { const s = 64, g = document.createElement('canvas'); g.width = g.height = s; const x = g.getContext('2d'), gr = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, c[0]); gr.addColorStop(c[2], c[1]); gr.addColorStop(1, 'rgba(255,160,60,0)'); x.fillStyle = gr; x.fillRect(0, 0, s, s); return new THREE.CanvasTexture(g); };
    const sp = (map, sz) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true })); m.scale.set(sz, sz, 1); m.position.copy(SH).multiplyScalar(1.015); m.renderOrder = 5; spin.add(m); return m; };
    marker = { dir: SH, core: sp(glow(['rgba(255,240,200,1)', 'rgba(255,192,74,.9)', .35]), .09), halo: sp(glow(['rgba(255,192,74,0)', 'rgba(255,200,110,.85)', .8]), .1) };
    // 开场：上海略偏西、正对镜头；整体往北倾一点，让中国落在画面中部
    group.rotation.x = 0.42;
    spin.rotation.y = -Math.atan2(SH.x, SH.z) - 0.22;
    rate = 0.012;
  } else {
    const FILE = { jupiter: 'jupiter_1k.webp', mars: 'mars_1k.webp', saturn: 'saturn_1k.webp', moon: 'moon.webp' }[kind] || 'moon.webp';
    rate = { jupiter: 0.05, saturn: 0.045, mars: 0.02, moon: 0.008 }[kind] || 0.02;
    spin.add(new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: { uMap: { value: tex(FILE) }, uSun: { value: SUN }, uRim: { value: new THREE.Color(kind === 'mars' ? '#ff9a6a' : '#ffe2b8') } }, vertexShader: VERT,
      fragmentShader: `uniform sampler2D uMap; uniform vec3 uSun; uniform vec3 uRim; varying vec2 vUv; varying vec3 vNw; varying vec3 vPw; ${TONE}
        void main(){ vec3 N=normalize(vNw); vec3 L=normalize(uSun-vPw); vec3 V=normalize(cameraPosition-vPw); float ndl=dot(N,L);
          vec3 c=lin(texture2D(uMap,vUv).rgb)*(max(ndl,0.)*2.05+.015);
          c+=lin(uRim)*pow(1.-max(dot(N,V),0.),4.)*smoothstep(-.2,.6,ndl)*.35;
          gl_FragColor=outc(c,1.); }` })));
    if (kind === 'saturn') {
      const IN = 1.24, OUT = 2.27;
      ring = new THREE.Mesh(new THREE.RingGeometry(IN, OUT, 160, 1), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { uRing: { value: tex('saturn_ring.webp') }, uSun: { value: SUN } },
        vertexShader: `varying float vRad; varying vec3 vPw; void main(){ vRad=length(position.xy); vec4 w=modelMatrix*vec4(position,1.); vPw=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
        fragmentShader: `uniform sampler2D uRing; uniform vec3 uSun; varying float vRad; varying vec3 vPw; ${TONE}
          void main(){ vec4 tx=texture2D(uRing,vec2((vRad-${IN.toFixed(2)})/${(OUT - IN).toFixed(2)},.5));
            vec3 L=normalize(uSun-vPw); float b=dot(-vPw,L); float c=dot(vPw,vPw)-1.; float sh=(b>0. && b*b-c>0.)?.08:1.;
            gl_FragColor=outc(lin(tx.rgb)*1.9*sh, tx.a*.95); }` }));
      ring.rotation.x = -Math.PI / 2 + 0.38; ring.rotation.y = -0.32;
      group.add(ring);
      group.rotation.z = 0.12;
    }
  }

  // 尺寸：画布铺满 .planet 外扩的一圈；只在页头看得见时转
  host.classList.add('gl'); host.appendChild(cv);
  function size() {
    const w = Math.round(host.clientWidth * PAD) || 1;
    R.setPixelRatio(Math.min(2, devicePixelRatio || 1)); R.setSize(w, w, false);
    cv.style.width = cv.style.height = w + 'px'; draw();
  }
  let on = true, last = performance.now(), t = 0;
  function draw() {
    if (marker) {
      const blink = 0.65 + 0.35 * Math.sin(t * 5.2), ph = (t * 0.6) % 1;
      // 光点转到背面就淡出
      spin.updateMatrixWorld(true);
      const w = marker.dir.clone().transformDirection(spin.matrixWorld), face = Math.min(1, Math.max(0, (w.z - 0.08) / 0.2));
      marker.core.material.opacity = face * blink; marker.core.scale.setScalar(0.09 * (0.9 + 0.2 * blink));
      marker.halo.material.opacity = face * (1 - ph) * 0.9; marker.halo.scale.setScalar(0.08 + ph * 0.3);
    }
    R.render(scene, cam);
  }
  function loop(now) {
    if (!on) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    spin.rotation.y += dt * rate;
    draw();
    requestAnimationFrame(loop);
  }
  addEventListener('resize', size); size();
  if (STILL) return;
  new IntersectionObserver(([e]) => { const was = on; on = e.isIntersecting; if (on && !was) { last = performance.now(); requestAnimationFrame(loop); } }).observe(head);
  requestAnimationFrame(loop);
})();
