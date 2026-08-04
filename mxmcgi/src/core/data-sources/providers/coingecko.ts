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
      // 行业日报常见「大盘/行情」：直接拉市值 Top，避免中文查询搜不到币
      if (this.isMarketOverviewQuery(q)) {
        return await this.marketOverview(query, Math.max(limit, 8));
      }

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
      let coins = (searchData.coins || []).slice(0, limit);
      if (coins.length === 0) {
        // 中文「加密货币」等泛查询 → 回退市值榜
        return await this.marketOverview(query, Math.max(limit, 8));
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

  private isMarketOverviewQuery(q: string): boolean {
    if (/\b(btc|eth|bitcoin|ethereum|solana|doge)\b/i.test(q)) return false;
    return /大盘|行情|市值|市场|排行|top|overview|加密货币|区块链|币圈/i.test(q);
  }

  private async marketOverview(query: string, perPage: number): Promise<DataSourceResult> {
    const res = await fetch(
      `${BASE_URL}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=1&sparkline=false&price_change_percentage=24h`,
      { signal: AbortSignal.timeout(12000) }
    );
    if (!res.ok) {
      return this.emptyResult(query, `CoinGecko markets failed: ${res.status}`);
    }
    const rows = (await res.json()) as Array<{
      id: string;
      name: string;
      symbol: string;
      current_price?: number;
      market_cap?: number;
      price_change_percentage_24h?: number;
      market_cap_rank?: number;
    }>;
    if (!Array.isArray(rows) || rows.length === 0) {
      return this.emptyResult(query, '未找到加密市场数据');
    }
    const summary = rows
      .map((c) => {
        const pct =
          c.price_change_percentage_24h != null
            ? `${c.price_change_percentage_24h >= 0 ? '+' : ''}${c.price_change_percentage_24h.toFixed(2)}%`
            : '?';
        return `#${c.market_cap_rank ?? '?'} ${c.name} (${c.symbol}): $${c.current_price ?? '?'} (24h ${pct})`;
      })
      .join('\n');
    return {
      domain: 'crypto',
      provider: this.name,
      query,
      summary: `加密市值 Top${rows.length}（CoinGecko）\n${summary}`,
      structuredData: rows,
      provenance: {
        provider: this.name,
        domain: 'crypto',
        fetchedAt: new Date().toISOString(),
        confidence: 'high',
        sourceUrl: 'https://www.coingecko.com',
      },
    };
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
