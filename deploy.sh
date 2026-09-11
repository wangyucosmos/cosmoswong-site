#!/bin/bash
# 部署：给 css / js 打版本号再上线，避免 Safari 缓存旧代码。
set -e
cd "$(dirname "$0")"
V=$(date +%Y%m%d%H%M%S)
for f in public/*.html; do
  sed -i '' -E "s#(/assets/style\.css)(\?v=[0-9]+)?\"#\1?v=$V\"#; s#(/assets/data\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#; s#(/assets/app\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#" "$f"
done
echo "资源版本 $V"
npx --yes wrangler@4 deploy
