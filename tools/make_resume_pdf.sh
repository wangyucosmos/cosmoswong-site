#!/bin/bash
# 从 /resume 页导出 public/resume.pdf（A4，走 style.css 末尾的 @media print）。
# 简历内容只在 data.js 里维护，改完重跑这个脚本即可，不要另外维护一份简历文件。
# 依赖：本机 Google Chrome、node ≥ 22（内置 fetch/WebSocket）、uv（临时拉 pymupdf 做字体子集合并，把体积压到 300KB 内）
set -e
cd "$(dirname "$0")/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT=8790; CDP=9333; PROFILE="$(mktemp -d)"
cleanup(){ kill $HTTP_PID $CHROME_PID 2>/dev/null; wait $CHROME_PID 2>/dev/null; sleep 0.5; rm -rf "$PROFILE" 2>/dev/null || true; }
trap cleanup EXIT

node tools/build_pages.mjs >/dev/null            # 先保证 resume.html 是最新预渲染
python3 -m http.server $PORT --directory public >/dev/null 2>&1 & HTTP_PID=$!
"$CHROME" --headless=new --disable-gpu --no-first-run --remote-debugging-port=$CDP --user-data-dir="$PROFILE" about:blank >/dev/null 2>&1 & CHROME_PID=$!
for i in $(seq 1 30); do curl -s "http://127.0.0.1:$CDP/json/version" >/dev/null && break; sleep 0.5; done

CDP_PORT=$CDP node tools/print_pdf.mjs "http://127.0.0.1:$PORT/resume.html?t=$(date +%s)" public/resume.pdf
# Chrome 会按字号/字重拆出十几份字体子集，合并一次能省 10–15%
uv run --quiet --with pymupdf python - <<'PY'
import pymupdf, os
d = pymupdf.open('public/resume.pdf'); d.subset_fonts()
d.save('public/resume.tmp.pdf', garbage=4, deflate=True, clean=True); d.close()
os.replace('public/resume.tmp.pdf', 'public/resume.pdf')
d = pymupdf.open('public/resume.pdf')
size = os.path.getsize('public/resume.pdf')
print(f"✓ public/resume.pdf  {len(d)} 页  {size} B" + ("" if size <= 300_000 else "  ⚠️ 超过 300KB"))
PY
