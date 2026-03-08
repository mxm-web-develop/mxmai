-- mxmauth 模块数据库表结构
-- 适用于 Supabase (PostgreSQL)

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  level INTEGER DEFAULT 1,
  balance DECIMAL(10, 2) DEFAULT 0.00, -- DEPRECATED: 使用 wallets 表，此字段仅作兼容
  membership_type VARCHAR(20) DEFAULT 'free', -- free, pro, premium
  membership_expires_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'active', -- active, suspended, banned
  role VARCHAR(20) DEFAULT 'user', -- user, admin
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);

-- 用户设置表
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme VARCHAR(10) DEFAULT 'system', -- light, dark, system
  language VARCHAR(10) DEFAULT 'zh', -- zh, en
  notifications_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 用户会话表
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  refresh_token_hash VARCHAR(255) NOT NULL,
  device_info JSONB,
  ip_address VARCHAR(45),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_refresh_token_hash ON user_sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

-- 更新时间戳触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为 users 表创建更新时间戳触发器
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 为 user_settings 表创建更新时间戳触发器
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 用户媒体资源表
CREATE TABLE IF NOT EXISTS user_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(32) NOT NULL,          -- 媒体类型：photo / video / music / illustration / text / voice 等
  assets_type VARCHAR(64) NOT NULL,   -- 生成文件类型：image/jpeg, video/mp4, audio/mpeg 等
  label VARCHAR(255) NOT NULL,        -- 名称
  url TEXT NOT NULL,                  -- MinIO 中的存储路径或完整 URL
  task_id VARCHAR(128) NOT NULL,      -- 生成任务的 ID
  description TEXT,                   -- 可选描述
  prompts_meta TEXT,                  -- 生成任务参数（JSON 字符串）
  created_at TIMESTAMP DEFAULT NOW()
);

-- 用户媒体资源索引
CREATE INDEX IF NOT EXISTS idx_user_media_user_id ON user_media(user_id);
CREATE INDEX IF NOT EXISTS idx_user_media_type ON user_media(type);
CREATE INDEX IF NOT EXISTS idx_user_media_task_id ON user_media(task_id);

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

-- 文件夹更新时间戳触发器
-- 先删除触发器（如果存在），然后重新创建
DROP TRIGGER IF EXISTS update_folders_updated_at ON folders;
CREATE TRIGGER update_folders_updated_at
  BEFORE UPDATE ON folders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 文件夹项关联表（多对多：文件夹 <-> 任务）
-- 直接使用 cgi-tasks 表的 task_id，不再依赖 user_media 表
CREATE TABLE IF NOT EXISTS folder_items (
  folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  task_id VARCHAR(64) NOT NULL,  -- 任务 ID（来自 cgi-tasks 表）
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (folder_id, task_id)
);

-- 文件夹项索引
CREATE INDEX IF NOT EXISTS idx_folder_items_folder_id ON folder_items(folder_id);
CREATE INDEX IF NOT EXISTS idx_folder_items_task_id ON folder_items(task_id);

