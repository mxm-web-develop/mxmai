-- Provider 模型连通性测试记录表
-- 用于 Admin 展示「最近测试状态 / 最近成功时间 / 历史记录」

CREATE TABLE IF NOT EXISTS provider_model_test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  provider_model_id UUID NOT NULL REFERENCES provider_models(id) ON DELETE CASCADE,

  provider VARCHAR(32) NOT NULL,
  scope VARCHAR(32) NOT NULL,
  model_key VARCHAR(128) NOT NULL,
  inferred_modality VARCHAR(16) NOT NULL, -- text/image/audio/video

  success BOOLEAN NOT NULL DEFAULT FALSE,
  latency_ms INTEGER,
  error_message TEXT,

  request_payload JSONB,
  response_meta JSONB,
  steps JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_model_test_runs_model
  ON provider_model_test_runs(provider_model_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_provider_model_test_runs_provider_scope_model
  ON provider_model_test_runs(provider, scope, model_key, created_at DESC);

COMMENT ON TABLE provider_model_test_runs IS 'Provider 物理模型连通性测试记录（每次测试写一行），用于 Admin 回溯与状态展示';

