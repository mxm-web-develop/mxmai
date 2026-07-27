import type {
  IPublishedApiUsageRepository,
  CreatePublishedApiUsageDto,
  PublishedApiUsageEvent,
  PublishedApiUsageStats,
  PublishedApiUsageStatsQuery,
  PublishedApiUsageDailyRow,
  PublishedApiUsageBySlugRow,
  PublishedApiUsageByOwnerRow,
  PublishedApiUsageByCallerRow,
  PublishedApiUsageByEndUserRow,
  PublishedApiUsageRecentEvent,
  OpenApiJobListItem,
} from '../../interfaces/IPublishedApiUsageRepository';
import { maskCnPhone } from '../../utils/mask-phone';
import { DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

const TABLE = 'published_api_usage_events';
const DEFAULT_RECENT_LIMIT = 40;

type UsageRow = {
  published_api_id: string;
  slug: string;
  status: string;
  tokens_charged: number | string;
  created_at: string;
  caller_user_id: string | null;
  owner_user_id?: string;
  end_user_id?: string | null;
  partner_app_id?: string | null;
  job_id?: string;
  kind?: string;
};

function toEvent(row: any): PublishedApiUsageEvent {
  return {
    id: row.id,
    published_api_id: row.published_api_id,
    slug: row.slug,
    owner_user_id: row.owner_user_id,
    caller_user_id: row.caller_user_id ?? null,
    partner_app_id: row.partner_app_id ?? null,
    end_user_id: row.end_user_id ?? null,
    job_id: row.job_id,
    kind: row.kind,
    status: row.status,
    title: row.title != null ? String(row.title) : null,
    tokens_charged: Number(row.tokens_charged ?? 0),
    error_message: row.error_message ?? null,
    created_at: row.created_at,
    completed_at: row.completed_at ?? null,
  };
}

function aggregateUsageRows(list: UsageRow[]) {
  let totalCalls = 0;
  let completedCalls = 0;
  let failedCalls = 0;
  let pendingCalls = 0;
  let totalTokensCharged = 0;
  const dailyMap = new Map<string, { call_count: number; tokens_charged: number }>();
  const apiMap = new Map<
    string,
    { slug: string; call_count: number; tokens_charged: number; last_called_at: string | null }
  >();
  const ownerMap = new Map<
    string,
    { call_count: number; tokens_charged: number; last_called_at: string | null }
  >();
  const callerMap = new Map<
    string,
    { call_count: number; tokens_charged: number; last_called_at: string | null }
  >();
  const endUserMap = new Map<
    string,
    { call_count: number; tokens_charged: number; last_called_at: string | null; partner_app_id: string | null }
  >();

  for (const r of list) {
    totalCalls += 1;
    const st = String(r.status);
    if (st === 'completed') completedCalls += 1;
    else if (st === 'failed') failedCalls += 1;
    else pendingCalls += 1;
    const tok = Number(r.tokens_charged ?? 0);
    totalTokensCharged += tok;

    const day = String(r.created_at).slice(0, 10);
    const d = dailyMap.get(day) ?? { call_count: 0, tokens_charged: 0 };
    d.call_count += 1;
    d.tokens_charged += tok;
    dailyMap.set(day, d);

    const apiId = r.published_api_id as string;
    const a = apiMap.get(apiId) ?? {
      slug: r.slug as string,
      call_count: 0,
      tokens_charged: 0,
      last_called_at: null,
    };
    a.call_count += 1;
    a.tokens_charged += tok;
    const created = String(r.created_at);
    if (!a.last_called_at || created > a.last_called_at) a.last_called_at = created;
    apiMap.set(apiId, a);

    if (r.owner_user_id) {
      const oid = String(r.owner_user_id);
      const o = ownerMap.get(oid) ?? { call_count: 0, tokens_charged: 0, last_called_at: null };
      o.call_count += 1;
      o.tokens_charged += tok;
      if (!o.last_called_at || created > o.last_called_at) o.last_called_at = created;
      ownerMap.set(oid, o);
    }

    const callerId = r.caller_user_id ? String(r.caller_user_id) : '__anonymous__';
    const c = callerMap.get(callerId) ?? { call_count: 0, tokens_charged: 0, last_called_at: null };
    c.call_count += 1;
    c.tokens_charged += tok;
    if (!c.last_called_at || created > c.last_called_at) c.last_called_at = created;
    callerMap.set(callerId, c);

    if (r.end_user_id) {
      const eid = String(r.end_user_id);
      const eu = endUserMap.get(eid) ?? {
        call_count: 0,
        tokens_charged: 0,
        last_called_at: null,
        partner_app_id: r.partner_app_id ? String(r.partner_app_id) : null,
      };
      eu.call_count += 1;
      eu.tokens_charged += tok;
      if (!eu.last_called_at || created > eu.last_called_at) eu.last_called_at = created;
      endUserMap.set(eid, eu);
    }
  }

  const daily: PublishedApiUsageDailyRow[] = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, call_count: v.call_count, tokens_charged: v.tokens_charged }));

  return {
    totalCalls,
    completedCalls,
    failedCalls,
    pendingCalls,
    totalTokensCharged,
    daily,
    apiMap,
    ownerMap,
    callerMap,
    endUserMap,
  };
}

