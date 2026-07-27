-- ============================================
-- 账号用量统计 RPC（summary 聚合）
-- 执行: pnpm --filter @mxmai/mxmdata run migrate:account-usage-rpc
-- ============================================

CREATE OR REPLACE FUNCTION normalize_usage_display_scope(p_scope text)
RETURNS text AS $$
  SELECT CASE lower(coalesce(p_scope, ''))
    WHEN 'outline' THEN 'writing'
    WHEN 'image'   THEN 'graph'
    WHEN 'text'    THEN 'text'
    WHEN 'writing' THEN 'writing'
    WHEN 'graph'  THEN 'graph'
    WHEN 'video'  THEN 'video'
    WHEN 'audio'  THEN 'audio'
    WHEN 'music'  THEN 'music'
    ELSE 'text'
  END;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION account_get_usage_summary(
  p_user_id uuid,
  p_days int DEFAULT 30,
  p_source text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days int;
  v_since timestamptz;
  v_source text;
BEGIN
  v_days := LEAST(GREATEST(coalesce(p_days, 30), 1), 90);
  v_since := now() - (v_days || ' days')::interval;
  v_source := lower(coalesce(nullif(trim(p_source), ''), 'all'));
  IF v_source NOT IN ('all', 'web', 'open_api') THEN
    v_source := 'all';
  END IF;

  RETURN (
    WITH base AS (
      SELECT r.*
      FROM provider_usage_records r
      WHERE r.user_id = p_user_id
        AND r.created_at >= v_since
        AND (
          v_source = 'all'
          OR (v_source = 'web' AND coalesce(r.usage_source, 'web') <> 'open_api')
          OR (v_source = 'open_api' AND r.usage_source = 'open_api')
        )
    ),
    enriched AS (
      SELECT
        b.*,
        normalize_usage_display_scope(b.scope) AS display_scope,
        coalesce(b.request_count, 1)::numeric AS rc,
        CASE
          WHEN coalesce(b.total_tokens, 0) > 0 THEN b.total_tokens
          ELSE coalesce(b.input_tokens, 0) + coalesce(b.output_tokens, 0)
        END AS row_total_tokens,
        CASE WHEN coalesce(b.usage_source, 'web') = 'open_api' THEN 'open_api' ELSE 'web' END AS src
      FROM base b
    ),
    totals_row AS (
      SELECT
        COUNT(*)::bigint AS provider_call_count,
        coalesce(SUM(input_tokens), 0) AS input_tokens,
        coalesce(SUM(output_tokens), 0) AS output_tokens,
        coalesce(SUM(row_total_tokens), 0) AS total_tokens,
        coalesce(SUM(image_count), 0) AS image_count,
        coalesce(SUM(mxm_token_charged), 0) AS mxm_token_charged,
        coalesce(SUM(CASE WHEN display_scope = 'video' THEN rc ELSE 0 END), 0) AS video_requests,
        coalesce(SUM(CASE WHEN display_scope = 'audio' THEN rc ELSE 0 END), 0) AS audio_requests,
        coalesce(SUM(CASE WHEN display_scope = 'music' THEN rc ELSE 0 END), 0) AS music_requests
      FROM enriched
    ),
    by_source_rows AS (
      SELECT
        src,
        COUNT(*)::bigint AS provider_call_count,
        coalesce(SUM(input_tokens), 0) AS input_tokens,
        coalesce(SUM(output_tokens), 0) AS output_tokens,
        coalesce(SUM(row_total_tokens), 0) AS total_tokens,
        coalesce(SUM(image_count), 0) AS image_count,
        coalesce(SUM(mxm_token_charged), 0) AS mxm_token_charged,
        coalesce(SUM(CASE WHEN display_scope = 'video' THEN rc ELSE 0 END), 0) AS video_requests,
        coalesce(SUM(CASE WHEN display_scope = 'audio' THEN rc ELSE 0 END), 0) AS audio_requests,
        coalesce(SUM(CASE WHEN display_scope = 'music' THEN rc ELSE 0 END), 0) AS music_requests
      FROM enriched
      GROUP BY src
    ),
    by_scope_rows AS (
      SELECT
        display_scope AS scope,
        CASE WHEN display_scope IN ('text', 'writing') THEN 'token' ELSE 'count' END AS metric_kind,
        COUNT(*)::bigint AS provider_call_count,
        coalesce(SUM(input_tokens), 0) AS input_tokens,
        coalesce(SUM(output_tokens), 0) AS output_tokens,
        coalesce(SUM(row_total_tokens), 0) AS total_tokens,
        coalesce(SUM(image_count), 0) AS image_count,
        coalesce(SUM(rc), 0) AS request_count,
        coalesce(SUM(video_seconds), 0) AS video_seconds,
        coalesce(SUM(audio_seconds), 0) AS audio_seconds,
        coalesce(SUM(mxm_token_charged), 0) AS mxm_token_charged
      FROM enriched
      GROUP BY display_scope
    ),
    daily_rows AS (
      SELECT
        (created_at AT TIME ZONE 'UTC')::date AS stat_date,
        COUNT(*)::bigint AS provider_call_count,
        coalesce(SUM(input_tokens), 0) AS input_tokens,
        coalesce(SUM(output_tokens), 0) AS output_tokens,
        coalesce(SUM(image_count), 0) AS image_count,
        coalesce(SUM(mxm_token_charged), 0) AS mxm_token_charged,
        coalesce(SUM(CASE WHEN display_scope = 'video' THEN rc ELSE 0 END), 0) AS video_requests,
        coalesce(SUM(CASE WHEN display_scope = 'audio' THEN rc ELSE 0 END), 0) AS audio_requests,
        coalesce(SUM(CASE WHEN display_scope = 'music' THEN rc ELSE 0 END), 0) AS music_requests
      FROM enriched
      GROUP BY stat_date
    ),
    open_api_base AS (
      SELECT * FROM enriched WHERE src = 'open_api'
    ),
    slug_rows AS (
      SELECT
        trim(published_slug) AS slug,
        COUNT(*)::bigint AS call_count,
        coalesce(SUM(mxm_token_charged), 0) AS mxm_token_charged,
        coalesce(SUM(image_count), 0) AS image_count,
        coalesce(SUM(input_tokens), 0) AS input_tokens
      FROM open_api_base
      WHERE published_slug IS NOT NULL AND trim(published_slug) <> ''
      GROUP BY trim(published_slug)
      ORDER BY coalesce(SUM(mxm_token_charged), 0) DESC
    ),
    caller_rows AS (
      SELECT
        caller_user_id::text AS caller_user_id,
        coalesce(u.username, caller_user_id::text) AS username,
        COUNT(*)::bigint AS call_count,
        coalesce(SUM(o.mxm_token_charged), 0) AS mxm_token_charged
      FROM open_api_base o
      LEFT JOIN users u ON u.id = o.caller_user_id
      WHERE o.caller_user_id IS NOT NULL
      GROUP BY o.caller_user_id, u.username
      ORDER BY coalesce(SUM(o.mxm_token_charged), 0) DESC
    ),
    end_user_rows AS (
      SELECT
        end_user_id::text AS end_user_id,
        COUNT(*)::bigint AS call_count,
        coalesce(SUM(mxm_token_charged), 0) AS mxm_token_charged
      FROM open_api_base
      WHERE end_user_id IS NOT NULL
      GROUP BY end_user_id
      ORDER BY coalesce(SUM(mxm_token_charged), 0) DESC
    ),
    totals_json AS (
      SELECT jsonb_build_object(
        'mxmTokenCharged', mxm_token_charged,
        'inputTokens', input_tokens,
        'outputTokens', output_tokens,
        'totalTokens', total_tokens,
        'imageCount', image_count,
        'videoRequests', video_requests,
        'audioRequests', audio_requests,
        'musicRequests', music_requests,
        'providerCallCount', provider_call_count
      ) AS j
      FROM totals_row
    ),
    by_source_json AS (
      SELECT jsonb_build_object(
        'web', coalesce((
          SELECT jsonb_build_object(
            'mxmTokenCharged', mxm_token_charged,
            'inputTokens', input_tokens,
            'outputTokens', output_tokens,
            'totalTokens', total_tokens,
            'imageCount', image_count,
            'videoRequests', video_requests,
            'audioRequests', audio_requests,
            'musicRequests', music_requests,
            'providerCallCount', provider_call_count
          )
          FROM by_source_rows WHERE src = 'web'
        ), jsonb_build_object(
          'mxmTokenCharged', 0, 'inputTokens', 0, 'outputTokens', 0, 'totalTokens', 0,
          'imageCount', 0, 'videoRequests', 0, 'audioRequests', 0, 'musicRequests', 0, 'providerCallCount', 0
        )),
        'open_api', coalesce((
          SELECT jsonb_build_object(
            'mxmTokenCharged', mxm_token_charged,
            'inputTokens', input_tokens,
            'outputTokens', output_tokens,
            'totalTokens', total_tokens,
            'imageCount', image_count,
            'videoRequests', video_requests,
            'audioRequests', audio_requests,
            'musicRequests', music_requests,
            'providerCallCount', provider_call_count
          )
          FROM by_source_rows WHERE src = 'open_api'
        ), jsonb_build_object(
          'mxmTokenCharged', 0, 'inputTokens', 0, 'outputTokens', 0, 'totalTokens', 0,
          'imageCount', 0, 'videoRequests', 0, 'audioRequests', 0, 'musicRequests', 0, 'providerCallCount', 0
        ))
      ) AS j
    ),
    by_scope_json AS (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'scope', scope,
          'metricKind', metric_kind,
          'inputTokens', input_tokens,
          'outputTokens', output_tokens,
          'totalTokens', total_tokens,
          'imageCount', image_count,
          'requestCount', request_count,
          'videoSeconds', video_seconds,
          'audioSeconds', audio_seconds,
          'mxmTokenCharged', mxm_token_charged,
          'providerCallCount', provider_call_count
        )
        ORDER BY CASE scope
          WHEN 'text' THEN 1 WHEN 'writing' THEN 2 WHEN 'graph' THEN 3
          WHEN 'video' THEN 4 WHEN 'audio' THEN 5 WHEN 'music' THEN 6 ELSE 99 END
      ), '[]'::jsonb) AS j
      FROM by_scope_rows
    ),
    daily_json AS (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'date', to_char(stat_date, 'YYYY-MM-DD'),
          'mxmTokenCharged', mxm_token_charged,
          'inputTokens', input_tokens,
          'outputTokens', output_tokens,
          'imageCount', image_count,
          'videoRequests', video_requests,
          'audioRequests', audio_requests,
          'musicRequests', music_requests,
          'providerCallCount', provider_call_count
        )
        ORDER BY stat_date ASC
      ), '[]'::jsonb) AS j
      FROM daily_rows
    ),
    open_api_json AS (
      SELECT jsonb_build_object(
        'bySlug', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'slug', slug,
            'callCount', call_count,
            'mxmTokenCharged', mxm_token_charged,
            'imageCount', image_count,
            'inputTokens', input_tokens
          ) ORDER BY mxm_token_charged DESC)
          FROM slug_rows
        ), '[]'::jsonb),
        'byCaller', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'callerUserId', caller_user_id,
            'username', username,
            'callCount', call_count,
            'mxmTokenCharged', mxm_token_charged
          ) ORDER BY mxm_token_charged DESC)
          FROM caller_rows
        ), '[]'::jsonb),
        'byEndUser', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'endUserId', end_user_id,
            'callCount', call_count,
            'mxmTokenCharged', mxm_token_charged
          ) ORDER BY mxm_token_charged DESC)
          FROM end_user_rows
        ), '[]'::jsonb)
      ) AS j
    )
    SELECT jsonb_build_object(
      'totals', (SELECT j FROM totals_json),
      'bySource', (SELECT j FROM by_source_json),
      'byScope', (SELECT j FROM by_scope_json),
      'daily', (SELECT j FROM daily_json),
      'openApi', (SELECT j FROM open_api_json)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION account_get_usage_summary(uuid, int, text) TO service_role;
GRANT EXECUTE ON FUNCTION normalize_usage_display_scope(text) TO service_role;
