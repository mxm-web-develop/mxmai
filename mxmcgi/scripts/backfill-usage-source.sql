-- 回填 provider_usage_records.usage_source / published_slug / mxm_token_charged
-- 在 migrate:usage-analytics 之后执行
-- 用法: psql $SUPABASE_DB_URL -f mxmcgi/scripts/backfill-usage-source.sql

-- 1) 从 cgi_tasks.metadata 标记 open_api
UPDATE provider_usage_records pur
SET
  usage_source = 'open_api',
  published_slug = COALESCE(pur.published_slug, NULLIF(TRIM(t.metadata->>'publishedSlug'), '')),
  published_api_id = COALESCE(
    pur.published_api_id,
    NULLIF(TRIM(t.metadata->>'publishedApiId'), '')::uuid
  ),
  caller_user_id = COALESCE(
    pur.caller_user_id,
    NULLIF(TRIM(t.metadata->>'openApiCallerId'), '')::uuid
  ),
  end_user_id = COALESCE(
    pur.end_user_id,
    NULLIF(TRIM(t.metadata->>'endUserId'), '')::uuid
  )
FROM cgi_tasks t
WHERE pur.task_id IS NOT NULL
  AND pur.task_id = t.id::text
  AND (
    t.metadata->>'creationSource' = 'open_api'
    OR (NULLIF(TRIM(t.metadata->>'publishedSlug'), '') IS NOT NULL)
  );

-- 2) 无 cgi_tasks 时从 wallet_transactions 推断（如同步 text-{uuid}）
UPDATE provider_usage_records pur
SET usage_source = 'open_api'
FROM wallet_transactions wt
WHERE pur.task_id IS NOT NULL
  AND pur.task_id = wt.reference_id
  AND wt.type = 'withdraw'
  AND wt.metadata->>'source' = 'open_api'
  AND pur.usage_source = 'web';

UPDATE provider_usage_records pur
SET
  published_slug = COALESCE(pur.published_slug, NULLIF(TRIM(wt.metadata->>'published_slug'), '')),
  published_api_id = COALESCE(
    pur.published_api_id,
    NULLIF(TRIM(wt.metadata->>'published_api_id'), '')::uuid
  ),
  caller_user_id = COALESCE(
    pur.caller_user_id,
    NULLIF(TRIM(wt.metadata->>'open_api_caller_id'), '')::uuid
  )
FROM wallet_transactions wt
WHERE pur.task_id IS NOT NULL
  AND pur.task_id = wt.reference_id
  AND wt.type = 'withdraw'
  AND wt.metadata->>'source' = 'open_api';

-- 3) mxm_token_charged：按 task_id + scope 匹配 wallet 扣费
UPDATE provider_usage_records pur
SET mxm_token_charged = wt.amount::numeric
FROM wallet_transactions wt
WHERE pur.task_id IS NOT NULL
  AND pur.task_id = wt.reference_id
  AND wt.type = 'withdraw'
  AND wt.metadata->>'scope' = pur.scope
  AND pur.mxm_token_charged = 0
  AND wt.amount IS NOT NULL;

-- 4) 仍无 mxm_token 且仅一条 withdraw 的任务
UPDATE provider_usage_records pur
SET mxm_token_charged = sub.total
FROM (
  SELECT reference_id, SUM(amount::numeric) AS total
  FROM wallet_transactions
  WHERE type = 'withdraw' AND reference_id IS NOT NULL
  GROUP BY reference_id
  HAVING COUNT(*) = 1
) sub
WHERE pur.task_id = sub.reference_id
  AND pur.mxm_token_charged = 0;
