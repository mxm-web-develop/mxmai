-- 用户 API Key 类型：personal（平台自动化）| integration（仅开放 API /open/*）

ALTER TABLE user_api_keys
  ADD COLUMN IF NOT EXISTS key_type TEXT NOT NULL DEFAULT 'personal'
  CHECK (key_type IN ('personal', 'integration'));

UPDATE user_api_keys SET key_type = 'personal' WHERE key_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_key_type ON user_api_keys(user_id, key_type);

COMMENT ON COLUMN user_api_keys.key_type IS 'personal=全平台 API；integration=仅 /api/v1/open/*';
