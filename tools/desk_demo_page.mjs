// 由 public/desk.html 生成 public/desk-demo.html（我的工作台演示版，/desk-demo）。
// 两页是同一套代码，演示版只多三处：<html data-demo="1">、不显示登录框、在 core.js 后面加载 demo.js（在浏览器里模拟接口和示例数据）。
// 改了 desk.html 之后跑一次：node tools/desk_demo_page.mjs（幂等，可以反复跑）。版本号照旧由 deploy.sh 统一打。
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const PUB = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
let s = readFileSync(join(PUB, 'desk.html'), 'utf8');
const swap = (a, b) => { if (!s.includes(a)) throw new Error('desk.html 里找不到：' + a); s = s.replace(a, b); };
swap('<html lang="zh-CN">', '<html lang="zh-CN" data-demo="1">');
swap('<title>我的工作台</title>', '<title>我的工作台 · 演示</title>\n<meta name="description" content="一个运营人用 AI 搭给自己的工作台：项目少但每个都很深——在等谁、拍板的口径、交付节点、几个 AI 的比稿版本一页理清。演示版数据全是虚构的，可以随便点。">');
swap('<!-- 独立应用页：', '<!-- 演示版：由 tools/desk_demo_page.mjs 从 desk.html 生成，不要手改。数据在访客浏览器里（demo.js），不连真实接口。\n     以下是 desk.html 原来的说明 —— 独立应用页：');
swap('<form id="login" class="login" novalidate>', '<form id="login" class="login" novalidate hidden>');
s = s.replace(/(<script src="\/assets\/desk\/core\.js(\?v=\d+)?"><\/script>)/, (m, all, v = '') => `${all}\n<script src="/assets/desk/demo.js${v}"></script>`);
if (!s.includes('/assets/desk/demo.js')) throw new Error('没插进 demo.js');
writeFileSync(join(PUB, 'desk-demo.html'), s);
console.log('✓ public/desk-demo.html');
