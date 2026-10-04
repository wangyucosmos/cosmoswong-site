/* 我的工作台 · 知识库（v4）：在工作台里看、搜你的笔记。
   两种来源：① 这台 Mac 的 Chrome：选一次本地知识库文件夹，网页直接读（照 .gitignore 跳过不进仓库的文件，如密钥版、联系人，内容不离开电脑）；
   ② 其他设备（手机等）：通过网站后台的 GitHub 只读令牌读私有仓库（要先连接 GitHub）。
   文件夹句柄和笔记缓存只存在本机浏览器的 IndexedDB（desk-kb），不进 D1。
   v5：读笔记开头的 type / tags 做筛选；目录可以按「最近改过」排；路径里带「草稿」的笔记标成草稿（橙色），和正式笔记分开。 */
(() => {
  const D = window.DESK;
  const { esc } = D;
  const K = D.kb = { supported: typeof window.showDirectoryPicker === 'function', source: '', root: null, rootName: '', perm: 'none', files: [], scanning: false, scannedAt: null, error: '' };
  const HARD_SKIP = /^(\.git|\.obsidian|\.trash|node_modules|\.venv|__pycache__|\.DS_Store)$/;
  const SECRET = /勿外发|密钥|password|secret|token/i;   // 名字里带这些的文件不读，哪怕 .gitignore 没写
  const MAX_SIZE = 2_000_000;

  /* ---------- 本机浏览器里的小仓库 ---------- */
  let dbp = null;
  const idb = () => dbp ||= new Promise((res, rej) => { const r = indexedDB.open('desk-kb', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('kv', mode), req = fn(t.objectStore('kv')); t.oncomplete = () => res(req?.result); t.onerror = () => rej(t.error); }); };
  const kvGet = k => tx('readonly', s => s.get(k)).catch(() => null);
  const kvSet = (k, v) => tx('readwrite', s => s.put(v, k)).catch(() => {});

  /* ---------- .gitignore（够用的子集：通配、目录、否定、锚定） ---------- */
  const globRe = g => { let r = ''; for (let i = 0; i < g.length; i++) { const c = g[i]; if (c === '*') { if (g[i + 1] === '*') { r += '.*'; i++; if (g[i + 1] === '/') i++; } else r += '[^/]*'; } else if (c === '?') r += '[^/]'; else r += c.replace(/[.+^${}()|[\]\\]/g, '\\$&'); } return new RegExp('^' + r + '$'); };
  const parseIgnore = text => text.split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l && !l.startsWith('#')).map(l => {
    const neg = l.startsWith('!'); if (neg) l = l.slice(1);
    const dirOnly = l.endsWith('/'); if (dirOnly) l = l.slice(0, -1);
    const anchored = l.includes('/'); l = l.replace(/^\//, '');
    return { neg, dirOnly, anchored, re: globRe(l) };
  });
  const ignored = (stack, path, isDir) => {
    let out = false;
    for (const { base, rules } of stack) {
      if (base && !path.startsWith(base + '/')) continue;
      const rel = base ? path.slice(base.length + 1) : path, name = rel.split('/').pop();
      for (const r of rules) { if (r.dirOnly && !isDir) continue; if (r.re.test(r.anchored ? rel : name)) out = !r.neg; }
    }
    return out;
  };

  /* ---------- 读取 ---------- */
  const titleOf = (text, name) => { const fm = text.match(/^---\n[\s\S]*?^title:\s*(.+)$[\s\S]*?\n---/m); if (fm) return fm[1].trim().replace(/^["']|["']$/g, ''); const h = text.match(/^#\s+(.+)$/m); return h ? h[1].trim() : name.replace(/\.md$/i, ''); };
  // 笔记开头的 type: xxx 和 tags: [a, b] / tags: a, b
  const fmOf = text => { const m = /^---\n([\s\S]*?)\n---/.exec(text || ''); if (!m) return {}; const type = /^type:\s*(.+)$/m.exec(m[1]); const tags = /^tags:\s*\[?([^\]\n]*)\]?$/m.exec(m[1]);
    return { type: type ? type[1].trim().replace(/^["']|["']$/g, '') : '', tags: tags ? tags[1].split(/[,，]/).map(x => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean) : [] }; };
  const decorate = f => Object.assign(f, { name: f.path.split('/').pop(), dir: f.path.split('/').slice(0, -1).join('/'), title: titleOf(f.text || '', f.path.split('/').pop()), low: ((f.text || '') + '\n' + f.path).toLowerCase(),
    draft: /草稿/.test(f.path), ...fmOf(f.text) });
  async function walk(dir, prefix, stack, out) {
    const entries = [];
    for await (const [name, h] of dir.entries()) entries.push([name, h]);
    const names = new Set(entries.map(e => e[0]));
    // 子仓库（自己有 .git）：上层的忽略规则不管它，从它自己的 .gitignore 重新算
    if (prefix && names.has('.git')) stack = [];
    if (names.has('.gitignore')) {
      try { const f = await (entries.find(e => e[0] === '.gitignore')[1]).getFile(); stack = [...stack, { base: prefix, rules: parseIgnore(await f.text()) }]; } catch { /* 读不了就算了 */ }
    }
    for (const [name, h] of entries) {
      if (HARD_SKIP.test(name) || name.startsWith('.') || SECRET.test(name)) continue;
      const path = prefix ? `${prefix}/${name}` : name;
      if (h.kind === 'directory') {
        let nested = false; try { await h.getDirectoryHandle('.git'); nested = true; } catch { /* 不是子仓库 */ }
        if (!nested && ignored(stack, path, true)) continue;
        await walk(h, path, stack, out);
      } else if (/\.md$/i.test(name) && !ignored(stack, path, false)) {
        try { const f = await h.getFile(); if (f.size > MAX_SIZE) continue; out.push(decorate({ path, text: await f.text(), mtime: f.lastModified, size: f.size })); } catch { /* 跳过 */ }
      }
    }
  }
  async function scan() {
    if (!K.root || K.scanning) return;
    K.scanning = true; K.error = ''; D.render();
    try {
      const out = []; await walk(K.root, '', [], out);
      K.files = out.sort((a, b) => a.path.localeCompare(b.path, 'zh')); K.scannedAt = Date.now(); K.source = 'local';
      await kvSet('index', { rootName: K.rootName, scannedAt: K.scannedAt, files: out.map(({ path, text, mtime, size }) => ({ path, text, mtime, size })) });
    } catch (e) { K.error = '读取没完成：' + (e.message || e); }
    K.scanning = false; D.render();
  }
  async function connect(h) {
    if (!K.supported) return D.toast('这个浏览器读不了本机文件夹，请用电脑上的 Chrome', { error: true });
    if (!h) { try { h = await window.showDirectoryPicker({ id: 'desk-kb', mode: 'read' }); } catch { return; } }
    if (h.kind !== 'directory') return D.toast('请选整个知识库文件夹', { error: true });
    K.root = h; K.rootName = h.name; K.perm = 'granted';
    await kvSet('root', h);
    D.toast(`已连接「${h.name}」，正在读取笔记…`, { icon: 'book' });
    await scan();
    if (D.current?.kind === 'kb') D.render(true);
  }
  async function resume() { if (!K.root) return; try { K.perm = await K.root.requestPermission({ mode: 'read' }); } catch { K.perm = 'denied'; } D.render(); if (K.perm === 'granted') scan(); }
  async function forget() {
    if (!(await D.confirm('断开本地知识库？只是让这个网页不再读它，你电脑里的笔记不会有任何变化。', '断开', { danger: false }))) return;
    await tx('readwrite', s => s.clear()).catch(() => {});
    Object.assign(K, { root: null, rootName: '', perm: 'none', files: [], scannedAt: null, source: '' }); D.render(true);
  }
  // 没有本地文件夹时，从 GitHub 读（手机、别的电脑）
  async function fromGithub() {
    if (K.scanning) return;
    K.scanning = true; K.error = ''; D.render();
    try {
      const r = await D.api('GET', '/gh/tree');
      const errs = r.files.filter(f => f.error);
      if (errs.length) K.error = errs.map(e => e.error).join('；');
      K.files = r.files.filter(f => !f.error && !SECRET.test(f.full)).map(f => decorate({ path: f.full, repo: f.repo, repoPath: f.path, text: null, size: f.size })).sort((a, b) => a.path.localeCompare(b.path, 'zh'));
      K.source = 'github'; K.scannedAt = Date.now();
    } catch (e) { K.error = e.message; }
    K.scanning = false; D.render();
  }
  async function ensureText(f) {
    if (f.text != null) return f.text;
    const r = await D.api('GET', `/gh/file?repo=${encodeURIComponent(f.repo)}&path=${encodeURIComponent(f.repoPath)}`);
    f.text = r.text; decorate(f); return f.text;
  }
  D.on('ready', async () => {
    if (K.supported) {
      const root = await kvGet('root');
      if (root) {
        K.root = root; K.rootName = root.name;
        const idx = await kvGet('index');
        if (idx?.files) { K.files = idx.files.map(decorate); K.scannedAt = idx.scannedAt; K.source = 'local'; }
        try { K.perm = await root.queryPermission({ mode: 'read' }); } catch { K.perm = 'prompt'; }
        D.render();
        if (K.perm === 'granted') scan();
        return;
      }
    }
  });

  /* ---------- 和 GitHub 的对应：本地路径 → 仓库 + 仓库里的路径 ---------- */
  D.kbRepoOf = path => {
    const kb = D.ghCfg?.()?.kb || [];
    const hit = [...kb].sort((a, b) => b.prefix.length - a.prefix.length).find(k => !k.prefix || path === k.prefix || path.startsWith(k.prefix + '/'));
    return hit ? { repo: hit.repo, branch: hit.branch || 'main', path: hit.prefix ? path.slice(hit.prefix.length + 1) : path } : null;
  };
  const ghUrl = path => { const r = D.kbRepoOf(path); return r ? `https://github.com/${r.repo}/blob/${encodeURIComponent(r.branch)}/${r.path.split('/').map(encodeURIComponent).join('/')}` : ''; };

  /* ---------- 搜索（⌘K、知识库页、项目页的相关笔记都用） ---------- */
  // 摘要用纯文字：去掉 Markdown 符号
  const plain = text => String(text || '').replace(/^---[\s\S]*?\n---\n/, '').replace(/```\w*/g, ' ').replace(/^#{1,6}\s+/gm, '').replace(/^\s*([-+*]|\d+[.)])\s+(\[.\]\s+)?/gm, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/^\s*\|?\s*:?-{2,}.*$/gm, ' ').replace(/[*_`>|=~]+/g, ' ').replace(/-{3,}/g, ' ').replace(/[ \t]+/g, ' ');
  const snippet = (f, q) => {
    const t = plain(f.text), low = t.toLowerCase(), w = q.toLowerCase().split(/\s+/).filter(Boolean)[0] || '';
    const i = w ? low.indexOf(w) : -1;
    if (i < 0) return D.firstLine(t.replace(/\s+/g, ' ').slice(f.title.length).trim(), 80);
    const s = Math.max(0, i - 30);
    return (s ? '…' : '') + t.slice(s, i + 70).replace(/\s+/g, ' ') + '…';
  };
  D.kbSearch = (q, n = 30) => {
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return K.files.map(f => {
      if (!words.every(w => f.low.includes(w))) return null;
      const tl = f.title.toLowerCase(); let score = 0;
      for (const w of words) { if (tl.includes(w)) score += 10; if (f.path.toLowerCase().includes(w)) score += 3; score += Math.min(5, f.low.split(w).length - 1); }
      return { f, score };
    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, n).map(x => ({ path: x.f.path, title: x.f.title, snippet: snippet(x.f, words[0]) }));
  };
  // 项目页「相关笔记」：按省份、项目名里的关键词找
  D.kbRelated = p => {
    if (!K.files.length) return [];
    const words = String(p.title).replace(/[（(].*?[)）]/g, ' ').split(/[\s·：:，,、「」『』—-]+/).filter(w => w.length >= 2 && !/^\d+$/.test(w) && !/^(示例|活动|项目|促活|会员|福利中心|20\d\d)$/.test(w));
    // 长词再取前 4 个字（「双十一抽奖模块」→「双十一抽」），笔记里换个说法也能对上
    const keys = [...new Set([...words, ...words.filter(w => /[\u4e00-\u9fff]{5,}/.test(w)).map(w => w.slice(0, 4))])].slice(0, 8).map(k => ({ k: k.toLowerCase(), w: 1 }));
    if (p.province) keys.unshift({ k: p.province.toLowerCase(), w: 2 });   // 省份最能说明是不是同一类事
    if (!keys.length) return [];
    return K.files.map(f => { let s = 0; for (const { k, w } of keys) { const n = f.low.split(k).length - 1; if (n) s += (Math.min(n, 6) + (f.title.toLowerCase().includes(k) ? 8 : 0)) * w; } return { f, s }; })
      .filter(x => x.s >= 3).sort((a, b) => b.s - a.s).slice(0, 5).map(x => ({ path: x.f.path, title: x.f.title, snippet: snippet(x.f, keys.find(k => x.f.low.includes(k.k))?.k || '') }));
  };
  D.kbOpen = path => D.app.show('kb/' + path.split('/').map(encodeURIComponent).join('/'));

  /* ---------- 页面 ---------- */
  D.kbSub = () => K.source === 'local' ? `「${esc(K.rootName)}」· ${K.files.length} 篇笔记 · 直接读这台电脑上的文件，内容不上传` : K.source === 'github' ? `从 GitHub 读 · ${K.files.length} 篇笔记` : '在工作台里看、搜你的笔记';
  const kbItem = cur => f => `<button type="button" class="kbf${f.path === cur ? ' on' : ''}${f.draft ? ' draft' : ''}" data-kb-open="${esc(f.path)}" title="${esc(f.path)}">${D.icon('file', 'sm')}<span>${esc(f.title)}</span>${f.draft ? '<em class="dtag">草稿</em>' : f.type ? `<em class="ttag">${esc(f.type)}</em>` : ''}</button>`;
  const tree = (files, cur) => {
    const groups = new Map();
    for (const f of files) { const top = f.path.includes('/') ? f.path.split('/')[0] : ''; if (!groups.has(top)) groups.set(top, []); groups.get(top).push(f); }
    const open = D.pref.get('kb.open', {});
    return [...groups.entries()].sort((a, b) => (a[0] === '') - (b[0] === '') || a[0].localeCompare(b[0], 'zh')).map(([g, fs]) => {
      const items = fs.map(kbItem(cur)).join('');
      if (!g) return `<div class="kbg root">${items}</div>`;
      const isOpen = open[g] ?? (cur || '').startsWith(g + '/');
      return `<details class="kbg" data-kbg="${esc(g)}" ${isOpen ? 'open' : ''}><summary>${D.icon('folder', 'sm')}<span>${esc(g)}</span><small>${fs.length}</small></summary>${items}</details>`;
    }).join('');
  };
  const connectHero = () => `<section class="card-box"><div class="connect-hero">
    <div class="big-i" style="width:58px;height:58px;border-radius:18px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent)">${D.icon('book', 'lg')}</div>
    <h2>${K.root && K.perm !== 'granted' ? `继续读取「${esc(K.rootName)}」` : '把知识库接进工作台'}</h2>
    <p class="muted">${K.supported ? '在这台电脑上：选一次「我的知识库」文件夹，笔记直接在工作台里看、⌘K 能搜正文、项目页自动挂上相关笔记。' : '这个浏览器读不了本机文件夹（手机、Safari）。'}${D.ghReady?.() ? '也可以从 GitHub 读，手机上也能看。' : ''}</p>
    <div class="row wrap" style="justify-content:center">
      ${K.supported ? (K.root && K.perm !== 'granted' ? `<button type="button" class="btn" data-kb-resume>${D.icon('book', 'sm')}继续读取</button>` : `<button type="button" class="btn" data-kb-connect>${D.icon('folder', 'sm')}选择知识库文件夹</button>`) : ''}
      ${D.ghReady?.() ? `<button type="button" class="btn ghost" data-kb-github>${D.icon('globe', 'sm')}从 GitHub 读</button>` : ''}</div>
    <p class="muted small">${D.icon('lock', 'sm')} 照知识库的 .gitignore 跳过不进仓库的文件（密钥版、联系人等），名字里带「勿外发」「密钥」的也不读。</p></div></section>`;

  D.renderKb = async (view, el) => {
    // 手机、Safari 读不了本机文件夹：连上 GitHub 的话直接从 GitHub 读，不用再点
    if (!K.files.length && !K.scanning && !K.supported && D.ghReady?.() && !K.autoGh) { K.autoGh = true; fromGithub(); }
    if (!K.files.length && !K.scanning) { el.innerHTML = `<div class="page">${connectHero()}</div>`; return; }
    const q = D.kq || '', cur = view.path || '';
    const f = cur ? K.files.find(x => x.path === cur) : null;
    const kf = { type: '', tag: '', sort: 'tree', ...D.pref.get('kb.f', {}) };
    const types = [...K.files.reduce((m, x) => x.type ? m.set(x.type, (m.get(x.type) || 0) + 1) : m, new Map()).entries()].sort((a, b) => b[1] - a[1]);
    const tags = [...K.files.reduce((m, x) => { (x.tags || []).forEach(t => m.set(t, (m.get(t) || 0) + 1)); return m; }, new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
    const pool = K.files.filter(x => (!kf.type || (kf.type === '草稿' ? x.draft : x.type === kf.type)) && (!kf.tag || (x.tags || []).includes(kf.tag)));
    const filtering = kf.type || kf.tag || kf.sort === 'recent';
    let results = q ? D.kbSearch(q, 60) : null;
    if (results && (kf.type || kf.tag)) { const ok = new Set(pool.map(x => x.path)); results = results.filter(r => ok.has(r.path)); }
    const listView = filtering && !q ? [...pool].sort((a, b) => kf.sort === 'recent' ? (b.mtime || 0) - (a.mtime || 0) : a.path.localeCompare(b.path, 'zh')) : null;
    const drafts = K.files.filter(x => x.draft).length;
    const kfBar = `<div class="kb-f"><select data-kbf="type" aria-label="类型"><option value="">全部类型</option>${drafts ? `<option value="草稿" ${kf.type === '草稿' ? 'selected' : ''}>草稿（${drafts}）</option>` : ''}${types.map(([t, n]) => `<option value="${esc(t)}" ${kf.type === t ? 'selected' : ''}>${esc(t)}（${n}）</option>`).join('')}</select>
      <select data-kbf="sort" aria-label="排序"><option value="tree" ${kf.sort !== 'recent' ? 'selected' : ''}>按文件夹</option><option value="recent" ${kf.sort === 'recent' ? 'selected' : ''}>最近改过</option></select></div>
      ${tags.length ? `<div class="kb-tags">${tags.map(([t]) => `<button type="button" class="fchip-t${kf.tag === t ? ' on' : ''}" data-kbtag="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}`;
    const side = `<aside class="kb-side card-box">
      <input class="filter" type="search" data-kfilter data-keep-focus="kq" value="${esc(q)}" placeholder="搜笔记标题和正文…" aria-label="搜笔记">
      <div class="kb-src muted small">${K.source === 'local' ? `${D.icon('monitor', 'sm')} 本机「${esc(K.rootName)}」` : `${D.icon('globe', 'sm')} GitHub`} · ${K.files.length} 篇${K.scanning ? ' · 正在读取…' : ''}
        <span class="grow"></span>${K.source === 'local' ? `<button type="button" class="icon" data-kb-rescan title="重新读取">${D.icon('refresh', 'sm')}</button><button type="button" class="icon" data-kb-forget title="断开">${D.icon('x', 'sm')}</button>` : `<button type="button" class="icon" data-kb-github title="重新读取">${D.icon('refresh', 'sm')}</button>`}</div>
      ${K.error ? `<p class="warn small">${esc(K.error)}</p>` : ''}
      ${kfBar}
      <nav class="kb-tree">${listView ? (listView.length ? listView.map(kbItem(cur)).join('') : '<p class="muted small pad">没有符合条件的笔记。</p>') : results ? (results.length ? results.map(r => `<button type="button" class="kbr${r.path === cur ? ' on' : ''}" data-kb-open="${esc(r.path)}"><b>${D.mdHighlight(esc(r.title), q)}</b><small>${D.mdHighlight(esc(r.snippet), q)}</small><em>${esc(r.path)}</em></button>`).join('') : '<p class="muted small pad">没搜到。</p>') : tree(K.files, cur)}</nav></aside>`;
    let main;
    if (!f) {
      const recent = [...K.files].filter(x => x.mtime).sort((a, b) => b.mtime - a.mtime).slice(0, 8);
      const prog = K.files.filter(x => /(^|\/)进度\.md$/.test(x.path));
      main = `<section class="card-box kb-home">${D.cardHead('book', '知识库', `<span class="more">${K.files.length} 篇</span>`)}
        ${prog.length ? `<h4 class="sub-h">${D.icon('target', 'sm')}各项目进度</h4><div class="kb-cards">${prog.map(x => `<button type="button" class="tile" data-kb-open="${esc(x.path)}"><span class="tico" style="--c:${D.hashColor(x.dir)}">${D.icon('list')}</span><span class="tl">${esc(x.dir || '根目录')}</span><span class="s">进度.md</span></button>`).join('')}</div>` : ''}
        ${recent.length ? `<h4 class="sub-h">${D.icon('clock', 'sm')}最近改过</h4><ul class="kb-recent">${recent.map(x => `<li><button type="button" class="link-btn" data-kb-open="${esc(x.path)}">${esc(x.title)}</button><small class="muted">${esc(x.dir)} · ${esc(new Date(x.mtime).toLocaleDateString('zh-CN'))}</small></li>`).join('')}</ul>` : '<p class="muted">左边点开任意一篇。</p>'}</section>`;
    } else {
      main = `<article class="card-box kb-note" data-kb-path="${esc(f.path)}"><p class="muted">正在读取…</p></article>`;
    }
    el.innerHTML = `<div class="page kb"><div class="kb-wrap">${side}<div class="kb-main">${main}</div></div></div>`;
    if (f) {
      let text;
      try { text = await ensureText(f); } catch (e) { el.querySelector('.kb-note').innerHTML = `<p class="warn">${esc(e.message)}</p>`; return; }
      const box = el.querySelector(`.kb-note[data-kb-path="${CSS.escape(f.path)}"]`); if (!box) return;
      const r = D.md(text, { q });
      // 正文第一行就是同名的大标题：页头已经有了，不重复显示
      r.html = r.html.replace(/^<h1 id="[^"]*">([\s\S]*?)<\/h1>\n?/, (all, t) => t.replace(/<[^>]+>/g, '').trim() === esc(f.title).trim() ? '' : all);
      const gu = ghUrl(f.path);
      box.innerHTML = `<header class="kb-head"><div class="kb-crumb">${f.path.split('/').slice(0, -1).map(esc).join(' <span>/</span> ') || '根目录'}</div>
          <h1>${esc(f.title)}</h1>
          ${r.meta ? `<div class="kb-meta">${Object.entries(r.meta).filter(([k]) => k !== 'title').map(([k, v]) => `<span class="tag">${esc(k)}：${esc(v)}</span>`).join('')}</div>` : ''}
          <div class="row wrap tight"><button type="button" class="tb" data-kb-copy="${esc(f.path)}">${D.icon('copy', 'sm')}复制路径</button><button type="button" class="tb" data-kb-copytext>${D.icon('file', 'sm')}复制全文</button>${gu ? `<a class="tb" href="${esc(gu)}" target="_blank" rel="noopener noreferrer">${D.icon('external', 'sm')}在 GitHub 打开</a>` : ''}
            ${f.mtime ? `<span class="muted small">改于 ${esc(new Date(f.mtime).toLocaleString('zh-CN'))}</span>` : ''}</div></header>
        <div class="kb-body${r.toc.length > 2 ? ' has-toc' : ''}"><div class="md">${r.html}</div>${r.toc.length > 2 ? `<nav class="kb-toc"><b>目录</b>${r.toc.filter(t => t.lv <= 3).map(t => `<a href="#" data-md-anchor="${esc(t.id)}" class="l${t.lv}">${esc(t.text)}</a>`).join('')}</nav>` : ''}</div>`;
      box.querySelectorAll('mark.hit')[0]?.scrollIntoView({ block: 'center' });
    }
  };

  /* ---------- 事件 ---------- */
  D.kbEvents = main => {
    main.addEventListener('input', e => { if (D.current?.kind === 'kb' && e.target.matches('[data-kfilter]')) { D.kq = e.target.value.trim(); D.render(true); } });
    main.addEventListener('change', e => { const s = e.target.closest('[data-kbf]'); if (s && D.current?.kind === 'kb') { const f = D.pref.get('kb.f', {}); f[s.dataset.kbf] = s.value; D.pref.set('kb.f', f); D.render(true); } });
    main.addEventListener('toggle', e => { if (e.target.matches?.('details[data-kbg]')) { const o = D.pref.get('kb.open', {}); o[e.target.dataset.kbg] = e.target.open; D.pref.set('kb.open', o); } }, true);
  };
  document.addEventListener('click', async e => {
    if (e.target.closest('[data-kb-connect]')) return connect();
    const tg = e.target.closest('[data-kbtag]'); if (tg) { const f = D.pref.get('kb.f', {}); f.tag = f.tag === tg.dataset.kbtag ? '' : tg.dataset.kbtag; D.pref.set('kb.f', f); return D.render(true); }
    if (e.target.closest('[data-kb-resume]')) return resume();
    if (e.target.closest('[data-kb-rescan]')) return scan();
    if (e.target.closest('[data-kb-forget]')) return forget();
    if (e.target.closest('[data-kb-github]')) return fromGithub();
    const o = e.target.closest('[data-kb-open]'); if (o) { e.preventDefault(); return D.kbOpen(o.dataset.kbOpen); }
    const cp = e.target.closest('[data-kb-copy]'); if (cp) { const base = D.pref.get('kb.base', ''); return D.copy(base ? `${base.replace(/\/$/, '')}/${cp.dataset.kbCopy}` : cp.dataset.kbCopy, base ? '路径' : '知识库里的相对路径'); }
    if (e.target.closest('[data-kb-copytext]')) { const f = K.files.find(x => x.path === D.current?.path); if (f?.text) return D.copy(f.text, '全文'); }
    const fp = e.target.closest('[data-copy-path]'); if (fp) return D.copy(fp.dataset.copyPath, '路径（在访达按 ⌘⇧G 粘贴就能打开）');
    const a = e.target.closest('[data-md-anchor]');
    if (a) { e.preventDefault(); const t = D.$('#h-' + CSS.escape(a.dataset.mdAnchor)); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const w = e.target.closest('[data-wiki]');
    if (w) {
      const name = w.dataset.wiki.trim().toLowerCase();
      const f = name ? K.files.find(x => x.name.replace(/\.md$/i, '').toLowerCase() === name || x.title.toLowerCase() === name || x.path.toLowerCase() === name + '.md') : K.files.find(x => x.path === D.current?.path);
      if (!f) return D.toast(`没找到笔记「${w.dataset.wiki}」`, { error: true });
      D.kbOpen(f.path);
      if (w.dataset.wikiHash) setTimeout(() => D.$('#h-' + CSS.escape(D.mdSlug(w.dataset.wikiHash)))?.scrollIntoView({ block: 'start' }), 400);
    }
  });
  K.connect = connect; K.fromGithub = fromGithub;
})();
