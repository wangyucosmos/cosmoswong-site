-- /desk 我的工作台的表结构。只通过 `wrangler d1 migrations apply cosmoswong-desk` 执行，不要手工在线上跑。
-- 迁移目录 migrations/desk/ 和 /kol 的 migrations/ 分开（wrangler.toml 里 DESK_DB 的 migrations_dir）。
-- 这里只建表，不放任何数据：选项清单、时间表模板、检查清单、提示词模板都由用户在页面里填，或从「初始化包」导入。
-- 枚举字段存英文 key，界面上的中文名和颜色在前端默认值 / settings 表里：
--   projects.status   : need 需求中 / plan 策划中 / proto 原型中 / review 等确认 / docs 出文档中 /
--                       test 测试拨测 / live 已上线 / done 已交付 / paused 暂缓
--   projects.priority : high 高 / mid 中 / low 低
--   deliverables.status : todo 未开始 / doing 制作中 / review 待审 / done 已交付
--   tasks.source      : manual 手动 / timeline 时间表模板 / inbox 收集箱
--   pendings.status   : waiting 等待中 / answered 已答复 / dropped 不需要了
--   activities.type   : progress 进展 / deliver 交付 / feedback 收到反馈 / nudge 催办 / ai AI 经手 / note 备注
--   ideas.target      : value 高价值转化 / stay 3 分钟停留 / both 两者 / other 其他
--   ideas.dev_cost    : light 轻 / mid 中 / heavy 重
--   ideas.status      : draft 草稿 / submitted 已提交 / evaluating 开发评估中 / adopted 被采纳 / rejected 未采纳
-- 类型、省份、交付物类型、问谁、AI 工具、提效任务类型等可在设置里改的选项，直接存中文文字。
-- 日期一律 'YYYY-MM-DD'（按 Asia/Shanghai 算），时间戳一律 ISO 8601（UTC）。
-- 主表都有 deleted_at：软删除，页面上 5 秒内可撤销，24 小时后清理。

CREATE TABLE projects (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  kind         TEXT,                 -- 类型（文字，选项在设置里）
  province     TEXT,                 -- 省份（文字，选项在设置里，全国项目为空）
  month        TEXT,                 -- 所属月份 YYYY-MM
  status       TEXT NOT NULL DEFAULT 'need',
  priority     TEXT,
  requester    TEXT,                 -- 需求方
  launch_at    TEXT,                 -- 上线日
  due_at       TEXT,                 -- 我这边的交付截止日
  summary      TEXT,                 -- 一句话需求
  next_action  TEXT,                 -- 下一步（可执行动作）
  links        TEXT,                 -- JSON: [{"label":"Figma","url":"https://…"}]
  local_paths  TEXT,                 -- JSON: ["~/…/文件夹"]，页面只显示和复制，不访问
  last_ai      TEXT,                 -- JSON: ["Claude Code","Codex"]
  tags         TEXT,                 -- JSON: ["…"]
  notes        TEXT,
  sort_order   REAL,                 -- 看板列内排序
  archived_at  TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT
);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_deleted ON projects(deleted_at);

CREATE TABLE deliverables (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            TEXT,              -- 名称（同类型有多份时区分用，如「主页面活动规则」）
  type            TEXT NOT NULL,     -- 交付物类型（文字，选项在设置里）
  version         TEXT,              -- 如 V1.1
  status          TEXT NOT NULL DEFAULT 'todo',
  due_at          TEXT,
  delivered_at    TEXT,
  file_hint       TEXT,              -- 文件名或位置提示
  notes           TEXT,
  checklist_state TEXT,              -- JSON: {"<清单 id>": {"<检查项原文>": true}}
  offset_days     INTEGER,           -- 由时间表生成时：相对上线日 T 的天数（改上线日顺移用）
  sort_order      REAL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT
);
CREATE INDEX idx_deliv_project ON deliverables(project_id);

CREATE TABLE tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER REFERENCES projects(id) ON DELETE CASCADE,   -- 可空 = 不属于任何项目
  title       TEXT NOT NULL,
  due_at      TEXT,
  done        INTEGER NOT NULL DEFAULT 0,
  done_at     TEXT,                  -- 勾完成那天（Asia/Shanghai 日期）
  sort_order  REAL,
  source      TEXT NOT NULL DEFAULT 'manual',
  offset_days INTEGER,               -- 由时间表生成时：相对上线日 T 的天数
  milestone   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_due ON tasks(due_at);

