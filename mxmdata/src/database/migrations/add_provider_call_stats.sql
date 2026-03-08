-- ============================================
-- Provider 调用监控表（错误率 / 延迟统计持久化）
-- 执行: pnpm --filter @mxmai/mxmdata migrate
-- ============================================

-- provider_call_stats：底层 Provider 调用原始统计记录（成功 / 失败 + 延迟）
CREATE TABLE IF NOT EXISTS provider_call_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provider 与逻辑模型
  provider VARCHAR(32) NOT NULL,        -- deer / openai / google / anthropic / qwen / volc / minimax / replicate / ppio ...
  logical_model VARCHAR(128) NOT NULL,  -- 逻辑或物理模型名，如 writing-outlines / gpt-5-2 / nano-banana-2 等

  -- 本次调用是否成功
  success BOOLEAN NOT NULL,

  -- 本次调用耗时（毫秒）
  latency_ms INTEGER NOT NULL,

  -- 失败时的错误码 / 错误类型（可选，如 "ECONNREFUSED", "401 Unauthorized" 等）
  error_code TEXT,

  -- 预留扩展字段，例如上游区域、重试次数等
  metadata JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_call_stats_created_at
  ON provider_call_stats(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_provider_call_stats_provider
  ON provider_call_stats(provider);

CREATE INDEX IF NOT EXISTS idx_provider_call_stats_provider_model
  ON provider_call_stats(provider, logical_model);

COMMENT ON TABLE provider_call_stats IS 'Provider 调用监控原始事实表，供错误率 / 延迟统计使用（与 provider_usage_records 分开存储）';

