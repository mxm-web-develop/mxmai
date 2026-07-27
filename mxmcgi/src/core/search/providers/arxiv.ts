import type { SearchProvider } from './base';
import type {
  ProviderSearchRequest,
  DimensionSearchResult,
  SearchDimension,
} from '../types';

const ARXIV_BASE_URL = 'http://export.arxiv.org/api/query';

/**
 * ArXiv Academic Search Provider
 * 免费，无 API Key 限制
 * 支持维度：academic
 */
export class ArxivSearchProvider implements SearchProvider {
  readonly name = 'arxiv';
  readonly supportedDimensions: SearchDimension[] = ['academic'];

  async search(request: ProviderSearchRequest): Promise<DimensionSearchResult> {
    const { query, numResults } = request;

    try {
      // ArXiv API 使用 all:query 语法搜索所有字段
      const searchQuery = `all:${this.escapeQuery(query)}`;
      const url = `${ARXIV_BASE_URL}?search_query=${searchQuery}&start=0&max_results=${numResults || 10}&sortBy=relevance&sortOrder=descending`;

      const response = await fetch(url);

      if (!response.ok) {
        console.error(`[ArxivSearch] API error: ${response.status}`);
        return this.createEmptyResult(query);
      }

      const xmlText = await response.text();
      const items = this.parseArxivXml(xmlText);

      return {
        dimension: 'academic',
        provider: this.name,
        items,
        total: items.length,
        query,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[ArxivSearch] Search failed:', error);
      return this.createEmptyResult(query);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(
        `${ARXIV_BASE_URL}?search_query=all:test&max_results=1`
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  private escapeQuery(query: string): string {
    // ArXiv 查询语法中需要转义特殊字符
    return query.replace(/[+\-*/&|!(){}[\]^"~?:\\]/g, '\\$&');
  }

  private parseArxivXml(xml: string): Array<{
    title: string;
    url: string;
    snippet: string;
    domain: string;
    publishedAt?: string;
    source: string;
  }> {
    const items: Array<{
      title: string;
      url: string;
      snippet: string;
      domain: string;
      publishedAt?: string;
      source: string;
    }> = [];

    // 解析 entry 标签
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;

    while ((match = entryRegex.exec(xml)) !== null) {
      const entry = match[1];

      const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(entry);
      const linkMatch = /<id>([\s\S]*?)<\/id>/.exec(entry);
      const summaryMatch = /<summary>([\s\S]*?)<\/summary>/.exec(entry);
      const publishedMatch = /<published>([\s\S]*?)<\/published>/.exec(entry);
      const authorMatch = /<author><name>([\s\S]*?)<\/name><\/author>/.exec(entry);

      if (titleMatch && linkMatch) {
        const title = this.cleanText(titleMatch[1]);
        const snippet = summaryMatch
          ? `${authorMatch ? `作者: ${authorMatch[1]}. ` : ''}${this.cleanText(summaryMatch[1]).slice(0, 300)}`
          : '';

        items.push({
          title,
          url: linkMatch[1].trim(),
          snippet,
          domain: 'arxiv.org',
          publishedAt: publishedMatch?.[1].trim(),
          source: this.name,
        });
      }
    }

    return items;
  }

  private cleanText(text: string): string {
    // 清理 XML 实体和多余空白
    return text
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private createEmptyResult(query: string): DimensionSearchResult {
    return {
      dimension: 'academic',
      provider: this.name,
      items: [],
      total: 0,
      query,
      timestamp: new Date().toISOString(),
    };
  }
}
