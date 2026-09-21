#!/bin/bash
# 部署：给 css / js 打版本号再上线，避免 Safari 缓存旧代码。
set -e
cd "$(dirname "$0")"
# 先从知识库同步公开笔记（源头在 ~/Documents/我的知识库/个人主页/公开笔记.txt）
node tools/build_notes.mjs
# 再预渲染导航/页脚/正文并注入分享卡片等 head 元信息（必须在 build_notes 之后，knowledge 页要先生成）
node tools/build_pages.mjs
V=$(date +%Y%m%d%H%M%S)
for f in public/*.html public/knowledge/*.html; do
  sed -i '' -E "s#(/assets/style\.css)(\?v=[0-9]+)?\"#\1?v=$V\"#; s#(/assets/data\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#; s#(/assets/app\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#; s#(/assets/render\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#; s#(/assets/notes\.css)(\?v=[0-9]+)?\"#\1?v=$V\"#" "$f"
done
echo "资源版本 $V"
npx --yes wrangler@4 deploy
