-- ============================================
-- Search 搜索引擎配置表
-- scope=search, task_key=provider_name, sub_type=dimension或'default'
-- ============================================

CREATE TABLE IF NOT EXISTS search_scope_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope         TEXT NOT NULL DEFAULT 'search',
  task_key      TEXT NOT NULL,
  sub_type      TEXT NOT NULL DEFAULT 'default',
  provider      TEXT NOT NULL DEFAULT '',
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  -- extra 字段存储 provider 特定配置（如 API key、额度等）
  extra         JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scope, task_key, sub_type)
);

CREATE INDEX IF NOT EXISTS idx_search_scope_config_task
  ON search_scope_config(scope, task_key, sub_type);

COMMENT ON TABLE search_scope_config IS '搜索引擎配置：scope=search，task_key=provider_name（brave/tavily/arxiv等），sub_type=dimension或default，extra存储api_key、额度等';
