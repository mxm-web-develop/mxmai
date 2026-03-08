-- ============================================
-- Graph 业务模型配置表
-- 按业务维度 (graph_type, sub_type) 选择逻辑模型名
-- 执行示例:
--   pnpm --filter @mxmai/mxmdata run migrate:graph-model-config
-- ============================================

CREATE TABLE IF NOT EXISTS graph_model_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope         TEXT NOT NULL DEFAULT 'graph',        -- 预留，当前固定为 graph
  graph_type    TEXT NOT NULL,                        -- 'photograph' | 'design' | 'painting'
  sub_type      TEXT NOT NULL,                        -- 业务子类型，如 'portrait'、'coverImage'
  logical_model TEXT NOT NULL,                        -- 逻辑模型 key，如 'nano-banana-2-pro'、'seedream-4'
  provider      TEXT NOT NULL DEFAULT 'deer',         -- ProviderType，当前主要是 deer
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (scope, graph_type, sub_type)
);

CREATE INDEX IF NOT EXISTS idx_graph_model_config_scope_type
  ON graph_model_config(scope, graph_type, sub_type);

COMMENT ON TABLE graph_model_config IS 'Graph 业务按 (graph_type, sub_type) 选择逻辑模型的配置表';

