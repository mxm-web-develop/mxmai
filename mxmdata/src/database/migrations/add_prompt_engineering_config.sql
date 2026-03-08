-- 提示词工程配置表（Admin 可配置，支持国际化）
CREATE TABLE IF NOT EXISTS prompt_engineering_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope VARCHAR(20) NOT NULL,
  type VARCHAR(80) NOT NULL,
  subtype VARCHAR(80),
  rules_i18n JSONB NOT NULL DEFAULT '{}',
  output_format_i18n JSONB NOT NULL DEFAULT '{}',
  form_options_i18n JSONB,
  extra JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_prompt_engineering_config_scope_type_subtype UNIQUE (scope, type, subtype)
);

CREATE INDEX IF NOT EXISTS idx_prompt_engineering_config_scope ON prompt_engineering_config(scope);
CREATE INDEX IF NOT EXISTS idx_prompt_engineering_config_type ON prompt_engineering_config(type);
CREATE INDEX IF NOT EXISTS idx_prompt_engineering_config_scope_type ON prompt_engineering_config(scope, type);

COMMENT ON TABLE prompt_engineering_config IS '提示词工程配置：写作/图文/视频的 rules、output_format 等，按 scope/type/subtype 唯一，支持 i18n';
