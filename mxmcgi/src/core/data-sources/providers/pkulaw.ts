import type { DataSourceProvider } from './base';
import type { DataSourceRequest, DataSourceResult } from '../types';
import {
  getDataSourceProviderConfig,
  getCurrentDataSourceApiKey,
} from '../data-source-config';
import { callMcpTool } from '../adapters/mcp-client';

const DEFAULT_MCP_TOOL = 'law-semantic-search';

/**
 * 北大法宝 MCP 法律检索（需配置 mcp_url + service_id）
 */
export class PkulawProvider implements DataSourceProvider {
  readonly name = 'pkulaw';
  readonly domain = 'legal' as const;

  async query(request: DataSourceRequest): Promise<DataSourceResult> {
    const { query } = request;
    const cfg = await getDataSourceProviderConfig(this.name);
    const apiKey = getCurrentDataSourceApiKey(this.name);

    const mcpUrl = this.buildMcpUrl(cfg.extra);
    if (!mcpUrl || !apiKey) {
      return this.emptyResult(query, '北大法宝 MCP 未配置（需 API Key + extra.mcp_service_id）');
    }

    const toolName =
      (cfg.extra?.mcp_tool as string) ||
      (request.extra?.mcp_tool as string) ||
      DEFAULT_MCP_TOOL;

    try {
      const raw = await callMcpTool(
        { url: mcpUrl, apiKey },
        { name: toolName, arguments: { query, keyword: query } }
      );

      const structuredData = raw;
      const summary = this.formatSummary(raw, query);

      return {
        domain: 'legal',
        provider: this.name,
        query,
        summary,
        structuredData,
        provenance: {
          provider: this.name,
          domain: 'legal',
          fetchedAt: new Date().toISOString(),
          confidence: summary.length > 20 ? 'high' : 'medium',
          sourceUrl: 'https://mcp.pkulaw.com',
        },
      };
    } catch (error) {
      console.error('[Pkulaw] MCP query failed:', error);
      return this.emptyResult(
        query,
        `北大法宝检索失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private buildMcpUrl(extra?: Record<string, unknown>): string | null {
    const serviceId = extra?.mcp_service_id as string | undefined;
    const customUrl = extra?.mcp_url as string | undefined;
    if (customUrl) return customUrl;
    if (serviceId) {
      return `https://apim-gw.pkulaw.com/${serviceId}/mcp`;
    }
    return null;
  }

  private formatSummary(raw: unknown, query: string): string {
    if (typeof raw === 'string') return raw.slice(0, 3000);
    if (Array.isArray(raw)) {
      return raw
        .slice(0, 8)
        .map((item, i) => {
          const o = item as Record<string, unknown>;
          const title = o.title || o.name || o.article || `结果${i + 1}`;
          const content = o.content || o.snippet || o.text || '';
          return `${title}: ${String(content).slice(0, 200)}`;
        })
        .join('\n');
    }
    if (raw && typeof raw === 'object') {
      const o = raw as Record<string, unknown>;
      if (Array.isArray(o.items)) return this.formatSummary(o.items, query);
      if (Array.isArray(o.results)) return this.formatSummary(o.results, query);
      return JSON.stringify(raw).slice(0, 3000);
    }
    return `北大法宝检索「${query}」无结构化结果`;
  }

  async healthCheck(): Promise<boolean> {
    const cfg = await getDataSourceProviderConfig(this.name);
    const apiKey = getCurrentDataSourceApiKey(this.name);
    const mcpUrl = this.buildMcpUrl(cfg.extra);
    return Boolean(mcpUrl && apiKey);
  }

  private emptyResult(query: string, summary: string): DataSourceResult {
    return {
      domain: 'legal',
      provider: this.name,
      query,
      summary,
      structuredData: null,
      provenance: {
        provider: this.name,
        domain: 'legal',
        fetchedAt: new Date().toISOString(),
        confidence: 'low',
      },
    };
  }
}
