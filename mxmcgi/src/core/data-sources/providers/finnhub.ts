import type { DataSourceProvider } from './base';
import type { DataSourceRequest, DataSourceResult } from '../types';
import { getDataSourceProviderConfig, getCurrentDataSourceApiKey } from '../data-source-config';

const BASE_URL = 'https://finnhub.io/api/v1';

/**
 * Finnhub 股市行情（免费层 60次/分）
 */
export class FinnhubProvider implements DataSourceProvider {
  readonly name = 'finnhub';
  readonly domain = 'stock' as const;

  async query(request: DataSourceRequest): Promise<DataSourceResult> {
    const { query, symbol, queryType = 'auto' } = request;
    await getDataSourceProviderConfig(this.name);
    const apiKey = getCurrentDataSourceApiKey(this.name);
    if (!apiKey) {
      return this.emptyResult(query, 'Finnhub API Key 未配置');
    }

    const ticker = this.resolveSymbol(symbol || query);
    // 大盘/指数类查询：拉美股核心指数（免费层可用）
    if (!ticker || this.isIndexOverviewQuery(query)) {
      if (this.isIndexOverviewQuery(query) || !ticker) {
        const overview = await this.indexOverview(query, apiKey);
        if (overview) return overview;
      }
      if (!ticker) {
        return this.emptyResult(query, '无法解析股票代码，请提供如 AAPL 或 600519.SS');
      }
    }

    try {
      if (queryType === 'search' || query.match(/搜索|查找|search/i)) {
        return await this.symbolSearch(query, apiKey);
      }

      const [quoteRes, profileRes] = await Promise.all([
        fetch(`${BASE_URL}/quote?symbol=${encodeURIComponent(ticker)}&token=${apiKey}`, {
          signal: AbortSignal.timeout(12000),
        }),
        fetch(`${BASE_URL}/stock/profile2?symbol=${encodeURIComponent(ticker)}&token=${apiKey}`, {
          signal: AbortSignal.timeout(12000),
        }),
      ]);

      const quote = quoteRes.ok ? ((await quoteRes.json()) as FinnhubQuote) : null;
      const profile = profileRes.ok ? ((await profileRes.json()) as FinnhubProfile) : null;

      const structuredData = { symbol: ticker, quote, profile };
      const summary = this.formatSummary(ticker, quote, profile);

      return {
        domain: 'stock',
        provider: this.name,
        query,
        summary,
        structuredData,
        provenance: {
          provider: this.name,
          domain: 'stock',
          fetchedAt: new Date().toISOString(),
          confidence: quote ? 'high' : 'medium',
          sourceUrl: `https://finnhub.io/quote/${ticker}`,
        },
      };
    } catch (error) {
      console.error('[Finnhub] query failed:', error);
      return this.emptyResult(query, 'Finnhub 请求失败');
    }
  }

  private async symbolSearch(query: string, apiKey: string): Promise<DataSourceResult> {
    const res = await fetch(
      `${BASE_URL}/search?q=${encodeURIComponent(query)}&token=${apiKey}`,
      { signal: AbortSignal.timeout(12000) }
    );
    const data = res.ok ? ((await res.json()) as { result?: Array<{ symbol: string; description: string }> }) : { result: [] };
    const items = (data.result || []).slice(0, 8);
    const summary = items.map((i) => `${i.symbol}: ${i.description}`).join('\n') || '无匹配结果';
    return {
      domain: 'stock',
      provider: this.name,
      query,
      summary,
      structuredData: items,
      provenance: {
        provider: this.name,
        domain: 'stock',
        fetchedAt: new Date().toISOString(),
        confidence: items.length > 0 ? 'high' : 'low',
      },
    };
  }

  private isIndexOverviewQuery(q: string): boolean {
    return /大盘|指数|行情|市场|nasdaq|标普|道指|s&p|dow|美股/i.test(q);
  }

