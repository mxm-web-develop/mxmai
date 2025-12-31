-- mxmcgi 模块数据库表结构
-- 用于管理 CGI 异步生成任务（cgi-task）

-- CGI 任务表
CREATE TABLE IF NOT EXISTS cgi_tasks (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  
  -- 任务基本信息
  task_type VARCHAR(50) NOT NULL,          -- 'text' | 'image' | 'video' | 'audio'
  model_name VARCHAR(100) NOT NULL,        -- 模型名称，如 'nano-banana', 'flux-fast'
  model_provider VARCHAR(50),              -- 'replicate' | 'ppio' | 'deer'
  
  -- 任务状态
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
  progress INTEGER DEFAULT 0,              -- 0-100
  error_message TEXT,                      -- 错误信息（如果失败）
  
  -- 任务输入
  input_data JSONB NOT NULL,               -- 完整输入（prompt + 参数）
  prompt TEXT,                             -- 提示词（用于快速查询）
  
  -- 任务输出
  output_data JSONB,                       -- 生成结果（包含 mediaUrls）
  result_format VARCHAR(20) DEFAULT 'base64', -- 'base64' | 'minio'（结果格式）
  storage_info JSONB,                      -- 如果存储到 minio，包含存储信息
  
  -- 时间戳
  queued_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,                   -- 软删除标记（用户删除时设置，admin 硬删除时真正删除）
  
  -- 元数据
  metadata JSONB                           -- 额外元数据
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_cgi_tasks_user_id ON cgi_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_cgi_tasks_status ON cgi_tasks(status);
CREATE INDEX IF NOT EXISTS idx_cgi_tasks_task_type ON cgi_tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_cgi_tasks_model_name ON cgi_tasks(model_name);
CREATE INDEX IF NOT EXISTS idx_cgi_tasks_created_at ON cgi_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cgi_tasks_user_status ON cgi_tasks(user_id, status);

-- 更新 updated_at 的触发器
CREATE OR REPLACE FUNCTION update_cgi_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_cgi_tasks_updated_at
  BEFORE UPDATE ON cgi_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_cgi_tasks_updated_at();
