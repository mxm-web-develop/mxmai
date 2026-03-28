-- ============================================
-- 扩展 provider_call_stats：增加 model_key、scope、task_id
-- 执行: pnpm --filter @mxmai/mxmdata run migrate:provider-call-stats-model-scope
-- ============================================

ALTER TABLE provider_call_stats
  ADD COLUMN IF NOT EXISTS model_key VARCHAR(128),
  ADD COLUMN IF NOT EXISTS scope VARCHAR(32),
  ADD COLUMN IF NOT EXISTS task_id VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_provider_call_stats_provider_model_scope
  ON provider_call_stats(provider, model_key, scope);

COMMENT ON COLUMN provider_call_stats.model_key IS '物理模型键，与 provider_models.model_key 对应';
COMMENT ON COLUMN provider_call_stats.scope IS '业务域：writing/graph/audio/video/text/default';
COMMENT ON COLUMN provider_call_stats.task_id IS '关联的 cgi_task id（若有）';
