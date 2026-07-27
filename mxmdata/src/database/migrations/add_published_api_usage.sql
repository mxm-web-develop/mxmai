-- 开放 API 调用记录（发布者扣费、统计页数据源）
CREATE TABLE IF NOT EXISTS published_api_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  published_api_id UUID NOT NULL REFERENCES published_apis(id) ON DELETE CASCADE,
  slug VARCHAR(64) NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  caller_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  job_id VARCHAR(128) NOT NULL,
  kind VARCHAR(32) NOT NULL CHECK (kind IN ('task_v2', 'smartflow')),
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  tokens_charged NUMERIC(20, 8) NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_published_api_usage_owner ON published_api_usage_events(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_published_api_usage_api ON published_api_usage_events(published_api_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_published_api_usage_slug ON published_api_usage_events(slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_published_api_usage_job ON published_api_usage_events(job_id);

COMMENT ON TABLE published_api_usage_events IS '第三方开放 API 调用记录（MXM-TOKEN 从发布者账户扣减）';
