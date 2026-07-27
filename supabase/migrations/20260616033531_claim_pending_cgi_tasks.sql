-- Atomic claim for mxmcgi worker / future Go taskd.
-- Applied to Supabase Cloud (supermxmai) on 2026-06-16.
-- Rollback: DROP FUNCTION IF EXISTS claim_pending_cgi_tasks(text, int);

CREATE OR REPLACE FUNCTION claim_pending_cgi_tasks(
  p_worker_id text,
  p_limit int DEFAULT 1
)
RETURNS SETOF cgi_tasks
LANGUAGE sql
AS $$
  UPDATE cgi_tasks SET
    status = 'processing',
    progress = 0,
    started_at = now(),
    updated_at = now(),
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('workerId', p_worker_id)
  WHERE id IN (
    SELECT id FROM cgi_tasks
    WHERE status IN ('pending', 'queued')
      AND deleted_at IS NULL
      AND COALESCE(progress, 0) = 0
      AND started_at IS NULL
      AND task_type NOT IN ('video-batch-parent', 'task-v2-batch-parent')
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(p_limit, 1)
  )
  RETURNING *;
$$;

GRANT EXECUTE ON FUNCTION claim_pending_cgi_tasks(text, int) TO service_role;
