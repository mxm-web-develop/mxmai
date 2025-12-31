-- ============================================
-- mxmagent 数据库表结构
-- 用于管理对话和智能体相关数据
-- ============================================

-- ============================================
-- 1. conversations 表 - 对话历史表（必需）
-- ============================================
-- 存储用户与 AI 的对话历史
-- messages 字段使用 JSONB 存储完整的对话消息列表，包括 flow_chain
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
-- 2. smartflows 表 - 智能工作流定义表（可选）
-- ============================================
-- 如果需要存储工作流的元数据和配置，可以创建此表
-- 如果 smartflow_id 只是简单的字符串标识符（如 'testflow'），则不需要此表
-- 注意：当前实现中 smartflow_id 只是字符串标识符，此表为可选
CREATE TABLE IF NOT EXISTS smartflows (
  id VARCHAR(255) PRIMARY KEY,                    -- 工作流 ID（如 'testflow'）
  name VARCHAR(255) NOT NULL,                     -- 工作流名称
  description TEXT,                               -- 工作流描述
  workflow_schema JSONB,                          -- LangGraph 工作流定义（JSON Schema，可选）
  status VARCHAR(20) DEFAULT 'active',            -- 状态：active, inactive, deprecated
  version VARCHAR(50),                           -- 版本号（可选）
  created_at TIMESTAMP DEFAULT NOW(),             -- 创建时间
  updated_at TIMESTAMP DEFAULT NOW()              -- 更新时间
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_smartflows_status ON smartflows(status);
CREATE INDEX IF NOT EXISTS idx_smartflows_updated_at ON smartflows(updated_at DESC);

-- 更新时间触发器（复用 conversations 的函数）
CREATE TRIGGER update_smartflows_updated_at
  BEFORE UPDATE ON smartflows
  FOR EACH ROW
  EXECUTE FUNCTION update_conversations_updated_at();

-- ============================================
-- 数据结构说明
-- ============================================

-- conversations.messages JSONB 结构示例：
-- [
--   {
--     "query": {
--       "content": "你好，我的名字是张三，我是一名软件工程师",
--       "type": "text",
--       "queryId": "query-1234567890-abc123",
--       "gmtCreate": "2024-01-01T00:00:00.000Z"
--     },
--     "reply": {
--       "content": "你好，张三！很高兴认识你。",
--       "type": "markdown",
--       "flow_chain": [
--         {
--           "type": "thinking",
--           "timestamp": 1704067200000,
--           "state": "completed",
--           "content": "理解用户输入：用户名字是张三，职业是软件工程师"
--         },
--         {
--           "type": "processing",
--           "timestamp": 1704067201000,
--           "state": "completed",
--           "content": "生成回复"
--         }
--       ],
--       "gmtCreate": "2024-01-01T00:00:01.000Z"
--     }
--   }
-- ]

-- smartflows.workflow_schema JSONB 结构示例（可选，如果使用 smartflows 表）：
-- {
--   "nodes": [
--     {"id": "step1_understand", "type": "llm", "name": "理解用户意图"},
--     {"id": "step2_process", "type": "process", "name": "处理数据"},
--     {"id": "step3_respond", "type": "llm", "name": "生成回复"}
--   ],
--   "edges": [
--     {"from": "step1_understand", "to": "step2_process"},
--     {"from": "step2_process", "to": "step3_respond"}
--   ]
-- }
