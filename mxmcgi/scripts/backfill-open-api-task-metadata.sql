-- 将历史 Open API 任务从 input_data 回填 metadata.publishedSlug，便于 Web「第三方应用」分栏筛选。
-- 在 Supabase SQL Editor 执行一次即可；新任务已由 database-storage 自动写入。

UPDATE cgi_tasks
SET metadata = COALESCE(metadata, '{}'::jsonb)
  || jsonb_build_object(
    'publishedSlug', NULLIF(TRIM(input_data->>'publishedSlug'), ''),
    'publishedApiId', NULLIF(TRIM(input_data->>'publishedApiId'), ''),
    'openApiCallerId', COALESCE(
      NULLIF(TRIM(input_data->>'openApiCallerId'), ''),
      NULLIF(TRIM(input_data->>'callerUserId'), '')
    ),
    'creationSource', 'open_api'
  )
WHERE deleted_at IS NULL
  AND NULLIF(TRIM(input_data->>'publishedSlug'), '') IS NOT NULL
  AND (
    metadata->>'publishedSlug' IS NULL
    OR TRIM(metadata->>'publishedSlug') = ''
  );
