-- storage_objects: asset vs temp + optional asset-center folder
ALTER TABLE storage_objects
  ADD COLUMN IF NOT EXISTS storage_mode TEXT NOT NULL DEFAULT 'asset'
    CHECK (storage_mode IN ('asset', 'temp'));

ALTER TABLE storage_objects
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;

UPDATE storage_objects
SET storage_mode = CASE
  WHEN purpose = 'temp' OR expires_at IS NOT NULL THEN 'temp'
  ELSE 'asset'
END
WHERE storage_mode = 'asset' AND (purpose = 'temp' OR expires_at IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_storage_objects_user_mode
  ON storage_objects (user_id, storage_mode, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_storage_objects_folder
  ON storage_objects (folder_id)
  WHERE deleted_at IS NULL AND folder_id IS NOT NULL;
