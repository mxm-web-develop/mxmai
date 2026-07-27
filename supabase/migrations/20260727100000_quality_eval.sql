-- 写作质量评估：按 subtype 的评分维度配置 + 评估运行历史

CREATE TABLE IF NOT EXISTS quality_eval_rubrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope VARCHAR(32) NOT NULL DEFAULT 'writing',
  task_key VARCHAR(128) NOT NULL,
  subtype VARCHAR(128) NOT NULL,
  dimensions JSONB NOT NULL DEFAULT '[]'::jsonb,
  business_brief TEXT NOT NULL DEFAULT '',
  provider VARCHAR(64) NOT NULL DEFAULT 'atlascloud',
  model_key VARCHAR(256) NOT NULL DEFAULT 'openai/gpt-5.6-terra',
  auto_on_complete BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scope, task_key, subtype)
);

CREATE INDEX IF NOT EXISTS idx_quality_eval_rubrics_scope
  ON quality_eval_rubrics (scope, is_active);

COMMENT ON TABLE quality_eval_rubrics IS 'Admin 写作质量评分：按 scope/taskKey/subtype 配置维度与默认模型';
COMMENT ON COLUMN quality_eval_rubrics.dimensions IS
  '[{ key, label, description, weight, failBelow }]';

CREATE TABLE IF NOT EXISTS quality_eval_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rubric_id UUID REFERENCES quality_eval_rubrics(id) ON DELETE SET NULL,
  scope VARCHAR(32) NOT NULL DEFAULT 'writing',
  task_key VARCHAR(128) NOT NULL,
  subtype VARCHAR(128) NOT NULL,
  source_kind VARCHAR(32) NOT NULL,
  source_ref JSONB,
  article_text TEXT,
  article_text_truncated TEXT,
  is_system_generated BOOLEAN NOT NULL DEFAULT false,
  scores JSONB,
  attribution JSONB,
  model_provider VARCHAR(64),
  model_key VARCHAR(256),
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  error TEXT,
  created_by VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quality_eval_runs_source_kind_check
    CHECK (source_kind IN ('task', 'folder_item', 'paste')),
  CONSTRAINT quality_eval_runs_status_check
    CHECK (status IN ('pending', 'scoring', 'attributing', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_quality_eval_runs_created
  ON quality_eval_runs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quality_eval_runs_business
  ON quality_eval_runs (scope, task_key, subtype, created_at DESC);

COMMENT ON TABLE quality_eval_runs IS 'Admin 写作质量评估运行记录（含维度分与可选管线归因）';
