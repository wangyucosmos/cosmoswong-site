#!/bin/bash
# 把 /desk 我的工作台回退到 v1（git 标签 desk-v1，2026-10-04 上线的第一版：9 个视图）。
# 数据不用回退：v2 的迁移（migrations/desk/0002_v2.sql）只加不删，旧版代码照样能读写这份数据。
#
# 用法（在站点目录）：
#   tools/desk_rollback_v1.sh --dry-run   只在本地把 /desk 的代码换成 v1（不改数据库、不部署、不提交），用来先看看
#   tools/desk_rollback_v1.sh --yes       正式回退：换代码 → 把 v2 新增的两个状态改回旧版认识的 → 部署 → 提交推送
#
# 只动 /desk 自己的三处：public/desk.html、public/assets/desk/、src/desk/。主站其他页面、导航、/kol、/subs 都不受影响。
# 回退后记得改站点 AGENTS.md 的「/desk」一节和知识库「个人主页.md」里的说明。
set -euo pipefail
cd "$(dirname "$0")/.."
MODE="${1:-}"
[ "$MODE" = "--yes" ] || [ "$MODE" = "--dry-run" ] || { echo "用法：tools/desk_rollback_v1.sh --dry-run | --yes"; exit 1; }
export PATH=/Library/Developer/CommandLineTools/usr/bin:$PATH   # 本机 /usr/bin/git 会因 Xcode 许可协议报错
git rev-parse -q --verify desk-v1 >/dev/null || git fetch -q origin tag desk-v1
if [ -n "$(git status --porcelain -- public/desk.html public/assets/desk src/desk)" ]; then echo "/desk 的文件有没提交的改动，先处理"; exit 1; fi

# 1. 换代码：先删掉 v2 才有的文件，再从标签里取回 v1 的
git rm -rq public/desk.html public/assets/desk src/desk
git checkout desk-v1 -- public/desk.html public/assets/desk src/desk
echo "已把 /desk 的代码换成 desk-v1："
git status --short -- public/desk.html public/assets/desk src/desk

if [ "$MODE" = "--dry-run" ]; then
  echo "（--dry-run：没改数据库、没部署、没提交。要撤销这次换代码：git reset -q HEAD -- public/desk.html public/assets/desk src/desk && git checkout -- public/desk.html public/assets/desk src/desk && git clean -fdq public/assets/desk src/desk）"
  exit 0
fi

# 2. 数据：v2 新增的状态 active（进行中）/ watch（观望）旧版不认识 → 改回 plan（策划中）/ paused（暂缓）；其余数据原样
export HTTPS_PROXY="${HTTPS_PROXY:-http://127.0.0.1:7897}"
npx wrangler@4 d1 execute cosmoswong-desk --remote --command "UPDATE projects SET status = 'plan' WHERE status = 'active'; UPDATE projects SET status = 'paused' WHERE status = 'watch';"

# 3. 部署、提交、推送（部署后照例用 curl 核对线上）
./deploy.sh
git add -A -- public/desk.html public/assets/desk src/desk public/*.html public/knowledge
git commit -q -m "revert(desk): 回退到 v1（git 标签 desk-v1）"
git push -q
echo "已回退到 v1 并部署。别忘了：curl 核对线上、更新 AGENTS.md 和知识库里的说明。"
