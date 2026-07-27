-- storage_objects: Partner 上传来源（与 metadata.partner_app_id 双写，便于索引与列表过滤）
ALTER TABLE storage_objects
  ADD COLUMN IF NOT EXISTS partner_app_id UUID REFERENCES partner_apps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_end_user_id UUID REFERENCES partner_end_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_storage_objects_partner_app
  ON storage_objects (user_id, partner_app_id, created_at DESC)
  WHERE partner_app_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_storage_objects_partner_end_user
  ON storage_objects (partner_app_id, partner_end_user_id, created_at DESC)
  WHERE partner_app_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN storage_objects.partner_app_id IS 'Partner 应用来源；非空表示终端用户上传，非发布者自有上传';
COMMENT ON COLUMN storage_objects.partner_end_user_id IS 'Partner 终端用户；与 partner_app_id 配套';
