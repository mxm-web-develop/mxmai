-- Partner 开放平台：应用、终端用户、会话
CREATE TABLE IF NOT EXISTS partner_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  api_key_id UUID NOT NULL REFERENCES user_api_keys(id) ON DELETE CASCADE,
  name VARCHAR(128) NOT NULL,
  secret_hash TEXT NOT NULL,
  secret_prefix VARCHAR(16) NOT NULL,
  allowed_slugs TEXT[] NOT NULL DEFAULT '{}',
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  daily_end_user_quota INTEGER,
  qps_limit INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (api_key_id)
);

CREATE INDEX IF NOT EXISTS idx_partner_apps_owner ON partner_apps(owner_user_id);

CREATE TABLE IF NOT EXISTS partner_end_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_app_id UUID NOT NULL REFERENCES partner_apps(id) ON DELETE CASCADE,
  kind VARCHAR(32) NOT NULL CHECK (kind IN ('anonymous', 'external')),
  external_id VARCHAR(256),
  device_fingerprint VARCHAR(256),
  display_name VARCHAR(128),
  metadata JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_end_users_external
  ON partner_end_users(partner_app_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_end_users_device
  ON partner_end_users(partner_app_id, device_fingerprint)
  WHERE device_fingerprint IS NOT NULL AND kind = 'anonymous';

CREATE INDEX IF NOT EXISTS idx_partner_end_users_app ON partner_end_users(partner_app_id, created_at DESC);

CREATE TABLE IF NOT EXISTS partner_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  end_user_id UUID NOT NULL REFERENCES partner_end_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_sessions_end_user ON partner_sessions(end_user_id);
CREATE INDEX IF NOT EXISTS idx_partner_sessions_token ON partner_sessions(token_hash);

-- 用量事件扩展
ALTER TABLE published_api_usage_events
  ADD COLUMN IF NOT EXISTS partner_app_id UUID REFERENCES partner_apps(id) ON DELETE SET NULL;

ALTER TABLE published_api_usage_events
  ADD COLUMN IF NOT EXISTS end_user_id UUID REFERENCES partner_end_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_published_api_usage_partner
  ON published_api_usage_events(partner_app_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_published_api_usage_end_user
  ON published_api_usage_events(end_user_id, created_at DESC);

-- Partner 静态素材（方案二）
CREATE TABLE IF NOT EXISTS partner_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_app_id UUID NOT NULL REFERENCES partner_apps(id) ON DELETE CASCADE,
  end_user_id UUID REFERENCES partner_end_users(id) ON DELETE SET NULL,
  kind VARCHAR(32) NOT NULL CHECK (kind IN ('app_shared', 'end_user')),
  storage_bucket VARCHAR(128) NOT NULL,
  storage_key TEXT NOT NULL,
  mime_type VARCHAR(128),
  label VARCHAR(256),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_assets_app ON partner_assets(partner_app_id);

-- 审计日志（方案三）
CREATE TABLE IF NOT EXISTS partner_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_app_id UUID NOT NULL REFERENCES partner_apps(id) ON DELETE CASCADE,
  action VARCHAR(64) NOT NULL,
  actor_user_id UUID,
  end_user_id UUID,
  detail JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_audit_app ON partner_audit_logs(partner_app_id, created_at DESC);

COMMENT ON TABLE partner_apps IS 'Open API Partner 应用（绑定 integration Key）';
COMMENT ON TABLE partner_end_users IS 'Partner 应用下的终端用户';
COMMENT ON TABLE partner_sessions IS 'Partner 终端用户会话 token 哈希';
