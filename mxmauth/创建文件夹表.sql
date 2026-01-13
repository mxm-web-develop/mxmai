-- 文件夹管理表创建脚本
-- 请在 Supabase SQL Editor 中执行此脚本

-- 用户文件夹表
CREATE TABLE IF NOT EXISTS folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  -- 同一用户在同一父目录下不能有重名文件夹
  CONSTRAINT unique_folder_name_per_parent UNIQUE (user_id, parent_id, name)
);

-- 文件夹索引
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_created_at ON folders(created_at DESC);

-- 文件夹更新时间戳触发器（需要先确保 update_updated_at_column 函数存在）
-- 先删除触发器（如果存在），然后重新创建
DROP TRIGGER IF EXISTS update_folders_updated_at ON folders;
CREATE TRIGGER update_folders_updated_at
  BEFORE UPDATE ON folders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 文件夹项关联表（多对多：文件夹 <-> 媒体文件）
CREATE TABLE IF NOT EXISTS folder_items (
  folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  media_item_id UUID NOT NULL REFERENCES user_media(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (folder_id, media_item_id)
);

-- 文件夹项索引
CREATE INDEX IF NOT EXISTS idx_folder_items_folder_id ON folder_items(folder_id);
CREATE INDEX IF NOT EXISTS idx_folder_items_media_item_id ON folder_items(media_item_id);
