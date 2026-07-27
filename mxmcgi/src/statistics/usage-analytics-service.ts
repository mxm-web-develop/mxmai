import { getSupabaseClient } from '@mxmai/mxmdata';
import {
  normalizeScopeForDisplay,
  rawScopesForDisplayScope,
  type DisplayScope,
  type UsageSource,
} from './usage-context';

export type AccountUsageSourceFilter = 'all' | 'web' | 'open_api';

export interface AccountUsageTotals {
  mxmTokenCharged: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  imageCount: number;
  videoRequests: number;
  audioRequests: number;
  musicRequests: number;
  providerCallCount: number;
}

export interface AccountUsageByScopeRow {
  scope: DisplayScope;
  metricKind: 'token' | 'count';
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  imageCount: number;
  requestCount: number;
  videoSeconds: number;
  audioSeconds: number;
  mxmTokenCharged: number;
  providerCallCount: number;
}

export interface AccountUsageDailyRow {
  date: string;
  mxmTokenCharged: number;
  inputTokens: number;
  outputTokens: number;
  imageCount: number;
  videoRequests: number;
  audioRequests: number;
  musicRequests: number;
  providerCallCount: number;
}

export interface AccountUsageOpenApiSlice {
  bySlug: Array<{
    slug: string;
    callCount: number;
    mxmTokenCharged: number;
    imageCount: number;
    inputTokens: number;
  }>;
  byCaller: Array<{
    callerUserId: string;
    username?: string;
    callCount: number;
    mxmTokenCharged: number;
  }>;
  byEndUser: Array<{
    endUserId: string;
    callCount: number;
    mxmTokenCharged: number;
  }>;
}

export interface AccountUsageRecentRow {
  id: string;
  taskId: string | null;
  scope: string;
  displayScope: DisplayScope;
  usageSource: UsageSource;
  createdAt: string;
  mxmTokenCharged: number;
  inputTokens: number;
  outputTokens: number;
  imageCount: number;
  requestCount: number;
  publishedSlug: string | null;
  callerUserId: string | null;
  modelKey: string;
  provider: string;
}

export interface AccountUsageSummary {
  days: number;
  source: AccountUsageSourceFilter;
  totals: AccountUsageTotals;
  byScope: AccountUsageByScopeRow[];
  bySource: { web: AccountUsageTotals; open_api: AccountUsageTotals };
  daily: AccountUsageDailyRow[];
  openApi: AccountUsageOpenApiSlice;
  recent: AccountUsageRecentRow[];
}

export interface AccountUsageEventsPage {
  days: number;
  source: AccountUsageSourceFilter;
  scope?: DisplayScope;
  slug?: string;
  taskId?: string;
  page: number;
  limit: number;
  total: number;
  items: AccountUsageRecentRow[];
}

type UsageRow = {
  id: string;
  task_id: string | null;
  user_id: string | null;
  provider: string;
  scope: string;
  model_key: string;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  image_count: number | null;
  audio_seconds: number | null;
  video_seconds: number | null;
  request_count: number | null;
  usage_source: string | null;
  caller_user_id: string | null;
  published_slug: string | null;
  published_api_id: string | null;
  end_user_id: string | null;
  parent_task_id: string | null;
  mxm_token_charged: number | null;
  created_at: string;
};

const RECENT_SELECT =
  'id, task_id, user_id, provider, scope, model_key, input_tokens, output_tokens, total_tokens, image_count, request_count, usage_source, caller_user_id, published_slug, mxm_token_charged, created_at';

function emptyTotals(): AccountUsageTotals {
  return {
    mxmTokenCharged: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    imageCount: 0,
    videoRequests: 0,
    audioRequests: 0,
    musicRequests: 0,
    providerCallCount: 0,
  };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function rowSource(r: UsageRow): UsageSource {
  return r.usage_source === 'open_api' ? 'open_api' : 'web';
}

function mapUsageRowToRecent(r: UsageRow): AccountUsageRecentRow {
  return {
    id: r.id,
    taskId: r.task_id,
    scope: r.scope,
    displayScope: normalizeScopeForDisplay(r.scope),
    usageSource: rowSource(r),
    createdAt: r.created_at,
    mxmTokenCharged: num(r.mxm_token_charged),
    inputTokens: num(r.input_tokens),
    outputTokens: num(r.output_tokens),
    imageCount: num(r.image_count),
    requestCount: num(r.request_count) || 1,
    publishedSlug: r.published_slug,
    callerUserId: r.caller_user_id,
    modelKey: r.model_key,
    provider: r.provider,
  };
}

function parseTotals(raw: unknown): AccountUsageTotals {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    mxmTokenCharged: num(o.mxmTokenCharged),
    inputTokens: num(o.inputTokens),
    outputTokens: num(o.outputTokens),
    totalTokens: num(o.totalTokens),
    imageCount: num(o.imageCount),
    videoRequests: num(o.videoRequests),
    audioRequests: num(o.audioRequests),
    musicRequests: num(o.musicRequests),
    providerCallCount: num(o.providerCallCount),
  };
}

