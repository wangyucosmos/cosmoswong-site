-- /kol KOL 工作台的表结构。只通过 `wrangler d1 migrations apply cosmoswong-kol` 执行，不要手工在线上跑。
-- 枚举字段存英文 key，界面上的中文名和颜色在 settings 表 / 前端默认值里：
--   status   : todo 待触达 / contacted 已联系·等回复 / talking 沟通中 / sampled 已寄样·待出内容 /
--              published 内容已发布 / won 已成交 / paused 暂不跟进
--   priority : high 高 / mid 中 / low 低
--   activities.type : email_out 发出邮件 / reply_in 收到回复 / dm 私信 / call 通话或会议 /
--                     sample 寄样 / publish 内容发布 / deal 成交 / note 备注
-- 日期一律 'YYYY-MM-DD'，时间戳一律 ISO 8601（UTC）。

CREATE TABLE kols (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  handle           TEXT,
  platform         TEXT,
  profile_url      TEXT,
  other_links      TEXT,                 -- JSON: [{"label":"Instagram","url":"https://…"}]
  followers        INTEGER,
  avg_views        INTEGER,
  engagement_rate  REAL,                 -- 互动率，百分数（6.2 表示 6.2%）
  country          TEXT,                 -- ISO 3166 两位代码，大写（DE / GB / FR …）
  language         TEXT,                 -- 语言代码，小写（en / de / fr …）
  category         TEXT,                 -- JSON: ["飞行模拟","VR 游戏"]
  email            TEXT,
  contact_other    TEXT,
  status           TEXT NOT NULL DEFAULT 'todo',
  priority         TEXT,
  rating           TEXT,                 -- 初筛评级 A / B / C
  can_sell         TEXT,                 -- 有无带货权限 yes / no / unknown
  promoted_similar TEXT,                 -- 推过同类产品 yes / no / unknown
  first_contact_at TEXT,
  last_contact_at  TEXT,
  next_followup_at TEXT,
  quote            REAL,                 -- 报价（EUR）
  quote_note       TEXT,                 -- 报价原文，如「€300 固定 + 15% 佣金」
  coop_type        TEXT,
  source           TEXT,
  source_url       TEXT,                 -- 信息来源链接
  reason           TEXT,                 -- 为什么值得关注
  blocker          TEXT,                 -- 卡点 / 在等什么
  crm_synced       INTEGER NOT NULL DEFAULT 0,
  do_not_contact   INTEGER NOT NULL DEFAULT 0,   -- 对方明确拒绝、勿再联系（GDPR）
  tags             TEXT,                 -- JSON: ["德语区","高互动"]
  notes            TEXT,
  data_updated_at  TEXT,                 -- 粉丝数等数据的核实日期
  sort_order       REAL,                 -- 看板列内排序
  url_key          TEXT,                 -- 查重用：规整后的主页链接
  email_key        TEXT,                 -- 查重用：小写邮箱
  handle_key       TEXT,                 -- 查重用：平台|账号（小写、去 @）
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  deleted_at       TEXT                  -- 软删除，撤销窗口过后清理
);
CREATE INDEX idx_kols_status   ON kols(status);
CREATE INDEX idx_kols_next     ON kols(next_followup_at);
CREATE INDEX idx_kols_url_key  ON kols(url_key);
CREATE INDEX idx_kols_email    ON kols(email_key);
CREATE INDEX idx_kols_handle   ON kols(handle_key);
CREATE INDEX idx_kols_deleted  ON kols(deleted_at);

CREATE TABLE kol_tasks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kol_id     INTEGER NOT NULL REFERENCES kols(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  due_at     TEXT,
  done       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_tasks_kol ON kol_tasks(kol_id);

CREATE TABLE activities (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kol_id      INTEGER NOT NULL REFERENCES kols(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  summary     TEXT,
  content     TEXT,
  happened_at TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_acts_kol ON activities(kol_id, happened_at);

CREATE TABLE deals (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  kol_id            INTEGER NOT NULL REFERENCES kols(id) ON DELETE CASCADE,
  platform          TEXT,
  content_url       TEXT,
  product_link      TEXT,
  published_at      TEXT,
  views             INTEGER,
  orders            INTEGER,
  gmv_eur           REAL,
  returns           INTEGER,
  net_gmv_eur       REAL,
  commission_rate   REAL,               -- 分成比例，百分数（15 表示 15%）
  commission_eur    REAL,               -- 默认 = 成交额 × 比例；commission_manual=1 时为手填值
  commission_manual INTEGER NOT NULL DEFAULT 0,
  settle_status     TEXT NOT NULL DEFAULT 'unsettled',   -- unsettled 未结算 / settled 已结算
  period            TEXT,               -- 结算月份 YYYY-MM
  notes             TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX idx_deals_kol    ON deals(kol_id);
CREATE INDEX idx_deals_period ON deals(period);

CREATE TABLE templates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  scene      TEXT NOT NULL,             -- outreach 开发信 / follow1 首次跟进 / follow2 二次跟进 / sample 寄样确认 /
                                        -- publish 发布提醒 / settle 成交结算 / decline 婉拒
  language   TEXT NOT NULL DEFAULT 'en',
  subject    TEXT,
  body       TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE saved_views (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  icon       TEXT,
  type       TEXT NOT NULL DEFAULT 'list',   -- list / board
  config     TEXT,                           -- JSON：筛选、分组、排序、列
  created_at TEXT NOT NULL
);

CREATE TABLE keywords (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  category   TEXT NOT NULL,
  language   TEXT NOT NULL,
  keyword    TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 界面可编辑的选项与偏好（状态名与颜色、平台、国家、语言、品类、跟进间隔、模板变量默认值等），value 是 JSON
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 服务端内部用：会话签名用的随机 key（首次登录时生成），不经任何接口返回
CREATE TABLE kol_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 登录限流：同一 IP 15 分钟内输错 10 次锁定
CREATE TABLE login_fails (
  ip           TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
