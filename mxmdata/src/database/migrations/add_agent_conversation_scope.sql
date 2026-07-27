-- 模块 Agent：会话可绑定 scope（主助手为 NULL）
ALTER TABLE agent_conversations
  ADD COLUMN IF NOT EXISTS scope TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_conversations_user_scope
  ON agent_conversations (user_id, scope)
  WHERE scope IS NOT NULL;
