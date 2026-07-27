-- ============================================
-- provider_usage_records 用量分析扩展列
-- 执行: pnpm --filter @mxmai/mxmdata run migrate:usage-analytics
-- ============================================

ALTER TABLE provider_usage_records
  ADD COLUMN IF NOT EXISTS usage_source VARCHAR(16) NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS caller_user_id UUID,
  ADD COLUMN IF NOT EXISTS published_slug VARCHAR(64),
  ADD COLUMN IF NOT EXISTS published_api_id UUID,
  ADD COLUMN IF NOT EXISTS end_user_id UUID,
  ADD COLUMN IF NOT EXISTS parent_task_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS mxm_token_charged NUMERIC(36, 18) NOT NULL DEFAULT 0;

COMMENT ON COLUMN provider_usage_records.usage_source IS 'web=平台自用 | open_api=第三方授权调用';
COMMENT ON COLUMN provider_usage_records.caller_user_id IS 'Open API 调用方用户 ID';
COMMENT ON COLUMN provider_usage_records.published_slug IS '开放 API slug';
COMMENT ON COLUMN provider_usage_records.parent_task_id IS '子调用归属父任务（如 graph 内 text）';
COMMENT ON COLUMN provider_usage_records.mxm_token_charged IS '对应 MXM-TOKEN 扣费（BillingService 回写）';

CREATE INDEX IF NOT EXISTS idx_pur_user_created
  ON provider_usage_records(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pur_source_scope_created
  ON provider_usage_records(usage_source, scope, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pur_published_slug
  ON provider_usage_records(published_slug)
  WHERE published_slug IS NOT NULL;
