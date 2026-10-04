/* 我的工作台 · 素材库（v3）：直接看本机文件夹里的图片。
   用的是 Chrome / Edge 的「文件夹访问」：你选一次文件夹、点允许，网页就能在你这台电脑的浏览器里读图片——
   图片不会上传到任何地方（不经过服务器，也不进 D1）。文件夹句柄、扫描结果和缩略图缓存在本机浏览器的 IndexedDB 里，
   换电脑、换浏览器、清浏览器数据后要重新选一次。手机和 Safari 不支持，页面会说明。
   v5：分类更细——类型看整条路径（「弹窗/抽奖机切图」既是弹窗也是切图）、活动（文件夹名去掉日期、省份、类型字眼后剩下的）、
   月份（文件夹名里的日期，没有就看修改时间）、页面模块（「1-头图」「4-抽好礼」这种）；同名同大小的重复图折成一张；
   可以不看某些顶层文件夹；能打星收藏、设为某个项目的参考图；项目页、今天页、开工包会按省份 / 名字 / 去年同期推荐「可能用得上」的图。
   收藏和参考图也只存在这台电脑的浏览器里（IndexedDB），和图片一样不上传。 */
(() => {
  const D = window.DESK;
  const { esc } = D;
  const IMG = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;
  const SKIP = /^(\.|__MACOSX$|node_modules$|\$RECYCLE)/;
  const MAX_FILES = 30000;
  // 文件夹名里带这些字的算对应类型；一张图可以同时属于几类。「切图」排最后：它说的是做到哪一步，不是图里画的什么
  const TYPE_RULES = [['弹窗', /弹窗/], ['主KV', /kv|主视觉/i], ['头图', /头图|banner|横幅/i], ['长图', /长图/], ['原型', /原型/], ['图标', /图标|icon/i], ['海报', /海报|易拉宝/], ['截图', /截图|拨测/], ['切图', /切图/]];
  // 演示页：没有真实文件夹，用浏览器私有存储（OPFS）里生成的示例图片，所以只要浏览器能写 OPFS 就算支持
  const A = D.assets = { supported: typeof window.showDirectoryPicker === 'function' || (D.DEMO && typeof navigator.storage?.getDirectory === 'function' && typeof window.FileSystemFileHandle?.prototype?.createWritable === 'function'), root: null, rootName: '', perm: 'none', files: [], scanning: false, scannedAt: null, error: '', limit: 120, stars: new Set(), refs: {} };
  const handles = new Map();   // 相对路径 → 文件句柄（这次打开期间）
  const urls = new Map();      // 缩略图 object URL

  /* ---------- 本机浏览器里的小仓库（IndexedDB）：文件夹句柄、扫描结果、缩略图 ---------- */
  let dbp = null;
  const idb = () => dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(D.DEMO ? 'desk-demo-assets' : 'desk-assets', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('thumbs'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const tx = async (store, mode, fn) => {
    const db = await idb();
    return new Promise((res, rej) => { const t = db.transaction(store, mode), req = fn(t.objectStore(store)); t.oncomplete = () => res(req?.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  };
  const kvGet = k => tx('kv', 'readonly', s => s.get(k)).catch(() => null);
  const kvSet = (k, v) => tx('kv', 'readwrite', s => s.put(v, k)).catch(() => {});

  /* ---------- 分类：分组（省份 / 顶层文件夹）、类型、活动、月份、页面模块、当前版 ---------- */
  const show = s => String(s || '').replace(/^_+/, '');
  // 文件夹名里不算「活动名」的字眼：批次说明、版本说明、整理用的子文件夹
  const NOISE = /单页|单个|单部分|整体|images?|imgs?|有按钮|无按钮|按钮|素材|物料|页面|文档|更新|增补|补$|重做|参考|最终|定稿|新版|旧版|副本|copy|待更新的?|各省|\d+省/gi;
  const MOD = /^(?:\d{8}_)?\d{1,2}-(.+)$/;   // 「1-头图」「4-抽好礼」：页面模块
  const TYPE_WORDS = new RegExp(TYPE_RULES.map(([, re]) => re.source).join('|'), 'gi');
  const pad2 = n => String(n).padStart(2, '0');
  function actName(seg, provs) {
    if (MOD.test(seg)) return '';   // 页面模块不是活动
    let s = show(seg).replace(/^\d{8}[_\-\s]*/, '').replace(/^\d{1,2}\.\d{1,2}(?!\d)/, '').replace(/(?<![\d.])\d{4}$/, '')
      .replace(/[（(]\d+[)）]/g, '').replace(/\s+\d+$/, '');
    for (const p of provs) if (p) s = s.split(p).join('');
    s = s.replace(TYPE_WORDS, '').replace(NOISE, '').replace(/[\s_\-—·]+/g, '').replace(/[和及与]$/, '').replace(/福利页/, '福利中心');
    return s.length >= 2 ? s : '';
  }
  function monthOf(dirs, mtime) {
    const m0 = new Date(mtime || Date.now()), y0 = m0.getFullYear();
    for (const d of [...dirs].reverse()) {
      let m = /(20\d{2})(0[1-9]|1[0-2])(\d{2})/.exec(d); if (m) return `${m[1]}-${m[2]}`;
      m = /(?:^|\D)(\d{1,2})\.(\d{1,2})(?!\d)/.exec(d); if (m && +m[1] >= 1 && +m[1] <= 12) return `${y0}-${pad2(m[1])}`;
      m = /\D(0[1-9]|1[0-2])([0-3]\d)$/.exec(d); if (m) return `${y0}-${m[1]}`;
    }
    return `${y0}-${pad2(m0.getMonth() + 1)}`;
  }
  function facet(path, mtime) {
    const dirs = path.split('/').slice(0, -1);
    const i = dirs.findIndex(d => /分省|省份/.test(d));   // 名字里带「分省 / 省份」的文件夹，下一层就是省份
    const provs = D.cfg().provinces;
    let gi = i >= 0 && dirs[i + 1] ? i + 1 : dirs.findIndex(d => provs.includes(show(d)));
    if (gi < 0) gi = 0;
    const g = dirs[gi] || '';
    const types = [], segs = dirs.slice(gi);
    for (const d of segs) for (const [t, re] of TYPE_RULES) if (re.test(d) && !types.includes(t)) types.push(t);
    // 缩略图角上显示一类：有别的就不显示「切图」
    const t = [...types].sort((x, y) => (x === '切图') - (y === '切图'))[0] || '其他';
    let act = '';
    for (const d of dirs.slice(gi + 1)) { if (MOD.test(d)) break; if (/^_(当前|历史)$/.test(d)) continue; act = actName(d, [...provs, show(g)]); if (act) break; }
    const mod = [...dirs].reverse().map(d => MOD.exec(d)).find(Boolean);
    return { g: show(g) || '根目录', top: dirs[0] || '', t, types: types.length ? types : ['其他'], act, ym: monthOf(dirs, mtime), mod: mod ? mod[1].replace(/^kv$/i, '主KV') : '',
      cur: dirs.includes('_当前') ? 'cur' : dirs.includes('_历史') ? 'old' : '' };
  }
  // 同名同大小的算重复：留最新的那张，其余记在它的 dups 里
  function withFacets(list) {
    const seen = new Map();
    for (const f of list) {
      Object.assign(f, facet(f.path, f.mtime), { dup: false, dups: [] });
      const k = f.name + '|' + f.size, first = seen.get(k);
      if (first) { f.dup = true; first.dups.push(f.path); } else seen.set(k, f);
    }
    return list;
  }
  // 设置里勾掉不看的顶层文件夹
  const excluded = () => new Set(D.pref.get('assets.exclude', []));
  A.visible = (withDups = false) => { const ex = excluded(); return A.files.filter(f => !ex.has(f.top) && (withDups || !f.dup)); };

  /* ---------- 连接 / 恢复 / 扫描 ---------- */
  async function walk(dir, prefix, out) {
    for await (const [name, h] of dir.entries()) {
      if (out.length >= MAX_FILES) return;
      if (SKIP.test(name)) continue;
      const path = prefix ? `${prefix}/${name}` : name;
      if (h.kind === 'directory') await walk(h, path, out);
      else if (IMG.test(name)) {
        try { const f = await h.getFile(); out.push({ path, name, size: f.size, mtime: f.lastModified }); handles.set(path, h); } catch { /* 读不了的跳过 */ }
      }
    }
  }
  async function scan() {
    if (!A.root || A.scanning) return;
    A.scanning = true; A.error = ''; D.render();
    try {
      const out = []; handles.clear();
      await walk(A.root, '', out);
      A.files = withFacets(out.sort((a, b) => b.mtime - a.mtime));
      A.scannedAt = Date.now();
      await kvSet('index', { rootName: A.rootName, files: out.map(({ path, name, size, mtime }) => ({ path, name, size, mtime })), scannedAt: A.scannedAt });
    } catch (e) { A.error = '扫描没完成：' + (e.message || e); }
    A.scanning = false; D.render();
  }
  // 选文件夹：点按钮弹出选择框，或者从访达把文件夹拖到素材库页面上（h 就是拖进来的那个）
  async function connect(h, { silent = false } = {}) {
    if (!A.supported) return D.toast('这个浏览器不支持读本机文件夹，请用电脑上的 Chrome 或 Edge 打开', { error: true });
    if (!h) { try { h = await window.showDirectoryPicker({ id: 'desk-assets', mode: 'read' }); } catch { return; } }   // 取消了
    if (h.kind !== 'directory') return D.toast('拖进来的是文件，请拖整个文件夹', { error: true });
    A.root = h; A.rootName = h.name; A.perm = 'granted'; A.files = []; A.limit = 120;
    await kvSet('root', h);
    if (!silent) D.toast(`已连接「${h.name}」，正在扫描图片…`, { icon: 'image' });
    await scan();
  }
  async function resume() {
    if (!A.root) return;
    try { A.perm = await A.root.requestPermission({ mode: 'read' }); } catch { A.perm = 'denied'; }
    D.render();
    if (A.perm === 'granted') scan();
  }
  async function forget() {
    if (!(await D.confirm('断开素材文件夹？只是让这个网页不再读它，你电脑里的图片不会有任何变化。', '断开', { danger: false }))) return;
    await tx('kv', 'readwrite', s => { s.delete('root'); return s.delete('index'); }).catch(() => {});   // 收藏和参考图留着，下次连回来还在
    await tx('thumbs', 'readwrite', s => s.clear()).catch(() => {});
    urls.forEach(u => URL.revokeObjectURL(u)); urls.clear(); handles.clear();
    Object.assign(A, { root: null, rootName: '', perm: 'none', files: [], scannedAt: null, error: '' });
    D.render(); D.toast('已断开');
  }
  D.on('ready', async () => {
    if (!A.supported || A.root) return;
    A.stars = new Set((await kvGet('stars')) || []); A.refs = (await kvGet('refs')) || {};
    const root = await kvGet('root');
    if (!root) return;
    A.root = root; A.rootName = root.name;
    const idx = await kvGet('index');
    if (idx?.files) { A.files = withFacets(idx.files); A.scannedAt = idx.scannedAt; }
    try { A.perm = await root.queryPermission({ mode: 'read' }); } catch { A.perm = 'prompt'; }
    D.render();
    if (A.perm === 'granted') scan();
  });

  /* ---------- 读文件、做缩略图 ---------- */
  async function fileOf(path) {
    let h = handles.get(path);
    if (!h && A.root) {
      try { let dir = A.root; const segs = path.split('/'); for (const s of segs.slice(0, -1)) dir = await dir.getDirectoryHandle(s); h = await dir.getFileHandle(segs.at(-1)); handles.set(path, h); } catch { return null; }
    }
    try { return await h.getFile(); } catch { return null; }
  }
  let running = 0; const queue = [];
  const pump = () => { while (running < 4 && queue.length) { const job = queue.shift(); running++; job().finally(() => { running--; pump(); }); } };
  const limited = fn => new Promise((res, rej) => { queue.push(() => fn().then(res, rej)); pump(); });
  async function makeThumb(f) {
    const file = await fileOf(f.path); if (!file) return null;
    if (/\.svg$/i.test(f.name)) return file;
    const bmp = await createImageBitmap(file);
    // 长图只取最上面一截（4:5），不然缩成一条细线看不清
    const sh = bmp.height / bmp.width > 1.6 ? Math.round(bmp.width * 1.25) : bmp.height;
    const scale = Math.min(1, 420 / Math.max(bmp.width, sh));
    const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(sh * scale));
    const cv = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    cv.getContext('2d').drawImage(bmp, 0, 0, bmp.width, sh, 0, 0, w, h);
    bmp.close?.();
    return cv.convertToBlob ? cv.convertToBlob({ type: 'image/webp', quality: .82 }) : new Promise(r => cv.toBlob(r, 'image/webp', .82));
  }
  // 同一张图同时被要两次（今天页 + 弹窗、页面重画）时只做一次：否则第二次会覆盖缓存，第一次拿到的图地址就失效了，缩略图变空白
  const inflight = new Map();
  function thumbUrl(f) {
    const key = `${f.path}|${f.mtime}`;
    if (urls.has(key)) return Promise.resolve(urls.get(key));
    if (!inflight.has(key)) inflight.set(key, makeUrl(f, key).finally(() => inflight.delete(key)));
    return inflight.get(key);
  }
  async function makeUrl(f, key) {
    let blob = await tx('thumbs', 'readonly', s => s.get(key)).catch(() => null);
    if (!blob) {
      try { blob = await limited(() => makeThumb(f)); } catch { blob = await fileOf(f.path); }
      if (!blob) return '';
      if (blob.size < 600000) tx('thumbs', 'readwrite', s => s.put(blob, key)).catch(() => {});
    }
    const u = URL.createObjectURL(blob); urls.set(key, u); return u;
  }
  // 缩略图分几组（素材库页 / 今天页 / 项目页 / 开工包），每组一张清单；<img data-thumb="序号" data-tctx="组"> 滚到眼前才加载
  D.assetLists = {};
  const ios = {};
  D.hydrateThumbs = (root, list, ctx = 'kick') => {
    D.assetLists[ctx] = list;
    ios[ctx]?.disconnect();
    ios[ctx] = new IntersectionObserver(entries => entries.forEach(async en => {
      if (!en.isIntersecting) return;
      ios[ctx].unobserve(en.target);
      const f = list[Number(en.target.dataset.thumb)]; if (!f) return;
      const u = await thumbUrl(f).catch(() => '');
      if (!u || !en.target.isConnected) return;
      // 同一张图可能被两次懒加载（页面重画时又挂了一次观察）：已经是这个地址、已经加载完的，直接显示，不等 load 事件
      const img = en.target, show = () => img.classList.add('ok');
      img.addEventListener('load', show, { once: true });
      if (img.getAttribute('src') !== u) img.src = u;
      if (img.complete && img.naturalWidth) show(); else img.decode?.().then(show, () => {});   // decode() 兜底：load 事件偶尔会错过
    }), { rootMargin: '300px' });
    root.querySelectorAll(`img[data-thumb][data-tctx="${ctx}"]`).forEach(img => ios[ctx].observe(img));
  };
  let mo = null;
  function hydrateMore(root) {
    const more = root.querySelector('[data-assets-more]');
    mo?.disconnect(); mo = null;
    if (more) { mo = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { mo.disconnect(); A.limit += 120; D.render(true); } }, { rootMargin: '400px' }); mo.observe(more); }
  }

  /* ---------- 收藏、项目参考图（只存在这台电脑的浏览器里） ---------- */
  const saveStars = () => kvSet('stars', [...A.stars]);
  const saveRefs = () => kvSet('refs', A.refs);
  A.toggleStar = path => { if (A.stars.has(path)) A.stars.delete(path); else A.stars.add(path); saveStars(); D.render(true); };
  A.refsOf = pid => (A.refs[pid] || []).map(p => A.files.find(f => f.path === p)).filter(Boolean);
  A.addRef = (pid, path) => { const l = A.refs[pid] || []; if (!l.includes(path)) A.refs[pid] = [path, ...l].slice(0, 60); saveRefs(); D.render(true); };
  A.delRef = (pid, path) => { A.refs[pid] = (A.refs[pid] || []).filter(p => p !== path); saveRefs(); D.render(true); };

  /* ---------- 「可能用得上」：同省份、名字对上、去年同期、当前版、收藏过的优先 ---------- */
  const shiftYm = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
  const titleWords = t => String(t || '').replace(/[（(].*?[)）]/g, ' ').replace(/20\d\d\s*年|\d{1,2}\s*月/g, ' ').split(/[\s·：:，,、「」『』—\-_/]+/)
    .flatMap(w => w.length > 4 ? [w, w.slice(0, 2), w.slice(-2)] : [w]).filter(w => w.length >= 2 && !/^\d+$/.test(w) && !/^(示例|活动|项目|模块|页面|福利|中心)$/.test(w));
  D.assetSuggest = (p, n = 6) => {
    if (!p || !A.files.length) return [];
    const files = A.visible(), prov = p.province || '', provs = D.cfg().provinces;
    // 项目名里的省份字眼不算「名字对上」（省份另外加分），不然别的省的图也会被推荐
    const ws = [...new Set(titleWords(p.title))].filter(w => !provs.some(v => v && (v.includes(w) || w.includes(v)))).slice(0, 8);
    const ym = (p.launch_at || '').slice(0, 7) || p.month || D.today().slice(0, 7), ly = shiftYm(ym, -12);
    const near = new Set([shiftYm(ly, -1), ly, shiftYm(ly, 1)]);
    const pinned = A.refsOf(p.id).map(f => Object.assign(Object.create(f), { why: '设为参考' }));
    const scored = files.filter(f => !(A.refs[p.id] || []).includes(f.path)).map(f => {
      let s = 0; const why = [];
      if (prov && f.g === prov) { s += 4; why.push('同省份'); }
      const hay = (f.path + ' ' + f.act).toLowerCase(), hit = ws.filter(w => hay.includes(w.toLowerCase()));
      if (hit.length) { s += 3 * Math.min(2, hit.length); why.push(`对上「${hit[0]}」`); }
      if (near.has(f.ym)) { s += 2; why.push('去年同期'); }
      if (A.stars.has(f.path)) { s += 2; why.push('收藏过'); }
      if (f.cur === 'cur') s += 1; else if (f.cur === 'old') s -= 1;
      return { f, s, why };
    }).filter(r => r.s >= 4).sort((a, b) => b.s - a.s || b.f.mtime - a.f.mtime);
    // 同一个文件夹最多拿 2 张，免得全是同一批
    const per = new Map(), out = [];
    for (const r of scored) {
      const dir = r.f.path.split('/').slice(0, -1).join('/'), k = per.get(dir) || 0;
      if (k >= 2) continue; per.set(dir, k + 1);
      out.push(Object.assign(Object.create(r.f), { why: r.why.join(' · ') }));
      if (pinned.length + out.length >= n) break;
    }
    return [...pinned, ...out].slice(0, n);
  };

  /* ---------- 筛选 ---------- */
  const FDEF = { g: '', t: '', act: '', ym: '', cur: false, star: false, dup: false, sort: 'new' };
  const fpref = () => ({ ...FDEF, ...D.pref.get('assets.f', {}) });
  function filtered() {
    const f = fpref(), q = (D.aq || '').toLowerCase();
    const list = A.visible(f.dup).filter(x => (!f.g || x.g === f.g) && (!f.t || x.types.includes(f.t)) && (!f.act || x.act === f.act) && (!f.ym || x.ym === f.ym)
      && (!f.cur || x.cur !== 'old') && (!f.star || A.stars.has(x.path)) && (!q || x.path.toLowerCase().includes(q)));
    return f.sort === 'name' ? [...list].sort((a, b) => a.path.localeCompare(b.path, 'zh')) : list;
  }
  const count = (list, k) => { const m = new Map(); list.forEach(x => [].concat(x[k]).forEach(v => m.set(v, (m.get(v) || 0) + 1))); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const thumb = (x, i, ctx = 'page', cls = '') => `<button type="button" class="th ${cls}${A.stars.has(x.path) ? ' starred' : ''}" data-asset="${i}" data-actx="${ctx}" style="--k:${i % 24}" title="${esc(x.why ? `${x.path}\n${x.why}` : x.path)}"><img data-thumb="${i}" data-tctx="${ctx}" alt="${esc(x.name)}"><span class="tg">${esc(x.t)}</span>${x.dups?.length ? `<span class="dupn" title="另有 ${x.dups.length} 处同一张图">×${x.dups.length + 1}</span>` : ''}<span class="nm">${esc(x.why || x.act || x.name)}</span>${A.stars.has(x.path) ? `<span class="stmark">${D.icon('star', 'sm')}</span>` : ''}</button>`;
  D.assetThumb = thumb;

  D.assetsSub = () => !A.supported ? '直接看你电脑里的图片——需要电脑上的 Chrome 或 Edge' : A.root ? `「${esc(A.rootName)}」· ${A.visible().length.toLocaleString('en-US')} 张图片（重复的折起来了） · 只在这台电脑的浏览器里显示，不会上传` : '直接看你电脑里的图片，不上传任何东西';
  const resumeNeeded = () => A.root && A.perm !== 'granted';
  // 今天页的小卡片
  const connectSmall = () => `<div class="connect"><div class="ghosts">${'<span></span>'.repeat(6)}</div>
    ${resumeNeeded() ? `<span>上次连接的是「${esc(A.rootName)}」，浏览器要你再点一次允许。</span><button type="button" class="btn sm" data-assets-resume>${D.icon('image', 'sm')}继续查看「${esc(A.rootName)}」</button>`
      : `<span>选一个本机素材文件夹（比如放各省切图、弹窗的那个），这里就会显示最近的图。</span><button type="button" class="btn sm" data-assets-connect>${D.icon('folder', 'sm')}选择素材文件夹</button>`}
    <span class="muted small">${D.icon('lock', 'sm')} 图片只在你这台电脑的浏览器里显示，不会上传到任何地方。</span></div>`;
  // 素材库页的引导
  const connectHero = () => `<div class="connect-hero">
    <div class="ghost-grid" aria-hidden="true">${Array.from({ length: 8 }, (_, i) => `<span style="--i:${i}"></span>`).join('')}</div>
    <h2>${resumeNeeded() ? `继续查看「${esc(A.rootName)}」` : '把本机素材文件夹接进来'}</h2>
    <p class="muted">${resumeNeeded() ? '浏览器出于安全考虑，要你再点一次允许。' : '各省的切图、弹窗、长图，按省份、类型、活动、月份自动分好，点开看大图、复制到 Figma。'}</p>
    ${resumeNeeded() ? `<button type="button" class="btn" data-assets-resume>${D.icon('image', 'sm')}继续查看</button>`
      : `<ol class="steps3"><li><b>1</b>点下面的按钮，或者直接把文件夹从访达拖到这一页</li><li><b>2</b>选放素材的总文件夹（比如放各省切图、弹窗的那个）</li><li><b>3</b>Chrome 问「允许查看文件」时点允许；选「每次访问都允许」，下次就不用再点</li></ol>
        <button type="button" class="btn" data-assets-connect>${D.icon('folder', 'sm')}选择素材文件夹</button>`}
    <p class="muted small">${D.icon('lock', 'sm')} 图片只在你这台电脑的浏览器里显示，不会上传到任何地方。</p></div>`;
  const connectBox = small => small ? connectSmall() : connectHero();

  // 今天页的卡片：有焦点项目就推荐「它可能用得上的」，否则显示最近的当前版
  D.assetsCard = (span = 's7') => {
    if (!A.supported) return '';
    const base = D.cardHead('image', '素材库', '');
    if (!A.root || A.perm !== 'granted' && !A.files.length) return `<section class="card-box ${span}">${base}${connectBox(true)}</section>`;
    const p = D.focusProject?.(), sug = p ? D.assetSuggest(p, 6) : [];
    const list = sug.length ? sug : (A.visible().some(f => f.cur === 'cur') ? A.visible().filter(f => f.cur !== 'old') : A.visible()).slice(0, 6);
    D.assetLists.today = list;
    const head = D.cardHead('image', sug.length ? `素材 · 「${esc(D.firstLine(p.title, 16))}」可能用得上` : '素材库',
      `<button type="button" class="more link-btn" data-goto="assets">全部 ${A.visible().length.toLocaleString('en-US')} 张 →</button>`);
    return `<section class="card-box ${span} lift assets-card" data-today-assets>${head}
      ${list.length ? `<div class="thumbs">${list.map((x, i) => thumb(x, i, 'today')).join('')}</div>` : `<p class="muted">${A.scanning ? '正在扫描…' : '这个文件夹里没有找到图片。'}</p>`}</section>`;
  };
  // 项目页「参考素材」：钉住的 + 推荐的
  D.assetsProjectBlock = p => {
    if (!A.supported || !A.files.length) return '';
    const list = D.assetSuggest(p, 8);
    D.assetLists.proj = list;
    return { n: list.length, pinned: A.refsOf(p.id).length, html: list.length ? `<p class="muted small hint-text">钉住的在前（点开大图 →「设为项目参考」），后面是按省份、名字、去年同期推荐的。</p><div class="thumbs proj-thumbs">${list.map((x, i) => thumb(x, i, 'proj')).join('')}</div>`
      : '<p class="muted small">素材库里没找到明显相关的图。点开任意一张大图，可以「设为这个项目的参考」。</p>' };
  };

  D.renderAssets = (view, el) => {
    if (!A.supported) {
      el.innerHTML = `<div class="page"><section class="card-box"><div class="empty-state"><div class="big-i">${D.icon('monitor')}</div>
        <p><b>这个浏览器看不了本机素材</b></p><p>素材库要用电脑上的 Chrome 或 Edge 打开（手机、Safari 不支持读本机文件夹）。</p><p class="muted small">图片只在你自己的浏览器里显示，不会上传。</p></div></section></div>`;
      return;
    }
    if (!A.root || (A.perm !== 'granted' && !A.files.length)) { el.innerHTML = `<div class="page"><section class="card-box">${connectBox(false)}</section></div>`; return; }
    const f = fpref(), list = filtered(), shown = list.slice(0, A.limit), all = A.visible(f.dup);
    const inG = all.filter(x => !f.g || x.g === f.g);
    const gs = count(all, 'g'), ts = count(inG, 'types'), as = count(inG, 'act').filter(([a]) => a), ms = count(inG, 'ym').sort((a, b) => b[0].localeCompare(a[0]));
    const tops = [...new Set(A.files.map(x => x.top).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh')), ex = excluded();
    const sel = (k, label, opts, fmt = v => v) => `<select data-af="${k}" aria-label="${label}"><option value="">${label}</option>${opts.map(([v, n]) => `<option value="${esc(v)}" ${v === f[k] ? 'selected' : ''}>${esc(fmt(v))}（${n}）</option>`).join('')}</select>`;
    el.innerHTML = `<div class="page assets">
      <div class="ameta"><span class="fold">${D.icon('folder', 'sm')}${esc(A.rootName)}</span><span>${list.length.toLocaleString('en-US')} / ${all.length.toLocaleString('en-US')} 张</span>
        <span>${A.scanning ? '正在扫描…' : A.scannedAt ? `扫描于 ${esc(new Date(A.scannedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }))}` : ''}</span>
        ${A.perm !== 'granted' ? `<button type="button" class="btn sm" data-assets-resume>继续查看（要再点一次允许）</button>` : ''}
        ${A.error ? `<span class="warn-text">${esc(A.error)}</span>` : ''}
        <span class="grow"></span><button type="button" class="tb" data-assets-exclude>${D.icon('eye', 'sm')}不看哪些文件夹${ex.size ? `（${ex.size}）` : ''}</button><button type="button" class="tb" data-assets-rescan ${A.scanning ? 'disabled' : ''}>${D.icon('refresh', 'sm')}重新扫描</button><button type="button" class="tb" data-assets-connect>${D.icon('folder', 'sm')}换文件夹</button><button type="button" class="tb ghost" data-assets-forget>断开</button></div>
      <div class="atools"><input class="filter" type="search" data-afilter data-keep-focus="aq" value="${esc(D.aq || '')}" placeholder="按文件名、文件夹、模块搜…" aria-label="搜素材">
        ${sel('g', '全部省份 / 文件夹', gs)}${as.length ? sel('act', '全部活动', as) : ''}${sel('ym', '全部月份', ms, v => `${v.slice(0, 4)} 年 ${Number(v.slice(5))} 月`)}
        <select data-af="sort" aria-label="排序"><option value="new" ${f.sort !== 'name' ? 'selected' : ''}>最近修改的在前</option><option value="name" ${f.sort === 'name' ? 'selected' : ''}>按路径排</option></select>
        <button type="button" class="fchip-t${f.cur ? ' on' : ''}" data-af-tog="cur">只看当前版</button><button type="button" class="fchip-t${f.star ? ' on' : ''}" data-af-tog="star">${D.icon('star', 'sm')} 收藏 ${A.stars.size || ''}</button><button type="button" class="fchip-t${f.dup ? ' on' : ''}" data-af-tog="dup" title="同名同大小的图默认只显示一张">显示重复的</button></div>
      <div class="chips"><button type="button" class="fchip-t${!f.t ? ' on' : ''}" data-af-t="">全部类型</button>${ts.map(([t, n]) => `<button type="button" class="fchip-t${t === f.t ? ' on' : ''}" data-af-t="${esc(t)}">${esc(t)}<small>${n}</small></button>`).join('')}</div>
      <div class="ex-box" hidden data-ex-box><p class="muted small">勾掉的顶层文件夹不出现在素材库、今天页和推荐里（比如不是活动素材的文件夹）。只记在这台电脑。</p><div class="checks">${tops.map(t => `<label><input type="checkbox" data-ex="${esc(t)}" ${ex.has(t) ? '' : 'checked'}> ${esc(t)} <small class="muted">${A.files.filter(x => x.top === t).length}</small></label>`).join('')}</div></div>
      ${shown.length ? `<div class="agrid">${shown.map((x, i) => thumb(x, i, 'page')).join('')}</div>${list.length > shown.length ? '<div class="more-sentinel" data-assets-more></div>' : ''}`
        : `<p class="empty-state">${A.scanning ? '正在扫描…' : '没有符合条件的图片。'}</p>`}</div>`;
    D.assetLists.page = shown;
  };
  // 每次重画后给图片挂上懒加载
  D.on('render', () => requestAnimationFrame(hydrateNow));
  function hydrateNow() {
    const v = D.$('#view'); if (!v) return;
    for (const ctx of ['page', 'today', 'proj']) if (D.assetLists[ctx] && v.querySelector(`img[data-tctx="${ctx}"]`)) D.hydrateThumbs(v, D.assetLists[ctx], ctx);
    if (D.current?.kind === 'assets') hydrateMore(v);
  }
  document.addEventListener('DOMContentLoaded', () => { new MutationObserver(() => hydrateNow()).observe(D.$('#view'), { childList: true }); });

  /* ---------- 看大图 ---------- */
  let lbList = [], lbIdx = 0, lbUrl = '';
  const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  async function openLb(list, i, { refresh = false } = {}) {
    lbList = list; lbIdx = i;
    const dlg = D.$('#lightbox'), x = list[i]; if (!x) return;
    const file = await fileOf(x.path);
    if (refresh && !dlg.open) return;   // 收藏 / 设参考后刷新时，用户已经关掉了大图，就别再打开
    if (lbUrl) URL.revokeObjectURL(lbUrl);
    lbUrl = file ? URL.createObjectURL(file) : '';
    const proj = D.current?.kind === 'project' ? D.project(D.current.pid) : null, isRef = proj && (A.refs[proj.id] || []).includes(x.path);
    dlg.innerHTML = `<button type="button" class="icon close" data-lb-close aria-label="关闭">${D.icon('x')}</button>
      <div class="stage">${lbUrl ? `<img src="${esc(lbUrl)}" alt="${esc(x.name)}">` : '<p class="muted">读不到这张图了，可能已经被移走。点「重新扫描」。</p>'}
        ${list.length > 1 ? `<button type="button" class="nav-btn prev" data-lb="-1" aria-label="上一张">${D.icon('back')}</button><button type="button" class="nav-btn next" data-lb="1" aria-label="下一张">${D.icon('right')}</button>` : ''}</div>
      <div class="info"><h3>${esc(x.name)}</h3>
        <dl><div><dt>位置</dt><dd>${esc(A.rootName)}/${esc(x.path.split('/').slice(0, -1).join('/'))}</dd></div><div><dt>分组</dt><dd>${esc(x.g)}${x.act ? ' · ' + esc(x.act) : ''}</dd></div>
          <div><dt>类型</dt><dd>${esc(x.types.join('、'))}${x.mod ? ` · 模块「${esc(x.mod)}」` : ''}${x.cur === 'cur' ? ' · 当前版' : x.cur === 'old' ? ' · 历史版' : ''}</dd></div>
          <div><dt>月份</dt><dd>${esc(x.ym)}</dd></div><div><dt>大小</dt><dd>${esc(fmtSize(x.size))}</dd></div><div><dt>尺寸</dt><dd data-lb-dim>—</dd></div><div><dt>修改时间</dt><dd>${esc(new Date(x.mtime).toLocaleString('zh-CN'))}</dd></div><div><dt>第几张</dt><dd>${i + 1} / ${list.length}</dd></div>
          ${x.why ? `<div><dt>为什么推荐</dt><dd>${esc(x.why)}</dd></div>` : ''}</dl>
        ${x.dups?.length ? `<details class="muted small"><summary>另有 ${x.dups.length} 处同一张图</summary>${x.dups.map(p => `<div class="path mono">${esc(p)}</div>`).join('')}</details>` : ''}
        <div class="acts"><button type="button" class="btn" data-lb-copyimg>${D.icon('copy', 'sm')}复制图片</button>
          <button type="button" class="btn ghost${A.stars.has(x.path) ? ' on' : ''}" data-lb-star>${D.icon('star', 'sm')}${A.stars.has(x.path) ? '已收藏' : '收藏'}</button>
          ${proj ? `<button type="button" class="btn ghost" data-lb-ref="${proj.id}">${D.icon('pin', 'sm')}${isRef ? '取消这个项目的参考' : '设为这个项目的参考'}</button>` : `<button type="button" class="btn ghost" data-lb-reffor>${D.icon('pin', 'sm')}设为某个项目的参考</button>`}
          <button type="button" class="btn ghost" data-lb-copypath>${D.icon('folder', 'sm')}复制文件路径</button>
          <p class="muted small">复制图片后，到 Figma 或微信里按 ⌘V 就能贴进去。</p></div></div>`;
    if (!dlg.open) dlg.showModal();
    const img = dlg.querySelector('.stage img');
    if (img) img.onload = () => { const d = dlg.querySelector('[data-lb-dim]'); if (d) d.textContent = `${img.naturalWidth} × ${img.naturalHeight}`; if (img.naturalHeight / img.naturalWidth > 2) img.classList.add('tall'); };
  }
  D.assetsOpen = (list, i) => openLb(list, i);
  async function copyImage(x) {
    try {
      const file = await fileOf(x.path); if (!file) throw new Error('读不到这张图');
      let blob = file;
      if (file.type !== 'image/png') {
        const bmp = await createImageBitmap(file), cv = document.createElement('canvas');
        cv.width = bmp.width; cv.height = bmp.height; cv.getContext('2d').drawImage(bmp, 0, 0);
        blob = await new Promise(r => cv.toBlob(r, 'image/png'));
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      D.toast('已复制图片，到 Figma 里按 ⌘V 就能贴进去', { icon: 'copy' });
    } catch (e) { D.toast('复制图片没成功：' + (e.message || e), { error: true }); }
  }
  // 网页拿不到文件夹在电脑上的完整位置，问一次存起来（只存在这台电脑的浏览器里）
  function fullPath(x, anchor, then) {
    const base = D.pref.get('assets.base.' + A.rootName, '');
    if (base) return then(`${base.replace(/\/$/, '')}/${x.path}`);
    const el = D.popover(anchor, `<form class="pop-form" novalidate><p class="pop-title">「${esc(A.rootName)}」在电脑上的位置</p>
      <p class="muted small">网页只知道文件夹名字。到访达里找到这个文件夹，右键 → 按住 Option 键 →「将“${esc(A.rootName)}”拷贝为路径名」，粘到下面。只问这一次。</p>
      <input name="base" placeholder="/Users/…/${esc(A.rootName)}" aria-label="文件夹完整路径">
      <div class="pop-foot"><button class="btn sm">保存</button></div></form>`, { width: 360 });
    el.querySelector('form').addEventListener('submit', e => {
      e.preventDefault();
      const v = e.target.base.value.trim();
      if (!v) return;
      D.pref.set('assets.base.' + A.rootName, v); D.closePopover();
      then(`${v.replace(/\/$/, '')}/${x.path}`);
    });
  }
  function refFor(x, anchor) {
    D.pickOption(anchor, { options: D.optionsFor('project'), search: true, allowEmpty: false, onPick: pid => {
      const p = D.project(pid); if (!p) return;
      A.addRef(p.id, x.path); D.toast(`已设为「${p.title}」的参考图`, { icon: 'pin' });
    } });
  }

  /* ---------- 事件 ---------- */
  A.connect = connect;
  D.assetsEvents = main => {
    // 从访达把文件夹拖进素材库页面
    main.addEventListener('dragover', e => { if (D.current?.kind === 'assets' && A.supported) { e.preventDefault(); main.classList.add('drop-on'); } });
    main.addEventListener('dragleave', e => { if (!main.contains(e.relatedTarget)) main.classList.remove('drop-on'); });
    main.addEventListener('drop', async e => {
      if (D.current?.kind !== 'assets' || !A.supported) return;
      e.preventDefault(); main.classList.remove('drop-on');
      const it = [...(e.dataTransfer?.items || [])].find(x => x.kind === 'file');
      const h = it?.getAsFileSystemHandle ? await it.getAsFileSystemHandle().catch(() => null) : null;
      if (h) connect(h); else D.toast('没认出拖进来的文件夹，请点「选择素材文件夹」', { error: true });
    });
    main.addEventListener('input', e => { if (D.current?.kind === 'assets' && e.target.matches('[data-afilter]')) { D.aq = e.target.value.trim(); A.limit = 120; D.render(true); } });
    main.addEventListener('change', e => {
      const x = e.target.closest('[data-ex]');
      if (x) { const ex = excluded(); if (x.checked) ex.delete(x.dataset.ex); else ex.add(x.dataset.ex); D.pref.set('assets.exclude', [...ex]); A.limit = 120; D.render(true); D.$('[data-ex-box]')?.removeAttribute('hidden'); return; }
      const s = e.target.closest('[data-af]'); if (!s || D.current?.kind !== 'assets') return;
      const f = fpref(); f[s.dataset.af] = s.value; if (s.dataset.af === 'g') { f.t = ''; f.act = ''; } D.pref.set('assets.f', f); A.limit = 120; D.render(true);
    });
  };
  const setF = (k, v) => { const f = fpref(); f[k] = v; D.pref.set('assets.f', f); A.limit = 120; D.render(true); };
  document.addEventListener('click', e => {
    if (e.target.closest('[data-assets-connect]')) return connect();
    if (e.target.closest('[data-assets-resume]')) return resume();
    if (e.target.closest('[data-assets-rescan]')) return scan();
    if (e.target.closest('[data-assets-forget]')) return forget();
    if (e.target.closest('[data-assets-exclude]')) { const b = D.$('[data-ex-box]'); if (b) b.hidden = !b.hidden; return; }
    const t = e.target.closest('[data-af-t]'); if (t) return setF('t', t.dataset.afT);
    const tg = e.target.closest('[data-af-tog]'); if (tg) return setF(tg.dataset.afTog, !fpref()[tg.dataset.afTog]);
    const a = e.target.closest('[data-asset]');
    if (a) return openLb(D.assetLists[a.dataset.actx] || [], Number(a.dataset.asset));
    const dlg = e.target.closest('#lightbox'); if (!dlg) return;
    if (e.target.closest('[data-lb-close]') || e.target === dlg) return dlg.close();
    const nv = e.target.closest('[data-lb]');
    if (nv) return openLb(lbList, (lbIdx + Number(nv.dataset.lb) + lbList.length) % lbList.length);
    const x = lbList[lbIdx]; if (!x) return;
    if (e.target.closest('[data-lb-copyimg]')) return copyImage(x);
    if (e.target.closest('[data-lb-star]')) { A.toggleStar(x.path); return openLb(lbList, lbIdx, { refresh: true }); }
    const rf = e.target.closest('[data-lb-ref]');
    if (rf) { const pid = Number(rf.dataset.lbRef); if ((A.refs[pid] || []).includes(x.path)) A.delRef(pid, x.path); else { A.addRef(pid, x.path); D.toast('已设为这个项目的参考图', { icon: 'pin' }); } return openLb(lbList, lbIdx, { refresh: true }); }
    const rff = e.target.closest('[data-lb-reffor]'); if (rff) return refFor(x, rff);
    const cp = e.target.closest('[data-lb-copypath]'); if (cp) return fullPath(x, cp, p => D.copy(p, '文件路径'));
  });
  document.addEventListener('keydown', e => {
    const dlg = D.$('#lightbox');
    if (!dlg?.open || D.popOpen()) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); openLb(lbList, (lbIdx + (e.key === 'ArrowRight' ? 1 : -1) + lbList.length) % lbList.length); }
  });
  document.addEventListener('DOMContentLoaded', () => { D.$('#lightbox').addEventListener('close', () => { if (lbUrl) { URL.revokeObjectURL(lbUrl); lbUrl = ''; } }); });
})();
