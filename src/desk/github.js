// /api/desk/gh/* —— 我的工作台替用户读写 GitHub（v4，2026-10-04）。
// 令牌放在 Worker secret GITHUB_TOKEN（用户自己用 wrangler secret put 设置，细粒度、只开指定仓库），绝不发给浏览器。
// 哪些仓库、哪些进度文件、草稿放哪，存在 D1 settings 的 github 键里（从仓库外的初始化包导入，代码里不写任何真实仓库名）。
// 只允许碰配置里列出的仓库；写入只允许：配置里的进度文件、草稿文件夹下的新文件。写入带上读取时的 sha，别人刚改过就返回 409。
import { json } from '../shared.js';
import { Invalid } from './schema.js';

const UA = 'cosmoswong-desk';
const REPO_RE = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const cleanPath = p => {
  const s = String(p || '').replace(/^\/+/, '');
  if (!s || s.length > 300 || s.split('/').some(x => !x || x === '.' || x === '..')) throw new Invalid('文件路径不对');
  return s;
};
const enc = p => p.split('/').map(encodeURIComponent).join('/');
const b64 = text => { const bytes = new TextEncoder().encode(text); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin); };
const unb64 = s => new TextDecoder().decode(Uint8Array.from(atob(String(s).replace(/\n/g, '')), c => c.charCodeAt(0)));

async function config(db) {
  const r = await db.prepare("SELECT value FROM settings WHERE key = 'github'").first();
  let c = {}; try { c = r ? JSON.parse(r.value) : {}; } catch { /* 坏值当没配 */ }
  const repos = (Array.isArray(c.repos) ? c.repos : []).filter(x => REPO_RE.test(x?.repo || ''));
  const progress = (Array.isArray(c.progress) ? c.progress : []).filter(x => REPO_RE.test(x?.repo || '') && x.path);
  const drafts = c.drafts && REPO_RE.test(c.drafts.repo || '') ? { repo: c.drafts.repo, dir: String(c.drafts.dir || '_草稿').replace(/^\/+|\/+$/g, '') } : null;
  // 知识库：哪个仓库对应本地知识库的哪个文件夹（prefix 为空 = 根目录）；手机上看知识库、「在 GitHub 打开」都靠它
  const kb = (Array.isArray(c.kb) ? c.kb : []).filter(x => REPO_RE.test(x?.repo || '')).map(x => ({ repo: x.repo, prefix: String(x.prefix || '').replace(/^\/+|\/+$/g, ''), branch: x.branch || 'main' }));
  return { repos, progress, drafts, kb };
}
const allowed = (cfg, repo) => cfg.repos.some(x => x.repo === repo) || cfg.progress.some(x => x.repo === repo) || cfg.drafts?.repo === repo || cfg.kb.some(x => x.repo === repo);