function parseByScope(raw: unknown): AccountUsageByScopeRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const o = item as Record<string, unknown>;
    const scope = normalizeScopeForDisplay(String(o.scope ?? 'text'));
    return {
      scope,
      metricKind: scope === 'text' || scope === 'writing' ? 'token' : 'count',
      inputTokens: num(o.inputTokens),
      outputTokens: num(o.outputTokens),
      totalTokens: num(o.totalTokens),
      imageCount: num(o.imageCount),
      requestCount: num(o.requestCount),
      videoSeconds: num(o.videoSeconds),
      audioSeconds: num(o.audioSeconds),
      mxmTokenCharged: num(o.mxmTokenCharged),
      providerCallCount: num(o.providerCallCount),
    };
  });
}

function parseDaily(raw: unknown): AccountUsageDailyRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const o = item as Record<string, unknown>;
    return {
      date: String(o.date ?? ''),
      mxmTokenCharged: num(o.mxmTokenCharged),
      inputTokens: num(o.inputTokens),
      outputTokens: num(o.outputTokens),
      imageCount: num(o.imageCount),
      videoRequests: num(o.videoRequests),
      audioRequests: num(o.audioRequests),
      musicRequests: num(o.musicRequests),
      providerCallCount: num(o.providerCallCount),
    };
  });
}

function parseOpenApi(raw: unknown): AccountUsageOpenApiSlice {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const mapSlug = (items: unknown) =>
    Array.isArray(items)
      ? items.map((item) => {
          const s = item as Record<string, unknown>;
          return {
            slug: String(s.slug ?? ''),
            callCount: num(s.callCount),
            mxmTokenCharged: num(s.mxmTokenCharged),
            imageCount: num(s.imageCount),
            inputTokens: num(s.inputTokens),
          };
        })
      : [];
  const mapCaller = (items: unknown) =>
    Array.isArray(items)
      ? items.map((item) => {
          const c = item as Record<string, unknown>;
          return {
            callerUserId: String(c.callerUserId ?? ''),
            username: c.username != null ? String(c.username) : undefined,
            callCount: num(c.callCount),
            mxmTokenCharged: num(c.mxmTokenCharged),
          };
        })
      : [];
  const mapEndUser = (items: unknown) =>
    Array.isArray(items)
      ? items.map((item) => {
          const e = item as Record<string, unknown>;
          return {
            endUserId: String(e.endUserId ?? ''),
            callCount: num(e.callCount),
            mxmTokenCharged: num(e.mxmTokenCharged),
          };
        })
      : [];
  return {
    bySlug: mapSlug(o.bySlug),
    byCaller: mapCaller(o.byCaller),
    byEndUser: mapEndUser(o.byEndUser),
  };
}

function parseRpcSummary(raw: unknown): Omit<AccountUsageSummary, 'days' | 'source' | 'recent'> {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const bySourceRaw = (o.bySource && typeof o.bySource === 'object' ? o.bySource : {}) as Record<
    string,
    unknown
  >;
  return {
    totals: parseTotals(o.totals),
    byScope: parseByScope(o.byScope),
    bySource: {
      web: parseTotals(bySourceRaw.web),
      open_api: parseTotals(bySourceRaw.open_api),
    },
    daily: parseDaily(o.daily),
    openApi: parseOpenApi(o.openApi),
  };
}

function sinceIso(days: number): string {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  return since.toISOString();
}

function applySourceFilter<T extends { eq: (col: string, val: string) => T }>(
  q: T,
  source: AccountUsageSourceFilter
): T {
  if (source === 'web') return q.eq('usage_source', 'web');
  if (source === 'open_api') return q.eq('usage_source', 'open_api');
  return q;
}

