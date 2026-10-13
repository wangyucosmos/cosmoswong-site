# 共用口令扩展验收（2026-10-13）

源码提交：c69bb25。Cloudflare版本：09bb1c4b-0b60-4094-ade2-ea317fb39311。

## 行为与验证

- 原TOOLS_PASSWORD、TOOLS_COOKIE_KEY和tools_session不变，无新增secret、无生产口令读取或记录。
- 简历HTML/PDF和全部knowledge笔记通过Worker鉴权；编码路径及重复斜杠也不能绕过。Worker先检查全部请求，公开页面原样转交ASSETS。
- 共享next白名单只接受工具ID及受保护本站路径，支持query/hash，拒绝外站、//、反斜杠、控制字符、穿越和编码路径。登录接口返回经校验的redirect，前端再次核对。
- 本地浏览器：未登录笔记进入解锁；虚构测试口令后返回原笔记；同一凭证随后放行预渲染简历；恶意next禁用提交。
- 43项工具箱及考勤测试全通过。提交构建成品后，连续两次node tools/build_pages.mjs，git diff均为空。
- 线上匿名curl：/resume、/resume.html、/resume.pdf、/knowledge、/knowledge/、overview及.html均302到unlock并带原next；编码路径同样被拦。
- /attendance、/、/portfolio均200；/go/travel、/go/fitness、/marquee维持302口令页。
- sitemap无resume或knowledge。公开data.js与新源码一致，无完整简历段落；/data/resume.json为404。解锁脚本和白名单模块与源码一致。
- 有凭证放行、共用旧格式cookie和fitness外站跳转由本地测试确认；未读取生产口令来做线上登录。

## a：公开JS与预渲染

完整简历及简历姓名移至public外的data/resume.json；公开SITE.resume仅保留pdf地址。仅resume构建上下文接收完整数据；浏览器使用已有预渲染正文。本地简历完整展示7个经历/教育区块。公开JS保留网站基本介绍、邮箱和独立案例，未收录简历经历/教育/技能数组。

## b：首页、作品集、案例、分享与索引

- 首页description、OG/Twitter文字摘要改为通用站点介绍，下载简历与导航保留；下载入口取消download属性，避免跳转口令页时下载HTML。
- 知识库项目原有方法简介改成通用入口说明，详细方法需解锁。所有笔记正文在受保护knowledge路径。
- 作品集及workbench保留原有独立案例介绍；其中仍有公开的职业/项目概述和AI工作流说明，这些并非把完整笔记或简历隐藏起来后的副本。
- 检查了其他公开文本文件：无完整简历段落；无受保护笔记超过50字的完整段落。该检查不表示所有公共主题词或简短职业介绍消失。
- 查看了og.png：仍为Cosmos Wong及“运营十年 · 游戏 / 活动 / 社群 / 内容”的基本介绍，没有完整简历或笔记正文。
- 保护页面三层noindex；sitemap仅剩6个公开页面。鉴权后的内容强制private/no-store和Vary: Cookie。

## c：公开GitHub

站点仓库仍为公开，data/resume.json、resume.html、resume.pdf及knowledge笔记源码/历史仍可由GitHub访问。本次没有变更仓库权限，也无法收回以前公开版本的副本。是否设为私有由网站拥有者决定。

## 本次变更文件

- `AGENTS.md`
- `CHANGELOG.md`
- `DATA_MAP.md`
- `GATE_SECURITY_REPORT.md`
- `PAGE_MAP.md`
- `PROJECT_BRIEF.md`
- `data/resume.json`
- `public/404.html`
- `public/_headers`
- `public/assets/data.js`
- `public/assets/render.js`
- `public/assets/tools-next.mjs`
- `public/assets/unlock.js`
- `public/attendance.html`
- `public/bookmarks.html`
- `public/desk-demo.html`
- `public/desk.html`
- `public/index.html`
- `public/knowledge/dsh-ops.html`
- `public/knowledge/index.html`
- `public/knowledge/kb-rules.html`
- `public/knowledge/overview.html`
- `public/knowledge/parallel-drafts.html`
- `public/knowledge/three-layers.html`
- `public/knowledge/us-apple-id.html`
- `public/kol.html`
- `public/marquee.html`
- `public/portfolio.html`
- `public/resume.html`
- `public/robots.txt`
- `public/sitemap.xml`
- `public/subs.html`
- `public/tools.html`
- `public/trips.html`
- `public/unlock.html`
- `public/workbench.html`
- `src/tools-gate.js`
- `src/worker.js`
- `tests/tools/gate.test.mjs`
- `tests/tools/next.test.mjs`
- `tools/build_notes.mjs`
- `tools/build_pages.mjs`
- `wrangler.toml`