  private async indexOverview(query: string, apiKey: string): Promise<DataSourceResult | null> {
    // 免费层用 ETF 代理主要美股指数，比 ^GSPC 一类更稳
    const symbols = [
      { s: 'SPY', n: 'S&P 500 (SPY)' },
      { s: 'QQQ', n: 'NASDAQ-100 (QQQ)' },
      { s: 'DIA', n: 'Dow (DIA)' },
    ];
    const rows: Array<{ symbol: string; name: string; quote: FinnhubQuote | null }> = [];
    for (const { s, n } of symbols) {
      try {
        const quoteRes = await fetch(
          `${BASE_URL}/quote?symbol=${encodeURIComponent(s)}&token=${apiKey}`,
          { signal: AbortSignal.timeout(10000) }
        );
        const quote = quoteRes.ok ? ((await quoteRes.json()) as FinnhubQuote) : null;
        if (quote && typeof quote.c === 'number' && quote.c > 0) {
          rows.push({ symbol: s, name: n, quote });
        }
      } catch {
        /* skip */
      }
    }
    if (rows.length === 0) return null;
    const summary = rows
      .map(({ name, quote }) => {
        const q = quote!;
        const pct =
          q.dp != null ? `${q.dp >= 0 ? '+' : ''}${Number(q.dp).toFixed(2)}%` : '?';
        return `${name}: ${q.c}（${pct}）`;
      })
      .join('\n');
    return {
      domain: 'stock',
      provider: this.name,
      query,
      summary: `美股指数代理快照（Finnhub ETF）\n${summary}`,
      structuredData: rows,
      provenance: {
        provider: this.name,
        domain: 'stock',
        fetchedAt: new Date().toISOString(),
        confidence: 'high',
        sourceUrl: 'https://finnhub.io',
      },
    };
  }

  private resolveSymbol(raw: string): string | null {
    const s = raw.trim().toUpperCase();
    // 中文大盘句：不要误吞成假 ticker
    if (/[\u4e00-\u9fff]/.test(raw) && this.isIndexOverviewQuery(raw)) return null;
    // 提取常见 ticker 模式
    const match = s.match(/\b([A-Z]{1,5}(?:\.[A-Z]{1,2})?)\b/);
    if (match) return match[1];
    // 中文 A 股代码
    const cnMatch = raw.match(/\b(\d{6})\b/);
    if (cnMatch) {
      const code = cnMatch[1];
      const prefix = code.startsWith('6') ? 'SS' : 'SZ';
      return `${code}.${prefix}`;
    }
    return s.length <= 10 && /^[A-Z0-9.]+$/.test(s) ? s : null;
  }

  private formatSummary(ticker: string, quote: FinnhubQuote | null, profile: FinnhubProfile | null): string {
    const parts: string[] = [];
    if (profile?.name) parts.push(`${profile.name} (${ticker})`);
    else parts.push(ticker);
    if (quote) {
      parts.push(
        `现价: ${quote.c} | 涨跌: ${quote.d} (${quote.dp}%) | 最高: ${quote.h} | 最低: ${quote.l} | 开盘: ${quote.o}`
      );
    }
    if (profile?.finnhubIndustry) parts.push(`行业: ${profile.finnhubIndustry}`);
    if (profile?.marketCapitalization) {
      parts.push(`市值: ${(profile.marketCapitalization / 1e6).toFixed(2)}M USD`);
    }
    return parts.join('\n');
  }

  async healthCheck(): Promise<boolean> {
    await getDataSourceProviderConfig(this.name);
    const apiKey = getCurrentDataSourceApiKey(this.name);
    if (!apiKey) return false;
    try {
      const res = await fetch(`${BASE_URL}/quote?symbol=AAPL&token=${apiKey}`, {
        signal: AbortSignal.timeout(8000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private emptyResult(query: string, summary: string): DataSourceResult {
    return {
      domain: 'stock',
      provider: this.name,
      query,
      summary,
      structuredData: null,
      provenance: {
        provider: this.name,
        domain: 'stock',
        fetchedAt: new Date().toISOString(),
        confidence: 'low',
      },
    };
  }
}

interface FinnhubQuote {
  c?: number;
  d?: number;
  dp?: number;
  h?: number;
  l?: number;
  o?: number;
  pc?: number;
  t?: number;
}

interface FinnhubProfile {
  name?: string;
  ticker?: string;
  finnhubIndustry?: string;
  marketCapitalization?: number;
  weburl?: string;
}
