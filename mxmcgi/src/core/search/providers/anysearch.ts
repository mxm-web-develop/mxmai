import type { SearchProvider } from './base';
import type {
  ProviderSearchRequest,
  DimensionSearchResult,
  SearchDimension,
  SearchResultItem,
} from '../types';
import { getSearchProviderConfig, getCurrentApiKey } from '../search-config';

const ANYSEARCH_ENDPOINT = 'https://api.anysearch.com/mcp';
const CLIENT_HEADER = 'supermxmai/1.0';

/** 我们的 SearchDimension → AnySearch 垂域（省略则走 general） */
const DIMENSION_TO_DOMAIN: Partial<Record<SearchDimension, string>> = {
  academic: 'academic',
  finance: 'finance',
  social: 'social_media',
  news: 'general',
  forum: 'social_media',
};

interface AnysearchRpcResult {
  content?: Array<{ type?: string; text?: string }>;
}

/**
 * AnySearch Provider
 * 托管 API（JSON-RPC MCP）：通用检索 + 垂域 + 全文 extract
 * 与 Tavily 差异：结果为 Markdown（需解析）、支持垂域/batch/extract；无 include_domains/语种过滤
 */
export class AnysearchSearchProvider implements SearchProvider {
  readonly name = 'anysearch';
  readonly supportedDimensions: SearchDimension[] = [
    'general',
    'news',
    'academic',
    'forum',
    'social',
    'finance',
    'official',
  ];

  /** domain → 缓存的默认 sub_domain（session 级） */
  private subDomainCache = new Map<string, string>();

