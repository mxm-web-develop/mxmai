import type { DataSourceProvider } from './base';
import type { DataSourceRequest, DataSourceResult } from '../types';
import { getDataSourceProviderConfig } from '../data-source-config';

const BASE_URL = 'https://api.llama.fi';

/**
 * DefiLlama DeFi 协议 TVL 数据（完全免费）
 */
export class DefiLlamaProvider implements DataSourceProvider {
  readonly name = 'defillama';
  readonly domain = 'crypto' as const;

  async query(request: DataSourceRequest): Promise<DataSourceResult> {
    const { query, limit = 10 } = request;
    const q = query.trim().toLowerCase();

    try {
      const res = await fetch(`${BASE_URL}/protocols`, {
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        return this.emptyResult(query, `DefiLlama failed: ${res.status}`);
      }

      const protocols = (await res.json()) as DefiProtocol[];
      const filtered = protocols
        .filter((p) => {
          if (!q) return true;
          return (
            p.name?.toLowerCase().includes(q) ||
            p.slug?.toLowerCase().includes(q) ||
            p.symbol?.toLowerCase().includes(q) ||
            p.category?.toLowerCase().includes(q)
          );
        })
        .sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0))
        .slice(0, limit);

      const structuredData = filtered.map((p) => ({
        name: p.name,
        slug: p.slug,
        symbol: p.symbol,
        category: p.category,
        chain: p.chain,
        tvl: p.tvl,
        change_1d: p.change_1d,
        change_7d: p.change_7d,
        url: p.url,
      }));

      const summary =
        structuredData.length > 0
          ? structuredData
              .map(
                (p) =>
                  `${p.name}: TVL $${this.formatTvl(p.tvl)} (1d ${p.change_1d?.toFixed(2) ?? '?'}%) [${p.category ?? ''}]`
              )
              .join('\n')
          : '未找到匹配的 DeFi 协议';

      return {
        domain: 'crypto',
        provider: this.name,
        query,
        summary,
        structuredData,
        provenance: {
          provider: this.name,
          domain: 'crypto',
          fetchedAt: new Date().toISOString(),
          confidence: structuredData.length > 0 ? 'high' : 'low',
          sourceUrl: 'https://defillama.com',
        },
      };
    } catch (error) {
      console.error('[DefiLlama] query failed:', error);
      return this.emptyResult(query, 'DefiLlama 请求失败');
    }
  }

  async healthCheck(): Promise<boolean> {
    await getDataSourceProviderConfig(this.name);
    try {
      const res = await fetch(`${BASE_URL}/protocols`, { signal: AbortSignal.timeout(10000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  private formatTvl(tvl?: number): string {
    if (tvl == null) return '?';
    if (tvl >= 1e9) return `${(tvl / 1e9).toFixed(2)}B`;
    if (tvl >= 1e6) return `${(tvl / 1e6).toFixed(2)}M`;
    return tvl.toFixed(0);
  }

  private emptyResult(query: string, summary: string): DataSourceResult {
    return {
      domain: 'crypto',
      provider: this.name,
      query,
      summary,
      structuredData: [],
      provenance: {
        provider: this.name,
        domain: 'crypto',
        fetchedAt: new Date().toISOString(),
        confidence: 'low',
      },
    };
  }
}

interface DefiProtocol {
  name?: string;
  slug?: string;
  symbol?: string;
  category?: string;
  chain?: string;
  tvl?: number;
  change_1d?: number;
  change_7d?: number;
  url?: string;
}
