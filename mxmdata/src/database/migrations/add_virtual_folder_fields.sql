-- 虚拟文件夹模块：folder_kind 隔离、软链 storage_object、向量化状态

-- 1. folders 扩展
ALTER TABLE folders ADD COLUMN IF NOT EXISTS folder_kind VARCHAR(20) NOT NULL DEFAULT 'upload';
ALTER TABLE folders DROP CONSTRAINT IF EXISTS unique_folder_name_per_parent;
ALTER TABLE folders DROP CONSTRAINT IF EXISTS unique_folder_name_per_parent_kind;
ALTER TABLE folders ADD CONSTRAINT unique_folder_name_per_parent_kind
  UNIQUE (user_id, parent_id, name, folder_kind);
ALTER TABLE folders DROP CONSTRAINT IF EXISTS folders_folder_kind_check;
ALTER TABLE folders ADD CONSTRAINT folders_folder_kind_check
  CHECK (folder_kind IN ('upload', 'virtual'));

ALTER TABLE folders ADD COLUMN IF NOT EXISTS index_status VARCHAR(20) DEFAULT 'none';
ALTER TABLE folders ADD COLUMN IF NOT EXISTS indexed_at TIMESTAMPTZ;
ALTER TABLE folders ADD COLUMN IF NOT EXISTS knowledge_base_id VARCHAR(50);
ALTER TABLE folders ADD COLUMN IF NOT EXISTS index_error TEXT;

CREATE INDEX IF NOT EXISTS idx_folders_user_kind ON folders (user_id, folder_kind);

-- 2. folder_items 扩展（先 drop 复合 PK，再 nullable task_id）
ALTER TABLE folder_items ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
UPDATE folder_items SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE folder_items DROP CONSTRAINT IF EXISTS folder_items_pkey;

ALTER TABLE folder_items ADD COLUMN IF NOT EXISTS storage_object_id UUID REFERENCES storage_objects(id) ON DELETE CASCADE;

ALTER TABLE folder_items ALTER COLUMN task_id DROP NOT NULL;
ALTER TABLE folder_items ALTER COLUMN id SET NOT NULL;
ALTER TABLE folder_items ADD PRIMARY KEY (id);

CREATE UNIQUE INDEX IF NOT EXISTS folder_items_folder_task_unique
  ON folder_items (folder_id, task_id) WHERE task_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS folder_items_folder_storage_unique
  ON folder_items (folder_id, storage_object_id) WHERE storage_object_id IS NOT NULL;

ALTER TABLE folder_items DROP CONSTRAINT IF EXISTS folder_items_ref_check;
ALTER TABLE folder_items ADD CONSTRAINT folder_items_ref_check CHECK (
  (task_id IS NOT NULL AND storage_object_id IS NULL)
  OR (task_id IS NULL AND storage_object_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_folder_items_storage_object_id ON folder_items (storage_object_id);

-- 3. 文件夹索引条目（每条软链的向量化快照）
CREATE TABLE IF NOT EXISTS folder_index_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  ref_type VARCHAR(20) NOT NULL CHECK (ref_type IN ('task', 'storage_object')),
  ref_id VARCHAR(64) NOT NULL,
  content_hash VARCHAR(128),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'indexed', 'failed', 'skipped')),
  chunk_count INTEGER DEFAULT 0,
  indexed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (folder_id, ref_type, ref_id)
);

CREATE INDEX IF NOT EXISTS idx_folder_index_entries_folder_id ON folder_index_entries (folder_id);