  async search(request: ProviderSearchRequest): Promise<DimensionSearchResult> {
    const { query, dimension, numResults } = request;
    await getSearchProviderConfig('anysearch');
    const apiKey = getCurrentApiKey('anysearch');

    if (!apiKey) {
      console.warn('[Anysearch] API key not configured, returning empty results');
      return this.createEmptyResult(dimension, query);
    }

    try {
      const args: Record<string, unknown> = {
        query,
        max_results: Math.min(Math.max(numResults || 10, 1), 10),
      };

      const vertical = DIMENSION_TO_DOMAIN[dimension];
      if (vertical && vertical !== 'general') {
        const sub = await this.resolveDefaultSubDomain(vertical, apiKey);
        if (sub) {
          args.domain = vertical;
          args.sub_domain = sub;
        }
      }

      let text = await this.callTool('search', args, apiKey);
      let items = parseSearchMarkdown(text, dimension, this.name);

      // 垂域无结果时降级为 general（避免 sub_domain 不匹配导致空集）
      if (items.length === 0 && args.domain) {
        console.warn(
          `[Anysearch] vertical ${args.domain}/${args.sub_domain} empty, fallback general`
        );
        text = await this.callTool(
          'search',
          { query, max_results: args.max_results },
          apiKey
        );
        items = parseSearchMarkdown(text, dimension, this.name);
      }

      return {
        dimension,
        provider: this.name,
        items,
        total: items.length,
        query,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[Anysearch] Search failed:', error);
      return this.createEmptyResult(dimension, query);
    }
  }

  async healthCheck(): Promise<boolean> {
    await getSearchProviderConfig('anysearch');
    const apiKey = getCurrentApiKey('anysearch');
    if (!apiKey) return false;
    try {
      const text = await this.callTool('search', { query: 'test', max_results: 1 }, apiKey);
      return typeof text === 'string' && text.length > 0;
    } catch {
      return false;
    }
  }

  /** 全文抽取（供 ContentExtractor 调用） */
  async extractUrl(url: string): Promise<{ title: string; content: string } | null> {
    await getSearchProviderConfig('anysearch');
    const apiKey = getCurrentApiKey('anysearch');
    if (!apiKey) return null;
    try {
      const text = await this.callTool('extract', { url }, apiKey);
      if (!text?.trim()) return null;
      const titleMatch = /^#\s+(.+)$/m.exec(text);
      return {
        title: titleMatch?.[1]?.trim() || extractDomain(url),
        content: text.slice(0, 50000),
      };
    } catch (error) {
      console.warn('[Anysearch] extract failed:', error);
      return null;
    }
  }

  private async resolveDefaultSubDomain(
    domain: string,
    apiKey: string
  ): Promise<string | undefined> {
    const cached = this.subDomainCache.get(domain);
    if (cached) return cached;

    try {
      const table = await this.callTool('get_sub_domains', { domain }, apiKey);
      const sub = pickDefaultSubDomain(domain, table);
      if (sub) this.subDomainCache.set(domain, sub);
      return sub;
    } catch (error) {
      console.warn(`[Anysearch] get_sub_domains(${domain}) failed:`, error);
      return undefined;
    }
  }

  private async callTool(
    name: string,
    args: Record<string, unknown>,
    apiKey: string
  ): Promise<string> {
    const response = await fetch(ANYSEARCH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-Anysearch-Client': CLIENT_HEADER,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'tools/call',
        params: { name, arguments: args },
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }

    const json = (await response.json()) as {
      error?: { message?: string };
      result?: AnysearchRpcResult;
    };

    if (json.error) {
      throw new Error(json.error.message || JSON.stringify(json.error));
    }

    const content = json.result?.content;
    if (Array.isArray(content)) {
      const textItem = content.find((c) => c.type === 'text' && c.text);
      if (textItem?.text) return textItem.text;
    }
    throw new Error('AnySearch returned empty content');
  }

  private createEmptyResult(
    dimension: SearchDimension,
    query: string
  ): DimensionSearchResult {
    return {
      dimension,
      provider: this.name,
      items: [],
      total: 0,
      query,
      timestamp: new Date().toISOString(),
    };
  }
}

/** 解析 AnySearch Markdown 检索结果 */
export function parseSearchMarkdown(
  text: string,
  dimension: SearchDimension,
  source: string
): SearchResultItem[] {
  const items: SearchResultItem[] = [];
  const blocks = text.split(/\n(?=###\s+\d+\.\s+)/);
  for (const block of blocks) {
    const titleMatch = /^###\s+\d+\.\s+(.+)$/m.exec(block);
    if (!titleMatch) continue;
    const title = titleMatch[1].trim();
    const urlMatch =
      /-\s*\*\*URL\*\*:\s*(\S+)/i.exec(block) ||
      /-\s*URL:\s*(\S+)/i.exec(block) ||
      /https?:\/\/[^\s)\]>]+/.exec(block);
    const url = (urlMatch?.[1] || urlMatch?.[0] || '').replace(/[.,;]+$/, '');
    if (!url || !/^https?:\/\//i.test(url)) continue;

    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    let snippet = '';
    for (const line of lines) {
      if (/^###\s+\d+\./.test(line)) continue;
      if (/^\*\*URL\*\*|^\-\s*\*\*URL\*\*|^-\s*URL:|^URL:/i.test(line)) continue;
      const cleaned = line
        .replace(/^[-*]\s*/, '')
        .replace(/^>\s*/, '')
        .replace(/^#{1,6}\s+/, '')
        .trim();
      if (!cleaned) continue;
      snippet = cleaned.slice(0, 500);
      break;
    }

    items.push({
      title,
      url,
      snippet,
      domain: extractDomain(url),
      dimension,
      source,
    });
  }
  return items;
}

function pickDefaultSubDomain(domain: string, tableMarkdown: string): string | undefined {
  const preferred: Record<string, string[]> = {
    academic: ['academic.search', 'academic.paper', 'academic'],
    finance: ['finance.news', 'finance.market', 'finance.quote'],
    social_media: ['social_media.search', 'social_media.general', 'social_media'],
  };
  const prefs = preferred[domain] || [];

  const found = new Set<string>();
  const re = new RegExp(`\\b${domain}\\.[a-z0-9_]+\\b`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(tableMarkdown)) !== null) {
    found.add(m[0].toLowerCase());
  }

  for (const p of prefs) {
    if (found.has(p.toLowerCase())) return p;
  }
  return found.values().next().value;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
