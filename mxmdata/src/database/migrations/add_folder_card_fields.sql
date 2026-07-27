-- 虚拟文件夹标签卡：card_tag / card_summary / asset_role / analysis
-- 并移除独立 characters 表（角色改由 card_tag=character 的虚拟文件夹承载）

-- 1. folders 卡字段
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

COMMENT ON COLUMN folders.card_tag IS '标签卡：null=普通管理夹；style=视觉风格 | writing=语感文风 | character | knowledge 才进入解析';
COMMENT ON COLUMN folders.card_status IS '卡解析状态 idle|parsing|ready|stale|failed';
COMMENT ON COLUMN folders.card_summary IS '夹级摘要 JSON（风格/角色 snapshot/知识主题）';
COMMENT ON COLUMN folders.is_system IS 'Admin 预置系统共享卡';

-- 2. folder_items.asset_role
ALTER TABLE folder_items ADD COLUMN IF NOT EXISTS asset_role VARCHAR(32) DEFAULT 'unknown';
ALTER TABLE folder_items DROP CONSTRAINT IF EXISTS folder_items_asset_role_check;
ALTER TABLE folder_items ADD CONSTRAINT folder_items_asset_role_check
  CHECK (asset_role IS NULL OR asset_role IN (
    'style_ref', 'palette', 'appearance', 'description', 'voice', 'doc', 'unknown'
  ));

COMMENT ON COLUMN folder_items.asset_role IS '条目资产角色（解析推断，用户可改）';

-- 3. folder_index_entries.analysis
ALTER TABLE folder_index_entries ADD COLUMN IF NOT EXISTS analysis JSONB DEFAULT NULL;
COMMENT ON COLUMN folder_index_entries.analysis IS '单条解析结果（caption/style_summary/palette/media_url/voice_id 等）';

-- 4. 删除旧角色表
DROP TABLE IF EXISTS characters CASCADE;
