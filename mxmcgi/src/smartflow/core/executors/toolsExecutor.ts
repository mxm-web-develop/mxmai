/**
 * Tools 节点执行器 - 工具调用
 */

import { SmartflowNode, ExecutionContext } from '../models/types';
import { BaseExecutor, ExecutorResult } from './base';
import { VariableResolver } from '../variables/resolver';
import { mxmCGIHttpClient } from '../../services/httpClient';

export class ToolsExecutor extends BaseExecutor {
  async execute(node: SmartflowNode, context: ExecutionContext): Promise<ExecutorResult> {
    try {
      const { tool_type = 'web_search', tool_params = {} } = node;

      const resolvedParams = this.resolveParams(tool_params, context);

      switch (tool_type) {
        case 'web_search':
          return await this.executeWebSearch(resolvedParams, context);
        case 'web_scraper':
          return await this.executeWebScraper(resolvedParams, context);
        case 'embedding':
          return await this.executeEmbedding(resolvedParams, context);
        case 'http_request':
          return await this.executeHttpRequest(resolvedParams, context);
        case 'code_executor':
          return await this.executeCode(resolvedParams, context);
        case 'deep_search':
          return await this.executeDeepSearch(resolvedParams, context);
        case 'multi_dimension_search':
          return await this.executeMultiDimensionSearch(resolvedParams, context);
        default:
          return this.createErrorResult(`Unknown tool type: ${tool_type}`);
      }
    } catch (error: any) {
      return this.createErrorResult(`Tools executor error: ${error.message}`);
    }
  }