export class SupabasePublishedApiUsageRepository implements IPublishedApiUsageRepository {
  private client = getSupabaseClient();

  async create(data: CreatePublishedApiUsageDto): Promise<PublishedApiUsageEvent> {
    const row = {
      published_api_id: data.publishedApiId,
      slug: data.slug,
      owner_user_id: data.ownerUserId,
      caller_user_id: data.callerUserId ?? null,
      partner_app_id: data.partnerAppId ?? null,
      end_user_id: data.endUserId ?? null,
      job_id: data.jobId,
      kind: data.kind,
      status: 'pending',
      tokens_charged: 0,
      title: data.title?.trim() ? data.title.trim().slice(0, 256) : null,
    };
    const { data: inserted, error } = await this.client.from(TABLE).insert(row).select().single();
    if (error) {
      throw new DataAccessError(`published_api_usage_events create failed: ${error.message}`, 'INSERT_ERROR', error);
    }
    return toEvent(inserted);
  }

  async findByJobId(jobId: string): Promise<PublishedApiUsageEvent | null> {
    const { data, error } = await this.client.from(TABLE).select('*').eq('job_id', jobId).maybeSingle();
    if (error) throw new DataAccessError(`usage findByJobId failed: ${error.message}`, 'QUERY_ERROR', error);
    return data ? toEvent(data) : null;
  }

