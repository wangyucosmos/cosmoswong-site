/* 我的工作台 · 素材库（v3）：直接看本机文件夹里的图片。
   用的是 Chrome / Edge 的「文件夹访问」：你选一次文件夹、点允许，网页就能在你这台电脑的浏览器里读图片——
   图片不会上传到任何地方（不经过服务器，也不进 D1）。文件夹句柄、扫描结果和缩略图缓存在本机浏览器的 IndexedDB 里，
   换电脑、换浏览器、清浏览器数据后要重新选一次。手机和 Safari 不支持，页面会说明。 */
(() => {
  const D = window.DESK;
  const { esc } = D;
  const IMG = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;
  const SKIP = /^(\.|__MACOSX$|node_modules$|\$RECYCLE)/;
  const MAX_FILES = 30000;
  // 文件夹名里带这些字的，归成对应类型（从深到浅找第一个对上的）
  const TYPE_RULES = [['切图', /切图/], ['弹窗', /弹窗/], ['原型', /原型/], ['长图', /长图/], ['主KV', /kv|主视觉/i], ['头图', /头图|banner|横幅/i], ['图标', /图标|icon/i], ['海报', /海报|易拉宝/], ['截图', /截图|拨测/]];
  const A = D.assets = { supported: typeof window.showDirectoryPicker === 'function', root: null, rootName: '', perm: 'none', files: [], scanning: false, scannedAt: null, error: '', limit: 120 };
  const handles = new Map();   // 相对路径 → 文件句柄（这次打开期间）
  const urls = new Map();      // 缩略图 object URL

  /* ---------- 本机浏览器里的小仓库（IndexedDB）：文件夹句柄、扫描结果、缩略图 ---------- */
  let dbp = null;
  const idb = () => dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('desk-assets', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('thumbs'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const tx = async (store, mode, fn) => {
    const db = await idb();
    return new Promise((res, rej) => { const t = db.transaction(store, mode), req = fn(t.objectStore(store)); t.oncomplete = () => res(req?.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  };
  const kvGet = k => tx('kv', 'readonly', s => s.get(k)).catch(() => null);
  const kvSet = (k, v) => tx('kv', 'readwrite', s => s.put(v, k)).catch(() => {});

  /* ---------- 分类：省份 / 文件夹、类型、当前版 ---------- */
  const show = s => String(s || '').replace(/^_+/, '');
  function facet(path) {
    const dirs = path.split('/').slice(0, -1);
    const i = dirs.findIndex(d => /分省|省份/.test(d));   // 名字里带「分省 / 省份」的文件夹，下一层就是省份
    const provs = D.cfg().provinces;
    const g = i >= 0 && dirs[i + 1] ? dirs[i + 1] : dirs.find(d => provs.includes(d)) || dirs[0] || '';
    let t = '其他';
    for (const d of [...dirs].reverse()) { const hit = TYPE_RULES.find(([, re]) => re.test(d)); if (hit) { t = hit[0]; break; } }
    return { g: show(g) || '根目录', t, cur: dirs.includes('_当前') ? 'cur' : dirs.includes('_历史') ? 'old' : '' };
  }
  const withFacets = list => list.map(f => Object.assign(f, f.g ? {} : facet(f.path)));

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
  async function connect(h) {
    if (!A.supported) return D.toast('这个浏览器不支持读本机文件夹，请用电脑上的 Chrome 或 Edge 打开', { error: true });
    if (!h) { try { h = await window.showDirectoryPicker({ id: 'desk-assets', mode: 'read' }); } catch { return; } }   // 取消了
    if (h.kind !== 'directory') return D.toast('拖进来的是文件，请拖整个文件夹', { error: true });
    A.root = h; A.rootName = h.name; A.perm = 'granted'; A.files = []; A.limit = 120;
    await kvSet('root', h);
    D.toast(`已连接「${h.name}」，正在扫描图片…`, { icon: 'image' });
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
    await tx('kv', 'readwrite', s => s.clear()).catch(() => {});
    await tx('thumbs', 'readwrite', s => s.clear()).catch(() => {});
    urls.forEach(u => URL.revokeObjectURL(u)); urls.clear(); handles.clear();
    Object.assign(A, { root: null, rootName: '', perm: 'none', files: [], scannedAt: null, error: '' });
    D.render(); D.toast('已断开');
  }
  D.on('ready', async () => {
    if (!A.supported || A.root) return;
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
  async function thumbUrl(f) {
    const key = `${f.path}|${f.mtime}`;
    if (urls.has(key)) return urls.get(key);
    let blob = await tx('thumbs', 'readonly', s => s.get(key)).catch(() => null);
    if (!blob) {
      try { blob = await limited(() => makeThumb(f)); } catch { blob = await fileOf(f.path); }
      if (!blob) return '';
      if (blob.size < 600000) tx('thumbs', 'readwrite', s => s.put(blob, key)).catch(() => {});
    }
    const u = URL.createObjectURL(blob); urls.set(key, u); return u;
  }
  // 页面上 <img data-thumb="序号"> 滚到眼前才加载
  let io = null, mo = null;
  function hydrate(root, list) {
    io?.disconnect();
    io = new IntersectionObserver(entries => entries.forEach(async en => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      const f = list[Number(en.target.dataset.thumb)]; if (!f) return;
      const u = await thumbUrl(f).catch(() => '');
      if (u && en.target.isConnected) { en.target.onload = () => en.target.classList.add('ok'); en.target.src = u; }
    }), { rootMargin: '300px' });
    root.querySelectorAll('img[data-thumb]').forEach(img => io.observe(img));
    const more = root.querySelector('[data-assets-more]');
    mo?.disconnect(); mo = null;
    if (more) { mo = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { mo.disconnect(); A.limit += 120; D.render(true); } }, { rootMargin: '400px' }); mo.observe(more); }
  }

  /* ---------- 筛选 ---------- */
  const fpref = () => D.pref.get('assets.f', { g: '', t: '', cur: false, sort: 'new' });
  function filtered() {
    const f = fpref(), q = (D.aq || '').toLowerCase();
    const list = A.files.filter(x => (!f.g || x.g === f.g) && (!f.t || x.t === f.t) && (!f.cur || x.cur !== 'old') && (!q || x.path.toLowerCase().includes(q)));
    return f.sort === 'name' ? [...list].sort((a, b) => a.path.localeCompare(b.path, 'zh')) : list;
  }
  const count = (list, k) => { const m = new Map(); list.forEach(x => m.set(x[k], (m.get(x[k]) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const thumb = (x, i, cls = '') => `<button type="button" class="th ${cls}" data-asset="${i}" style="--k:${i % 24}" title="${esc(x.path)}"><img data-thumb="${i}" alt="${esc(x.name)}"><span class="tg">${esc(x.t)}</span><span class="nm">${esc(x.name)}</span></button>`;

  D.assetsSub = () => !A.supported ? '直接看你电脑里的图片——需要电脑上的 Chrome 或 Edge' : A.root ? `「${esc(A.rootName)}」· ${A.files.length.toLocaleString('en-US')} 张图片 · 只在这台电脑的浏览器里显示，不会上传` : '直接看你电脑里的图片，不上传任何东西';
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
    <p class="muted">${resumeNeeded() ? '浏览器出于安全考虑，要你再点一次允许。' : '各省的切图、弹窗、长图，按省份和类型自动分好，点开看大图、复制到 Figma。'}</p>
    ${resumeNeeded() ? `<button type="button" class="btn" data-assets-resume>${D.icon('image', 'sm')}继续查看</button>`
      : `<ol class="steps3"><li><b>1</b>点下面的按钮，或者直接把文件夹从访达拖到这一页</li><li><b>2</b>选放素材的总文件夹（比如放各省切图、弹窗的那个）</li><li><b>3</b>Chrome 问「允许查看文件」时点允许；选「每次访问都允许」，下次就不用再点</li></ol>
        <button type="button" class="btn" data-assets-connect>${D.icon('folder', 'sm')}选择素材文件夹</button>`}
    <p class="muted small">${D.icon('lock', 'sm')} 图片只在你这台电脑的浏览器里显示，不会上传到任何地方。</p></div>`;
  const connectBox = small => small ? connectSmall() : connectHero();

  // 今天页的卡片
  D.assetsCard = () => {
    if (!A.supported) return '';
    const head = D.cardHead('image', '素材库', A.files.length ? `<span class="more">本机 · ${A.files.length.toLocaleString('en-US')} 张</span><button type="button" class="more link-btn" data-goto="assets" style="margin-left:12px">全部 →</button>` : '');
    if (!A.root || A.perm !== 'granted' && !A.files.length) return `<section class="card-box s7">${head}${connectBox(true)}</section>`;
    const recent = (A.files.some(f => f.cur === 'cur') ? A.files.filter(f => f.cur !== 'old') : A.files).slice(0, 6);
    D.todayAssets = recent;
    return `<section class="card-box s7 lift" data-today-assets>${head}
      ${recent.length ? `<div class="thumbs">${recent.map((x, i) => thumb(x, i)).join('')}</div>` : `<p class="muted">${A.scanning ? '正在扫描…' : '这个文件夹里没有找到图片。'}</p>`}</section>`;
  };

  D.renderAssets = (view, el) => {
    if (!A.supported) {
      el.innerHTML = `<div class="page"><section class="card-box"><div class="empty-state"><div class="big-i">${D.icon('monitor')}</div>
        <p><b>这个浏览器看不了本机素材</b></p><p>素材库要用电脑上的 Chrome 或 Edge 打开（手机、Safari 不支持读本机文件夹）。</p><p class="muted small">图片只在你自己的浏览器里显示，不会上传。</p></div></section></div>`;
      return;
    }
    if (!A.root || (A.perm !== 'granted' && !A.files.length)) { el.innerHTML = `<div class="page"><section class="card-box">${connectBox(false)}</section></div>`; return; }
    const f = fpref(), list = filtered(), shown = list.slice(0, A.limit);
    const gs = count(A.files, 'g'), ts = count(A.files.filter(x => !f.g || x.g === f.g), 't');
    el.innerHTML = `<div class="page assets">
      <div class="ameta"><span class="fold">${D.icon('folder', 'sm')}${esc(A.rootName)}</span><span>${list.length.toLocaleString('en-US')} / ${A.files.length.toLocaleString('en-US')} 张</span>
        <span>${A.scanning ? '正在扫描…' : A.scannedAt ? `扫描于 ${esc(new Date(A.scannedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }))}` : ''}</span>
        ${A.perm !== 'granted' ? `<button type="button" class="btn sm" data-assets-resume>继续查看（要再点一次允许）</button>` : ''}
        ${A.error ? `<span class="warn-text">${esc(A.error)}</span>` : ''}
        <span class="grow"></span><button type="button" class="tb" data-assets-rescan ${A.scanning ? 'disabled' : ''}>${D.icon('refresh', 'sm')}重新扫描</button><button type="button" class="tb" data-assets-connect>${D.icon('folder', 'sm')}换文件夹</button><button type="button" class="tb ghost" data-assets-forget>断开</button></div>
      <div class="atools"><input class="filter" type="search" data-afilter data-keep-focus="aq" value="${esc(D.aq || '')}" placeholder="按文件名、文件夹搜…" aria-label="搜素材">
        <select data-af="g" aria-label="省份 / 文件夹"><option value="">全部省份 / 文件夹</option>${gs.map(([g, n]) => `<option value="${esc(g)}" ${g === f.g ? 'selected' : ''}>${esc(g)}（${n}）</option>`).join('')}</select>
        <select data-af="sort" aria-label="排序"><option value="new" ${f.sort !== 'name' ? 'selected' : ''}>最近修改的在前</option><option value="name" ${f.sort === 'name' ? 'selected' : ''}>按路径排</option></select>
        <button type="button" class="fchip-t${f.cur ? ' on' : ''}" data-af-cur>只看当前版</button></div>
      <div class="chips"><button type="button" class="fchip-t${!f.t ? ' on' : ''}" data-af-t="">全部类型</button>${ts.map(([t, n]) => `<button type="button" class="fchip-t${t === f.t ? ' on' : ''}" data-af-t="${esc(t)}">${esc(t)}<small>${n}</small></button>`).join('')}</div>
      ${shown.length ? `<div class="agrid">${shown.map((x, i) => thumb(x, i)).join('')}</div>${list.length > shown.length ? '<div class="more-sentinel" data-assets-more></div>' : ''}`
        : `<p class="empty-state">${A.scanning ? '正在扫描…' : '没有符合条件的图片。'}</p>`}</div>`;
    D.assetsShown = shown;
  };
  // 每次重画后给图片挂上懒加载
  D.on('render', () => requestAnimationFrame(hydrateNow));
  function hydrateNow() {
    const v = D.$('#view'); if (!v) return;
    if (D.current?.kind === 'assets' && D.assetsShown) hydrate(v, D.assetsShown);
    else if (D.current?.kind === 'today' && D.todayAssets) hydrate(v, D.todayAssets);
  }
  document.addEventListener('DOMContentLoaded', () => { new MutationObserver(() => hydrateNow()).observe(D.$('#view'), { childList: true }); });

  /* ---------- 看大图 ---------- */
  let lbList = [], lbIdx = 0, lbUrl = '';
  const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  async function openLb(list, i) {
    lbList = list; lbIdx = i;
    const dlg = D.$('#lightbox'), x = list[i]; if (!x) return;
    const file = await fileOf(x.path);
    if (lbUrl) URL.revokeObjectURL(lbUrl);
    lbUrl = file ? URL.createObjectURL(file) : '';
    dlg.innerHTML = `<button type="button" class="icon close" data-lb-close aria-label="关闭">${D.icon('x')}</button>
      <div class="stage">${lbUrl ? `<img src="${esc(lbUrl)}" alt="${esc(x.name)}">` : '<p class="muted">读不到这张图了，可能已经被移走。点「重新扫描」。</p>'}
        ${list.length > 1 ? `<button type="button" class="nav-btn prev" data-lb="-1" aria-label="上一张">${D.icon('back')}</button><button type="button" class="nav-btn next" data-lb="1" aria-label="下一张">${D.icon('right')}</button>` : ''}</div>
      <div class="info"><h3>${esc(x.name)}</h3>
        <dl><div><dt>位置</dt><dd>${esc(A.rootName)}/${esc(x.path.split('/').slice(0, -1).join('/'))}</dd></div><div><dt>分组</dt><dd>${esc(x.g)} · ${esc(x.t)}${x.cur === 'cur' ? ' · 当前版' : x.cur === 'old' ? ' · 历史版' : ''}</dd></div>
          <div><dt>大小</dt><dd>${esc(fmtSize(x.size))}</dd></div><div><dt>尺寸</dt><dd data-lb-dim>—</dd></div><div><dt>修改时间</dt><dd>${esc(new Date(x.mtime).toLocaleString('zh-CN'))}</dd></div><div><dt>第几张</dt><dd>${i + 1} / ${list.length}</dd></div></dl>
        <div class="acts"><button type="button" class="btn" data-lb-copyimg>${D.icon('copy', 'sm')}复制图片</button>
          <button type="button" class="btn ghost" data-lb-copypath>${D.icon('folder', 'sm')}复制文件路径</button>
          <button type="button" class="btn ghost" data-lb-attach>${D.icon('pin', 'sm')}挂到项目上</button>
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
      const v = e.target.base.value.trim().replace(/^~/, '~');
      if (!v) return;
      D.pref.set('assets.base.' + A.rootName, v); D.closePopover();
      then(`${v.replace(/\/$/, '')}/${x.path}`);
    });
  }
  function attach(x, anchor) {
    fullPath(x, anchor, path => {
      D.pickOption(anchor, { options: D.optionsFor('project'), search: true, allowEmpty: false, onPick: async pid => {
        const p = D.project(pid); if (!p) return;
        const paths = [...new Set([...(p.local_paths || []), path])];
        try { await D.patch('projects', p.id, { local_paths: paths }); D.toast(`已挂到「${p.title}」的本机路径里`, { icon: 'pin' }); } catch { /* 已提示 */ }
      } });
    });
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
      const s = e.target.closest('[data-af]'); if (!s || D.current?.kind !== 'assets') return;
      const f = fpref(); f[s.dataset.af] = s.value; if (s.dataset.af === 'g') f.t = ''; D.pref.set('assets.f', f); A.limit = 120; D.render(true);
    });
  };
  document.addEventListener('click', e => {
    if (e.target.closest('[data-assets-connect]')) return connect();
    if (e.target.closest('[data-assets-resume]')) return resume();
    if (e.target.closest('[data-assets-rescan]')) return scan();
    if (e.target.closest('[data-assets-forget]')) return forget();
    const t = e.target.closest('[data-af-t]');
    if (t) { const f = fpref(); f.t = t.dataset.afT; D.pref.set('assets.f', f); A.limit = 120; return D.render(true); }
    if (e.target.closest('[data-af-cur]')) { const f = fpref(); f.cur = !f.cur; D.pref.set('assets.f', f); A.limit = 120; return D.render(true); }
    const a = e.target.closest('[data-asset]');
    if (a) { const list = D.current?.kind === 'assets' ? D.assetsShown : D.todayAssets; return openLb(list || [], Number(a.dataset.asset)); }
    const dlg = e.target.closest('#lightbox'); if (!dlg) return;
    if (e.target.closest('[data-lb-close]') || e.target === dlg) return dlg.close();
    const nv = e.target.closest('[data-lb]');
    if (nv) return openLb(lbList, (lbIdx + Number(nv.dataset.lb) + lbList.length) % lbList.length);
    const x = lbList[lbIdx]; if (!x) return;
    if (e.target.closest('[data-lb-copyimg]')) return copyImage(x);
    const cp = e.target.closest('[data-lb-copypath]'); if (cp) return fullPath(x, cp, p => D.copy(p, '文件路径'));
    const at = e.target.closest('[data-lb-attach]'); if (at) return attach(x, at);
  });
  document.addEventListener('keydown', e => {
    const dlg = D.$('#lightbox');
    if (!dlg?.open || D.popOpen()) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); openLb(lbList, (lbIdx + (e.key === 'ArrowRight' ? 1 : -1) + lbList.length) % lbList.length); }
  });
  document.addEventListener('DOMContentLoaded', () => { D.$('#lightbox').addEventListener('close', () => { if (lbUrl) { URL.revokeObjectURL(lbUrl); lbUrl = ''; } }); });
})();
