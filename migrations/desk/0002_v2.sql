-- /desk v2（2026-10-04）：按「同时只有几个、每个都很深的项目」重做。
-- ⚠️ 只加不删：不删表、不删列、不改原有列的含义 → 旧版代码（git 标签 desk-v1）照样能读写这份数据，回退时不用动数据库。
--   回退步骤见 tools/desk_rollback_v1.sh。
--
-- 项目状态新增两个 key（旧的 9 个仍然有效，页面上统一显示成「进行中」）：
--   active 进行中 / watch 观望（不一定是我做：能看排期，但不进「今天」）
--   live 已上线收尾 / done 已交付 / paused 暂缓 沿用

-- 上线日是不是「暂定」
ALTER TABLE projects ADD COLUMN launch_tentative INTEGER NOT NULL DEFAULT 0;
-- 比稿状态 JSON：{"scope":"…","tools":["Claude Code","Codex"],"started_at":"YYYY-MM-DD"}
ALTER TABLE projects ADD COLUMN compare TEXT;

-- 待确认：最晚哪天要到、从哪天开始催（时间表生成的还记着相对上线日的天数，改上线日时一起顺移）
ALTER TABLE pendings ADD COLUMN need_by TEXT;
ALTER TABLE pendings ADD COLUMN remind_from TEXT;
ALTER TABLE pendings ADD COLUMN offset_days INTEGER;
ALTER TABLE pendings ADD COLUMN remind_offset INTEGER;
ALTER TABLE pendings ADD COLUMN source TEXT;

-- 交付物：当前底稿（哪一版、谁做的）、是不是你手改的（AI 不得改动）、交付前有没有确认过检查
ALTER TABLE deliverables ADD COLUMN base TEXT;
ALTER TABLE deliverables ADD COLUMN base_locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE deliverables ADD COLUMN checked INTEGER NOT NULL DEFAULT 0;

-- 待办：旧版时间表会给「带交付物的节点」同时生成一条同名待办；v2 把这种待办挂到对应交付物上，页面只显示交付物
ALTER TABLE tasks ADD COLUMN deliverable_id INTEGER;
-- 提效记录：从「标成已交付」记下来的，挂到那件交付物上
ALTER TABLE wins ADD COLUMN deliverable_id INTEGER;

-- 已拍板的口径：你自己的决定（比如「以 Claude 版为底稿」「活动时间以 Word 第一条为准」），带日期；业务方的答复仍在 pendings 里
CREATE TABLE decisions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  source      TEXT,                  -- 谁定的：我 / 领导 / 业务方 / 比稿选定 / 某个 AI 的收工汇报
  decided_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX idx_decisions_project ON decisions(project_id);

-- 把旧版时间表生成的「重复待办」挂到同一批生成的交付物上（同项目、同一次生成、同一个相对天数、同样的数量才挂，按顺序一一对应）
WITH t AS (
  SELECT id, project_id, offset_days, created_at,
         ROW_NUMBER() OVER (PARTITION BY project_id, offset_days, created_at ORDER BY sort_order, id) AS rn,
         COUNT(*) OVER (PARTITION BY project_id, offset_days, created_at) AS n
  FROM tasks WHERE source = 'timeline' AND offset_days IS NOT NULL
), d AS (
  SELECT id, project_id, offset_days, created_at,
         ROW_NUMBER() OVER (PARTITION BY project_id, offset_days, created_at ORDER BY sort_order, id) AS rn,
         COUNT(*) OVER (PARTITION BY project_id, offset_days, created_at) AS n
  FROM deliverables WHERE offset_days IS NOT NULL
)
UPDATE tasks SET deliverable_id = (
  SELECT d.id FROM t JOIN d ON d.project_id = t.project_id AND d.offset_days = t.offset_days
    AND d.created_at = t.created_at AND d.rn = t.rn AND d.n = t.n
  WHERE t.id = tasks.id
)
WHERE source = 'timeline' AND offset_days IS NOT NULL AND deliverable_id IS NULL;
