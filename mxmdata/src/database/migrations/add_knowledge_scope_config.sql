-- ============================================
-- Knowledge 业务 Embedding 路由表
-- scope=knowledge, task_key=default, sub_type=embedding → 平台默认向量模型
-- 执行: 在 Supabase SQL Editor 或通过项目迁移脚本
-- ============================================

CREATE TABLE IF NOT EXISTS knowledge_scope_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope         TEXT NOT NULL DEFAULT 'knowledge',
  task_key      TEXT NOT NULL DEFAULT 'default',
  sub_type      TEXT NOT NULL DEFAULT 'embedding',
  model         TEXT NOT NULL,
  provider      TEXT NOT NULL DEFAULT 'jiekou',
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scope, task_key, sub_type)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_scope_config_task
  ON knowledge_scope_config(scope, task_key, sub_type);

COMMENT ON TABLE knowledge_scope_config IS 'Knowledge 向量模型路由：默认 embedding 的 provider + model_key（见 provider_models scope=knowledge）';

NOTIFY pgrst, 'reload schema';
