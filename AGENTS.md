# AGENTS.md — 接手 cosmoswong.com 仓库前先读

给 agent 看的硬约束。违反任何一条都会在下次部署时被覆盖、或让线上出错。

## 架构
- 静态站为主，Cloudflare Workers 静态资源托管（`wrangler.toml` 的 `[assets]`）。
- **唯一的服务端代码是 `src/worker.js`，只接 `/api/*`**（`run_worker_first`），其余请求直接走静态资源，不经过它。
  `/subs`、`/kol`、`/desk` 共用的小工具（JSON 响应、HMAC、长度无关比较）在 `src/shared.js`。
  `/subs` 订阅倒计时页（2026-09-29 起）：
  - 页面 `public/subs.html` + `public/assets/subs.js` 是公开的壳，**不含任何订阅数据**；数据只经 `/api/subs` 读写
  - 数据存在 KV（binding `SUBS`，key `list`），**不进仓库**（仓库是公开的）
  - 密码与 cookie 签名 key 是 Worker secret：`SUBS_PASSWORD`、`SUBS_COOKIE_KEY`，**不进仓库**；换密码：
    `printf '%s' '新密码' | HTTPS_PROXY=http://127.0.0.1:7897 npx wrangler@4 secret put SUBS_PASSWORD`（旧登录全部失效）
  - 同一 IP 15 分钟输错 10 次锁定；登录 cookie 30 天、HttpOnly、只发给 `/api/subs`
  - 本地测试：`.dev.vars` 放测试密码（已 gitignore，不要放真实密码），`npx wrangler@4 dev --port 8788`
  - 导航里有「订阅」入口（用户要求入口公开、内容加密）；页面 noindex，不进 sitemap
- `/kol` KOL 工作台（2026-10-02 起，私用的海外 KOL 跟进工作台，密码保护，见下方「/kol」一节）。
- `/desk` 我的工作台（2026-10-04 起，站长自己的工作待办 / 待确认 / 排期台，密码保护，导航有入口「我的工作台」，见下方「/desk」一节）。
- **零外部请求**：不引 CDN、Web Font、图标库、任何前端依赖。唯一外部脚本是 Cloudflare 自动注入的 Insights beacon。`public/_headers` 里的 CSP 就是按这个前提写的，引任何外部资源都会被拦。

