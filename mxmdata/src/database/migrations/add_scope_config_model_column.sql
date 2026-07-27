-- ============================================
-- *_scope_config 增加物理模型列 model（Admin POST /providers/routing 写入）
-- 云库历史表仅有 logical_model；本地已演进为 model。本迁移对齐两者。
-- text_scope_config 建表时已含 model，此处仅补其余 scope 表。
-- ============================================

ALTER TABLE graph_scope_config ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE writing_scope_config ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE video_scope_config ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE audio_scope_config ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE music_scope_config ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE outline_scope_config ADD COLUMN IF NOT EXISTS model TEXT;

UPDATE graph_scope_config SET model = logical_model WHERE model IS NULL AND logical_model IS NOT NULL;
UPDATE writing_scope_config SET model = logical_model WHERE model IS NULL AND logical_model IS NOT NULL;
UPDATE video_scope_config SET model = logical_model WHERE model IS NULL AND logical_model IS NOT NULL;
UPDATE audio_scope_config SET model = logical_model WHERE model IS NULL AND logical_model IS NOT NULL;
UPDATE music_scope_config SET model = logical_model WHERE model IS NULL AND logical_model IS NOT NULL;
UPDATE outline_scope_config SET model = logical_model WHERE model IS NULL AND logical_model IS NOT NULL;

-- 历史云库 logical_model 为 NOT NULL；Admin 路由现只写 model，放宽约束
ALTER TABLE graph_scope_config ALTER COLUMN logical_model DROP NOT NULL;
ALTER TABLE writing_scope_config ALTER COLUMN logical_model DROP NOT NULL;
ALTER TABLE video_scope_config ALTER COLUMN logical_model DROP NOT NULL;
ALTER TABLE audio_scope_config ALTER COLUMN logical_model DROP NOT NULL;
ALTER TABLE music_scope_config ALTER COLUMN logical_model DROP NOT NULL;
ALTER TABLE outline_scope_config ALTER COLUMN logical_model DROP NOT NULL;

NOTIFY pgrst, 'reload schema';
