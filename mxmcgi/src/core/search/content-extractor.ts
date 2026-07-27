import type { ContentExtractResult } from './types';
import { AnysearchSearchProvider } from './providers/anysearch';
import { isSearchProviderUsable } from './search-config';

/**
 * 内容深度提取器
 * 优先走 AnySearch extract（Markdown 正文，上限 50k），失败再回退本地 HTML 抓取
 */
export class ContentExtractor {
  private httpClient: typeof fetch;
  private maxConcurrent: number;
  private anysearch: AnysearchSearchProvider | null = null;

  constructor(maxConcurrent = 3) {
    this.maxConcurrent = maxConcurrent;
    this.httpClient = fetch;
  }

  /**
   * 提取多个 URL 的内容
   */
  async extract(
    urls: string[],
    _prompt?: string
  ): Promise<ContentExtractResult[]> {
    const results: ContentExtractResult[] = [];

    // 分批处理以控制并发
    for (let i = 0; i < urls.length; i += this.maxConcurrent) {
      const batch = urls.slice(i, i + this.maxConcurrent);
      const batchResults = await Promise.allSettled(
        batch.map((url) => this.extractSingle(url))
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push(this.createErrorResult(result.reason));
        }
      }
    }

    return results;
  }

  private async extractSingle(url: string): Promise<ContentExtractResult> {
    const viaAnysearch = await this.tryAnysearchExtract(url);
    if (viaAnysearch) return viaAnysearch;
    return this.extractLocalHtml(url);
  }

  private async tryAnysearchExtract(url: string): Promise<ContentExtractResult | null> {
    try {
      if (!(await isSearchProviderUsable('anysearch'))) return null;
      if (!this.anysearch) this.anysearch = new AnysearchSearchProvider();
      const extracted = await this.anysearch.extractUrl(url);
      if (!extracted?.content?.trim()) return null;
      return {
        url,
        title: extracted.title,
        content: extracted.content.slice(0, 50000),
        extractedAt: new Date().toISOString(),
        confidence: this.assessConfidence(extracted.content),
      };
    } catch {
      return null;
    }
  }

  private async extractLocalHtml(url: string): Promise<ContentExtractResult> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await this.httpClient(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; DeepSearchBot/1.0; +https://example.com/bot)',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return this.createErrorResult(new Error(`HTTP ${response.status}`));
      }

      const html = await response.text();
      const cleaned = this.cleanHtml(html);
      const title = this.extractTitle(html);

      return {
        url,
        title,
        content: cleaned.slice(0, 10000),
        extractedAt: new Date().toISOString(),
        confidence: this.assessConfidence(cleaned),
      };
    } catch (error) {
      return this.createErrorResult(error);
    }
  }

  private cleanHtml(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\r\n/g, ' ')
      .replace(/\n/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractTitle(html: string): string {
    const match = /<title>([\s\S]*?)<\/title>/i.exec(html);
    return match?.[1]?.trim() || '';
  }

  private assessConfidence(content: string): 'high' | 'medium' | 'low' {
    const length = content.length;
    if (length > 2000) return 'high';
    if (length > 500) return 'medium';
    return 'low';
  }

  private createErrorResult(_error: unknown): ContentExtractResult {
    return {
      url: '',
      title: '',
      content: '',
      confidence: 'low',
      extractedAt: new Date().toISOString(),
    };
  }
}
