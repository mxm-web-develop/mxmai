-- 已发布开放 API：业务 Task V2 或 Smartflow 对外 slug 调用
CREATE TABLE IF NOT EXISTS published_apis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(64) NOT NULL,
  kind VARCHAR(32) NOT NULL CHECK (kind IN ('task_v2', 'smartflow')),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(256) NOT NULL,
  description TEXT,
  task_v2_scope VARCHAR(64),
  task_v2_task_key VARCHAR(128),
  task_v2_subtype VARCHAR(128),
  smartflow_id VARCHAR(255),
  input_schema_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  input_doc JSONB NOT NULL DEFAULT '{}'::jsonb,
  schema_version INTEGER NOT NULL DEFAULT 1,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_published_apis_slug ON published_apis(slug);
CREATE INDEX IF NOT EXISTS idx_published_apis_owner ON published_apis(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_published_apis_enabled ON published_apis(is_enabled) WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_published_apis_task_v2 ON published_apis(task_v2_scope, task_v2_task_key, task_v2_subtype)
  WHERE kind = 'task_v2';
CREATE INDEX IF NOT EXISTS idx_published_apis_smartflow ON published_apis(smartflow_id) WHERE kind = 'smartflow';

COMMENT ON TABLE published_apis IS '用户发布的开放 API（稳定 slug + 入参 schema 快照）';
