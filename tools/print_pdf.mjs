// 用 CDP 让已启动的 headless Chrome 打印一页为 PDF（走 @media print 样式）
// 用法：node tools/print_pdf.mjs <url> <out.pdf>   —— 一般不直接调，由 tools/make_resume_pdf.sh 调用
// 为什么不用 --print-to-pdf：macOS 上 Chrome 153 的 --headless=new 打印完不退出，命令会挂住。
import { writeFileSync } from 'node:fs';
const [url, out] = process.argv.slice(2);
const port = process.env.CDP_PORT || 9333;
const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
const ws = new WebSocket(webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = {};
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) pend[m.id](m); };
const send = (method, params = {}, sessionId) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Page.navigate', { url }, sessionId);
await new Promise(r => setTimeout(r, 1500));
const r = await send('Page.printToPDF', { printBackground: false, preferCSSPageSize: true, displayHeaderFooter: false }, sessionId);
const buf = Buffer.from(r.result.data, 'base64');
writeFileSync(out, buf);
await send('Target.closeTarget', { targetId });
console.log(`✓ ${out}  ${buf.length} B（未压缩）`); ws.close();
