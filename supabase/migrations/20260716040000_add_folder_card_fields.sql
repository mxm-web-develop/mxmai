-- 虚拟文件夹标签卡 + 移除 characters 表
-- 与 mxmdata/src/database/migrations/add_folder_card_fields.sql 对齐

ALTER TABLE folders ADD COLUMN IF NOT EXISTS card_tag VARCHAR(20);
ALTER TABLE folders DROP CONSTRAINT IF EXISTS folders_card_tag_check;
ALTER TABLE folders ADD CONSTRAINT folders_card_tag_check
  CHECK (card_tag IS NULL OR card_tag IN ('style', 'character', 'knowledge', 'writing'));

ALTER TABLE folders ADD COLUMN IF NOT EXISTS card_status VARCHAR(20) NOT NULL DEFAULT 'idle';
ALTER TABLE folders DROP CONSTRAINT IF EXISTS folders_card_status_check;
ALTER TABLE folders ADD CONSTRAINT folders_card_status_check
  CHECK (card_status IN ('idle', 'parsing', 'ready', 'stale', 'failed'));

ALTER TABLE folders ADD COLUMN IF NOT EXISTS card_summary JSONB DEFAULT '{}'::jsonb;
ALTER TABLE folders ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_folders_card_tag ON folders (user_id, card_tag)
  WHERE card_tag IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_folders_is_system ON folders (is_system)
  WHERE is_system = true;

ALTER TABLE folder_items ADD COLUMN IF NOT EXISTS asset_role VARCHAR(32) DEFAULT 'unknown';
ALTER TABLE folder_items DROP CONSTRAINT IF EXISTS folder_items_asset_role_check;
ALTER TABLE folder_items ADD CONSTRAINT folder_items_asset_role_check
  CHECK (asset_role IS NULL OR asset_role IN (
    'style_ref', 'palette', 'appearance', 'description', 'voice', 'doc', 'unknown'
  ));

ALTER TABLE folder_index_entries ADD COLUMN IF NOT EXISTS analysis JSONB DEFAULT NULL;

DROP TABLE IF EXISTS characters CASCADE;
