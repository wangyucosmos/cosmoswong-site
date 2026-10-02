# AGENTS.md — 接手 cosmoswong.com 仓库前先读

给 agent 看的硬约束。违反任何一条都会在下次部署时被覆盖、或让线上出错。

## 架构
- 静态站为主，Cloudflare Workers 静态资源托管（`wrangler.toml` 的 `[assets]`）。
- **唯一的服务端代码是 `src/worker.js`，只接 `/api/*`**（`run_worker_first`），其余请求直接走静态资源，不经过它。
  `/subs` 与 `/kol` 共用的小工具（JSON 响应、HMAC、长度无关比较）在 `src/shared.js`。
  `/subs` 订阅倒计时页（2026-09-29 起）：
  - 页面 `public/subs.html` + `public/assets/subs.js` 是公开的壳，**不含任何订阅数据**；数据只经 `/api/subs` 读写
  - 数据存在 KV（binding `SUBS`，key `list`），**不进仓库**（仓库是公开的）
  - 密码与 cookie 签名 key 是 Worker secret：`SUBS_PASSWORD`、`SUBS_COOKIE_KEY`，**不进仓库**；换密码：
    `printf '%s' '新密码' | HTTPS_PROXY=http://127.0.0.1:7897 npx wrangler@4 secret put SUBS_PASSWORD`（旧登录全部失效）
  - 同一 IP 15 分钟输错 10 次锁定；登录 cookie 30 天、HttpOnly、只发给 `/api/subs`
  - 本地测试：`.dev.vars` 放测试密码（已 gitignore，不要放真实密码），`npx wrangler@4 dev --port 8788`
  - 导航里有「订阅」入口（用户要求入口公开、内容加密）；页面 noindex，不进 sitemap
- `/kol` KOL 工作台（2026-10-02 起，私用的海外 KOL 跟进工作台，密码保护，见下方「/kol」一节）。
- **零外部请求**：不引 CDN、Web Font、图标库、任何前端依赖。唯一外部脚本是 Cloudflare 自动注入的 Insights beacon。`public/_headers` 里的 CSP 就是按这个前提写的，引任何外部资源都会被拦。

## /kol KOL 工作台
- **路由**：页面 `public/kol.html`（独立应用，**不带主站导航和页脚**）+ `public/assets/kol/*.js|css`；接口 `/api/kol/*` 在 `src/kol/`（`api.js` 路由、`auth.js` 密码门、`schema.js` 字段校验），`worker.js` 只做转发。
- **不进导航、不进 sitemap**：靠 `tools/build_pages.mjs` 的 `DYNAMIC` / `STATIC` 清单里**没有** `kol.html` 实现排除——**不要把它加进清单**，否则会被注入主站导航/页脚并写进 sitemap。另有三层 noindex：页面 `<meta name="robots">`、`_headers` 的 `/kol` → `X-Robots-Tag`、`robots.txt` 的 `Disallow: /kol`。
- **数据**：Cloudflare D1 `cosmoswong-kol`（binding `KOL_DB`，id 见 `wrangler.toml`），**真实 KOL 数据只在 D1，绝不进仓库**。表：`kols` / `kol_tasks` / `activities` / `deals` / `templates` / `saved_views` / `keywords` / `settings` / `kol_meta`（会话签名 key，接口不返回）/ `login_fails`。
- **建表只用迁移**（`migrations/*.sql`）：`HTTPS_PROXY=http://127.0.0.1:7897 npx wrangler@4 d1 migrations apply cosmoswong-kol --remote`（本地用 `--local`）。改表结构 = 新加一个迁移文件，**不要改已执行过的迁移、不要手工在线上跑建表语句**。
- **鉴权**：Worker secret `KOL_PASSWORD`（和 /subs 分开；设置：`npx wrangler@4 secret put KOL_PASSWORD`，由用户自己输入）。会话 cookie `kol_session` 只发给 `/api/kol`，HttpOnly + Secure + SameSite=Strict，30 天；签名 key 在 D1 `kol_meta` 里首次登录时随机生成，并混入密码 → 换密码旧登录全失效。同一 IP 15 分钟输错 10 次锁定（D1 `login_fails`）。除 `POST /login`、`POST /logout`、`GET /session`（只回答是否已登录）外全部要登录，未登录 401；写操作必须带请求头 `x-kol-request: 1` 且同源，否则 403。
- **前端约束**：零外部请求、无内联脚本/事件（CSP）；外部内容一律 `KOL.esc()` 转义，外链只放行 http(s) 且 `rel="noopener noreferrer"`；localStorage 只存界面偏好（`kol.*`），业务数据只走 D1。资源版本号由 `deploy.sh` 的 `/assets/kol/*` 那条 sed 维护。
- **本地测试**：`.dev.vars` 里放测试用 `KOL_PASSWORD`；`npx wrangler@4 d1 migrations apply cosmoswong-kol --local` → `node tools/kol_seed_local.mjs`（30 个虚构 KOL，**只写本地库**，线上库不灌演示数据）→ `npx wrangler@4 dev --port 8788` → 打开 `/kol`。
- **AI 直接读线上数据**（只读示例）：`HTTPS_PROXY=http://127.0.0.1:7897 npx wrangler@4 d1 execute cosmoswong-kol --remote --command "SELECT name, status, next_followup_at FROM kols WHERE deleted_at IS NULL ORDER BY next_followup_at"`。要改线上数据先问用户、先导出备份。

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
- `build_pages.mjs` 用 `git log` 取 sitemap 的 lastmod。本机 `/usr/bin/git` 若因 Xcode 许可协议没同意而报错，lastmod 会**静默丢失**（sitemap 出现大片 diff）。这时把 `/Library/Developer/CommandLineTools/usr/bin` 放到 PATH 最前面再构建 / 部署。