CREATE TABLE pendings (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id     INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  question       TEXT NOT NULL,      -- 要确认什么
  ask_whom       TEXT,               -- 问谁（角色，选项在设置里）
  ask_name       TEXT,               -- 可选的名字
  asked_at       TEXT,               -- 什么时候问的
  last_nudged_at TEXT,
  nudge_count    INTEGER NOT NULL DEFAULT 0,
  answer         TEXT,
  answered_at    TEXT,
  status         TEXT NOT NULL DEFAULT 'waiting',
  blocking       INTEGER NOT NULL DEFAULT 0,   -- 是否卡住交付
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  deleted_at     TEXT
);
CREATE INDEX idx_pend_project ON pendings(project_id);

CREATE TABLE activities (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  summary     TEXT,
  content     TEXT,                  -- 可选：粘贴的反馈原文、AI 收工汇报等
  tool        TEXT,                  -- AI 经手时填
  happened_at TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX idx_acts_project ON activities(project_id, happened_at);

CREATE TABLE ideas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  week       TEXT NOT NULL,          -- ISO 周，如 2026-W41
  title      TEXT NOT NULL,
  mechanism  TEXT,                   -- 玩法机制
  target     TEXT,
  dev_cost   TEXT,
  status     TEXT NOT NULL DEFAULT 'draft',
  file_hint  TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_ideas_week ON ideas(week);

CREATE TABLE wins (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  happened_at    TEXT NOT NULL,
  project_id     INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  task           TEXT NOT NULL,      -- 做了什么
  task_type      TEXT,               -- 任务类型（文字，选项在设置里）
  tools          TEXT,               -- JSON: ["Claude Code","生成脚本"]
  before_minutes INTEGER,            -- 以前大概要多久
  after_minutes  INTEGER,            -- 这次实际多久
  output         TEXT,               -- 产出了什么
  portfolio_ok   INTEGER NOT NULL DEFAULT 0,   -- 可以上作品集（需脱敏）
  note           TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  deleted_at     TEXT
);
CREATE INDEX idx_wins_date ON wins(happened_at);

CREATE TABLE inbox (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  content      TEXT NOT NULL,
  source       TEXT,                 -- 微信 / 会议 / 邮件 / 自己想到 / 其他
  processed_at TEXT,
  converted_to TEXT,                 -- 转成了什么：project:12 / task:5 / pending:3
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT
);

-- 时间表模板：items = [{"offset_days":-14,"title":"…","deliverable_type":"策划案","deliverable_name":"…","is_milestone":true}]
CREATE TABLE timelines (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  kind       TEXT,
  items      TEXT NOT NULL,
  sort_order REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- 检查清单模板：applies_to = 交付物类型 JSON 数组（空 = 所有类型）；items = 检查项 JSON 数组
CREATE TABLE checklists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  applies_to TEXT,
  items      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- AI 提示词模板：body 里可以用 {{project}} {{province}} … 这类变量（清单见页面「设置 → 提示词模板」）
CREATE TABLE prompt_templates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  tool       TEXT,
  scene      TEXT,                   -- 开工 / 收工 / 需求梳理 / 写玩法提案 / 其他
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- 快捷入口（只是外链，页面不访问对方）。group_name 即「分组」（避开 SQL 关键字 group）
CREATE TABLE links (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  group_name TEXT,
  label      TEXT NOT NULL,
  url        TEXT NOT NULL,
  sort_order REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE saved_views (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  icon       TEXT,
  type       TEXT NOT NULL DEFAULT 'list',   -- list / board
  config     TEXT,                           -- JSON：筛选、分组、排序、列
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- 界面可编辑的选项与偏好（类型、省份、状态名与颜色、交付物类型、问谁、AI 工具、标色天数等），value 是 JSON
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 服务端内部用：会话签名 key（首次登录时随机生成）、改过的密码哈希。不经任何接口返回、不进备份
CREATE TABLE desk_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 登录限流：同一 IP 15 分钟内输错 10 次锁定
CREATE TABLE login_fails (
  ip           TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
