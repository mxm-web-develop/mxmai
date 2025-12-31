-- ============================================
-- mxmagent 数据库表结构（安全版本）
-- 用于管理对话和智能体相关数据
-- 此版本会先删除已存在的触发器，避免冲突
-- ============================================

-- ============================================
-- 1. conversations 表 - 对话历史表
-- ============================================
-- 存储用户与 AI 的对话历史
CREATE TABLE IF NOT EXISTS conversations (
  id VARCHAR(255) PRIMARY KEY,                    -- 对话 ID（conversationId）
  user_id VARCHAR(255) NOT NULL,                  -- 用户 ID
  smartflow_id VARCHAR(255),                      -- 智能工作流 ID（如 'testflow'，可选）
  title VARCHAR(500),                              -- 对话标题（可选）
  messages JSONB DEFAULT '[]'::jsonb,              -- 消息列表（JSON 数组）
  created_at TIMESTAMP DEFAULT NOW(),             -- 创建时间
  updated_at TIMESTAMP DEFAULT NOW()              -- 更新时间
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_smartflow_id ON conversations(smartflow_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC);

-- 删除已存在的触发器（如果存在）
DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;

-- 更新时间触发器函数
CREATE OR REPLACE FUNCTION update_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 更新时间触发器
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_conversations_updated_at();

-- ============================================
-- 2. smartflows 表 - 智能工作流定义表
-- ============================================
-- 存储工作流的元数据和配置
CREATE TABLE IF NOT EXISTS smartflows (
  id VARCHAR(255) PRIMARY KEY,                    -- 工作流 ID（如 'testflow'）
  name VARCHAR(255) NOT NULL,                     -- 工作流名称
  description TEXT,                               -- 工作流描述
  category VARCHAR(100),                          -- 分类
  icon VARCHAR(500),                              -- 图标 URL
  tags TEXT[],                                    -- 标签数组
  schema JSONB NOT NULL,                          -- 工作流定义（JSON Schema）
  status VARCHAR(20) DEFAULT 'draft',             -- 状态：active, inactive, draft, deprecated
  version VARCHAR(50) DEFAULT '1.0.0',            -- 版本号
  author_id VARCHAR(255),                         -- 创建者 ID
  is_public BOOLEAN DEFAULT false,                -- 是否公开
  created_at TIMESTAMP DEFAULT NOW(),             -- 创建时间
  updated_at TIMESTAMP DEFAULT NOW()              -- 更新时间
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_smartflows_status ON smartflows(status);
CREATE INDEX IF NOT EXISTS idx_smartflows_author_id ON smartflows(author_id);
CREATE INDEX IF NOT EXISTS idx_smartflows_is_public ON smartflows(is_public);
CREATE INDEX IF NOT EXISTS idx_smartflows_updated_at ON smartflows(updated_at DESC);

-- 删除已存在的触发器（如果存在）
DROP TRIGGER IF EXISTS update_smartflows_updated_at ON smartflows;

-- 更新时间触发器函数（复用 conversations 的函数）
CREATE TRIGGER update_smartflows_updated_at
  BEFORE UPDATE ON smartflows
  FOR EACH ROW
  EXECUTE FUNCTION update_conversations_updated_at();

-- ============================================
-- 3. smartflow_executions 表 - 工作流执行实例表（Task）
-- ============================================
-- 存储工作流的执行任务，记录运行状态和每一步节点的输出
CREATE TABLE IF NOT EXISTS smartflow_executions (
  id VARCHAR(255) PRIMARY KEY,                    -- 执行实例 ID（task_id）
  smartflow_id VARCHAR(255) NOT NULL,             -- 工作流 ID
  conversation_id VARCHAR(255),                   -- 关联的对话 ID（如果从对话触发）
  user_id VARCHAR(255) NOT NULL,                  -- 用户 ID
  status VARCHAR(20) DEFAULT 'pending',           -- 执行状态：pending, running, completed, failed, cancelled
  progress INTEGER DEFAULT 0,                     -- 进度（0-100）
  input_data JSONB NOT NULL,                      -- 输入数据
  output_data JSONB,                              -- 输出数据
  error_message TEXT,                             -- 错误信息
  flow_chain JSONB DEFAULT '[]'::jsonb,          -- 执行链（思维链），记录每个节点的状态和输出
  started_at TIMESTAMP,                           -- 开始时间
  completed_at TIMESTAMP,                         -- 完成时间
  created_at TIMESTAMP DEFAULT NOW(),             -- 创建时间
  updated_at TIMESTAMP DEFAULT NOW()              -- 更新时间
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_smartflow_executions_smartflow_id ON smartflow_executions(smartflow_id);
CREATE INDEX IF NOT EXISTS idx_smartflow_executions_user_id ON smartflow_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_smartflow_executions_conversation_id ON smartflow_executions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_smartflow_executions_status ON smartflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_smartflow_executions_created_at ON smartflow_executions(created_at DESC);

-- 删除已存在的触发器（如果存在）
DROP TRIGGER IF EXISTS update_smartflow_executions_updated_at ON smartflow_executions;

-- 更新时间触发器函数（复用 conversations 的函数）
CREATE TRIGGER update_smartflow_executions_updated_at
  BEFORE UPDATE ON smartflow_executions
  FOR EACH ROW
  EXECUTE FUNCTION update_conversations_updated_at();

-- ============================================
-- 4. prompt_templates 表 - Prompt 模板表
-- ============================================
-- 存储 Prompt 模板，供 formatter 节点使用
CREATE TABLE IF NOT EXISTS prompt_templates (
  id VARCHAR(255) PRIMARY KEY,                    -- 模板 ID
  name VARCHAR(255) NOT NULL UNIQUE,             -- 模板名称（唯一）
  display_name VARCHAR(255) NOT NULL,             -- 显示名称
  description TEXT,                               -- 模板描述
  template TEXT NOT NULL,                         -- 模板内容（支持变量占位符 {{variable}}）
  variables TEXT[] DEFAULT '{}'::text[],          -- 模板变量列表
  category VARCHAR(100),                          -- 分类（如 'image', 'text', 'formatter'）
  author_id VARCHAR(255),                          -- 创建者 ID
  is_public BOOLEAN DEFAULT false,                -- 是否公开
  usage_count INTEGER DEFAULT 0,                  -- 使用次数
  created_at TIMESTAMP DEFAULT NOW(),             -- 创建时间
  updated_at TIMESTAMP DEFAULT NOW()              -- 更新时间
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_prompt_templates_name ON prompt_templates(name);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_author_id ON prompt_templates(author_id);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_is_public ON prompt_templates(is_public);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_category ON prompt_templates(category);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_updated_at ON prompt_templates(updated_at DESC);

-- 删除已存在的触发器（如果存在）
DROP TRIGGER IF EXISTS update_prompt_templates_updated_at ON prompt_templates;

-- 更新时间触发器函数（复用 conversations 的函数）
CREATE TRIGGER update_prompt_templates_updated_at
  BEFORE UPDATE ON prompt_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_conversations_updated_at();
