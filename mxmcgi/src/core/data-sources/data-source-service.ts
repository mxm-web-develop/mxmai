import type {
  DataDomain,
  DataSourceRequest,
  DataSourceResult,
  CombinedDomainSearchResult,
} from './types';
import type { DataSourceProvider } from './providers/base';
import { CoinGeckoProvider } from './providers/coingecko';
import { FinnhubProvider } from './providers/finnhub';
import { DefiLlamaProvider } from './providers/defillama';
import { PkulawProvider } from './providers/pkulaw';
import { TianyanchaProvider } from './providers/tianyancha';
import { inferDataDomain, topicTypeToDataDomain } from './domain-router';
import { resolveProviderForDomain, isDataSourceProviderUsable } from './data-source-config';
import { SearchService } from '../search/search-service';
import { inferTopicType } from '../search/topic-router';
import type { SearchDepth } from '../search/types';

/**
 * 专业数据源统一服务
 */
export class DataSourceService {
  private providers = new Map<string, DataSourceProvider>();

  constructor() {
    this.registerDefaultProviders();
  }

  private registerDefaultProviders() {
    const list: DataSourceProvider[] = [
      new CoinGeckoProvider(),
      new FinnhubProvider(),
      new DefiLlamaProvider(),
      new PkulawProvider(),
      new TianyanchaProvider(),
    ];
    for (const p of list) {
      this.providers.set(p.name, p);
    }
  }

  getProvider(name: string): DataSourceProvider | undefined {
    return this.providers.get(name);
  }

  private async resolveProviderName(domain: DataDomain, query: string): Promise<string | null> {
    if (domain === 'crypto' && /\b(tvl|defi|协议|锁仓|liquidity)\b/i.test(query)) {
      if (await isDataSourceProviderUsable('defillama')) return 'defillama';
    }
    return resolveProviderForDomain(domain);
  }

  /** 按领域查询结构化数据 */
  async query(request: DataSourceRequest): Promise<DataSourceResult> {
    const domain = request.domain || inferDataDomain(request.query);
    if (!domain) {
      return {
        domain: 'finance',
        provider: 'none',
        query: request.query,
        summary: '无法推断数据领域，请指定 domain 参数',
        structuredData: null,
        provenance: {
          provider: 'none',
          domain: 'finance',
          fetchedAt: new Date().toISOString(),
          confidence: 'low',
        },
      };
    }

    const providerName = await this.resolveProviderName(domain, request.query);
    if (!providerName) {
      return {
        domain,
        provider: 'none',
        query: request.query,
        summary: `领域「${domain}」无可用数据源，请在 Admin 配置对应 API Key`,
        structuredData: null,
        provenance: {
          provider: 'none',
          domain,
          fetchedAt: new Date().toISOString(),
          confidence: 'low',
        },
      };
    }

    const provider = this.providers.get(providerName);
    if (!provider) {
      return {
        domain,
        provider: providerName,
        query: request.query,
        summary: `Provider ${providerName} 未实现`,
        structuredData: null,
        provenance: {
          provider: providerName,
          domain,
          fetchedAt: new Date().toISOString(),
          confidence: 'low',
        },
      };
    }

    return provider.query({ ...request, domain });
  }

  /** 自动推断领域并查询 */
  async autoQuery(request: DataSourceRequest): Promise<DataSourceResult> {
    const domain = request.domain || inferDataDomain(request.query);
    return this.query({ ...request, domain: domain ?? undefined });
  }

  /** 网页检索 + 结构化数据并行（domain_search 统一入口） */
  async combinedSearch(
    query: string,
    options?: { domain?: DataDomain; depth?: SearchDepth }
  ): Promise<CombinedDomainSearchResult> {
    const topicType = inferTopicType(query);
    const domain =
      options?.domain || inferDataDomain(query) || topicTypeToDataDomain(topicType);

    const searchService = new SearchService();
    const [webResult, dataResult] = await Promise.all([
      searchService.autoSearch({ query, depth: options?.depth || 'standard' }).catch(() => null),
      domain
        ? this.query({ query, domain }).catch(() => null)
        : Promise.resolve(null),
    ]);

    return {
      domain: domain || topicTypeToDataDomain(topicType) || 'finance',
      webResults: webResult?.aggregated,
      dataSource: dataResult ?? undefined,
      topicType,
      timestamp: new Date().toISOString(),
    };
  }
}
