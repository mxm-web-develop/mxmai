import type { SearchProvider } from './base';
import type {
  ProviderSearchRequest,
  DimensionSearchResult,
  SearchDimension,
} from '../types';
import {
  getSearchProviderConfig,
  isRateLimitSignal,
  listApiKeysInPriority,
  promoteApiKeyAndPersist,
} from '../search-config';

/**
 * 端点策略：
 * 1) 数眼智能「搜索阅读」网关（国内常见转售）：POST /v1/search
 * 2) 博查官方 Web Search：POST /v1/web-search
 *
 * 注意：数眼「AI 模型」主站 platform.shuyanai.com / cloud.shuyanai.com
 * 不能用于搜索；搜索专用 Base 为 api.shuyanai.com，且须用「搜索阅读产品」Key。
 */
const DEFAULT_ENDPOINTS: Array<{
  url: string;
  style: 'shuyan' | 'bocha';
}> = [
  { url: 'https://api.shuyanai.com/v1/search', style: 'shuyan' },
  { url: 'https://api.bocha.cn/v1/web-search', style: 'bocha' },
  { url: 'https://api.bochaai.com/v1/web-search', style: 'bocha' },
];

type WebPageItem = {
  name?: string;
  title?: string;
  url?: string;
  snippet?: string;
  summary?: string;
  siteName?: string;
  datePublished?: string;
  dateLastCrawled?: string;
};

/**
 * 博查 / 数眼搜索网关 Provider（Admin 名仍为 bocha）
 */
export class BochaSearchProvider implements SearchProvider {
  readonly name = 'bocha';
  readonly supportedDimensions: SearchDimension[] = ['general', 'news', 'academic', 'forum'];

  async search(request: ProviderSearchRequest): Promise<DimensionSearchResult> {
    const { query, numResults, timeRange, includeDomains } = request;

    try {
      const cfg = await getSearchProviderConfig('bocha');
      const keys = listApiKeysInPriority('bocha');
      if (keys.length === 0) {
        console.warn('[BochaSearch] No API key configured');
        return this.createEmptyResult(query);
      }

      const endpoints = this.resolveEndpoints(cfg.extra);
      let lastError = '';

      for (let attempt = 0; attempt < keys.length; attempt++) {
        const apiKey = keys[attempt]!;
        const outcome = await this.requestWithKey(apiKey, endpoints, {
          query,
          numResults: Math.min(50, Math.max(1, numResults || 10)),
          timeRange,
          includeDomains,
        });

        if (outcome.ok) {
          if (attempt > 0) {
            console.info(
              `[BochaSearch] key#${attempt + 1}/${keys.length} 成功，提升为优先级第一`
            );
            promoteApiKeyAndPersist('bocha', apiKey);
          }
          const items = outcome.items.map((item) => ({
            title: item.name || item.title || '',
            url: item.url || '',
            snippet: item.summary || item.snippet || '',
            domain: this.extractDomain(item.url || ''),
            publishedAt: item.datePublished || item.dateLastCrawled,
            source: this.name,
          }));
          return {
            dimension: 'general',
            provider: this.name,
            items,
            total: items.length,
            query,
            timestamp: new Date().toISOString(),
          };
        }

        lastError = outcome.error;
        if (this.isRetryableKeyError(outcome.error) && attempt + 1 < keys.length) {
          console.warn(
            `[BochaSearch] key#${attempt + 1}/${keys.length} 失败（${outcome.error.slice(0, 80)}），立即切换下一优先级 Key`
          );
          continue;
        }
        return this.createEmptyResult(query, lastError);
      }

      return this.createEmptyResult(query, lastError || undefined);
    } catch (error) {
      console.error('[BochaSearch] Search failed:', error);
      const msg = error instanceof Error ? error.message : String(error);
      return this.createEmptyResult(query, msg);
    }
  }

  async healthCheck(): Promise<boolean> {
    const cfg = await getSearchProviderConfig('bocha');
    const keys = listApiKeysInPriority('bocha');
    if (keys.length === 0) return false;
    const endpoints = this.resolveEndpoints(cfg.extra);

    for (let i = 0; i < keys.length; i++) {
      const apiKey = keys[i]!;
      const outcome = await this.requestWithKey(apiKey, endpoints, {
        query: 'test',
        numResults: 1,
      });
      if (outcome.ok) {
        if (i > 0) promoteApiKeyAndPersist('bocha', apiKey);
        return true;
      }
      if (this.isRetryableKeyError(outcome.error) && i + 1 < keys.length) continue;
      return false;
    }
    return false;
  }

  private resolveEndpoints(
    extra?: Record<string, unknown>
  ): Array<{ url: string; style: 'shuyan' | 'bocha' }> {
    const raw = typeof extra?.base_url === 'string' ? extra.base_url.trim() : '';
    if (!raw) return [...DEFAULT_ENDPOINTS];

    const base = raw.replace(/\/+$/, '');
    // 用户若填了数眼模型主站，自动改到搜索专用端点，避免 404
    if (/platform\.shuyanai\.com|cloud\.shuyanai\.com/i.test(base)) {
      console.warn(
        '[BochaSearch] base_url 是数眼「AI 模型」地址，搜索应使用 api.shuyanai.com；已自动改写'
      );
      return [{ url: 'https://api.shuyanai.com/v1/search', style: 'shuyan' }, ...DEFAULT_ENDPOINTS];
    }
    if (/api\.shuyanai\.com/i.test(base)) {
      const url = base.endsWith('/v1/search') ? base : `${base}/v1/search`;
      return [{ url, style: 'shuyan' }, ...DEFAULT_ENDPOINTS.filter((e) => e.url !== url)];
    }
    if (/bocha/i.test(base)) {
      const url = /web-search/.test(base) ? base : `${base}/v1/web-search`;
      return [{ url, style: 'bocha' }, ...DEFAULT_ENDPOINTS.filter((e) => e.url !== url)];
    }
    // 未知自定义：优先当数眼 search，再兜底官方
    const asSearch = base.endsWith('/v1/search') ? base : `${base}/v1/search`;
    return [{ url: asSearch, style: 'shuyan' }, ...DEFAULT_ENDPOINTS];
  }

