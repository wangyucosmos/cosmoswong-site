-- 已触达次数：发出邮件 / 私信 / 通话每记一次 +1（删掉这类记录 -1），也可以手动改。
-- 用来判断下一封该发哪封（开发信 → 首次跟进 → 最后一封 → 建议暂不跟进）。
-- 同时新增状态 partner（长期合作），status 是 TEXT，不需要改表。
ALTER TABLE kols ADD COLUMN touches INTEGER NOT NULL DEFAULT 0;
