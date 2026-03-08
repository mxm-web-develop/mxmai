/**
 * Provider 调用统计与稳定性指标
 * 用于 admin 查看各通道错误率、平均耗时等（仅 admin 可查）
 */

import { ProviderType } from './types';
import { getSupabaseClient } from '@mxmai/mxmdata';

export interface ProviderStatsRecord {
  provider: ProviderType;
  /** 逻辑或物理模型名 */
  logicalModel: string;
  success: boolean;
  latencyMs: number;
  errorCode?: string;
  ts: number;
}

export interface ProviderStatsAggregate {
  provider: ProviderType;
  /** 可选：部分 provider 的子服务标识 */
  service?: string;
  requestCount: number;
  successCount: number;
  errorRate: number;
  avgLatencyMs: number;
  p50LatencyMs?: number;
  p95LatencyMs?: number;
  window: string;
  /** 主要错误类型及次数 */
  errorDistribution?: Record<string, number>;
}

// 为了在 Supabase 持久化失败时仍能提供近期数据，这里同时保留一份内存缓存
const MAX_RECORDS = 50000;
const RECORDS: ProviderStatsRecord[] = [];

function prune(): void {
  if (RECORDS.length <= MAX_RECORDS) return;
  RECORDS.sort((a, b) => a.ts - b.ts);
  const toRemove = RECORDS.length - MAX_RECORDS;
  RECORDS.splice(0, toRemove);
}

/**
 * 记录一次 Provider 调用
 */
export function recordStats(entry: Omit<ProviderStatsRecord, 'ts'>): void {
  // 1) 写入内存缓存（用于兜底）
  RECORDS.push({ ...entry, ts: Date.now() });
  if (RECORDS.length > MAX_RECORDS) prune();

  // 2) 异步写入 Supabase，持久化统计数据（不中断主流程）
  void (async () => {
    try {
      const supabase = getSupabaseClient();
      const payload: Record<string, any> = {
        provider: entry.provider,
        logical_model: entry.logicalModel,
        success: entry.success,
        latency_ms: entry.latencyMs,
        error_code: entry.errorCode ?? null,
      };
      const { error } = await supabase.from('provider_call_stats').insert(payload);
      if (error) {
        console.warn('[ProviderStats] 写入 provider_call_stats 失败（仅影响监控，不影响业务）:', {
          code: error.code,
          message: error.message,
          details: error.details,
          provider: entry.provider,
          logicalModel: entry.logicalModel,
        });
      }
    } catch (e) {
      console.warn('[ProviderStats] 持久化 Provider 调用统计失败（仅影响监控，不影响业务）:', e instanceof Error ? e.message : String(e));
    }
  })();
}

/**
 * 解析时间窗口为毫秒数
 */
function parseWindow(window: string): number {
  const m = window.match(/^(\d+)(m|h|d)$/i);
  if (!m) return 60 * 60 * 1000; // 默认 1h
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  if (unit === 'm') return n * 60 * 1000;
  if (unit === 'h') return n * 60 * 60 * 1000;
  if (unit === 'd') return n * 24 * 60 * 60 * 1000;
  return 60 * 60 * 1000;
}

/**
 * 基于若干记录聚合统计（供内存 / DB 两种来源复用）
 */
function aggregate(records: ProviderStatsRecord[], windowLabel: string, providerFilter?: ProviderType): ProviderStatsAggregate[] {
  const filtered = records.filter(
    (r) => providerFilter == null || r.provider === providerFilter,
  );
  const byKey = new Map<string, ProviderStatsRecord[]>();
  for (const r of filtered) {
    const key = r.provider;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(r);
  }
  const result: ProviderStatsAggregate[] = [];
  for (const [provider, list] of byKey.entries()) {
    const successCount = list.filter((r) => r.success).length;
    const latencies = list.map((r) => r.latencyMs).sort((a, b) => a - b);
    const p50 = latencies.length ? latencies[Math.floor(latencies.length * 0.5)] : undefined;
    const p95 = latencies.length ? latencies[Math.floor(latencies.length * 0.95)] : undefined;
    const errDist: Record<string, number> = {};
    for (const r of list) {
      if (!r.success && r.errorCode) {
        errDist[r.errorCode] = (errDist[r.errorCode] || 0) + 1;
      }
    }
    result.push({
      provider: provider as ProviderType,
      requestCount: list.length,
      successCount,
      errorRate: list.length ? 1 - successCount / list.length : 0,
      avgLatencyMs: list.length ? list.reduce((s, r) => s + r.latencyMs, 0) / list.length : 0,
      p50LatencyMs: p50,
      p95LatencyMs: p95,
      window: windowLabel,
      errorDistribution: Object.keys(errDist).length ? errDist : undefined,
    });
  }
  return result;
}

/**
 * 查询聚合统计（仅 admin 可调用），从数据库中读取，失败时回退到内存缓存。
 * @param provider 可选，按 provider 过滤
 * @param window 时间窗口，如 '5m', '1h', '24h'
 */
export async function getProviderStats(
  options: { provider?: ProviderType; window?: string } = {}
): Promise<ProviderStatsAggregate[]> {
  const windowLabel = options.window || '1h';
  const windowMs = parseWindow(windowLabel);
  const since = new Date(Date.now() - windowMs).toISOString();

  try {
    const supabase = getSupabaseClient();
    let query = supabase
      .from('provider_call_stats')
      .select('provider, logical_model, success, latency_ms, error_code, created_at')
      .gte('created_at', since);

    if (options.provider) {
      query = query.eq('provider', options.provider);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('[ProviderStats] 查询 provider_call_stats 失败，回退到内存缓存:', {
        code: error.code,
        message: error.message,
        details: error.details,
      });
      // 回退：仅使用当前进程内存中的记录
      const sinceTs = Date.now() - windowMs;
      const recent = RECORDS.filter((r) => r.ts >= sinceTs);
      return aggregate(recent, windowLabel, options.provider);
    }

    const rows = (data || []) as Array<{
      provider: ProviderType;
      logical_model: string;
      success: boolean;
      latency_ms: number;
      error_code?: string | null;
      created_at?: string;
    }>;

    if (!rows.length) {
      return [];
    }

    const records: ProviderStatsRecord[] = rows.map((r) => ({
      provider: r.provider,
      logicalModel: r.logical_model,
      success: r.success,
      latencyMs: Number(r.latency_ms) || 0,
      errorCode: r.error_code ?? undefined,
      ts: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    }));

    return aggregate(records, windowLabel, options.provider);
  } catch (e) {
    console.warn('[ProviderStats] 查询 Provider 调用统计异常，回退到内存缓存:', e instanceof Error ? e.message : String(e));
    const windowMsFallback = parseWindow(windowLabel);
    const sinceTs = Date.now() - windowMsFallback;
    const recent = RECORDS.filter((r) => r.ts >= sinceTs);
    return aggregate(recent, windowLabel, options.provider);
  }
}
