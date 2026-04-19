-- Admin 模型配置表
-- 存储全局的 LLM 模型配置，供 Agent Chat 使用

CREATE TABLE IF NOT EXISTS model_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  model_key TEXT NOT NULL,           -- 如 'deer/glm-5-turbo'
  temperature REAL DEFAULT 0.7,
  max_tokens INTEGER,
  top_p REAL,
  frequency_penalty REAL,
  presence_penalty REAL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 默认配置
INSERT INTO model_config (id, model_key)
VALUES ('default', 'deer/glm-5-turbo')
ON CONFLICT (id) DO NOTHING;
