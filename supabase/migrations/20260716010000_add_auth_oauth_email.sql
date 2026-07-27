-- 邮箱验证、OAuth 身份、邮件/重置 token

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ NULL;

ALTER TABLE users
  ALTER COLUMN password_hash DROP NOT NULL;

-- 已有账号视为已验证，避免上线后无法登录
UPDATE users
SET email_verified_at = COALESCE(created_at, NOW())
WHERE email_verified_at IS NULL
  AND email IS NOT NULL
  AND password_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS oauth_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL,
  provider_user_id VARCHAR(255) NOT NULL,
  email TEXT,
  raw_profile JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_identities_user_id ON oauth_identities(user_id);

CREATE TABLE IF NOT EXISTS auth_email_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(32) NOT NULL,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT auth_email_tokens_type_check CHECK (type IN ('email_verify', 'password_reset'))
);

CREATE INDEX IF NOT EXISTS idx_auth_email_tokens_user_type ON auth_email_tokens(user_id, type);
