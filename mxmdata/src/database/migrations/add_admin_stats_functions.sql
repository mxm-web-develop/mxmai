-- Admin 统计用 RPC 函数：每日任务用量、用量 Top N 用户

-- 每日任务用量（最近 N 天，按 created_at 日期分组）
CREATE OR REPLACE FUNCTION admin_get_daily_task_stats(p_days int DEFAULT 30)
RETURNS TABLE (stat_date date, task_count bigint) AS $$
BEGIN
  RETURN QUERY
  SELECT
    created_at::date AS stat_date,
    COUNT(*)::bigint AS task_count
  FROM cgi_tasks
  WHERE deleted_at IS NULL
    AND created_at >= CURRENT_DATE - (p_days || ' days')::interval
  GROUP BY created_at::date
  ORDER BY stat_date DESC
  LIMIT p_days;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 用量 Top N 用户（含 username，user_id 可能是 uuid 字符串）
CREATE OR REPLACE FUNCTION admin_get_top_users_by_usage(p_limit int DEFAULT 10)
RETURNS TABLE (user_id text, username text, task_count bigint) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.user_id::text,
    COALESCE(u.username, t.user_id::text)::text AS username,
    COUNT(*)::bigint AS task_count
  FROM cgi_tasks t
  LEFT JOIN users u ON u.id::text = t.user_id
  WHERE t.deleted_at IS NULL
  GROUP BY t.user_id, u.username
  ORDER BY task_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
