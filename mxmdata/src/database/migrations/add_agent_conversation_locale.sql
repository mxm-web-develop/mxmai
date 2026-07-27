-- Agent 会话 UI 语言（zh / en），用于 system prompt 回复语言
ALTER TABLE agent_conversations
  ADD COLUMN IF NOT EXISTS locale TEXT;
