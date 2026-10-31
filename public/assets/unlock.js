import { safeNext, nextLocation, toolmapReturn, resumePath } from './tools-next.mjs';
// 工具箱口令页：输对口令后跳回 /go/<next>（服务端再跳到真实工具地址）。见 src/tools-gate.js
(() => {
  if (location.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(location.hostname)) {
    location.replace('https://' + location.host + location.pathname + location.search + location.hash);
    return;
  }
  const next = new URLSearchParams(location.search).get('next') || '';
  const destination = nextLocation(next);
  const validNext = !next || safeNext(next) !== null;
  const f = document.getElementById('f'), pw = document.getElementById('pw'), btn = document.getElementById('go'), err = document.getElementById('err');
  // 简历是单独的口令（src/tools-gate.js），文案也分开说
  if (destination && resumePath(destination.split(/[?#]/)[0])) {
    document.title = '简历需要口令';
    document.querySelector('h1').textContent = '简历需要口令';
    document.querySelector('main > p').textContent = '简历只给我发过口令的人看，输入后即可浏览和下载。';
  }
  pw.focus();
  if (!validNext) { err.textContent = '返回地址不受支持，请从站内入口重新打开'; btn.disabled = true; }
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (!validNext) return;
    err.textContent = '';
    if (!pw.value) { err.textContent = '请输入口令'; return; }
    btn.disabled = true;
    try {
      const r = await fetch('/api/tools/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-tools-request': '1' }, credentials: 'same-origin', body: JSON.stringify({ password: pw.value, next }) });
      if (r.ok) { const d = await r.json(); if (d.redirect !== destination) throw new Error('返回地址不正确'); location.replace(toolmapReturn(destination, location.hash)); return; }
      const d = await r.json().catch(() => ({}));
      err.textContent = d.error || '出错了，请稍后再试';
      pw.select();
    } catch { err.textContent = '网络不通，请稍后再试'; }
    btn.disabled = false;
  });
})();
