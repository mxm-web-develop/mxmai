-- 修正误标为 open_api 的自用用量（Task V2 / Agent + personal Key 误带 callerUserId）
-- 用法: psql $SUPABASE_DB_URL -f mxmcgi/scripts/backfix-self-usage-source.sql

-- 1) provider_usage_records：无 published / partner / end-user 信号的一律归为 web
UPDATE provider_usage_records
SET usage_source = 'web'
WHERE usage_source = 'open_api'
  AND coalesce(nullif(trim(published_slug), ''), '') = ''
  AND published_api_id IS NULL
  AND end_user_id IS NULL;

-- 2) cgi_tasks.metadata：同步 creationSource
UPDATE cgi_tasks t
SET metadata = (t.metadata - 'openApiCallerId') || jsonb_build_object('creationSource', 'web')
WHERE t.metadata->>'creationSource' = 'open_api'
  AND coalesce(nullif(trim(t.metadata->>'publishedSlug'), ''), '') = ''
  AND coalesce(nullif(trim(t.metadata->>'publishedApiId'), ''), '') = ''
  AND coalesce(nullif(trim(t.metadata->>'endUserId'), ''), '') = ''
  AND coalesce(nullif(trim(t.metadata->>'partnerAppId'), ''), '') = '';

-- 3) 从已修正任务回填 usage 行（task_id 关联）
UPDATE provider_usage_records pur
SET usage_source = 'web'
FROM cgi_tasks t
WHERE pur.task_id IS NOT NULL
  AND pur.task_id = t.id::text
  AND pur.usage_source = 'open_api'
  AND t.metadata->>'creationSource' = 'web';
