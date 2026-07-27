import type { DataSourceProvider } from './base';
import type { DataSourceRequest, DataSourceResult } from '../types';
import { getDataSourceProviderConfig } from '../data-source-config';

const BASE_URL = 'https://api.coingecko.com/api/v3';

/**
 * CoinGecko 加密货币行情（免费 Demo 层）
 */
export class CoinGeckoProvider implements DataSourceProvider {
  readonly name = 'coingecko';
  readonly domain = 'crypto' as const;

  async query(request: DataSourceRequest): Promise<DataSourceResult> {
    const { query, symbol, limit = 5 } = request;
    const q = (symbol || query).trim();

    try {
      // 先搜索币种 ID
      const searchRes = await fetch(
        `${BASE_URL}/search?query=${encodeURIComponent(q)}`,
        { signal: AbortSignal.timeout(12000) }
      );
      if (!searchRes.ok) {
        return this.emptyResult(query, `CoinGecko search failed: ${searchRes.status}`);
      }
      const searchData = (await searchRes.json()) as {
        coins?: Array<{ id: string; name: string; symbol: string; market_cap_rank?: number }>;
      };
      const coins = (searchData.coins || []).slice(0, limit);
      if (coins.length === 0) {
        return this.emptyResult(query, '未找到匹配的加密货币');
      }

      const ids = coins.map((c) => c.id).join(',');
      const priceRes = await fetch(
        `${BASE_URL}/simple/price?ids=${ids}&vs_currencies=usd,cny&include_24hr_change=true&include_market_cap=true`,
        { signal: AbortSignal.timeout(12000) }
      );
      const prices = priceRes.ok ? ((await priceRes.json()) as Record<string, unknown>) : {};

      const structuredData = coins.map((c) => ({
        id: c.id,
        name: c.name,
        symbol: c.symbol,
        rank: c.market_cap_rank,
        price: prices[c.id] ?? null,
      }));

      const summary = structuredData
        .map((c) => {
          const p = c.price as { usd?: number; cny?: number; usd_24h_change?: number } | null;
          if (!p) return `${c.name} (${c.symbol})`;
          return `${c.name} (${c.symbol}): $${p.usd?.toFixed(2) ?? '?'} / ¥${p.cny?.toFixed(2) ?? '?'} (24h ${p.usd_24h_change?.toFixed(2) ?? '?'}%)`;
        })
        .join('\n');

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
          confidence: 'high',
          sourceUrl: 'https://www.coingecko.com',
        },
      };
    } catch (error) {
      console.error('[CoinGecko] query failed:', error);
      return this.emptyResult(query, 'CoinGecko 请求失败');
    }
  }

  async healthCheck(): Promise<boolean> {
    await getDataSourceProviderConfig(this.name);
    try {
      const res = await fetch(`${BASE_URL}/ping`, { signal: AbortSignal.timeout(8000) });
      return res.ok;
    } catch {
      return false;
    }
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
