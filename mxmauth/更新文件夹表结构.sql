-- 更新文件夹表结构：移除对 user_media 表的依赖，直接使用 task_id
-- 执行此 SQL 前请备份数据库！

-- 1. 删除旧的 folder_items 表（如果存在）
DROP TABLE IF EXISTS folder_items CASCADE;

-- 2. 创建新的 folder_items 表（使用 task_id 而不是 media_item_id）
CREATE TABLE IF NOT EXISTS folder_items (
  folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  task_id VARCHAR(64) NOT NULL,  -- 任务 ID（来自 cgi-tasks 表）
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (folder_id, task_id)
);

-- 3. 创建索引
CREATE INDEX IF NOT EXISTS idx_folder_items_folder_id ON folder_items(folder_id);
CREATE INDEX IF NOT EXISTS idx_folder_items_task_id ON folder_items(task_id);

-- 注意：
-- - 此迁移会删除所有现有的文件夹关联数据
-- - 如果需要保留数据，需要先导出旧数据，然后手动转换为新的 task_id 格式
