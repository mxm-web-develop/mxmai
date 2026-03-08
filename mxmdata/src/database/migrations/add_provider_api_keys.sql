-- Provider API Keys：Admin 配置各通道 Key，多 key 按 priority 使用
-- 安全：key_value 仅服务端使用，API 返回脱敏，禁止写日志

CREATE TABLE IF NOT EXISTS provider_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(32) NOT NULL,
  service VARCHAR(32),
  key_value TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID
);

CREATE INDEX IF NOT EXISTS idx_provider_api_keys_provider_service ON provider_api_keys(provider, service);
CREATE INDEX IF NOT EXISTS idx_provider_api_keys_active ON provider_api_keys(provider, service, is_active) WHERE is_active = true;

COMMENT ON TABLE provider_api_keys IS 'Provider API Keys，仅 Admin 可管理；key_value 不可通过 API 明文返回';
