-- /desk 我的工作台 v3（2026-10-04 改版：左侧导航、资源页、本机素材库）
-- 和 0002 一样只加不删：旧版代码（git 标签 desk-v1 / desk-v2）不认识这些列和表，但照样能读写其余数据。
-- 回退步骤见 tools/desk_rollback.sh

-- 快捷入口可以「钉到今天页」
ALTER TABLE links ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;

-- 资源：本机文件夹 / 本地小工具 / 文档。只存名字和路径，网页不会去访问这些路径（点一下复制路径）
CREATE TABLE resources (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,          -- folder 本机文件夹 / tool 本地小工具 / doc 文档
  group_name TEXT,
  label      TEXT NOT NULL,
  path       TEXT NOT NULL,
  province   TEXT,
  note       TEXT,
  pinned     INTEGER NOT NULL DEFAULT 0,
  sort_order REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_resources_kind ON resources(kind);