## /kol KOL 工作台
- **路由**：页面 `public/kol.html`（独立应用，**不带主站导航和页脚**）+ `public/assets/kol/*.js|css`；接口 `/api/kol/*` 在 `src/kol/`（`api.js` 路由、`auth.js` 密码门、`schema.js` 字段校验），`worker.js` 只做转发。
- **主站导航有入口、页面本身不带主站骨架、不进 sitemap**：2026-10-03 起用户要求在主站导航加「KOL 工作台」（`render.js` 的 `navItems`，和「订阅」一样入口公开、内容要密码）。`kol.html` 仍然**不在** `tools/build_pages.mjs` 的 `DYNAMIC` / `STATIC` 清单里——**不要把它加进清单**，否则会被注入主站导航/页脚并写进 sitemap。另有三层 noindex：页面 `<meta name="robots">`、`_headers` 的 `/kol` → `X-Robots-Tag`、`robots.txt` 的 `Disallow: /kol`。
- **数据**：Cloudflare D1 `cosmoswong-kol`（binding `KOL_DB`，id 见 `wrangler.toml`），**真实 KOL 数据只在 D1，绝不进仓库**。表：`kols` / `kol_tasks` / `activities` / `deals` / `templates` / `saved_views` / `keywords` / `settings` / `kol_meta`（会话签名 key、改过的密码哈希，接口不返回、不进备份）/ `login_fails`。
- **建表只用迁移**（`migrations/*.sql`）：`HTTPS_PROXY=http://127.0.0.1:7897 npx wrangler@4 d1 migrations apply cosmoswong-kol --remote`（本地用 `--local`）。改表结构 = 新加一个迁移文件，**不要改已执行过的迁移、不要手工在线上跑建表语句**。
- **鉴权**：初始密码是 Worker secret `KOL_PASSWORD`（和 /subs 分开；设置：`npx wrangler@4 secret put KOL_PASSWORD`，由用户自己输入）。页面「设置 → 改密码」（`POST /api/kol/password`，要已登录 + 原密码正确，原密码输错计入同一个 10 次锁定）改过之后，新密码以 PBKDF2-SHA256（3 万次、随机盐）存在 D1 `kol_meta` 的 `password_hash`，登录优先认它，secret 不再生效。**忘了新密码**：`HTTPS_PROXY=http://127.0.0.1:7897 npx wrangler@4 d1 execute cosmoswong-kol --remote --command "DELETE FROM kol_meta WHERE key = 'password_hash'"` → 恢复成 secret 里的初始密码（先问用户）。会话 cookie `kol_session` 只发给 `/api/kol`，HttpOnly + Secure + SameSite=Strict，30 天；签名 key = `kol_meta` 里首次登录时随机生成的 key + 当前密码（哈希或 secret）→ 改密码后旧登录全失效，改密码的那台设备会收到新 cookie。同一 IP 15 分钟输错 10 次锁定（D1 `login_fails`）。除 `POST /login`、`POST /logout`、`GET /session`（只回答是否已登录）外全部要登录，未登录 401；写操作必须带请求头 `x-kol-request: 1` 且同源，否则 403。
- **前端约束**：零外部请求、无内联脚本/事件（CSP）；外部内容一律 `KOL.esc()` 转义，外链只放行 http(s) 且 `rel="noopener noreferrer"`；localStorage 只存界面偏好（`kol.*`），业务数据只走 D1。资源版本号由 `deploy.sh` 的 `/assets/kol/*` 那条 sed 维护。
- **本地测试**：`.dev.vars` 里放测试用 `KOL_PASSWORD`；`npx wrangler@4 d1 migrations apply cosmoswong-kol --local` → `node tools/kol_seed_local.mjs`（30 个虚构 KOL，**只写本地库**，线上库不灌演示数据）→ `npx wrangler@4 dev --port 8788` → 打开 `/kol`。
- **业务规则（2026-10-02 第二轮）**：状态多了 `partner` 长期合作；`kols.touches` = 已触达次数（发出邮件 / 私信 / 通话每记一次 +1、删掉 -1），「下一步」按它推荐：开发信 → 首次跟进 → 最后一封 → 3 封没回建议暂不跟进（`K.nextStep`）。优先级没手动设时按规则自动建议（沟通中 / 已寄样或粉丝 ≥10 万 → 高，≥1 万 → 中，其余低；`K.autoPriority`），筛选、排序、分组都按「有效优先级」。赛道、合作模式、跟进天数沿用用户 2026-09-28 的「KOL总表模板」。
- **导入约定**（`public/assets/kol/io.js`）：表头别名覆盖她的原表（账号链接 / 联系方式 / 粉丝量（K）/ 内容赛道 / 当前阶段 / 二次标签 / 触达回复 / 回复总结）；表头带（K）/ 万 / M 自动乘单位；联系方式里的邮箱自动放进邮箱栏；「未建联」+ 二次触达 → 已联系·等回复，否则待触达；「明确拒绝 / 要求移除」→ 勿再联系；回复原文存成「收到回复」沟通记录；没认出的列默认「追加到备注」不丢。**国家名转代码时跳过 UK / FX 等废弃代码**（`Intl.DisplayNames` 会把它们也叫「英国」「法国」）。
- **待补全**（`quality.js`，内置视图 `#fix`）：国家代码、邮箱放错栏、粉丝按千填、缺语言（按国家给建议、人工确认后才填）、没排期、缺链接 / 赛道 / 邮箱，都能就地修。
- **AI 直接读线上数据**（只读示例）：`HTTPS_PROXY=http://127.0.0.1:7897 npx wrangler@4 d1 execute cosmoswong-kol --remote --command "SELECT name, status, next_followup_at FROM kols WHERE deleted_at IS NULL ORDER BY next_followup_at"`。要改线上数据先问用户、先导出备份。

