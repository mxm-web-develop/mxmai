-- Agent 助手：可调用业务白名单 + Smartflow 开关
ALTER TABLE model_config ADD COLUMN IF NOT EXISTS allowed_businesses JSONB DEFAULT NULL;
ALTER TABLE model_config ADD COLUMN IF NOT EXISTS smartflow_enabled BOOLEAN DEFAULT TRUE;
-- allowed_businesses: null = 全部业务；[] = 禁止调用业务；[{scope,taskKey,subtype?}, ...] = 白名单
