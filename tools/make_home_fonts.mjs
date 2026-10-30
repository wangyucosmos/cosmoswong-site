// 首页字体自托管（站点零外部请求，CSP 不放行 Google Fonts）
// 中文 Noto Sans SC 只取首页实际会显示的字（public/index.html 的文字 + data.js 里作品的标题 / 类别 / 年份 / 摘要），
// 用 Google Fonts 的 text= 子集接口一次下载；英文 Unbounded、等宽 JetBrains Mono 只取 ASCII 与少量符号。
// 产物：public/assets/home/fonts/*.woff2 + public/assets/home/fonts.css（不要手改，改了首页文字或作品后重跑）
// 用法：HTTPS_PROXY=http://127.0.0.1:7897 node tools/make_home_fonts.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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
const dataText = [S.me.name, S.me.title, ...S.portfolio.flatMap(p => [p.title, p.category, p.year, p.summary])].join('');
const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');
const SYM = '·—–…→←↑↓↗×©“”‘’《》「」、，。：；！？（）%·';
const all = new Set([...html, ...ui, ...dataText, ...ASCII, ...SYM].filter(c => c.codePointAt(0) >= 32));
const text = [...all].sort().join('');
console.log(`中文子集 ${[...all].filter(c => c.codePointAt(0) > 0x2e80).length} 个汉字/全角字符`);

// ---- 下载：每个字族每个字重一个 woff2 ----
const FAMILIES = [
  { css: 'Noto Sans SC', file: 'noto-sc', weights: [400, 500, 700, 900], text },
  { css: 'Unbounded', file: 'unbounded', weights: [500, 700, 800], text: ASCII + '·—–…→↑↓↗×©' },
  { css: 'JetBrains Mono', file: 'jbmono', weights: [400, 500], text: ASCII + '·—→↑↓↗×' }
];
let faces = '/* 生成物：tools/make_home_fonts.mjs，不要手改 */\n';
for (const f of FAMILIES) {
  for (const w of f.weights) {
    const q = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.css)}:wght@${w}&text=${encodeURIComponent(f.text)}&display=swap`;
    const css = curl(q);
    const url = (css.match(/url\((https:[^)]+)\)/) || [])[1];
    if (!url) throw new Error(`没拿到 ${f.css} ${w} 的字体地址：\n${css.slice(0, 300)}`);
    const name = `${f.file}-${w}.woff2`;
    const buf = curl(url, true);
    writeFileSync(join(OUT, name), buf);
    faces += `@font-face{font-family:"${f.css}";font-style:normal;font-weight:${w};font-display:swap;src:url(/assets/home/fonts/${name}) format("woff2")}\n`;
    console.log(`✓ ${name.padEnd(22)} ${(buf.length / 1024).toFixed(0)} KB`);
  }
}
writeFileSync(join(PUB, 'assets/home/fonts.css'), faces);
