-- Partner 访问控制：终端用户白名单、slug 模式、邀请链接

ALTER TABLE partner_apps
  ADD COLUMN IF NOT EXISTS end_user_access_mode VARCHAR(16) NOT NULL DEFAULT 'open'
    CHECK (end_user_access_mode IN ('open', 'whitelist')),
  ADD COLUMN IF NOT EXISTS slug_access_mode VARCHAR(16) NOT NULL DEFAULT 'all_owner'
    CHECK (slug_access_mode IN ('all_owner', 'restricted')),
  ADD COLUMN IF NOT EXISTS invite_token_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS h5_login_base_url VARCHAR(512);

CREATE TABLE IF NOT EXISTS partner_app_allowlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_app_id UUID NOT NULL REFERENCES partner_apps(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL CHECK (provider IN ('sms', 'wechat', 'external')),
  subject VARCHAR(256) NOT NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'invite')),
  note VARCHAR(256),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (partner_app_id, provider, subject)
);

CREATE INDEX IF NOT EXISTS idx_partner_allowlist_app ON partner_app_allowlist(partner_app_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_apps_invite_token ON partner_apps(invite_token_hash)
  WHERE invite_token_hash IS NOT NULL;

COMMENT ON TABLE partner_app_allowlist IS 'Partner 终端用户白名单（手机号/微信/externalId）';
COMMENT ON COLUMN partner_apps.end_user_access_mode IS 'open=任意注册 whitelist=仅白名单或邀请';
COMMENT ON COLUMN partner_apps.slug_access_mode IS 'all_owner=不限制 slug restricted=allowed_slugs 子集';
COMMENT ON COLUMN partner_apps.invite_token_hash IS '邀请链接 token SHA256';
