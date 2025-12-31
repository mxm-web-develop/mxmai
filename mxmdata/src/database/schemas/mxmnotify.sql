-- mxmnotify 数据库表结构
-- 用于管理生成任务和通知

-- 生成任务表
CREATE TABLE IF NOT EXISTS generation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_type VARCHAR(50) NOT NULL,          -- 'graph' | 'text'
  model_name VARCHAR(100) NOT NULL,        -- 模型名称，如 'seedream-4', 'claude-4.5-sonnet'
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending' | 'processing' | 'completed' | 'failed'
  prompt TEXT NOT NULL,                    -- 用户输入的提示词
  params JSONB,                            -- 任务参数（JSON 格式）
  result JSONB,                            -- 生成结果（包含 image_urls 或 text）
  error_message TEXT,                      -- 错误信息（如果失败）
  started_at TIMESTAMP DEFAULT NOW(),      -- 任务开始时间
  completed_at TIMESTAMP,                  -- 任务完成时间
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_generation_tasks_user_id ON generation_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_tasks_status ON generation_tasks(status);
CREATE INDEX IF NOT EXISTS idx_generation_tasks_task_type ON generation_tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_generation_tasks_created_at ON generation_tasks(created_at DESC);

-- 通知表
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES generation_tasks(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,                -- 'task_completed' | 'task_failed' | 'system'
  title VARCHAR(255) NOT NULL,              -- 通知标题
  content TEXT,                             -- 通知内容
  data JSONB,                               -- 附加数据（JSON 格式）
  is_read BOOLEAN DEFAULT false,           -- 是否已读
  read_at TIMESTAMP,                       -- 阅读时间
  created_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_task_id ON notifications(task_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- 更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_generation_tasks_updated_at
  BEFORE UPDATE ON generation_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
