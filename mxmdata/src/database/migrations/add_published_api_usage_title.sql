-- published_api_usage_events 增加展示标题（H5 项目列表 sync 用）
ALTER TABLE published_api_usage_events
  ADD COLUMN IF NOT EXISTS title VARCHAR(256);

COMMENT ON COLUMN published_api_usage_events.title IS 'Open API run 展示名（displayName 或请求 label）';