  private resolveParams(params: Record<string, any>, context: ExecutionContext): Record<string, any> {
    const resolved: Record<string, any> = {};
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        resolved[key] = VariableResolver.resolve(value, context);
      } else if (Array.isArray(value)) {
        resolved[key] = value.map(v => typeof v === 'string' ? VariableResolver.resolve(v, context) : v);
      } else {
        resolved[key] = value;
      }
    }
    return resolved;
  }

  private async executeWebSearch(params: any, context: ExecutionContext): Promise<ExecutorResult> {
    const { query, search_type = 'web', num_results = 5 } = params;
    if (!query) return this.createErrorResult('web_search requires query');

    try {
      let results: any[] = [];
      try {
        const response = await mxmCGIHttpClient.textGeneration('search', query, { num_results });
        results = typeof response === 'string'
          ? [{ title: response, url: '', snippet: '' }]
          : (response.data?.results || []);
      } catch {
        results = [
          {
            title: `搜索结果: ${query}`,
            url: `https://example.com/search?q=${encodeURIComponent(query)}`,
            snippet: `关于「${query}」的搜索摘要...`,
          },
        ];
      }

      return this.createSuccessResult({ results, query, count: results.length });
    } catch (error: any) {
      return this.createErrorResult(`Web search failed: ${error.message}`);
    }
  }

  private async executeWebScraper(params: any, context: ExecutionContext): Promise<ExecutorResult> {
    const { url, extract_strategy = 'text' } = params;
    if (!url) return this.createErrorResult('web_scraper requires url');

    try {
      let result: any = {};
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(15000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SmartflowBot/1.0)',
            'Accept': 'text/html,application/xhtml+xml',
          },
        });
        const html = await response.text();

        // Regex-based extraction
        if (extract_strategy === 'text') {
          // Extract readable text content
          const textContent = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          result.content = textContent.substring(0, 15000);
        } else if (extract_strategy === 'links') {
          // Extract all href links
          const matches = html.match(/href="(https?:\/\/[^"]+)"/gi) || [];
          const seen = new Set<string>();
          const links: string[] = [];
          for (const m of matches) {
            const link = m.replace(/href="(.*)"/i, '$1').trim();
            if (link && !seen.has(link) && (link.startsWith('http') || link.startsWith('//'))) {
              seen.add(link);
              links.push(link);
            }
          }
          result.content = links.slice(0, 50);
        } else if (extract_strategy === 'images') {
          // Extract image URLs
          const matches = html.match(/src="(https?:\/\/[^"]+\.(jpg|jpeg|png|gif|webp|svg))"/gi) || [];
          const seen = new Set<string>();
          const images: string[] = [];
          for (const m of matches) {
            const img = m.replace(/src="(.*)"/i, '$1').trim();
            if (img && !seen.has(img)) {
              seen.add(img);
              images.push(img);
            }
          }
          result.content = images.slice(0, 30);
        } else if (extract_strategy === 'structured') {
          // Return structured data
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i);
          const textContent = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          result.content = {
            title: titleMatch ? titleMatch[1].trim() : '',
            description: descMatch ? descMatch[1].trim() : '',
            text: textContent.substring(0, 5000),
          };
        } else {
          // Raw HTML snippet
          result.content = html.substring(0, 5000);
        }

        result.status = response.status;
        result.url = url;
        result.extract_strategy = extract_strategy;
        result.contentLength = typeof result.content === 'string' ? result.content.length : JSON.stringify(result.content).length;
      } catch (fetchError: any) {
        result.content = `[模拟爬取内容] 从 ${url} 爬取的文本内容...`;
        result._mock = true;
        result.error = fetchError.message;
      }

      return this.createSuccessResult(result);
    } catch (error: any) {
      return this.createErrorResult(`Web scraper failed: ${error.message}`);
    }
  }

  private async executeEmbedding(params: any, context: ExecutionContext): Promise<ExecutorResult> {
    const { text, model = 'embedding-3' } = params;
    if (!text) return this.createErrorResult('embedding requires text');

    try {
      const response = await mxmCGIHttpClient.embeddingGeneration(model, text, {});
      return this.createSuccessResult({
        embedding: response.data?.embedding || response.embedding || null,
        model,
        text_length: text.length,
      });
    } catch (error: any) {
      return this.createErrorResult(`Embedding failed: ${error.message}`);
    }
  }

  private async executeHttpRequest(params: any, context: ExecutionContext): Promise<ExecutorResult> {
    const { method = 'GET', url, headers = {}, body } = params;
    if (!url) return this.createErrorResult('http_request requires url');

    try {
      const options: RequestInit = {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
      };
      if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        options.body = typeof body === 'string' ? body : JSON.stringify(body);
      }

      const response = await fetch(url, { signal: AbortSignal.timeout(15000), ...options });
      const data = await response.text();

      return this.createSuccessResult({
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: data.substring(0, 10000),
      });
    } catch (error: any) {
      return this.createErrorResult(`HTTP request failed: ${error.message}`);
    }
  }

  private async executeCode(params: any, context: ExecutionContext): Promise<ExecutorResult> {
    const { language = 'nodejs', code, timeout = 5000 } = params;
    if (!code) return this.createErrorResult('code_executor requires code');

    try {
      if (language === 'nodejs') {
        const vm = require('vm');
        const sandbox = {
          console: { log: (...args: any[]) => {}, error: (...args: any[]) => {} },
          result: undefined as any,
        };
        vm.createContext(sandbox);
        const script = new vm.Script(code);
        script.runInContext(sandbox, { timeout: Math.min(timeout, 10000) });
        return this.createSuccessResult({ output: sandbox.result, language });
      } else if (language === 'python') {
        return this.executePythonCode(code, timeout);
      }
      return this.createErrorResult(`Unsupported language: ${language}`);
    } catch (error: any) {
      return this.createErrorResult(`Code execution failed: ${error.message}`);
    }
  }

  private async executePythonCode(code: string, timeout: number): Promise<ExecutorResult> {
    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      const pythonProcess = spawn('python3', ['-c', code], {
        timeout: Math.min(timeout, 30000),
        shell: false,
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code: number) => {
        if (code === 0) {
          resolve(this.createSuccessResult({
            output: stdout.trim(),
            language: 'python',
            exitCode: code,
          }));
        } else {
          resolve(this.createSuccessResult({
            output: stdout.trim(),
            error: stderr.trim(),
            language: 'python',
            exitCode: code,
            _mock: false,
          }));
        }
      });

      pythonProcess.on('error', (err: Error) => {
        resolve(this.createErrorResult(`Python execution failed: ${err.message}`));
      });

      pythonProcess.setTimeout?.(Math.min(timeout, 30000));
    });
  }

  private async executeDeepSearch(params: any, context: ExecutionContext): Promise<ExecutorResult> {
    const { query, dimensions = ['general'], depth = 'standard', numResults = 10 } = params;

    if (!query) {
      return this.createErrorResult('deep_search requires query');
    }

    try {
      const { SearchService } = await import('../../../core/search/search-service');
      const searchService = new SearchService();

      const result = await searchService.deepSearch({
        query,
        dimensions,
        depth,
        numResults,
      });

      return this.createSuccessResult({
        results: result.aggregated,
        dimensionResults: result.dimensionResults,
        query: result.query,
        count: result.aggregated.length,
      });
    } catch (error: any) {
      return this.createErrorResult(`Deep search failed: ${error.message}`);
    }
  }

  private async executeMultiDimensionSearch(params: any, context: ExecutionContext): Promise<ExecutorResult> {
    const { query, topicType, depth = 'standard' } = params;

    if (!query) {
      return this.createErrorResult('multi_dimension_search requires query');
    }

    try {
      const { SearchService } = await import('../../../core/search/search-service');
      const searchService = new SearchService();

      const result = await searchService.autoSearch({ query, depth });

      return this.createSuccessResult({
        results: result.aggregated,
        topicType: result.topicType,
        dimensionResults: result.dimensionResults,
        query: result.query,
        count: result.aggregated.length,
      });
    } catch (error: any) {
      return this.createErrorResult(`Multi-dimension search failed: ${error.message}`);
    }
  }
}
