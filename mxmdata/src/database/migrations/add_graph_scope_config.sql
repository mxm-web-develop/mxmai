-- ============================================
-- Graph 业务模型路由表
-- scope=graph, task_key=photograph/design/painting, sub_type=细分或'default'
-- ============================================

CREATE TABLE IF NOT EXISTS graph_scope_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope         TEXT NOT NULL DEFAULT 'graph',
  task_key      TEXT NOT NULL,
  sub_type      TEXT NOT NULL DEFAULT 'default',
  model         TEXT NOT NULL,
  provider      TEXT NOT NULL DEFAULT 'deer',
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scope, task_key, sub_type)
);

CREATE INDEX IF NOT EXISTS idx_graph_scope_config_task
  ON graph_scope_config(scope, task_key, sub_type);

COMMENT ON TABLE graph_scope_config IS 'Graph 业务模型路由配置：scope=graph，task_key=photograph/design/painting，sub_type=细分或default';
