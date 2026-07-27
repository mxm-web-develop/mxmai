import type { SearchProvider } from './base';
import type {
  ProviderSearchRequest,
  DimensionSearchResult,
  SearchDimension,
} from '../types';

const DDG_BASE_URL = 'https://html.duckduckgo.com/html/';

/**
 * DuckDuckGo Search Provider
 * 免费，无需 API Key
 * 支持维度：general
 */
export class DuckDuckGoSearchProvider implements SearchProvider {
  readonly name = 'duckduckgo';
  readonly supportedDimensions: SearchDimension[] = ['general'];

  async search(request: ProviderSearchRequest): Promise<DimensionSearchResult> {
    const { query, numResults } = request;

    try {
      const url = `${DDG_BASE_URL}?q=${encodeURIComponent(query)}`;

      const response = await fetch(url, {
        headers: {
          Accept: 'text/html',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        console.error(`[DuckDuckGoSearch] API error: ${response.status}`);
        return this.createEmptyResult(query);
      }

      const htmlText = await response.text();
      const items = this.parseHtml(htmlText, numResults || 10);

      return {
        dimension: 'general',
        provider: this.name,
        items,
        total: items.length,
        query,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[DuckDuckGoSearch] Search failed:', error);
      return this.createEmptyResult(query);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${DDG_BASE_URL}?q=test`, {
        headers: {
          Accept: 'text/html',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(10000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private parseHtml(html: string, limit: number): Array<{
    title: string;
    url: string;
    snippet: string;
    domain: string;
    source: string;
  }> {
    const items: Array<{
      title: string;
      url: string;
      snippet: string;
      domain: string;
      source: string;
    }> = [];

    // 解析结果卡片
    // DuckDuckGo HTML 结果格式：<a class="result__a" href="...">Title</a>
    // 描述在 <a class="result__snippet" href="...">...</a>
    const resultLinkRegex = /<a class="result__a" href="([^"]+)">([^<]+)<\/a>/g;
    const snippetRegex = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

    const links: Array<{ url: string; title: string }> = [];
    const snippets: string[] = [];

    let match;
    while ((match = resultLinkRegex.exec(html)) !== null && links.length < limit) {
      const url = match[1];
      const title = this.cleanHtml(match[2]);
      if (url && title && !url.includes('duckduckgo')) {
        links.push({ url, title });
      }
    }

    // 重置正则位置
    snippetRegex.lastIndex = 0;
    while ((match = snippetRegex.exec(html)) !== null && snippets.length < limit) {
      snippets.push(this.cleanHtml(match[1]));
    }

    // 配对 title 和 snippet
    for (let i = 0; i < Math.min(links.length, limit); i++) {
      const link = links[i];
      const urlObj = new URL(link.url, 'https://duckduckgo.com');
      items.push({
        title: link.title,
        url: link.url,
        snippet: snippets[i] || '',
        domain: urlObj.hostname.replace(/^www\./, ''),
        source: this.name,
      });
    }

    return items;
  }

  private cleanHtml(text: string): string {
    return text
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  private createEmptyResult(query: string): DimensionSearchResult {
    return {
      dimension: 'general',
      provider: this.name,
      items: [],
      total: 0,
      query,
      timestamp: new Date().toISOString(),
    };
  }
}
