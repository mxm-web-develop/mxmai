-- 平台统一对象存储元数据表
CREATE TABLE IF NOT EXISTS storage_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  domain TEXT NOT NULL CHECK (domain IN ('generated', 'user_upload', 'system_static')),
  provider TEXT NOT NULL CHECK (provider IN ('minio', 'r2', 'aliyun_oss')),
  bucket TEXT NOT NULL,
  object_key TEXT NOT NULL,
  purpose TEXT NOT NULL,
  content_type TEXT,
  size_bytes BIGINT,
  original_name TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, bucket, object_key)
);

CREATE INDEX IF NOT EXISTS idx_storage_objects_user_domain
  ON storage_objects (user_id, domain, purpose, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_storage_objects_system
  ON storage_objects (domain, purpose, created_at DESC)
  WHERE deleted_at IS NULL AND user_id IS NULL;

ALTER TABLE storage_objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own storage objects"
  ON storage_objects
  FOR ALL
  USING (user_id IS NOT NULL AND user_id = auth.uid())
  WITH CHECK (user_id IS NOT NULL AND user_id = auth.uid());

CREATE OR REPLACE FUNCTION cleanup_expired_storage_objects()
RETURNS BIGINT AS $$
DECLARE
  deleted_count BIGINT;
BEGIN
  UPDATE storage_objects
  SET deleted_at = NOW()
  WHERE deleted_at IS NULL
    AND expires_at IS NOT NULL
    AND expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
