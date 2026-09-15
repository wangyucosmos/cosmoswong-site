// 知识库公开笔记 → /knowledge/*.html
// 读取知识库里的清单 个人主页/公开笔记.txt，把列出的 md 转成站内页面，并生成 /knowledge 目录页。
// 知识库是唯一源头：改 md → 重新部署即更新，不要手改生成的 html。
// 用法：node tools/build_notes.mjs   （deploy.sh 会自动调用）
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KB = process.env.KB_DIR || join(process.env.HOME, 'Documents/我的知识库');
const LIST = join(KB, '个人主页/公开笔记.txt');
const OUT = join(SITE, 'public/knowledge');
const HOME = process.env.HOME;

if (!existsSync(LIST)) { console.error(`找不到公开清单：${LIST}`); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const notes = readFileSync(LIST, 'utf8').split('\n')
  .map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  .map(l => { const [slug, path, title, desc] = l.split('|').map(x => x.trim()); return { slug, path, title, desc }; });

const slugByPath = new Map(notes.map(n => [n.path, n.slug]));

marked.setOptions({ gfm: true, breaks: false });

function shell({ title, eyebrow, h1, lede, body }) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="${esc(lede)}">
<title>${esc(title)} · Cosmos Wong</title>
<link rel="stylesheet" href="/assets/style.css?v=20260913220000">
<link rel="stylesheet" href="/assets/notes.css?v=20260913220000">
</head>
<body data-page="knowledge">
<main class="wrap">
  <div class="page-head"><p class="eyebrow">${eyebrow}</p><h1>${esc(h1)}</h1>
    <p>${esc(lede)}</p></div>
  <article class="kb">
${body}
  </article>
</main>
<script src="/assets/data.js?v=20260913220000"></script>
<script src="/assets/app.js?v=20260913220000"></script>
</body>
</html>
`;
}

function convert(note) {
  const src = join(KB, note.path);
  let md = readFileSync(src, 'utf8');
  md = md.replace(/^---\n[\s\S]*?\n---\n/, '');                 // YAML frontmatter
  md = md.replace(/^#\s[^\n]*\n/, '');                            // 首个 h1，页头已有标题
  md = md.split(HOME).join('~');                                  // 本机绝对路径脱敏
  let html = marked.parse(md);
  // 指向 .md 的链接：已公开的映射到站内页，其余退化为纯文字
  html = html.replace(/<a href="([^"]+\.md)">([^<]*)<\/a>/g, (m, href, text) => {
    const clean = decodeURIComponent(href).replace(/^\.\//, '');
    const dir = dirname(note.path);
    const cand = [clean, dir === '.' ? clean : `${dir}/${clean}`];
    const hit = cand.map(c => slugByPath.get(c)).find(Boolean);
    return hit ? `<a href="/knowledge/${hit}">${text}</a>` : text;
  });
  html = html.replace(/<table>/g, '<div class="tablewrap"><table>').replace(/<\/table>/g, '</table></div>');
  return html;
}

for (const n of notes) {
  const body = convert(n);
  writeFileSync(join(OUT, `${n.slug}.html`), shell({
    title: n.title, eyebrow: `<a href="/knowledge">知识库</a> / 笔记`, h1: n.title, lede: n.desc, body
  }));
  console.log(`✓ /knowledge/${n.slug}  ← ${n.path}`);
}

// 目录页：架构说明 + 清单里的笔记
const rows = [
  { href: '/knowledge/overview', ic: '🗺', title: '知识库架构说明', desc: '一份本地文件夹、两个 GitHub 备份、五个 AI 工具各自怎么进出' },
  ...notes.map(n => ({ href: `/knowledge/${n.slug}`, ic: '📝', title: n.title, desc: n.desc }))
];
const list = `<div class="rows">${rows.map(r =>
  `<a class="row" href="${r.href}"><span class="ic">${r.ic}</span><span class="t"><h3>${esc(r.title)}</h3><p>${esc(r.desc)}</p></span><span class="arrow">→</span></a>`).join('\n')}</div>`;
writeFileSync(join(OUT, 'index.html'), shell({
  title: '知识库', eyebrow: 'Knowledge base', h1: '知识库',
  lede: '我怎么让几个 AI 工具共用一套知识和流程，以及一些沉淀下来的方法与技术笔记。内容直接从本地知识库同步，不是手抄的。',
  body: list
}));
console.log(`✓ /knowledge  目录页（${rows.length} 条）`);
