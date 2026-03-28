-- ============================================
-- Provider 模型目录表：provider_models
-- 执行: pnpm --filter @mxmai/mxmdata run migrate:provider-models
-- ============================================

CREATE TABLE IF NOT EXISTS provider_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provider 与业务范围
  provider VARCHAR(32) NOT NULL,         -- deer / openai / google / anthropic / qwen / volc / minimax / replicate / ppio ...
  scope VARCHAR(32) NOT NULL,            -- writing / graph / audio / video / text / default ...

  -- 物理模型键与上游模型名
  model_key VARCHAR(128) NOT NULL,       -- 平台内统一物理模型键，如 gpt-4.1-mini, gemini-2.0-flash, nano-banana-2
  upstream_model VARCHAR(256),           -- 可选：上游真实模型名，model_key 为别名时使用

  -- 协议与输出模态
  protocol VARCHAR(64),                  -- 使用哪种协议适配器：openai / anthropic / google / deerapi-openai / deerapi-anthropic ...
  modality VARCHAR(32),                  -- 输出模态：text / image / audio / video / embedding / json 等
  io_schema VARCHAR(64),                 -- 可选：请求/响应结构标识，如 chat.completions / responses / images.generate / video.generate

  display_name VARCHAR(128),             -- Admin 展示名
  description TEXT,                      -- 简要说明

  capabilities JSONB,                    -- 能力声明：上下文长度、多模态支持、最大分辨率等
  default_parameters JSONB,              -- 模型级默认参数：temperature、max_tokens 等

  is_enabled BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 每个 provider / scope / model_key 唯一
CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_models_unique
  ON provider_models(provider, scope, model_key);

CREATE INDEX IF NOT EXISTS idx_provider_models_provider
  ON provider_models(provider);

CREATE INDEX IF NOT EXISTS idx_provider_models_scope
  ON provider_models(scope);

CREATE INDEX IF NOT EXISTS idx_provider_models_protocol_modality
  ON provider_models(provider, protocol, modality);

COMMENT ON TABLE provider_models IS 'Provider 模型目录：以 provider + scope + model_key 为主键，挂载协议、模态、能力与默认参数。';

-- 更新时间戳触发器（若存在通用 updated_at 函数，幂等执行）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS update_provider_models_updated_at ON provider_models;
    CREATE TRIGGER update_provider_models_updated_at
      BEFORE UPDATE ON provider_models
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

