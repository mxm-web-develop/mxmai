-- ============================================
-- Text 业务模型路由表（与 writing/outline 等 *_scope_config 对齐）
-- 执行前请确保已应用其它 scope_config 相关迁移；本文件可独立执行
-- ============================================

CREATE TABLE IF NOT EXISTS text_scope_config (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope          TEXT NOT NULL DEFAULT 'text',
  task_key       TEXT NOT NULL,
  sub_type       TEXT NOT NULL DEFAULT 'default',
  logical_model  TEXT NOT NULL,
  model          TEXT NOT NULL,
  provider       TEXT NOT NULL DEFAULT 'deer',
  enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  margin         NUMERIC(10,4),
  charge_metric  VARCHAR(64),
  price_in_tokens NUMERIC(20,8),
  min_charge_tokens NUMERIC(20,8) DEFAULT 0,
  sensitive_word_list_ids JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scope, task_key, sub_type)
);

CREATE INDEX IF NOT EXISTS idx_text_scope_config_task
  ON text_scope_config(scope, task_key, sub_type);

COMMENT ON TABLE text_scope_config IS 'Text 业务模型路由：logical_model 为业务键（如 text-think-reasoning），model 为物理模型 key';

-- 让 PostgREST 立即刷新 schema cache（避免出现 “Could not find the table in the schema cache”）
NOTIFY pgrst, 'reload schema';
