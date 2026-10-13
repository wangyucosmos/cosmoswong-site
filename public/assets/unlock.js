// 工具箱口令页：输对口令后跳回 /go/<next>（服务端再跳到真实工具地址）。见 src/tools-gate.js
(() => {
  if (location.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(location.hostname)) {
    location.replace('https://' + location.host + location.pathname + location.search);
    return;
  }
  const next = new URLSearchParams(location.search).get('next') || '';
  const safeNext = /^[a-z0-9-]{1,40}$/.test(next) ? next : '';
  const f = document.getElementById('f'), pw = document.getElementById('pw'), btn = document.getElementById('go'), err = document.getElementById('err');
  pw.focus();
  f.addEventListener('submit', async e => {
    e.preventDefault();
    err.textContent = '';
    if (!pw.value) { err.textContent = '请输入口令'; return; }
    btn.disabled = true;
    try {
      const r = await fetch('/api/tools/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-tools-request': '1' }, credentials: 'same-origin', body: JSON.stringify({ password: pw.value }) });
      if (r.ok) { location.replace(safeNext ? '/go/' + safeNext : '/tools'); return; }
      const d = await r.json().catch(() => ({}));
      err.textContent = d.error || '出错了，请稍后再试';
      pw.select();
    } catch { err.textContent = '网络不通，请稍后再试'; }
    btn.disabled = false;
  });
})();
