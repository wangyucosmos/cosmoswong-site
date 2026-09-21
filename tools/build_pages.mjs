// 构建期预渲染 + <head> 元信息注入
// 用 render.js（和浏览器同一份模板）把导航 / 页脚 / 正文直接写进 public/*.html，
// 让微信、飞书、百度、Bing 这些不跑 JS 的抓取器也能拿到完整页面；同时给每页补
// favicon、canonical、og / twitter 分享卡片、theme-color。
// 内容仍然只来自 public/assets/data.js —— 改 data.js 后重新部署即更新，不要手改 html。
// 幂等：所有注入段都包在标记注释里，重复构建整段替换而不是叠加。
// 用法：node tools/build_pages.mjs   （deploy.sh 在 build_notes.mjs 之后自动调用，顺序不能反）
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public');
const ORIGIN = 'https://cosmoswong.com';
const THEME = '#0e0a1a';
const YEAR = new Date().getFullYear();

/* ---------- 在假 window 上跑 data.js + render.js，拿到 SITE 和 RENDER ---------- */
const window = {};
const ctx = vm.createContext({ window, globalThis: window });
for (const f of ['data.js', 'render.js']) vm.runInContext(readFileSync(join(PUB, 'assets', f), 'utf8'), ctx, { filename: f });
const { SITE, RENDER } = window;
if (!SITE || !RENDER) { console.error('data.js / render.js 没有导出 SITE / RENDER'); process.exit(1); }
const esc = RENDER.esc;

/* ---------- 页面清单 ---------- */
// 动态页：正文由 RENDER.pages[page](SITE) 生成
const DYNAMIC = [
  { path: '/', file: 'index.html', page: 'home', type: 'profile' },
  { path: '/portfolio', file: 'portfolio.html', page: 'portfolio' },
  { path: '/resume', file: 'resume.html', page: 'resume', type: 'profile' },
  { path: '/trips', file: 'trips.html', page: 'trips' },
  { path: '/tools', file: 'tools.html', page: 'tools' },
  { path: '/bookmarks', file: 'bookmarks.html', page: 'bookmarks' }
];
// 静态页：正文自带（knowledge 由 build_notes.mjs 生成，404 手写），只注入骨架和 head
const STATIC = [
  { path: null, file: '404.html' },
  ...readdirSync(join(PUB, 'knowledge')).filter(f => f.endsWith('.html')).sort().map(f => ({
    path: f === 'index.html' ? '/knowledge' : `/knowledge/${f.replace(/\.html$/, '')}`,
    file: join('knowledge', f)
  }))
];

/* ---------- 注入工具 ---------- */
const block = (name, body) => `<!--${name}:auto-->${body}<!--/${name}:auto-->`;
// 把标记段替换成新内容；没有标记时按 where 插入（'before' 某锚点 / 'after' 某锚点）
function upsert(html, name, body, anchor, where) {
  const re = new RegExp(`\\n?<!--${name}:auto-->[\\s\\S]*?<!--/${name}:auto-->`);
  const seg = '\n' + block(name, body);
  if (re.test(html)) return html.replace(re, seg);
  const i = html.indexOf(anchor);
  if (i < 0) throw new Error(`找不到锚点 ${anchor}`);
  const at = where === 'after' ? i + anchor.length : i;
  return html.slice(0, at) + seg + (where === 'after' ? '' : '\n') + html.slice(at);
}
const attr = (html, re) => (html.match(re) || [])[1] || '';

function headMeta(p, html) {
  const title = attr(html, /<title>([^<]*)<\/title>/);
  const desc = attr(html, /<meta name="description" content="([^"]*)"/);
  const lines = [
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`,
    `<link rel="icon" href="/favicon.ico" sizes="32x32">`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
    `<meta name="theme-color" content="${THEME}">`
  ];
  if (p.path) {
    // canonical 统一不带尾斜杠（wrangler 是 auto-trailing-slash），首页是 https://cosmoswong.com/
    const url = ORIGIN + p.path;
    lines.push(
      `<link rel="canonical" href="${url}">`,
      `<meta property="og:type" content="${p.type || 'website'}">`,
      `<meta property="og:site_name" content="${esc(SITE.me.name)}">`,
      `<meta property="og:locale" content="zh_CN">`,
      `<meta property="og:url" content="${url}">`,
      `<meta property="og:title" content="${title}">`,
      `<meta property="og:description" content="${desc}">`,
      `<meta property="og:image" content="${ORIGIN}/og.png">`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
      `<meta property="og:image:alt" content="${esc(SITE.me.name)} · ${esc(SITE.me.title)}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:title" content="${title}">`,
      `<meta name="twitter:description" content="${desc}">`,
      `<meta name="twitter:image" content="${ORIGIN}/og.png">`
    );
  }
  return '\n' + lines.join('\n') + '\n';
}

function build(p) {
  const file = join(PUB, p.file);
  let html = readFileSync(file, 'utf8');
  const here = p.path || '/404';

  // 1. head：icon / canonical / og / twitter / theme-color
  html = upsert(html, 'head', headMeta(p, html), '</head>', 'before');

  // 2. 骨架：header（body 开头）、footer + 菜单遮罩（放在 <script> 之前——app.js 是同步执行的，
  //    骨架必须先进 DOM，它的幂等判断才看得到，否则会插出第二份页脚）
  html = upsert(html, 'chrome-top', RENDER.renderHeader(SITE, here), attr(html, /(<body[^>]*>)/), 'after');
  html = upsert(html, 'chrome-bottom', RENDER.renderFooter(SITE, YEAR), '<script src="/assets/data.js', 'before');

  // 3. 内页给 body 加 .inner（app.js 也会加，这里是为了无 JS 时背景亮度一致）
  if (p.page !== 'home') html = html.replace(/<body(?![^>]*\bclass=)([^>]*)>/, '<body class="inner"$1>');

  // 4. 动态页正文
  if (p.page) {
    const body = RENDER.pages[p.page](SITE);
    html = html.replace(/<main class="wrap"[^>]*>[\s\S]*?<\/main>/, `<main class="wrap" data-prerendered="1">${body}\n</main>`);
  }

  // 5. app.js 前面要先加载 render.js；版本号跟 app.js 的一致（deploy.sh 之后还会统一 bump）
  if (!/\/assets\/render\.js/.test(html)) {
    html = html.replace(/<script src="\/assets\/app\.js(\?v=\d+)?"><\/script>/, (m, v = '') => `<script src="/assets/render.js${v}"></script>${m}`);
  }

  writeFileSync(file, html);
  console.log(`✓ ${(p.path || '(404)').padEnd(28)} ${relative(ROOT, file)}  ${html.length} B`);
}

for (const p of [...DYNAMIC, ...STATIC]) build(p);
console.log(`共 ${DYNAMIC.length + STATIC.length} 页`);
