-- 修复 provider_usage_records.task_id 类型
-- cgi_tasks.id 为 VARCHAR(64)，而 task_id 原为 UUID，导致插入失败
-- 运行: pnpm --filter @mxmai/mxmdata run migrate:provider-usage-task-id

-- 将 task_id 改为 VARCHAR(64) 以匹配 cgi_tasks.id
ALTER TABLE provider_usage_records
  ALTER COLUMN task_id TYPE VARCHAR(64) USING task_id::text;
