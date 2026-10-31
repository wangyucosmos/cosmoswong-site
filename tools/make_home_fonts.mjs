// 全站字体自托管（站点零外部请求，CSP 不放行 Google Fonts）；首页和子页面共用这一套（2026-10-30 起）
// 中文 Noto Sans SC 只取全站会显示的字（首页 + data.js 全部内容 + 简历 + 静态页 + 模板 / 脚本里的文案），
// 用 Google Fonts 的 text= 子集接口一次下载；英文 Unbounded、等宽 JetBrains Mono 只取 ASCII 与少量符号。
// 产物：public/assets/home/fonts/*.woff2 + public/assets/home/fonts.css（不要手改，改了首页文字或作品后重跑）
// 用法：HTTPS_PROXY=http://127.0.0.1:7897 node tools/make_home_fonts.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public'), OUT = join(PUB, 'assets/home/fonts');
mkdirSync(OUT, { recursive: true });
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const curl = (url, bin) => execFileSync('curl', ['-sSfL', '-A', UA, url], { encoding: bin ? 'buffer' : 'utf8', maxBuffer: 1 << 26 });

// ---- 首页会显示的中文 ----
const window = {};
vm.runInContext(readFileSync(join(PUB, 'assets/data.js'), 'utf8'), vm.createContext({ window, globalThis: window }));
const S = window.SITE;
const html = readFileSync(join(PUB, 'index.html'), 'utf8')
  .replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '');
const ui = readFileSync(join(PUB, 'assets/home/ui.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\/\/ .*$/gm, '');
const strip = f => readFileSync(join(PUB, f), 'utf8').replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<!--[\s\S]*?-->|<[^>]+>/g, '');
const js = f => readFileSync(join(PUB, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\/\/ .*$/gm, '');
const pages = ['workbench.html', '404.html', 'unlock.html', ...readdirSync(join(PUB, 'knowledge')).filter(f => f.endsWith('.html')).map(f => 'knowledge/' + f)];
const dataText = [JSON.stringify(S), readFileSync(join(ROOT, 'data/resume.json'), 'utf8'), ...pages.map(strip), js('assets/render.js'), js('assets/app.js'), js('assets/unlock.js')].join('');
const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');
const SYM = '·—–…→←↑↓↗×©“”‘’《》「」、，。：；！？（）%·';
const all = new Set([...html, ...ui, ...dataText, ...ASCII, ...SYM].filter(c => c.codePointAt(0) >= 32));
const text = [...all].sort().join('');
console.log(`中文子集 ${[...all].filter(c => c.codePointAt(0) > 0x2e80).length} 个汉字/全角字符`);

// ---- 下载：每个字族每个字重；中文字多，text= 地址太长会被截断，所以按 CHUNK 个字一批分开下，
//      每批一个 woff2，@font-face 用 unicode-range 写明这一批的字，浏览器只下页面用到的那几批 ----
const CHUNK = 260;
const cjk = [...all].filter(c => c.codePointAt(0) > 0x2e80).sort();
const rest = [...all].filter(c => c.codePointAt(0) <= 0x2e80).sort().join('');
const chunks = [rest, ...Array.from({ length: Math.ceil(cjk.length / CHUNK) }, (_, i) => cjk.slice(i * CHUNK, (i + 1) * CHUNK).join(''))];
const range = t => [...new Set([...t].map(c => c.codePointAt(0)))].sort((a, b) => a - b).map(n => 'U+' + n.toString(16).toUpperCase()).join(',');
const FAMILIES = [
  { css: 'Noto Sans SC', file: 'noto-sc', weights: [400, 500, 700, 900], parts: chunks },
  { css: 'Unbounded', file: 'unbounded', weights: [500, 700, 800], parts: [ASCII + '·—–…→↑↓↗×©'] },
  { css: 'JetBrains Mono', file: 'jbmono', weights: [400, 500], parts: [ASCII + '·—→↑↓↗×'] }
];
let faces = '/* 生成物：tools/make_home_fonts.mjs，不要手改 */\n', total = 0;
for (const f of readdirSync(OUT)) if (f.endsWith('.woff2')) rmSync(join(OUT, f));   // 旧文件全清，只留这次生成的
for (const f of FAMILIES) {
  for (const w of f.weights) {
    for (const [i, text] of f.parts.entries()) {
      const q = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.css)}:wght@${w}&text=${encodeURIComponent(text)}&display=swap`;
      const css = curl(q);
      const url = (css.match(/url\((https:[^)]+)\)/) || [])[1];
      if (!url) throw new Error(`没拿到 ${f.css} ${w} 第 ${i} 批的字体地址：\n${css.slice(0, 300)}`);
      const buf = curl(url, true);
      // 文件名带内容哈希：/assets 是长缓存，字变了文件名就变，回头客不会拿到旧字体
      const name = `${f.file}-${w}${f.parts.length > 1 ? '-' + i : ''}-${createHash('sha1').update(buf).digest('hex').slice(0, 8)}.woff2`;
      if (buf.length < 1500 && text.length > 20) throw new Error(`${name} 只有 ${buf.length} B，字没下全`);
      writeFileSync(join(OUT, name), buf); total += buf.length;
      faces += `@font-face{font-family:"${f.css}";font-style:normal;font-weight:${w};font-display:swap;src:url(/assets/home/fonts/${name}) format("woff2")${f.parts.length > 1 ? `;unicode-range:${range(text)}` : ''}}\n`;
    }
    console.log(`✓ ${f.css} ${w}  ${f.parts.length} 个文件`);
  }
}
writeFileSync(join(PUB, 'assets/home/fonts.css'), faces);
console.log(`共 ${(total / 1024).toFixed(0)} KB`);
