-- ============================================
-- Provider 价格 & Usage 记录 & 业务定价 表
-- 执行: pnpm --filter @mxmai/mxmdata migrate
-- ============================================

-- 1. provider_pricing：各 Provider 官方价目表 / 成本配置
CREATE TABLE IF NOT EXISTS provider_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(32) NOT NULL, -- deer / openai / google / anthropic / qwen / volc / minimax / replicate / ppio
  scope VARCHAR(32) NOT NULL,    -- writing / graph / audio / video / text ...
  model_key VARCHAR(128) NOT NULL, -- 逻辑或物理模型名，如 gpt-5-2, gemini-3-pro, qwen3-235b, nano-banana 等

  charge_mode VARCHAR(32) NOT NULL, -- token_based / per_request / per_image / per_second_audio / custom

  -- 通用单价，按 charge_mode 解释；如每 1k tokens 价格
  unit_price NUMERIC(20, 8) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'USD',

  -- 可选：区分输入输出 token 单价
  input_unit_price NUMERIC(20, 8),
  output_unit_price NUMERIC(20, 8),

  metadata JSONB, -- 额外配置，如官方定价链接、批量折扣等

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_pricing_unique
  ON provider_pricing(provider, scope, model_key);

CREATE INDEX IF NOT EXISTS idx_provider_pricing_provider
  ON provider_pricing(provider);

COMMENT ON TABLE provider_pricing IS '各 Provider 官方价格配置表，用于按 usage 计算平台成本';


-- 2. provider_usage_records：底层调用 Usage 事实表
CREATE TABLE IF NOT EXISTS provider_usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  task_id UUID,        -- 关联 mxmcgi 任务（可选）
  user_id UUID,        -- 发起人用户 ID（可选）

  provider VARCHAR(32) NOT NULL,
  scope VARCHAR(32) NOT NULL,
  model_key VARCHAR(128) NOT NULL,

  -- 文本类 usage
  input_tokens BIGINT DEFAULT 0,
  output_tokens BIGINT DEFAULT 0,
  total_tokens BIGINT DEFAULT 0,

  -- 媒体类 usage
  image_count INTEGER DEFAULT 0,
  audio_seconds NUMERIC(20, 4) DEFAULT 0,
  video_seconds NUMERIC(20, 4) DEFAULT 0,
  request_count INTEGER DEFAULT 1,

  raw_usage JSONB, -- Provider 原始 usage 结构

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_usage_created_at
  ON provider_usage_records(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_provider_usage_provider_scope
  ON provider_usage_records(provider, scope);

CREATE INDEX IF NOT EXISTS idx_provider_usage_model_key
  ON provider_usage_records(model_key);

CREATE INDEX IF NOT EXISTS idx_provider_usage_user
  ON provider_usage_records(user_id);

CREATE INDEX IF NOT EXISTS idx_provider_usage_task
  ON provider_usage_records(task_id);

COMMENT ON TABLE provider_usage_records IS '底层 Provider 调用 Usage 事实表，不直接存成本，成本由 usage × provider_pricing 计算';


-- 3. business_pricing：对外业务定价（按 Token 计价）
CREATE TABLE IF NOT EXISTS business_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 业务类型，例如 writing-outlines / writing-articles / graph-photograph / audio-speak / video-generate 等
  business_type VARCHAR(128) NOT NULL,

  -- 计量方式：per_1000_chars / per_task / per_image / per_second_audio / per_video_task ...
  charge_metric VARCHAR(64) NOT NULL,

  -- 每单位消耗多少平台 Token
  price_in_tokens NUMERIC(20, 8) NOT NULL,

  -- 最低收费 Token 数
  min_charge_tokens NUMERIC(20, 8) DEFAULT 0,

  -- 可选：区分 provider / model_key / 细分业务类型（如不同写作细分模型单价不同）
  provider VARCHAR(32),
  model_key VARCHAR(128),
  subtype VARCHAR(64),

  -- 预留扩展字段，如 UI 展示文案、币种、折扣策略等
  metadata JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_business_pricing_unique
  ON business_pricing(business_type, charge_metric, COALESCE(provider, ''), COALESCE(model_key, ''), COALESCE(subtype, ''));

CREATE INDEX IF NOT EXISTS idx_business_pricing_business_type
  ON business_pricing(business_type);

COMMENT ON TABLE business_pricing IS '面向用户的业务价格配置表，单位为平台 Token';


-- 更新时间戳触发器（若存在通用 updated_at 函数，幂等执行）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS update_provider_pricing_updated_at ON provider_pricing;
    CREATE TRIGGER update_provider_pricing_updated_at
      BEFORE UPDATE ON provider_pricing
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();

    DROP TRIGGER IF EXISTS update_business_pricing_updated_at ON business_pricing;
    CREATE TRIGGER update_business_pricing_updated_at
      BEFORE UPDATE ON business_pricing
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