export class UsageAnalyticsService {
  static async getSummary(params: {
    userId: string;
    days?: number;
    source?: AccountUsageSourceFilter;
    recentLimit?: number;
  }): Promise<AccountUsageSummary> {
    const days = Math.min(Math.max(params.days ?? 30, 1), 90);
    const source = params.source ?? 'all';
    const recentLimit = Math.min(Math.max(params.recentLimit ?? 20, 1), 100);

    const supabase = getSupabaseClient();
    const { data: rpcData, error: rpcErr } = await supabase.rpc('account_get_usage_summary', {
      p_user_id: params.userId,
      p_days: days,
      p_source: source,
    });

    if (rpcErr) {
      const hint =
        rpcErr.message?.includes('account_get_usage_summary') ||
        rpcErr.code === 'PGRST202'
          ? '（请先执行 pnpm --filter @mxmai/mxmdata run migrate:account-usage-rpc）'
          : '';
      throw new Error(`usage summary RPC failed: ${rpcErr.message}${hint}`);
    }

    const parsed = parseRpcSummary(rpcData);

    let recentQ = supabase
      .from('provider_usage_records')
      .select(RECENT_SELECT)
      .eq('user_id', params.userId)
      .gte('created_at', sinceIso(days))
      .order('created_at', { ascending: false })
      .limit(recentLimit);

    recentQ = applySourceFilter(recentQ, source);

    const { data: recentRows, error: recentErr } = await recentQ;
    if (recentErr) {
      throw new Error(`usage recent query failed: ${recentErr.message}`);
    }

    const recent = ((recentRows ?? []) as UsageRow[]).map(mapUsageRowToRecent);

    return {
      days,
      source,
      ...parsed,
      recent,
    };
  }

  static async listEvents(params: {
    userId: string;
    days?: number;
    source?: AccountUsageSourceFilter;
    scope?: DisplayScope;
    slug?: string;
    taskId?: string;
    page?: number;
    limit?: number;
  }): Promise<AccountUsageEventsPage> {
    const days = Math.min(Math.max(params.days ?? 30, 1), 90);
    const source = params.source ?? 'all';
    const page = Math.max(params.page ?? 1, 1);
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const offset = (page - 1) * limit;

    const supabase = getSupabaseClient();
    let q = supabase
      .from('provider_usage_records')
      .select(RECENT_SELECT, { count: 'exact' })
      .eq('user_id', params.userId)
      .gte('created_at', sinceIso(days))
      .order('created_at', { ascending: false });

    q = applySourceFilter(q, source);

    if (params.scope) {
      q = q.in('scope', rawScopesForDisplayScope(params.scope));
    }
    if (params.slug?.trim()) {
      q = q.eq('published_slug', params.slug.trim());
    }
    if (params.taskId?.trim()) {
      q = q.eq('task_id', params.taskId.trim());
    }

    const { data, error, count } = await q.range(offset, offset + limit - 1);
    if (error) {
      throw new Error(`usage events query failed: ${error.message}`);
    }

    const items = ((data ?? []) as UsageRow[]).map(mapUsageRowToRecent);

    return {
      days,
      source,
      scope: params.scope,
      slug: params.slug?.trim() || undefined,
      taskId: params.taskId?.trim() || undefined,
      page,
      limit,
      total: count ?? items.length,
      items,
    };
  }

  /** BillingService 扣费后回写 mxm_token_charged */
  static async backfillMxmTokenCharged(
    taskId: string,
    scope: string,
    tokensCharged: number
  ): Promise<void> {
    if (!taskId || tokensCharged <= 0) return;
    try {
      const supabase = getSupabaseClient();
      const { data: rows, error: selErr } = await supabase
        .from('provider_usage_records')
        .select('id, mxm_token_charged')
        .eq('task_id', taskId)
        .eq('scope', scope)
        .order('created_at', { ascending: false })
        .limit(1);
      if (selErr || !rows?.length) return;
      const row = rows[0] as { id: string; mxm_token_charged: number | null };
      const next = num(row.mxm_token_charged) + tokensCharged;
      await supabase.from('provider_usage_records').update({ mxm_token_charged: next }).eq('id', row.id);
    } catch (e) {
      console.warn(
        '[UsageAnalytics] backfill mxm_token_charged failed:',
        e instanceof Error ? e.message : e
      );
    }
  }
}

/** @internal exported for unit tests */
export const __usageAnalyticsTestUtils = {
  parseRpcSummary,
  parseTotals,
};
