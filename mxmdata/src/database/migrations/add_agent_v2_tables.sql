-- Agent Chat v2：会话 / 消息 / Run / 事件流
-- 全异步 harness agent：worker 消费 run，事件落库 + Redis 实时

CREATE TABLE IF NOT EXISTS agent_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  summary TEXT,
  scope TEXT,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_conversations_user_updated
  ON agent_conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '[]'::jsonb,
  references_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  run_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_conversation_created
  ON agent_messages (conversation_id, created_at ASC);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  message_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  usage JSONB,
  heartbeat_at TIMESTAMPTZ,
  claimed_by TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_status_created
  ON agent_runs (status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_agent_runs_conversation
  ON agent_runs (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_runs_heartbeat
  ON agent_runs (status, heartbeat_at);

CREATE TABLE IF NOT EXISTS agent_run_events (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_agent_run_events_conversation_seq
  ON agent_run_events (conversation_id, seq ASC);

CREATE INDEX IF NOT EXISTS idx_agent_run_events_run_seq
  ON agent_run_events (run_id, seq ASC);

-- model_config 扩展：provider + agent loop 参数
ALTER TABLE model_config ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE model_config ADD COLUMN IF NOT EXISTS max_loop_rounds INTEGER DEFAULT 12;
ALTER TABLE model_config ADD COLUMN IF NOT EXISTS run_timeout_ms INTEGER DEFAULT 600000;
ALTER TABLE model_config ADD COLUMN IF NOT EXISTS system_prompt_extra TEXT;
ALTER TABLE model_config ADD COLUMN IF NOT EXISTS tools_enabled BOOLEAN DEFAULT TRUE;
