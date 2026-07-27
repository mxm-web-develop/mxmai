-- Partner 短信登录：身份绑定与匿名合并审计

CREATE TABLE IF NOT EXISTS partner_end_user_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_app_id UUID NOT NULL REFERENCES partner_apps(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL CHECK (provider IN ('sms', 'wechat')),
  provider_subject VARCHAR(256) NOT NULL,
  end_user_id UUID NOT NULL REFERENCES partner_end_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (partner_app_id, provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS idx_partner_identities_end_user ON partner_end_user_identities(end_user_id);

CREATE TABLE IF NOT EXISTS partner_end_user_merges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_app_id UUID NOT NULL REFERENCES partner_apps(id) ON DELETE CASCADE,
  from_end_user_id UUID NOT NULL REFERENCES partner_end_users(id) ON DELETE CASCADE,
  to_end_user_id UUID NOT NULL REFERENCES partner_end_users(id) ON DELETE CASCADE,
  reason VARCHAR(64) NOT NULL DEFAULT 'anonymous_upgrade',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE partner_apps
  ADD COLUMN IF NOT EXISTS sms_login_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON TABLE partner_end_user_identities IS 'Partner 终端用户外部身份（手机号/微信 unionid）';
