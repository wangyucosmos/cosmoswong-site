/* 我的工作台 · GitHub（v4）：AI 进度看板、最近动态、代码仓库卡片，以及两条「写回去」：
   ① 收集箱的一条 → 存进知识库草稿文件夹（新文件，不改已有的）；
   ② 项目 → 回写到 进度.md（先给你看改哪几行，确认后才提交；提交时带上读取时的版本号，别人刚改过会被拦下）。
   令牌只在网站后台（Worker secret），浏览器只调 /api/desk/gh/*。仓库名、进度文件位置存在 D1 的 github 设置里，代码里不写。 */
(() => {
  const D = window.DESK;
  const { esc } = D;
  const G = D.gh = { status: null, overview: null, progress: null, loading: false, at: 0 };
  D.ghCfg = () => { const c = D.state.settings?.github || {}; return { repos: c.repos || [], progress: c.progress || [], drafts: c.drafts || null, kb: (c.kb || []).map(k => ({ ...k, prefix: String(k.prefix || '').replace(/^\/+|\/+$/g, '') })) }; };
  D.ghReady = () => !!(G.status?.configured && !G.status.error);

  async function load(force) {
    if (G.loading || (!force && Date.now() - G.at < 60_000)) return;
    G.loading = true;
    try {
      G.status = await D.api('GET', '/gh/status');
      if (D.ghReady()) {
        const [p, o] = await Promise.all([D.api('GET', '/gh/progress').catch(e => ({ error: e.message })), D.api('GET', '/gh/overview').catch(e => ({ error: e.message }))]);
        G.progress = p; G.overview = o;
      }
      G.at = Date.now();
    } catch (e) { G.status = { configured: false, error: e.message }; }
    G.loading = false; D.render();
  }
  D.ghLoad = load;
  D.on('ready', () => load(true));

  /* ---------- 读 进度.md：两种写法都认（工作看板那种「## 进行中 / ### 条目」，和个人项目那种「## 当前状态 / ## 下一步」列表） ---------- */
  const FIELD = /^\s*[-*]\s*\*\*(.+?)[：:]\*\*\s*(.*)$/;
  D.parseProgress = text => {
    const lines = String(text || '').replace(/\r/g, '').split('\n'), secs = [];
    let sec = null, ent = null;
    for (const l of lines) {
      let m;
      if ((m = l.match(/^##\s+(.+)$/))) { sec = { title: m[1].trim(), entries: [], items: [] }; secs.push(sec); ent = null; continue; }
      if (!sec) continue;
      if ((m = l.match(/^###\s+(.+)$/))) { ent = { title: m[1].trim(), fields: {} }; sec.entries.push(ent); continue; }
      if (ent && (m = l.match(FIELD))) { ent.fields[m[1].trim()] = m[2].trim(); continue; }
      if (!ent && (m = l.match(/^(?:\d+[.)]|[-*])\s+(.+)$/))) sec.items.push(m[1].replace(/\*\*/g, '').trim());
    }
    const date = (text.match(/（(\d{4}-\d{2}-\d{2})\s*更新）/) || text.match(/当前状态（(\d{4}-\d{2}-\d{2})）/) || [])[1] || '';
    return { secs, date };
  };
  const strip = s => String(s || '').replace(/^\[[ xX]\]\s*/, '').replace(/\*\*/g, '').replace(/`/g, '').replace(/\s+/g, ' ').trim();
  function progressBlocks() {
    const files = G.progress?.files || [];
    return files.map(f => {
      if (f.error) return { f, err: f.error };
      const p = D.parseProgress(f.text);
      const doing = p.secs.find(s => /进行中/.test(s.title));
      if (doing) return { f, date: p.date, entries: doing.entries.slice(0, 4), empty: !doing.entries.length };
      const nx = p.secs.find(s => /下一步|待处理|观察中/.test(s.title));
      return { f, date: p.date, items: (nx?.items || []).slice(0, 3), nxTitle: nx?.title };
    });
  }
  const openFile = f => { const local = (D.ghCfg().kb || []).find(k => k.repo === f.repo); return local ? `data-kb-open="${esc((local.prefix ? local.prefix + '/' : '') + f.path)}"` : ''; };
  const AI_RE = [['工作台', /来自我的工作台/], ['Claude', /claude/i], ['Codex', /codex|chatgpt/i], ['DeepSeek', /deepseek|\bDSH\b/i], ['Cowork', /cowork/i]];
  const aiOf = c => (AI_RE.find(([, re]) => re.test(c.message)) || [])[0] || '';
  const ago = iso => { if (!iso) return ''; const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? '刚刚' : m < 60 ? `${m} 分钟前` : m < 1440 ? `${Math.round(m / 60)} 小时前` : m < 43200 ? `${Math.round(m / 1440)} 天前` : new Date(iso).toLocaleDateString('zh-CN'); };

  /* ---------- 今天页的两张卡 ---------- */
  D.ghCards = () => {
    if (!G.status) return '';
    if (!D.ghReady()) return `<section class="card-box s12 gh-setup">${D.cardHead('globe', '连上 GitHub', `<button type="button" class="more link-btn" data-goto="settings" data-sec="github">怎么连 →</button>`)}
      <p class="muted">${G.status.error ? esc(G.status.error) : '连上之后，这里会显示三个 AI 在各项目的进度、最近都提交了什么；项目页能一键回写 进度.md，手机上也能看知识库。'}</p></section>`;
    const blocks = progressBlocks();
    const commits = (G.overview?.repos || []).flatMap(r => (r.commits || []).map(c => ({ ...c, label: r.label }))).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 8);
    const prog = `<section class="card-box s7 lift gh-prog">${D.cardHead('target', 'AI 进度', `<button type="button" class="more link-btn" data-gh-refresh title="重新读取">${D.icon('refresh', 'sm')} ${G.at ? esc(ago(new Date(G.at).toISOString())) : ''}</button>`)}
      ${blocks.length ? blocks.map(b => `<div class="pb">
        <div class="pb-h"><button type="button" class="link-btn" ${openFile(b.f)}>${esc(b.f.label)}</button>${b.date ? `<small>更新于 ${esc(b.date.slice(5))}</small>` : ''}</div>
        ${b.err ? `<p class="warn small">${esc(b.err)}</p>`
          : b.entries ? (b.empty ? '<p class="muted small">进行中：暂无</p>' : `<ul>${b.entries.map(e => `<li><b>${esc(strip(e.title))}</b>${e.fields['状态'] ? `<span class="pill ${/等待|待确认/.test(e.fields['状态']) ? 'warn' : 'acc'}">${esc(strip(e.fields['状态']).split(/[（(，,。]/)[0].slice(0, 10))}</span>` : ''}
              ${e.fields['下一步'] ? `<div class="pn">${D.icon('right', 'sm')}${esc(strip(e.fields['下一步']).slice(0, 90))}</div>` : ''}${e.fields['最近经手'] ? `<small class="muted">${esc(strip(e.fields['最近经手']).slice(0, 50))}</small>` : ''}</li>`).join('')}</ul>`)
          : b.items.length ? `<ul class="plain">${b.items.map(x => `<li>${esc(strip(x).slice(0, 110))}</li>`).join('')}</ul>` : '<p class="muted small">没有待办事项。</p>'}</div>`).join('')
        : '<p class="muted">还没配置要看的进度文件（设置 → GitHub）。</p>'}</section>`;
    const feed = `<section class="card-box s5 lift gh-feed">${D.cardHead('message', '最近动态', '<button type="button" class="more link-btn" data-goto="resources">代码仓库 →</button>')}
      ${commits.length ? `<ul class="feed">${commits.map(c => { const ai = aiOf(c); return `<li><a href="${esc(D.safeUrl(c.html_url) || '#')}" target="_blank" rel="noopener noreferrer">
        <span class="fd-t">${esc(D.firstLine(c.message, 60))}</span><span class="fd-m"><span class="tag">${esc(c.label)}</span>${ai ? `<span class="tag ai">${esc(ai)}</span>` : ''}<span>${esc(ago(c.date))}</span></span></a></li>`; }).join('')}</ul>` : '<p class="muted">还没有提交记录。</p>'}</section>`;
    return prog + feed;
  };

  /* ---------- 资源页：代码仓库 ---------- */
  D.ghReposSection = () => {
    if (!G.status) return '';
    if (!D.ghReady()) return '';
    const repos = G.overview?.repos || [];
    return `<section class="card-box rsec">${D.cardHead('layers', '代码仓库', `<span class="gcount">${repos.length}</span><button type="button" class="more link-btn" data-gh-refresh>${D.icon('refresh', 'sm')} 刷新</button>`)}
      <div class="repo-grid">${repos.map(r => r.error ? `<div class="repo"><b>${esc(r.label)}</b><p class="warn small">${esc(r.error)}</p></div>`
        : `<a class="repo" href="${esc(D.safeUrl(r.html_url) || '#')}" target="_blank" rel="noopener noreferrer"><div class="repo-h"><b>${esc(r.label)}</b><span class="pill${r.private ? '' : ' warn'}">${r.private ? '私有' : '公开'}</span></div>
          <p class="repo-c">${r.commits?.[0] ? esc(D.firstLine(r.commits[0].message, 70)) : '还没有提交'}</p>
          <div class="repo-m"><span>${D.icon('clock', 'sm')} ${esc(ago(r.pushed_at))}</span>${r.open_prs ? `<span class="pill warn">${r.open_prs} 个待合并</span>` : ''}${r.commits?.[0] && aiOf(r.commits[0]) ? `<span class="tag ai">${esc(aiOf(r.commits[0]))}</span>` : ''}</div></a>`).join('')}</div></section>`;
  };

  /* ---------- 写回去 ① 收集箱 → 知识库草稿 ---------- */
  D.saveDraft = async item => {
    const cfg = D.ghCfg();
    if (!D.ghReady() || !cfg.drafts) return D.toast('先在「设置 → GitHub」里连上 GitHub、填好草稿放哪', { error: true });
    const title = D.firstLine(item.content, 24).replace(/[\\/:*?"<>|#\n]/g, ' ').trim() || '收集';
    const date = D.today(), path = `${cfg.drafts.dir}/${date}-${title}-${Math.random().toString(36).slice(2, 6)}.md`;
    const text = `---\ntitle: ${title}\ncreated: ${date}\nsource: 我的工作台 · 收集箱（${item.source || '其他'}）\ntags: [草稿]\n---\n\n${item.content}\n`;
    if (!(await D.confirm(`存进知识库草稿：\n${cfg.drafts.repo} / ${path}\n\n会在 GitHub 上新建这个文件（不改任何已有的文件），各个 AI 下次同步就能看到。`, '存进去', { danger: false }))) return;
    try {
      const r = await D.api('PUT', '/gh/file', { repo: cfg.drafts.repo, path, text, message: `docs: 收集箱草稿「${title}」（来自我的工作台）` });
      await D.patch('inbox', item.id, { processed_at: new Date().toISOString(), converted_to: 'kb' });
      D.toast('已存进知识库草稿', { icon: 'book', action: '在 GitHub 看', onAction: () => r.html_url && window.open(D.safeUrl(r.html_url), '_blank', 'noopener,noreferrer') });
      load(true);
    } catch (e) { D.fail(e); }
  };

  /* ---------- 写回去 ② 项目 → 进度.md ---------- */
  // 一个条目：从「### 标题」到下一个 ### / ## / ---
  const blocks = lines => { const out = []; lines.forEach((l, i) => { if (/^###\s+/.test(l)) out.push({ start: i, title: l.replace(/^###\s+/, '').trim() }); }); out.forEach((b, k) => { let e = b.start + 1; while (e < lines.length && !/^(###?\s|---\s*$)/.test(lines[e])) e++; b.end = e; }); return out; };
  const norm = s => String(s).replace(/[\s（）()「」『』：:·，,、—\-*]/g, '').toLowerCase();
  D.progressApply = (text, entry, { replaceTitle, done }) => {
    let lines = text.replace(/\r/g, '').split('\n');
    if (replaceTitle) { const b = blocks(lines).find(x => x.title === replaceTitle); if (b) { let e = b.end; while (e < lines.length && lines[e].trim() === '') e++; lines.splice(b.start, e - b.start); } }
    const want = done ? /^##\s+.*已交付/ : /^##\s+.*进行中/;
    let h = lines.findIndex(l => want.test(l));
    if (h < 0) throw new Error(`这个文件里没有「## ${done ? '已交付' : '进行中'}」这一节，没法放`);
    let at = h + 1;
    while (at < lines.length && lines[at].trim() === '') at++;
    if (/^（暂无）\s*$/.test(lines[at] || '')) { lines.splice(at, 1); while (at < lines.length && lines[at].trim() === '') lines.splice(at, 1); }
    const ins = ['', ...entry.trim().split('\n'), ''];
    lines.splice(h + 1, at - (h + 1), ...ins);
    return lines.join('\n').replace(/\n{3,}/g, '\n\n');
  };
  // 按行比对，只显示改动附近的几行
  D.lineDiff = (a, b, ctx = 3) => {
    const A = a.split('\n'), B = b.split('\n'), n = A.length, m = B.length;
    let p = 0; while (p < n && p < m && A[p] === B[p]) p++;
    let s = 0; while (s < n - p && s < m - p && A[n - 1 - s] === B[m - 1 - s]) s++;
    const a2 = A.slice(p, n - s), b2 = B.slice(p, m - s);
    const L = Array.from({ length: a2.length + 1 }, () => new Int32Array(b2.length + 1));
    for (let i = a2.length - 1; i >= 0; i--) for (let j = b2.length - 1; j >= 0; j--) L[i][j] = a2[i] === b2[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const ops = []; let i = 0, j = 0;
    while (i < a2.length && j < b2.length) { if (a2[i] === b2[j]) { ops.push([' ', a2[i]]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) ops.push(['-', a2[i++]]); else ops.push(['+', b2[j++]]); }
    while (i < a2.length) ops.push(['-', a2[i++]]); while (j < b2.length) ops.push(['+', b2[j++]]);
    const before = A.slice(Math.max(0, p - ctx), p).map(x => [' ', x]), after = A.slice(n - s, Math.min(n, n - s + ctx)).map(x => [' ', x]);
    return { ops: [...before, ...ops, ...after], add: ops.filter(o => o[0] === '+').length, del: ops.filter(o => o[0] === '-').length, start: Math.max(0, p - ctx) + 1 };
  };
  // 能回写的：带「## 进行中」的进度文件；默认用配置里排在最前面的那个（初始化包里把工作项目的看板放第一个）
  const pickTarget = () => { const files = (G.progress?.files || []).filter(f => !f.error && /^##\s+.*进行中/m.test(f.text)); return { files, def: files[0] }; };

  D.pushProgress = async p => {
    if (!D.ghReady()) return D.toast('先在「设置 → GitHub」里连上 GitHub', { error: true });
    if (!G.progress) await load(true);
    const { files, def } = pickTarget();
    if (!files.length) return D.toast('配置的进度文件里没有带「## 进行中」的，没法回写（设置 → GitHub 里检查）', { error: true });
    const dlg = D.$('#pushprog'), body = D.$('#pushprog-body');
    const st = { f: def, entry: D.progressEntry(p), title: null, fresh: null };
    const done = ['done'].includes(D.normStatus(p.status)) || !!p.archived_at;
    const guess = f => { const t = norm(p.title); return blocks(f.text.split('\n')).find(b => norm(b.title).includes(t) || t.includes(norm(b.title)))?.title || null; };
    st.title = guess(st.f);
    const draw = () => {
      let next = '', diff = null, err = '';
      try { next = D.progressApply(st.f.text, st.entry, { replaceTitle: st.title, done }); diff = D.lineDiff(st.f.text, next); } catch (e) { err = e.message; }
      body.innerHTML = `<div class="row wrap tight"><label class="lbl inline">写进<select data-pp="file">${files.map((f, i) => `<option value="${i}" ${f === st.f ? 'selected' : ''}>${esc(f.label)}（${esc(f.repo.split('/')[1])}/${esc(f.path)}）</option>`).join('')}</select></label>
          <label class="lbl inline">替换<select data-pp="title"><option value="">（新增一条，不替换）</option>${blocks(st.f.text.split('\n')).map(b => `<option ${b.title === st.title ? 'selected' : ''}>${esc(b.title)}</option>`).join('')}</select></label></div>
        <p class="muted small">放进「## ${done ? '已交付' : '进行中'}」最上面（最近更新的放最前）。下面的条目可以直接改。</p>
        <textarea data-pp="entry" rows="8" aria-label="条目内容">${esc(st.entry)}</textarea>
        ${err ? `<p class="warn">${esc(err)}</p>` : `<div class="diff"><div class="diff-h">改动：<b class="ok-text">+${diff.add}</b> <b class="warn-text">−${diff.del}</b> 行 · 从第 ${diff.start} 行起</div><pre>${diff.ops.map(([k, l]) => `<span class="d${k === '+' ? 'a' : k === '-' ? 'd' : 'c'}">${k} ${esc(l) || ' '}</span>`).join('')}</pre></div>`}
        <div class="row wrap"><input data-pp="msg" value="${esc(`docs: 回写进度「${p.title}」（来自我的工作台）`)}" maxlength="200" aria-label="提交说明"><span class="grow"></span>
          <button type="button" class="btn sm ghost" data-pp-close>取消</button><button type="button" class="btn sm" data-pp-go ${err ? 'disabled' : ''}>${D.icon('upload', 'sm')}提交到 GitHub</button></div>`;
      st.next = next;
    };
    body.oninput = e => { if (e.target.matches('[data-pp=entry]')) { st.entry = e.target.value; clearTimeout(st.t); st.t = setTimeout(() => { const pos = e.target.selectionStart; draw(); const ta = body.querySelector('[data-pp=entry]'); ta.focus(); ta.setSelectionRange(pos, pos); }, 350); } };
    body.onchange = e => {
      if (e.target.matches('[data-pp=file]')) { st.f = files[Number(e.target.value)]; st.title = guess(st.f); draw(); }
      if (e.target.matches('[data-pp=title]')) { st.title = e.target.value || null; draw(); }
    };
    body.onclick = async e => {
      if (e.target.closest('[data-pp-close]')) return dlg.close();
      const go = e.target.closest('[data-pp-go]'); if (!go) return;
      go.disabled = true;
      try {
        const r = await D.api('PUT', '/gh/file', { repo: st.f.repo, path: st.f.path, sha: st.f.sha, text: st.next, message: body.querySelector('[data-pp=msg]').value });
        st.f.text = st.next; st.f.sha = r.sha;
        dlg.close();
        D.toast(`已回写到 ${st.f.label}`, { icon: 'upload', action: '看提交', onAction: () => r.commit_url && window.open(D.safeUrl(r.commit_url), '_blank', 'noopener,noreferrer') });
        D.create('activities', { project_id: p.id, type: 'progress', summary: `回写进度：${st.f.label}`, happened_at: D.today() }).catch(() => {});
        load(true);
      } catch (err) {
        go.disabled = false;
        if (err.status === 409) {   // 别人刚改过：重新读一遍，重新算改动
          try { const f = await D.api('GET', `/gh/file?repo=${encodeURIComponent(st.f.repo)}&path=${encodeURIComponent(st.f.path)}`); Object.assign(st.f, { text: f.text, sha: f.sha }); draw(); D.toast('这个文件刚被别人（可能是某个 AI）改过，已重新读取，请看一眼新的改动再提交', { error: true, timeout: 8000 }); }
          catch (e2) { D.fail(e2); }
        } else D.fail(err);
      }
    };
    draw(); dlg.showModal();
  };

  /* ---------- 设置里的「GitHub」一节 ---------- */
  D.ghSettings = () => {
    const c = D.ghCfg(), s = G.status;
    const state = !s ? '正在检查…' : !s.configured ? '还没连接（网站后台没有 GitHub 令牌）' : s.error ? `连接有问题：${esc(s.error)}` : `已连接，账号 ${esc(s.login || '')}`;
    return `<p><b>状态：</b>${state} <button type="button" class="tb" data-gh-refresh>${D.icon('refresh', 'sm')}重新检查</button></p>
      <details class="sub" ${s && !s.configured ? 'open' : ''}><summary>怎么连接（一次就好，约 5 分钟）</summary><ol class="steps">
        <li>打开 GitHub → 右上角头像 → Settings → Developer settings → Personal access tokens → <b>Fine-grained tokens</b> → Generate new token。</li>
        <li>名字随便填（比如「我的工作台」），有效期选 1 年；Repository access 选 <b>Only select repositories</b>，勾上你的知识库和要看的代码仓库。</li>
        <li>Permissions → Repository permissions：<b>Contents 选 Read and write</b>（只读也行，但那样不能回写进度、存草稿），<b>Pull requests 选 Read-only</b>，其余不动。生成后复制令牌。</li>
        <li>在电脑终端里到站点目录，运行 <code>npx wrangler@4 secret put GITHUB_TOKEN</code>，粘贴令牌回车。令牌只存在网站后台，页面上看不到。</li>
        <li>回到这里点「重新检查」。</li></ol></details>
      <h4>要看的仓库 <small class="muted">${c.repos.length} 个</small></h4><p class="muted small">${c.repos.map(r => esc(r.label || r.repo)).join('、') || '还没配置（从初始化包导入）'}</p>
      <h4>进度文件 <small class="muted">${c.progress.length} 个</small></h4><p class="muted small">${c.progress.map(r => esc(r.label || r.path)).join('、') || '还没配置'}</p>
      <h4>草稿放哪</h4><p class="muted small">${c.drafts ? `${esc(c.drafts.repo.split('/')[1])} 仓库的「${esc(c.drafts.dir)}」文件夹` : '还没配置'}</p>
      <p class="muted small">这些从仓库外的初始化包导入（设置 → 数据），代码里不写任何仓库名。工作台只能读写这里列出的仓库；写入只能改进度文件、在草稿文件夹新建笔记。</p>`;
  };

  document.addEventListener('click', e => {
    if (e.target.closest('[data-gh-refresh]')) { e.preventDefault(); return load(true); }
  });
})();
