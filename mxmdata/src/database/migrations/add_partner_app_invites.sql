-- Partner 一次性邀请码（白名单模式：一码一人）

CREATE TABLE IF NOT EXISTS partner_app_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_app_id UUID NOT NULL REFERENCES partner_apps(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'used', 'revoked')),
  used_subject VARCHAR(256),
  used_end_user_id UUID REFERENCES partner_end_users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_partner_app_invites_app
  ON partner_app_invites(partner_app_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_app_invites_pending
  ON partner_app_invites(partner_app_id, status)
  WHERE status = 'pending';

COMMENT ON TABLE partner_app_invites IS '白名单模式一次性邀请码（验码成功后标记 used）';
