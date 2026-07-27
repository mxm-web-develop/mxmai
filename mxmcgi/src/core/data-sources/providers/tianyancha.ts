import type { DataSourceProvider } from './base';
import type { DataSourceRequest, DataSourceResult } from '../types';
import {
  getDataSourceProviderConfig,
  getCurrentDataSourceApiKey,
} from '../data-source-config';

const BASE_URL = 'https://open.api.tianyancha.com/services/open/ic/baseinfo/2.0';

/**
 * 天眼查企业工商信息 REST API
 */
export class TianyanchaProvider implements DataSourceProvider {
  readonly name = 'tianyancha';
  readonly domain = 'business' as const;

  async query(request: DataSourceRequest): Promise<DataSourceResult> {
    const { query } = request;
    await getDataSourceProviderConfig(this.name);
    const apiKey = getCurrentDataSourceApiKey(this.name);
    if (!apiKey) {
      return this.emptyResult(query, '天眼查 API Token 未配置');
    }

    const keyword = query.trim();
    if (!keyword) {
      return this.emptyResult(query, '请提供企业名称或统一社会信用代码');
    }

    try {
      const url = `${BASE_URL}?keyword=${encodeURIComponent(keyword)}`;
      const response = await fetch(url, {
        headers: { Authorization: apiKey },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        return this.emptyResult(query, `天眼查 API 错误: ${response.status}`);
      }

      const data = (await response.json()) as TianyanchaResponse;
      if (data.error_code !== 0 || !data.result) {
        return this.emptyResult(query, data.reason || '未找到企业信息');
      }

      const r = data.result;
      const structuredData = r;
      const summary = [
        `企业名称: ${r.name ?? '-'}`,
        `法人: ${r.legalPersonName ?? '-'}`,
        `状态: ${r.regStatus ?? '-'}`,
        `注册资本: ${r.regCapital ?? '-'}`,
        `成立日期: ${r.estiblishTime ? new Date(r.estiblishTime).toISOString().slice(0, 10) : '-'}`,
        `统一社会信用代码: ${r.creditCode ?? '-'}`,
        `经营范围: ${(r.businessScope ?? '').slice(0, 300)}`,
      ].join('\n');

      return {
        domain: 'business',
        provider: this.name,
        query,
        summary,
        structuredData,
        provenance: {
          provider: this.name,
          domain: 'business',
          fetchedAt: new Date().toISOString(),
          confidence: 'high',
          sourceUrl: 'https://www.tianyancha.com',
        },
      };
    } catch (error) {
      console.error('[Tianyancha] query failed:', error);
      return this.emptyResult(query, '天眼查请求失败');
    }
  }

  async healthCheck(): Promise<boolean> {
    await getDataSourceProviderConfig(this.name);
    const apiKey = getCurrentDataSourceApiKey(this.name);
    return Boolean(apiKey);
  }

  private emptyResult(query: string, summary: string): DataSourceResult {
    return {
      domain: 'business',
      provider: this.name,
      query,
      summary,
      structuredData: null,
      provenance: {
        provider: this.name,
        domain: 'business',
        fetchedAt: new Date().toISOString(),
        confidence: 'low',
      },
    };
  }
}

interface TianyanchaResponse {
  error_code?: number;
  reason?: string;
  result?: {
    name?: string;
    legalPersonName?: string;
    regStatus?: string;
    regCapital?: string;
    estiblishTime?: number;
    creditCode?: string;
    businessScope?: string;
    [key: string]: unknown;
  };
}