  async markCompleted(jobId: string, tokensCharged: number): Promise<PublishedApiUsageEvent | null> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from(TABLE)
      .update({
        status: 'completed',
        tokens_charged: tokensCharged,
        completed_at: now,
      })
      .eq('job_id', jobId)
      .select()
      .maybeSingle();
    if (error) throw new DataAccessError(`usage markCompleted failed: ${error.message}`, 'UPDATE_ERROR', error);
    return data ? toEvent(data) : null;
  }

  async markFailed(jobId: string, errorMessage?: string): Promise<PublishedApiUsageEvent | null> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from(TABLE)
      .update({
        status: 'failed',
        error_message: errorMessage ?? null,
        completed_at: now,
      })
      .eq('job_id', jobId)
      .select()
      .maybeSingle();
    if (error) throw new DataAccessError(`usage markFailed failed: ${error.message}`, 'UPDATE_ERROR', error);
    return data ? toEvent(data) : null;
  }

  async getStats(query: PublishedApiUsageStatsQuery): Promise<PublishedApiUsageStats> {
    const days = Math.min(Math.max(query.days ?? 30, 1), 90);
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    const sinceIso = since.toISOString();
    const isAdminGlobal = query.admin === true && !query.ownerUserId;

    const selectCols =
      'published_api_id, slug, status, tokens_charged, created_at, caller_user_id, owner_user_id, job_id, kind, end_user_id, partner_app_id';

    let q = this.client.from(TABLE).select(selectCols).gte('created_at', sinceIso);

    if (!isAdminGlobal) {
      if (!query.ownerUserId) {
        throw new DataAccessError('getStats requires ownerUserId unless admin=true', 'VALIDATION_ERROR');
      }
      q = q.eq('owner_user_id', query.ownerUserId);
    }

    if (query.publishedApiId) q = q.eq('published_api_id', query.publishedApiId);
    if (query.slug) q = q.eq('slug', query.slug);

    const { data: rows, error } = await q;
    if (error) throw new DataAccessError(`usage getStats failed: ${error.message}`, 'QUERY_ERROR', error);

    const list = (rows ?? []) as UsageRow[];
    const agg = aggregateUsageRows(list);

    const apiIds = [...agg.apiMap.keys()];
    const titleById = new Map<string, string>();
    const scopeById = new Map<string, string | null>();
    if (apiIds.length > 0) {
      const { data: apis } = await this.client
        .from('published_apis')
        .select('id, title, task_v2_scope')
        .in('id', apiIds);
      for (const a of apis ?? []) {
        titleById.set(a.id, a.title);
        scopeById.set(a.id, a.task_v2_scope ?? null);
      }
    }

    const byApi: PublishedApiUsageBySlugRow[] = [...agg.apiMap.entries()].map(([published_api_id, v]) => ({
      published_api_id,
      slug: v.slug,
      title: titleById.get(published_api_id),
      call_count: v.call_count,
      tokens_charged: v.tokens_charged,
      last_called_at: v.last_called_at,
    }));
    byApi.sort((a, b) => b.tokens_charged - a.tokens_charged);

    const userIds = new Set<string>();
    for (const oid of agg.ownerMap.keys()) userIds.add(oid);
    for (const cid of agg.callerMap.keys()) {
      if (cid !== '__anonymous__') userIds.add(cid);
    }
    const usernameById = new Map<string, string>();
    if (userIds.size > 0) {
      const { data: users } = await this.client
        .from('users')
        .select('id, username')
        .in('id', [...userIds]);
      for (const u of users ?? []) {
        usernameById.set(u.id, u.username ?? u.id);
      }
    }

    const endUserIds = [...agg.endUserMap.keys()];
    const phoneByEndUser = new Map<string, string>();
    const displayByEndUser = new Map<string, string>();
    const kindByEndUser = new Map<string, string>();
    if (endUserIds.length > 0) {
      const { data: identities } = await this.client
        .from('partner_end_user_identities')
        .select('end_user_id, provider_subject')
        .eq('provider', 'sms')
        .in('end_user_id', endUserIds);
      for (const row of identities ?? []) {
        phoneByEndUser.set(String(row.end_user_id), String(row.provider_subject));
      }
      const { data: endUsers } = await this.client
        .from('partner_end_users')
        .select('id, display_name, kind')
        .in('id', endUserIds);
      for (const row of endUsers ?? []) {
        displayByEndUser.set(String(row.id), row.display_name != null ? String(row.display_name) : '');
        kindByEndUser.set(String(row.id), String(row.kind ?? ''));
      }
    }

    const byEndUser: PublishedApiUsageByEndUserRow[] = [...agg.endUserMap.entries()]
      .map(([end_user_id, v]) => {
        const phone = phoneByEndUser.get(end_user_id) ?? null;
        return {
          end_user_id,
          call_count: v.call_count,
          tokens_charged: v.tokens_charged,
          last_called_at: v.last_called_at,
          phone,
          phone_masked: phone ? maskCnPhone(phone) : null,
          display_name: displayByEndUser.get(end_user_id) || null,
          user_kind: kindByEndUser.get(end_user_id) || null,
        };
      })
      .sort((a, b) => b.tokens_charged - a.tokens_charged);

    const byOwner: PublishedApiUsageByOwnerRow[] | undefined = isAdminGlobal
      ? [...agg.ownerMap.entries()]
          .map(([owner_user_id, v]) => ({
            owner_user_id,
            username: usernameById.get(owner_user_id),
            call_count: v.call_count,
            tokens_charged: v.tokens_charged,
            last_called_at: v.last_called_at,
          }))
          .sort((a, b) => b.tokens_charged - a.tokens_charged)
      : undefined;

    const byCaller: PublishedApiUsageByCallerRow[] = [...agg.callerMap.entries()]
      .map(([callerKey, v]) => {
        const caller_user_id = callerKey === '__anonymous__' ? '' : callerKey;
        return {
          caller_user_id,
          username: callerKey === '__anonymous__' ? undefined : usernameById.get(callerKey),
          call_count: v.call_count,
          tokens_charged: v.tokens_charged,
          last_called_at: v.last_called_at,
        };
      })
      .sort((a, b) => b.tokens_charged - a.tokens_charged);

    const recentLimit = Math.min(Math.max(query.recentLimit ?? DEFAULT_RECENT_LIMIT, 1), 100);
    const recentSorted = [...list].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const recentEvents: PublishedApiUsageRecentEvent[] = recentSorted.slice(0, recentLimit).map((r) => {
      const eid = r.end_user_id ? String(r.end_user_id) : null;
      const phone = eid ? phoneByEndUser.get(eid) ?? null : null;
      return {
      job_id: String(r.job_id ?? ''),
      slug: String(r.slug),
      published_api_id: String(r.published_api_id),
      caller_user_id: r.caller_user_id ?? null,
      owner_user_id: String(r.owner_user_id ?? ''),
      end_user_id: eid,
      end_user_phone: phone,
      status: r.status as PublishedApiUsageRecentEvent['status'],
      tokens_charged: Number(r.tokens_charged ?? 0),
      created_at: String(r.created_at),
      kind: (r.kind ?? 'task_v2') as PublishedApiUsageRecentEvent['kind'],
      task_v2_scope: scopeById.get(String(r.published_api_id)) ?? null,
      title: titleById.get(String(r.published_api_id)),
    };
    });

    return {
      days,
      totalCalls: agg.totalCalls,
      completedCalls: agg.completedCalls,
      failedCalls: agg.failedCalls,
      pendingCalls: agg.pendingCalls,
      totalTokensCharged: agg.totalTokensCharged,
      daily: agg.daily,
      byApi,
      byOwner,
      byCaller,
      byEndUser: byEndUser.length > 0 ? byEndUser : undefined,
      recentEvents,
    };
  }

  async listJobsByEndUser(query: {
    partnerAppId: string;
    endUserId: string;
    slug?: string;
    slugIn?: string[];
    limit?: number;
    offset?: number;
  }): Promise<OpenApiJobListItem[]> {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const offset = Math.max(query.offset ?? 0, 0);
    let q = this.client
      .from(TABLE)
      .select('job_id, slug, status, kind, title, created_at, completed_at')
      .eq('partner_app_id', query.partnerAppId)
      .eq('end_user_id', query.endUserId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (query.slug) q = q.eq('slug', query.slug);
    if (query.slugIn?.length) q = q.in('slug', query.slugIn);
    const { data, error } = await q;
    if (error) {
      throw new DataAccessError(`usage listJobsByEndUser failed: ${error.message}`, 'QUERY_ERROR', error);
    }
    return (data ?? []).map((r) => ({
      job_id: String(r.job_id),
      slug: String(r.slug),
      status: r.status as OpenApiJobListItem['status'],
      kind: r.kind as OpenApiJobListItem['kind'],
      title: r.title != null ? String(r.title) : null,
      created_at: String(r.created_at),
      completed_at: r.completed_at != null ? String(r.completed_at) : null,
    }));
  }

  async countCallsByEndUserToday(partnerAppId: string, endUserId: string): Promise<number> {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const { count, error } = await this.client
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('partner_app_id', partnerAppId)
      .eq('end_user_id', endUserId)
      .gte('created_at', start.toISOString());
    if (error) {
      throw new DataAccessError(`usage countCallsByEndUserToday failed: ${error.message}`, 'QUERY_ERROR', error);
    }
    return count ?? 0;
  }
}
