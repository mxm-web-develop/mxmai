-- ============================================
-- mxmagent Smartflow 数据库表结构
-- 参考 Dify.ai 的 Workflow 概念
-- ============================================

-- ============================================
-- 1. smartflows 表 - 工作流定义表（模板）
-- ============================================
-- 存储工作流的定义和配置，类似于 Dify.ai 的 Workflow 模板
CREATE TABLE IF NOT EXISTS smartflows (
  id VARCHAR(255) PRIMARY KEY,                    -- 工作流 ID（如 'testflow', 'image_generation'）
  name VARCHAR(255) NOT NULL,                     -- 工作流名称
  description TEXT,                               -- 工作流描述
  category VARCHAR(100),                          -- 分类（如 'image', 'text', 'multimodal'）
  icon VARCHAR(500),                              -- 图标 URL
  tags TEXT[],                                    -- 标签数组
  schema JSONB NOT NULL,                          -- 工作流定义（JSON Schema）
  status VARCHAR(20) DEFAULT 'draft',             -- 状态：draft, active, inactive, deprecated
  version VARCHAR(50) DEFAULT '1.0.0',            -- 版本号
  author_id VARCHAR(255),                        -- 创建者 ID
  is_public BOOLEAN DEFAULT false,               -- 是否公开
  created_at TIMESTAMP DEFAULT NOW(),             -- 创建时间
  updated_at TIMESTAMP DEFAULT NOW()               -- 更新时间
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_smartflows_status ON smartflows(status);
CREATE INDEX IF NOT EXISTS idx_smartflows_category ON smartflows(category);
CREATE INDEX IF NOT EXISTS idx_smartflows_author ON smartflows(author_id);
CREATE INDEX IF NOT EXISTS idx_smartflows_public ON smartflows(is_public);
CREATE INDEX IF NOT EXISTS idx_smartflows_updated_at ON smartflows(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_smartflows_tags ON smartflows USING GIN(tags); -- GIN 索引支持数组查询

-- ============================================
-- 2. smartflow_executions 表 - 工作流执行实例表
-- ============================================
-- 存储每次工作流执行的记录，包括执行状态、进度、输入输出等
CREATE TABLE IF NOT EXISTS smartflow_executions (
  id VARCHAR(255) PRIMARY KEY,                    -- 执行实例 ID（task_id）
  smartflow_id VARCHAR(255) NOT NULL,            -- 工作流 ID（外键）
  conversation_id VARCHAR(255),                   -- 关联的对话 ID（如果从对话触发）
  user_id VARCHAR(255) NOT NULL,                 -- 用户 ID
  status VARCHAR(20) DEFAULT 'pending',           -- 状态：pending, running, completed, failed, cancelled
  progress INTEGER DEFAULT 0,                    -- 进度（0-100）
  input_data JSONB DEFAULT '{}'::jsonb,          -- 输入数据
  output_data JSONB,                              -- 输出数据
  error_message TEXT,                            -- 错误信息
  flow_chain JSONB,                              -- 执行链（思维链数据）
  started_at TIMESTAMP,                          -- 开始时间
  completed_at TIMESTAMP,                        -- 完成时间
  created_at TIMESTAMP DEFAULT NOW(),             -- 创建时间
  updated_at TIMESTAMP DEFAULT NOW()              -- 更新时间
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_smartflow_executions_smartflow_id ON smartflow_executions(smartflow_id);
CREATE INDEX IF NOT EXISTS idx_smartflow_executions_conversation_id ON smartflow_executions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_smartflow_executions_user_id ON smartflow_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_smartflow_executions_status ON smartflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_smartflow_executions_created_at ON smartflow_executions(created_at DESC);

-- 外键约束（可选，如果 smartflows 表已创建）
-- ALTER TABLE smartflow_executions 
--   ADD CONSTRAINT fk_smartflow_executions_smartflow_id 
--   FOREIGN KEY (smartflow_id) REFERENCES smartflows(id) ON DELETE SET NULL;

-- ============================================
-- 3. conversations 表 - 对话历史表（已存在，添加注释说明）
-- ============================================
-- smartflow_id 字段用于关联工作流，当 conversation 使用 smartflow 时，会创建对应的 smartflow_execution
-- 注意：此表可能已存在，如果不存在请先创建

-- ============================================
-- 更新时间触发器函数（复用）
-- ============================================
CREATE OR REPLACE FUNCTION update_smartflows_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 更新时间触发器
CREATE TRIGGER update_smartflows_updated_at
  BEFORE UPDATE ON smartflows
  FOR EACH ROW
  EXECUTE FUNCTION update_smartflows_updated_at();

CREATE TRIGGER update_smartflow_executions_updated_at
  BEFORE UPDATE ON smartflow_executions
  FOR EACH ROW
  EXECUTE FUNCTION update_smartflows_updated_at();

-- ============================================
-- 数据结构说明
-- ============================================

-- smartflows.schema JSONB 结构示例：
-- {
--   "version": "1.0.0",
--   "nodes": [
--     {
--       "id": "start",
--       "type": "start",
--       "name": "开始",
--       "position": { "x": 100, "y": 100 },
--       "config": {}
--     },
--     {
--       "id": "step1_understand",
--       "type": "llm",
--       "name": "理解用户意图",
--       "position": { "x": 300, "y": 100 },
--       "config": {
--         "model": "gpt-5-nano",
--         "prompt": "请分析以下用户输入，提取关键信息：\n\n用户输入：{{user_input}}\n\n请用一句话总结用户想要什么。",
--         "temperature": 0.7
--       },
--       "inputs": [
--         { "variable": "user_input", "value": "{{input.user_input}}" }
--       ],
--       "outputs": [
--         { "variable": "understanding", "type": "string" }
--       ]
--     },
--     {
--       "id": "step2_process",
--       "type": "tool",
--       "name": "处理数据",
--       "position": { "x": 500, "y": 100 },
--       "config": {
--         "tool_name": "text_generation",
--         "tool_params": {
--           "model": "gpt-5-nano",
--           "prompt": "基于以下理解，生成处理方案：{{step1_understand.understanding}}"
--         }
--       },
--       "inputs": [
--         { "variable": "understanding", "source": "step1_understand" }
--       ],
--       "outputs": [
--         { "variable": "result", "type": "string" }
--       ]
--     },
--     {
--       "id": "step3_respond",
--       "type": "llm",
--       "name": "生成回复",
--       "position": { "x": 700, "y": 100 },
--       "config": {
--         "model": "gpt-5-nano",
--         "prompt": "基于以下信息，生成友好回复：\n\n用户输入：{{input.user_input}}\n理解结果：{{step1_understand.understanding}}\n处理方案：{{step2_process.result}}"
--       },
--       "inputs": [
--         { "variable": "user_input", "value": "{{input.user_input}}" },
--         { "variable": "understanding", "source": "step1_understand" },
--         { "variable": "result", "source": "step2_process" }
--       ],
--       "outputs": [
--         { "variable": "response", "type": "string" }
--       ]
--     },
--     {
--       "id": "end",
--       "type": "end",
--       "name": "结束",
--       "position": { "x": 900, "y": 100 },
--       "config": {}
--     }
--   ],
--   "edges": [
--     { "id": "e1", "source": "start", "target": "step1_understand" },
--     { "id": "e2", "source": "step1_understand", "target": "step2_process" },
--     { "id": "e3", "source": "step2_process", "target": "step3_respond" },
--     { "id": "e4", "source": "step3_respond", "target": "end" }
--   ],
--   "variables": {
--     "user_input": ""
--   },
--   "settings": {
--     "timeout": 300,
--     "retry_count": 3,
--     "error_handling": "stop"
--   }
-- }

-- smartflow_executions.flow_chain JSONB 结构示例：
-- [
--   {
--     "node_id": "step1_understand",
--     "node_name": "理解用户意图",
--     "state": "completed",
--     "input": { "user_input": "我想生成一张照片" },
--     "output": { "understanding": "用户想要生成图片" },
--     "timestamp": 1704067200000,
--     "duration": 1500
--   },
--   {
--     "node_id": "step2_process",
--     "node_name": "处理数据",
--     "state": "completed",
--     "input": { "understanding": "用户想要生成图片" },
--     "output": { "result": "调用图像生成工具" },
--     "timestamp": 1704067201500,
--     "duration": 2000
--   }
-- ]