## /desk 我的工作台
- **红线：工作内容不进本仓库。** 公司项目名、负责的省份名单、流程原文、内部仓库名、本机路径、Figma 链接——包括代码默认值、注释、演示数据、测试用例——一律不写进来。这些都放在仓库以外的「初始化包」JSON 里，由用户在页面「设置 → 数据 → 导入初始化包」导入到 D1（只新增；已有同名、内容却不同的模板 / 清单会单独列出，用户勾了才换成包里的版本）。代码里只放通用空壳和通用默认值（如内置时间表只有「开工 T−7 / 交付 T−1 / 上线 T」示例，内置提示词模板只有通用版）。
- **路由**：页面 `public/desk.html`（独立应用，不带主站导航和页脚）+ `public/assets/desk/*.js|css`；接口 `/api/desk/*` 在 `src/desk/`（`api.js` 路由、`auth.js` 密码门、`schema.js` 字段校验），`worker.js` 只做转发。鉴权代码照 `/kol` 复制了一份到 `src/desk/auth.js`（**没有改 `/kol` 的任何文件**），共用的只有 `src/shared.js`。
- **主站导航有入口、页面本身不带主站骨架、不进 sitemap**：2026-10-04 用户要求在主站导航加「我的工作台」（`render.js` 的 `navItems`，排在「KOL 工作台」后面；和 `/kol` 一样入口公开、内容要密码），**取代**上线当天「不进导航、靠书签访问」的约定。两个工作台的名字要一眼能分清：导航 / 登录页 / 浏览器标签页上 `/desk` 叫「我的工作台」，`/kol` 叫「KOL 工作台」。`desk.html` 仍然**不在** `tools/build_pages.mjs` 的 `DYNAMIC` / `STATIC` 清单里——**不要把它加进清单**，否则会被注入主站导航/页脚并写进 sitemap。三层 noindex 照旧：页面 `<meta name="robots">`、`_headers` 的 `/desk` → `X-Robots-Tag`、`robots.txt` 的 `Disallow: /desk`。
- **数据**：Cloudflare D1 `cosmoswong-desk`（binding `DESK_DB`，APAC，id 见 `wrangler.toml`），**不进仓库**。表：`projects` / `deliverables` / `tasks` / `pendings`（待确认）/ `activities`（项目时间线）/ `ideas`（每周玩法创意）/ `wins`（提效记录）/ `inbox`（收集箱）/ `decisions`（已拍板的口径：业务方答复和用户自己的决定，开工提示词会带上）/ `timelines`（时间表模板）/ `checklists` / `prompt_templates` / `links` / `saved_views` / `settings` / `desk_meta`（会话签名 key、改过的密码哈希，接口不返回、不进备份）/ `login_fails`。主表都有 `deleted_at` 软删除（页面 5 秒内可撤销，24 小时后清理；删项目会连带它的交付物、待办、待确认、时间线，撤销时一起回来）。日期存 `YYYY-MM-DD`，「今天 / 本周 / 逾期」一律按 **Asia/Shanghai** 算（前端 `DESK.today()`、后端 `shToday()`），时间戳存 ISO。
- **建表只用迁移**，迁移文件单独放 `migrations/desk/`（`wrangler.toml` 里 `DESK_DB` 的 `migrations_dir`，和 `/kol` 的 `migrations/` 互不干扰）：`HTTPS_PROXY=http://127.0.0.1:7897 npx wrangler@4 d1 migrations apply cosmoswong-desk --remote`（本地 `--local`）。**线上只跑迁移，不灌任何数据**；改表结构 = 在 `migrations/desk/` 新加文件。
- **鉴权**（同 `/kol`，各自独立）：初始密码 Worker secret `DESK_PASSWORD`（和 `/subs`、`/kol` 都分开；`npx wrangler@4 secret put DESK_PASSWORD`，由用户自己输入）。页面「设置 → 改密码」（`POST /api/desk/password`）后新密码以 PBKDF2 加盐哈希存在 D1 `desk_meta` 的 `password_hash`，登录优先认它，其他设备登录失效。**忘了新密码**（先问用户）：`HTTPS_PROXY=http://127.0.0.1:7897 npx wrangler@4 d1 execute cosmoswong-desk --remote --command "DELETE FROM desk_meta WHERE key = 'password_hash'"` → 恢复成 secret 里的初始密码。会话 cookie `desk_session` 只发给 `/api/desk`，HttpOnly + Secure + SameSite=Strict，30 天；同一 IP 15 分钟输错 10 次锁定；除 `POST /login`、`POST /logout`、`GET /session` 外全部要登录（未登录 401），写操作必须带 `x-desk-request: 1` 且同源（否则 403）。
- **几个带业务逻辑的接口**：`POST /projects/:id/schedule`（`mode: apply` 按时间表节点生成：节点 `kind` 是 `task` → 待办、`deliverable` → 交付物（不再另外生成一条重复待办）、`wait` → 待确认，`need_by` = 节点日期、`remind_from` = `remind_offset` 那天；日期 = 上线日 T + 天数，周末提前到周五、T 本身不挪；`mode: shift` 改上线日时顺移没完成的待办、交付物和还在等的待确认）、`POST /projects/:id/apply`（「回填」：用户把 AI 收工汇报里 `【回填工作台】…【回填结束】` 那段贴回来、在页面上勾选确认后，一个事务更新下一步 / 交付物 / 新待确认 / 答复 / 拍板 / 提效记录 / 时间线）、`POST /inbox/:id/intake`（AI 拆好的 `【新建项目】…【新建结束】` 一次生成项目 + 交付物 + 待确认）、`POST /pendings/:id/nudge` / `answer`（同时写项目时间线）、`POST /inbox/:id/convert`、`POST /init-pack`（`apply: false` 只预览；`replace: ["timelines:名字", …]` 才覆盖同名的）、`GET /backup` / `POST /restore`。交付物标「已交付」不再被检查清单拦（v2 起改成交付时勾一句「已让 AI 跑过交付前检查」）；标成已交付时，旧版排期留下的、挂在它上面的重复待办（`tasks.deliverable_id`）一起完成。
- **前端约束**：同 `/kol`——零外部请求、无内联脚本/事件；外部内容一律 `DESK.esc()` 转义（收集箱里粘的微信消息尤其要转义），外链只放行 http(s) 且 `rel="noopener noreferrer"`；localStorage 只存界面偏好（`desk.*`），业务数据只走 D1。资源版本号由 `deploy.sh` 的 `/assets/desk/*` 那条 sed 维护。
- **本地测试**：`.dev.vars` 里放测试用 `DESK_PASSWORD`；`npx wrangler@4 d1 migrations apply cosmoswong-desk --local` → `node tools/desk_seed_local.mjs`（13 个虚构项目等，含观望、旧版状态、旧版排期的项目，内容全是「示例省份 A」这类，**只写本地库**）→ `npx wrangler@4 dev --port 8788` → 打开 `/desk`。
- **AI 直接读线上数据**（只读示例，在站点目录）：`HTTPS_PROXY=http://127.0.0.1:7897 npx wrangler@4 d1 execute cosmoswong-desk --remote --command "SELECT p.title, x.question, x.ask_whom, x.asked_at FROM pendings x LEFT JOIN projects p ON p.id = x.project_id WHERE x.status = 'waiting' AND x.deleted_at IS NULL ORDER BY x.asked_at"`。状态等存英文 key：projects.status = active 进行中 / live 已上线收尾 / watch 观望（不一定由用户做：能看排期，但不进「今天」）/ paused 暂缓 / done 已交付；v1 留下的 need / plan / proto / review / docs / test 页面上一律当「进行中」。pendings.need_by = 最晚哪天要、remind_from = 从哪天开始催。**改线上数据前先问用户、先在页面「设置 → 数据」下载 JSON 全量备份**。
- **v2 改版与回退**（2026-10-04）：用户反馈 v1 照搬 `/kol` 太重，改成 4 个标签（今天 / 项目 / 收集箱 / 记录）+ 项目页（`#p/ID`）+ 设置，手机上是底部 3 个大按钮；去掉了表格、看板、列配置、存视图、批量修改、CSV（`saved_views` 表还在，只是不用了）。**留了回退口子**：git 标签 `desk-v1` 是改版前最后一版；迁移 `0002_v2.sql` 只加列、加表，不删不改旧列，v1 代码照样能读写 v2 的数据。回退步骤：先问用户、先下载 JSON 备份 → `tools/desk_rollback_v1.sh --dry-run`（只把本地文件换回 v1，不动线上，脚本会提示怎么撤销）→ `tools/desk_rollback_v1.sh --yes`（换回 v1 前端和接口代码、把线上 v1 不认识的两个状态改回去：active → plan、watch → paused、部署、提交推送）。v2 新增的数据（已拍板的口径、最晚日期、底稿等）回退后不显示，但不会丢，再升回 v2 就又能看到。

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