  private async requestWithKey(
    apiKey: string,
    endpoints: Array<{ url: string; style: 'shuyan' | 'bocha' }>,
    args: {
      query: string;
      numResults: number;
      timeRange?: string;
      includeDomains?: string[];
    }
  ): Promise<{ ok: true; items: WebPageItem[] } | { ok: false; error: string }> {
    let lastError = '';
    let sawAuthOrQuota = false;

    for (const ep of endpoints) {
      const body =
        ep.style === 'shuyan'
          ? JSON.stringify({
              q: args.query,
              num: args.numResults,
              range: this.toShuyanRange(args.timeRange),
              ...(args.includeDomains?.length
                ? { includeSite: args.includeDomains.slice(0, 20) }
                : {}),
            })
          : JSON.stringify({
              query: args.query,
              count: args.numResults,
              summary: true,
              freshness: this.toBochaFreshness(args.timeRange),
            });

      try {
        const response = await fetch(ep.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey.trim()}`,
          },
          body,
        });
        const text = await response.text().catch(() => '');
        let parsed: Record<string, unknown> | null = null;
        try {
          parsed = text ? (JSON.parse(text) as Record<string, unknown>) : null;
        } catch {
          parsed = null;
        }

        if (!response.ok) {
          const msg =
            (parsed && typeof parsed.message === 'string' && parsed.message) ||
            (parsed && typeof parsed.error === 'string' && parsed.error) ||
            `HTTP ${response.status} ${text.slice(0, 200)}`;
          lastError = `HTTP ${response.status} ${msg}`;
          console.error(`[BochaSearch] API error @ ${ep.url}:`, lastError.slice(0, 200));
          if (response.status === 401 || response.status === 403) {
            sawAuthOrQuota = true;
            // 鉴权/额度问题：换域名通常无效，跳出端点循环换 Key
            return { ok: false, error: lastError };
          }
          continue;
        }

        const items = this.extractWebPages(parsed);
        if (items === null) {
          const bizMsg =
            (parsed && typeof parsed.message === 'string' && parsed.message) ||
            (parsed && typeof parsed.error === 'string' && parsed.error) ||
            'unexpected response shape';
          lastError = bizMsg;
          console.error('[BochaSearch] bad payload:', bizMsg, text.slice(0, 240));
          return { ok: false, error: lastError };
        }

        return { ok: true, items };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        console.error(`[BochaSearch] fetch failed @ ${ep.url}:`, lastError);
      }
    }

    return {
      ok: false,
      error: lastError || (sawAuthOrQuota ? 'auth/quota failed' : 'Bocha/Shuyan request failed'),
    };
  }

  /** 成功 → 数组；业务失败 → null */
  private extractWebPages(parsed: Record<string, unknown> | null): WebPageItem[] | null {
    if (!parsed || typeof parsed !== 'object') return null;

    const code = parsed.code;
    if (
      code !== undefined &&
      code !== null &&
      code !== 0 &&
      code !== 200 &&
      code !== '0' &&
      code !== '200'
    ) {
      return null;
    }

    const data =
      parsed.data && typeof parsed.data === 'object'
        ? (parsed.data as Record<string, unknown>)
        : parsed;

    // 数眼：data.webPages = Array
    if (Array.isArray(data.webPages)) {
      return data.webPages as WebPageItem[];
    }

    // 博查官方：data.webPages.value = Array
    const webPages = data.webPages;
    if (webPages && typeof webPages === 'object') {
      const value = (webPages as { value?: unknown }).value;
      if (Array.isArray(value)) return value as WebPageItem[];
      return [];
    }

    if (Array.isArray(data.webResults)) {
      return data.webResults as WebPageItem[];
    }

    // HTTP 200 且无明确失败：空结果
    return [];
  }

  private toShuyanRange(timeRange?: string): string | undefined {
    if (!timeRange) return 'year';
    const map: Record<string, string> = {
      day: 'day',
      week: 'week',
      month: 'month',
      year: 'year',
    };
    return map[timeRange] ?? 'year';
  }

  private toBochaFreshness(timeRange?: string): string {
    if (!timeRange) return 'oneYear';
    const map: Record<string, string> = {
      day: 'oneDay',
      week: 'oneWeek',
      month: 'oneMonth',
      year: 'oneYear',
    };
    return map[timeRange] ?? 'oneYear';
  }

  private isRetryableKeyError(message: string): boolean {
    if (isRateLimitSignal(message)) return true;
    return /(?:^|\D)(?:401|403)(?:\D|$)|invalid api key|invalid.?key|quota|余额不足|insufficient|exceeded/i.test(
      message
    );
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  private createEmptyResult(query: string, error?: string): DimensionSearchResult {
    return {
      dimension: 'general',
      provider: this.name,
      items: [],
      total: 0,
      query,
      timestamp: new Date().toISOString(),
      ...(error ? { error } : {}),
    };
  }
}
