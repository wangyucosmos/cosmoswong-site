# 补时计算器部署与维护

入口：https://cosmoswong.com/attendance；工具箱：https://cosmoswong.com/tools。

独立D1为cosmoswong-attendance，绑定ATTENDANCE_DB，迁移在migrations/attendance。真实用户资料、考勤和截图不进入代码仓库；截图不上传，前端仅提交核对后的记录。没有复制本机试用账号或示例数据。

源码：public/attendance.html、public/assets/attendance/、src/attendance/；测试node --test tests/attendance/*.test.mjs。规则及类型校验在domain.mjs。OCR引擎/模型固定版本来自Tesseract官方npm包，许可证随vendor文件保留；升级需重新做截图识别验收。

生产仅运行D1迁移，然后按deploy.sh顺序构建与部署。已存在的/desk、/kol、/subs数据不参与迁移。两个SQL的JSON批量事务保证版本冲突时整批回滚，支持500条多月备份，避免按日期逐条请求触发D1查询数量限制。

上线前源码HEAD：709261d4e78f3a34b7bfaef0dca5d86fa41b9f6d。
上线前Cloudflare版本：ff048b62-e8fb-41f9-87ab-2dc0d401fdfa。
如新工具影响主站，可以将Cloudflare流量回退到已记录版本；新D1保留，不删除任何真实用户资料。当前部署结果与验收见CHANGELOG。

用户自行设账号密码，无手机号或邮箱。密码不能从后台读取；当前不支持自助找回。建议页面导出备份。记录按自然月独立汇总，未上传日期不扣时；无时长标待确认，已人工确认的请假等免计记录不被之后无时长截图覆盖。

正式部署版本：427e5536-f105-4624-866b-0cb33719c233。线上接口与静态资源已验收，图片操作的本轮自动浏览器回归因控制工具无响应而未完成；本机版本曾使用用户截图完成识别。

## 本次变更文件

- `AGENTS.md`
- `ATTENDANCE.md`
- `CHANGELOG.md`
- `DATA_MAP.md`
- `PAGE_MAP.md`
- `PROJECT_BRIEF.md`
- `deploy.sh`
- `migrations/attendance/0001_initial.sql`
- `public/404.html`
- `public/_headers`
- `public/assets/attendance/app.mjs`
- `public/assets/attendance/domain.mjs`
- `public/assets/attendance/ocr.mjs`
- `public/assets/attendance/style.css`
- `public/assets/attendance/vendor/core/LICENSE`
- `public/assets/attendance/vendor/core/tesseract-core-lstm.wasm`
- `public/assets/attendance/vendor/core/tesseract-core-lstm.wasm.js`
- `public/assets/attendance/vendor/core/tesseract-core-simd-lstm.wasm`
- `public/assets/attendance/vendor/core/tesseract-core-simd-lstm.wasm.js`
- `public/assets/attendance/vendor/core/tesseract-core-simd.wasm`
- `public/assets/attendance/vendor/core/tesseract-core-simd.wasm.js`
- `public/assets/attendance/vendor/core/tesseract-core.wasm`
- `public/assets/attendance/vendor/core/tesseract-core.wasm.js`
- `public/assets/attendance/vendor/lang/chi_sim-README.md`
- `public/assets/attendance/vendor/lang/chi_sim.traineddata.gz`
- `public/assets/attendance/vendor/lang/eng-README.md`
- `public/assets/attendance/vendor/lang/eng.traineddata.gz`
- `public/assets/attendance/vendor/tesseract.min.js`
- `public/assets/attendance/vendor/tesseract.min.js.LICENSE.txt`
- `public/assets/attendance/vendor/worker.min.js`
- `public/assets/attendance/vendor/worker.min.js.LICENSE.txt`
- `public/assets/data.js`
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
- `public/portfolio.html`
- `public/resume.html`
- `public/robots.txt`
- `public/subs.html`
- `public/tools.html`
- `public/trips.html`
- `public/workbench.html`
- `src/attendance/api.mjs`
- `src/attendance/security.mjs`
- `src/worker.js`
- `tests/attendance/api.test.mjs`
- `tests/attendance/domain.test.mjs`
- `tests/attendance/sqlite.mjs`
- `wrangler.toml`

## v0.2 更新口径

请假、公休、补卡均计0，只累计其他有效时长的盈亏；旧补卡无需重录即可按新规则显示，不覆写原数据库。密码至少8位，不要求字母或符号。手机号可以作为普通账号名，不代表已验证手机所有权；无短信费用，不启用恢复码。忘记密码先由网站拥有者核实身份，再定向重置该账号的密码哈希及会话，不修改考勤数据。

多图上传先进入本机待分析队列，可继续添加、移除或清空，点击开始分析才运行OCR；保留最终核对保存步骤。单批最多12张，每张不超过15MB，失败图片留在队列中重试。

当前v0.2部署：16828932-65ef-450e-bd19-136aeaffc454。回退参考源码为0b52b6f，上一部署为427e5536-f105-4624-866b-0cb33719c233。修改记录与验证见CHANGELOG。

### v0.2变更文件

- `ATTENDANCE.md`
- `CHANGELOG.md`
- `DATA_MAP.md`
- `PAGE_MAP.md`
- `PROJECT_BRIEF.md`
- `public/404.html`
- `public/assets/attendance/app.mjs`
- `public/assets/attendance/domain.mjs`
- `public/assets/attendance/style.css`
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
- `public/portfolio.html`
- `public/resume.html`
- `public/subs.html`
- `public/tools.html`
- `public/trips.html`
- `public/workbench.html`
- `src/attendance/api.mjs`
- `tests/attendance/api.test.mjs`
- `tests/attendance/domain.test.mjs`


## 2026-10-12 本机登录时长

登录可选7、30、365天，默认30天；注册仍仅三个输入框，默认30天。规则与账号中可从现在起调整当前浏览器有效期，并显示到期时间。服务端会话与HttpOnly Cookie同步到期，调整时原子轮换当前令牌，不影响其他设备；退出立即撤销，修改密码撤销所有旧会话并保留本机剩余有效期。账号唯一性及大小写归一化保持。无需数据库迁移，不改变用户考勤记录。