async function gh(env, path, init = {}) {
  const base = (env.GITHUB_API || 'https://api.github.com').replace(/\/$/, '');
  let r;
  try {
    r = await fetch(base + path, { ...init, headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': UA, ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers || {}) } });
  } catch { const e = new Error('连不上 GitHub，稍后再试'); e.status = 502; throw e; }
  const data = r.status === 204 ? {} : await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = r.status === 401 ? 'GitHub 令牌失效了，需要重新设置' : r.status === 403 ? (r.headers.get('x-ratelimit-remaining') === '0' ? 'GitHub 调用次数用完了，过一会儿再试' : 'GitHub 令牌没有这个权限（看看令牌开了哪些仓库、是不是只读）')
      : r.status === 404 ? 'GitHub 上找不到这个仓库或文件（也可能是令牌没开这个仓库）' : r.status === 409 || r.status === 422 ? '有人刚改过这个文件，请重新读取再改' : `GitHub 出错了（${r.status}）`;
    const e = new Error(msg); e.status = r.status === 422 ? 409 : r.status; throw e;
  }
  return data;
}
const fail = e => json({ error: e.message || String(e) }, e.status && e.status >= 400 && e.status < 600 ? (e.status === 401 ? 424 : e.status) : 500);   // GitHub 的 401 不能原样回，否则页面会以为工作台登录过期

async function readFile(env, repo, path) {
  const d = await gh(env, `/repos/${repo}/contents/${enc(path)}`);
  if (Array.isArray(d) || d.type !== 'file') throw new Invalid('这不是一个文件');
  return { repo, path, sha: d.sha, text: d.encoding === 'base64' ? unb64(d.content) : String(d.content || ''), html_url: d.html_url };
}

export async function githubApi(req, env, db, parts, readBody) {
  const [, what] = parts;   // parts = ['gh', what]
  const m = req.method, url = new URL(req.url);
  const cfg = await config(db);
  if (what === 'status' && m === 'GET') {
    if (!env.GITHUB_TOKEN) return json({ configured: false, ...cfg });
    try { const u = await gh(env, '/user'); return json({ configured: true, login: u.login, ...cfg }); }
    catch (e) { return json({ configured: true, error: e.message, ...cfg }); }
  }
  if (!env.GITHUB_TOKEN) return json({ error: '还没连接 GitHub（缺 GITHUB_TOKEN）' }, 424);
  try {
    if (what === 'overview' && m === 'GET') {
      const out = await Promise.all(cfg.repos.map(async x => {
        try {
          const [info, commits, pulls] = await Promise.all([
            gh(env, `/repos/${x.repo}`), gh(env, `/repos/${x.repo}/commits?per_page=8`), gh(env, `/repos/${x.repo}/pulls?state=open&per_page=30`).catch(() => [])
          ]);
          return { repo: x.repo, label: x.label || x.repo.split('/')[1], private: info.private, html_url: info.html_url, default_branch: info.default_branch, pushed_at: info.pushed_at, open_prs: Array.isArray(pulls) ? pulls.length : 0,
            commits: (Array.isArray(commits) ? commits : []).map(c => ({ sha: c.sha, message: String(c.commit?.message || '').slice(0, 2000), author: c.commit?.author?.name || c.author?.login || '', date: c.commit?.author?.date || c.commit?.committer?.date, html_url: c.html_url })) };
        } catch (e) { return { repo: x.repo, label: x.label || x.repo, error: e.message }; }
      }));
      return json({ repos: out });
    }
    if (what === 'progress' && m === 'GET') {
      const files = await Promise.all(cfg.progress.map(async x => {
        try { return { ...(await readFile(env, x.repo, x.path)), label: x.label || x.path }; }
        catch (e) { return { repo: x.repo, path: x.path, label: x.label || x.path, error: e.message }; }
      }));
      return json({ files });
    }
    if (what === 'tree' && m === 'GET') {   // 知识库里所有 .md 的路径（手机上浏览知识库用）
      const out = [];
      for (const k of cfg.kb) {
        try {
          const t = await gh(env, `/repos/${k.repo}/git/trees/${encodeURIComponent(k.branch)}?recursive=1`);
          for (const n of t.tree || []) if (n.type === 'blob' && /\.md$/i.test(n.path) && n.size < 2_000_000) out.push({ repo: k.repo, path: n.path, full: (k.prefix ? k.prefix + '/' : '') + n.path, size: n.size, sha: n.sha });
        } catch (e) { out.push({ repo: k.repo, error: e.message }); }
      }
      return json({ files: out });
    }
    if (what === 'file' && m === 'GET') {
      const repo = url.searchParams.get('repo'), path = cleanPath(url.searchParams.get('path'));
      if (!allowed(cfg, repo)) throw new Invalid('这个仓库不在工作台的配置里');
      return json(await readFile(env, repo, path));
    }
    if (what === 'file' && m === 'PUT') {
      const b = await readBody(req);
      const repo = String(b.repo || ''), path = cleanPath(b.path), text = String(b.text ?? '');
      if (text.length > 1_000_000) throw new Invalid('内容太大了');
      const isProgress = cfg.progress.some(x => x.repo === repo && x.path === path);
      const isDraft = cfg.drafts && cfg.drafts.repo === repo && path.startsWith(cfg.drafts.dir + '/') && /\.md$/.test(path) && !b.sha;
      if (!isProgress && !isDraft) throw new Invalid('工作台只能改配置里的进度文件、在草稿文件夹里新建笔记');
      if (isProgress && !/^[0-9a-f]{40}$/.test(String(b.sha || ''))) throw new Invalid('缺少读取时的版本号（sha），请重新读取再改');
      const message = String(b.message || '').trim().slice(0, 200) || `docs: 我的工作台回写 ${path}`;
      const r = await gh(env, `/repos/${repo}/contents/${enc(path)}`, { method: 'PUT', body: JSON.stringify({ message, content: b64(text), ...(isProgress ? { sha: b.sha } : {}) }) });
      return json({ ok: true, sha: r.content?.sha, commit: r.commit?.sha, html_url: r.content?.html_url, commit_url: r.commit?.html_url });
    }
    return json({ error: '没有这个接口' }, 404);
  } catch (e) {
    if (e instanceof Invalid) throw e;
    return fail(e);
  }
}
