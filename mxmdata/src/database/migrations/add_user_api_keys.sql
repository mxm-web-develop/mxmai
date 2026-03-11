-- 用户 API Key（个人访问凭证）：供 OpenClaw / 脚本等代表用户调用平台接口
-- 安全：仅存 key_hash，明文创建时仅返回一次，禁止写日志

CREATE TABLE IF NOT EXISTS user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  key_prefix VARCHAR(12) NOT NULL,
  name VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_api_keys_key_hash ON user_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON user_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_expires_at ON user_api_keys(expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE user_api_keys IS '用户 API Key：key_hash 用于校验，key_prefix 用于列表展示；明文仅创建时返回一次';
