# AGENTS.md — 接手 cosmoswong.com 仓库前先读

给 agent 看的硬约束。违反任何一条都会在下次部署时被覆盖、或让线上出错。

## 架构
- 纯静态站，Cloudflare Workers 静态资源托管（`wrangler.toml` 的 `[assets]`），**没有后端**。
- **零外部请求**：不引 CDN、Web Font、图标库、任何前端依赖。唯一外部脚本是 Cloudflare 自动注入的 Insights beacon。`public/_headers` 里的 CSP 就是按这个前提写的，引任何外部资源都会被拦。

## 内容与生成物
- **所有内容只改 `public/assets/data.js`（`window.SITE`）**。不要把内容写进 HTML 模板或 `tools/*.mjs`。
- `public/*.html` 里 `<!--head:auto-->`、`<!--chrome-top:auto-->`、`<!--chrome-bottom:auto-->` 之间，以及 `<main data-prerendered="1">` 的内容，都是 `tools/build_pages.mjs` 的生成物。**手改会被下次部署覆盖**——要改就改生成逻辑。
- `public/knowledge/*.html` 由 `tools/build_notes.mjs` 从 `~/Documents/我的知识库/个人主页/公开笔记.txt` 生成，同样手改会被覆盖。要公开一篇笔记，在那个清单里加一行再部署。
- `public/sitemap.xml`、`public/resume.pdf` 也是生成物：前者随 `build_pages.mjs`，后者用 `tools/make_resume_pdf.sh` 从 `/resume` 页打印。改简历只改 `data.js` 再重跑脚本，不要另存第二份简历。

## 渲染分层
- `public/assets/render.js` 必须保持**纯函数**：浏览器和 Node 构建脚本共用同一份模板，里面不能碰 `document` / `location` / `matchMedia` / `Date`（年份等由调用方传入）。
- 浏览器侧行为写在 `public/assets/app.js`，且对预渲染必须**幂等**：骨架（`.mesh` / `footer` / `.menu-backdrop`）已存在就不再插，`main[data-prerendered]` 就不重画；事件绑定无条件执行。
- 页面清单（路径、文件、`og:type`）在 `tools/build_pages.mjs` 顶部的 `DYNAMIC` / `STATIC`。

## 构建与部署
- 部署命令：`HTTPS_PROXY=http://127.0.0.1:7897 ./deploy.sh`（本机不走代理连不上 Cloudflare；仓库 `.git/config` 已配 git 代理，push 直接可用）。
- `deploy.sh` 的顺序**不能反**：`build_notes.mjs` → `build_pages.mjs` → 资源版本号 `sed` → `wrangler deploy`。knowledge 页要先生成才能被注入 head 和写进 sitemap。
- 部署后 `public/*.html` 的 `?v=` 会变，要单独 `git commit -am "chore: bump asset versions"` 并 push。
- `public/_headers` 里 CSP `script-src` 的 `'sha256-…'` 是首页 JSON-LD 的哈希，由 `build_pages.mjs` 自动维护，**不要手改**。改 `data.js` 里 `me` 的 `name` / `fullName` / `email` / `location` / `links` / `jobTitle` / `knowsAbout` 会让它变化——**`_headers` 必须和 `data.js` 一起提交**，否则线上 CSP 和页面对不上。

## CSS
- `public/assets/style.css` 是唯一样式文件，不要拆 `print.css` 之类。
- 文件末尾的 `@media(prefers-reduced-motion:reduce)` 和 `@media print` 两个块**必须留在末尾**：媒体查询不增加特异度，它们靠源码顺序压过前面的基础规则。新增动画或基础规则要加在这两个块之前。
- 手机端 hero / 区块留白的 `@media(max-width:820px)` 同理，放在 `.hero` / `.sec` 基础规则之后。

## 其他
- `优化任务清单.md` 是工作文件，保持未跟踪，不要提交。
- 公司交付物上站前要脱敏：未上线活动、奖品数值、内部联系人、二维码、官方受限素材一律不放。
- 改完先本地验：`npx wrangler@4 dev --port 8788`，`node tools/build_pages.mjs` 连跑两次 `git diff --stat` 应为空。
