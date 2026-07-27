-- 用户参考图记录表：追踪用户在 R2 的上传，实现短期复用
CREATE TABLE IF NOT EXISTS user_reference_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  -- R2 相关字段
  r2_bucket TEXT NOT NULL DEFAULT 'mxmtemimageref',
  r2_key TEXT NOT NULL,
  r2_url TEXT NOT NULL,
  -- 图片元数据
  original_name TEXT,
  content_type TEXT DEFAULT 'image/jpeg',
  file_size_bytes BIGINT,
  -- 用途标签（可选，方便用户分类）
  tag TEXT,
  -- 软删除
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引：按用户 ID + 创建时间查询最近上传
CREATE INDEX IF NOT EXISTS idx_user_reference_images_user_created
  ON user_reference_images (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- 索引：按 R2 key 查询（用于去重检查）
CREATE INDEX IF NOT EXISTS idx_user_reference_images_r2_key
  ON user_reference_images (r2_key)
  WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE user_reference_images ENABLE ROW LEVEL SECURITY;

-- 用户只能操作自己的记录
CREATE POLICY "Users can manage own reference images"
  ON user_reference_images
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 辅助函数：清理 N 天前的记录（可由 cron 调用）
CREATE OR REPLACE FUNCTION cleanup_old_reference_images(days_to_keep INT DEFAULT 7)
RETURNS BIGINT AS $$
DECLARE
  deleted_count BIGINT;
BEGIN
  UPDATE user_reference_images
  SET deleted_at = NOW()
  WHERE deleted_at IS NULL
    AND created_at < NOW() - (days_to_keep || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
