/**
 * Tools 节点执行器 - 工具调用
 */

import { SmartflowNode, ExecutionContext } from '../models/types';
import { BaseExecutor, ExecutorResult } from './base';
import { VariableResolver } from '../variables/resolver';
import { mxmCGIHttpClient } from '../../services/httpClient';

let knowledgeServiceSingleton: import('../../../knowledge/knowledge-service').KnowledgeService | null = null;
async function getKnowledgeService() {
  if (knowledgeServiceSingleton) return knowledgeServiceSingleton;
  const mod = await import('../../../knowledge/knowledge-service');
  knowledgeServiceSingleton = new mod.KnowledgeService();
  return knowledgeServiceSingleton;
}

export class ToolsExecutor extends BaseExecutor {
  async execute(node: SmartflowNode, context: ExecutionContext): Promise<ExecutorResult> {
    try {
      const { tool_type = 'web_search', tool_params = {} } = node;

      const resolvedParams = this.resolveParams(tool_params, context);

      // 兼容前端 schema：code_executor/custom 的代码字段可能放在节点顶层（custom_code/custom_language）
      // - 前端工具栏创建的 Node.js/Python 节点当前就是这种结构
      // - 这里统一映射到 params.code / params.language，避免前端必须同步改动两套字段
      const resolvedParamsWithFallback = { ...resolvedParams } as Record<string, any>;
      const nodeCode = typeof (node as any).custom_code === 'string' ? String((node as any).custom_code) : '';
      const nodeLangRaw = typeof (node as any).custom_language === 'string' ? String((node as any).custom_language) : '';
      if (!resolvedParamsWithFallback.code && nodeCode) {
        resolvedParamsWithFallback.code = nodeCode;
      }
      if (!resolvedParamsWithFallback.language && nodeLangRaw) {
        // 后端执行器使用 nodejs/python；前端存 javascript/python
        resolvedParamsWithFallback.language = nodeLangRaw === 'javascript' ? 'nodejs' : nodeLangRaw;
      }

      switch (tool_type) {
        case 'web_search':
          return await this.executeWebSearch(resolvedParamsWithFallback, context);
        case 'web_scraper':
          return await this.executeWebScraper(resolvedParamsWithFallback, context);
        case 'deep_search':
          return await this.executeDeepSearch(resolvedParamsWithFallback, context);
        case 'embedding':
          return await this.executeEmbedding(resolvedParamsWithFallback, context);
        case 'http_request':
          return await this.executeHttpRequest(resolvedParamsWithFallback, context);
        case 'code_executor':
          return await this.executeCode(resolvedParamsWithFallback, context);
        case 'vector_store':
          return await this.executeVectorStore(resolvedParamsWithFallback, context, node);
        case 'vector_recall':
          return await this.executeVectorRecall(resolvedParamsWithFallback, context);
        case 'multi_dimension_search':
          return await this.executeMultiDimensionSearch(resolvedParamsWithFallback, context);
        case 'domain_search':
          return await this.executeDomainSearch(resolvedParamsWithFallback, context);
        case 'legal_search':
          return await this.executeDataSourceQuery(resolvedParamsWithFallback, 'legal');
        case 'stock_lookup':
          return await this.executeDataSourceQuery(resolvedParamsWithFallback, 'stock');
        case 'crypto_lookup':
          return await this.executeDataSourceQuery(resolvedParamsWithFallback, 'crypto');
        case 'company_lookup':
          return await this.executeDataSourceQuery(resolvedParamsWithFallback, 'business');
        case 'custom':
          // custom 目前复用 code_executor（允许后续扩展成更复杂的自定义工具）
          return await this.executeCode(resolvedParamsWithFallback, context);
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
    const { query, provider = 'auto', num_results = 5 } = params;
    if (!query) return this.createErrorResult('web_search requires query');

    try {
      const { SearchService } = await import('../../../core/search/search-service');
      const searchService = new SearchService();

      // Use SearchService for configurable multi-provider search
      // provider 'auto' will auto-select best provider based on query
      const results = await searchService.quickSearch(query, 'general');

      // Format results for workflow
      const formattedResults = results.slice(0, num_results).map((item: any) => ({
        title: item.title || '',
        url: item.url || '',
        snippet: item.snippet || item.content || '',
      }));

      return this.createSuccessResult({
        results: formattedResults,
        query,
        count: formattedResults.length,
        provider,
      });
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

    const userId = (context.variables?.user_id as string) || 'system';
    try {
      const response = await mxmCGIHttpClient.writingCompletion(
        model,
        { prompt: text, outputFormat: 'json' },
        userId
      );
      const inner = (response as any)?.result ?? response;
      const embedding =
        inner?.embedding ?? inner?.data?.embedding ?? (Array.isArray(inner) ? inner : null);
      return this.createSuccessResult({
        embedding,
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
      const { DataSourceService } = await import('../../../core/data-sources/data-source-service');
      const { topicTypeToDataDomain } = await import('../../../core/data-sources/domain-router');
      const searchService = new SearchService();
      const dataService = new DataSourceService();

      const result = await searchService.autoSearch({ query, depth });
      const dataDomain = topicTypeToDataDomain(result.topicType);
      let dataSource = null;
      if (dataDomain) {
        dataSource = await dataService.query({ query, domain: dataDomain }).catch(() => null);
      }

      return this.createSuccessResult({
        results: result.aggregated,
        topicType: result.topicType,
        dimensionResults: result.dimensionResults,
        query: result.query,
        count: result.aggregated.length,
        dataSource,
      });
    } catch (error: any) {
      return this.createErrorResult(`Multi-dimension search failed: ${error.message}`);
    }
  }

  private async executeDomainSearch(params: any, _context: ExecutionContext): Promise<ExecutorResult> {
    const { query, domain, depth = 'standard' } = params;
    if (!query) return this.createErrorResult('domain_search requires query');

    try {
      const { DataSourceService } = await import('../../../core/data-sources/data-source-service');
      const service = new DataSourceService();
      const result = await service.combinedSearch(query, { domain, depth });
      return this.createSuccessResult(result);
    } catch (error: any) {
      return this.createErrorResult(`Domain search failed: ${error.message}`);
    }
  }

  private async executeDataSourceQuery(
    params: any,
    domain: 'legal' | 'stock' | 'crypto' | 'business'
  ): Promise<ExecutorResult> {
    const { query, symbol, queryType } = params;
    if (!query && !symbol) {
      return this.createErrorResult(`${domain} lookup requires query or symbol`);
    }

    try {
      const { DataSourceService } = await import('../../../core/data-sources/data-source-service');
      const service = new DataSourceService();
      const result = await service.query({
        query: query || String(symbol),
        domain,
        symbol,
        queryType,
      });
      return this.createSuccessResult(result);
    } catch (error: any) {
      return this.createErrorResult(`Data source query failed: ${error.message}`);
    }
  }

  /**
   * 向量存储：把文本写入知识库（以“上传 txt 文件”的方式复用现有切分+embedding+入库链路）
   *
   * tool_params:
   * - knowledgeBaseId: string （必填，knowledge base 的 id 或 name；优先当作 id）
   * - text: string（必填）
   * - fileName?: string（可选，默认 smartflow-tool-{node.id}.txt）
   * - tags?: string[]
   * - metadata?: object
   * - chunkSize/chunkOverlap/maxChunkSize?: number（可选）
   */
  private async executeVectorStore(params: any, context: ExecutionContext, node: SmartflowNode): Promise<ExecutorResult> {
    const knowledgeBaseId = String(params.knowledgeBaseId ?? params.knowledge_base_id ?? params.kbId ?? params.kb_id ?? '');
    const text = typeof params.text === 'string' ? params.text : String(params.text ?? '');
    if (!knowledgeBaseId) return this.createErrorResult('vector_store requires knowledgeBaseId');
    if (!text.trim()) return this.createErrorResult('vector_store requires text');

    try {
      const ks = await getKnowledgeService();
      const fileName = String(params.fileName ?? params.filename ?? `smartflow-tool-${String(node.id)}.txt`);
      const buffer = Buffer.from(text, 'utf-8');
      const userId = context.execution?.user_id;

      const result = await ks.uploadFileById({
        knowledgeBaseId,
        file: {
          buffer,
          originalname: fileName,
          mimetype: 'text/plain',
          size: buffer.byteLength,
        },
        userId,
        tags: Array.isArray(params.tags) ? params.tags.map(String) : undefined,
        metadata: params.metadata && typeof params.metadata === 'object' ? params.metadata : undefined,
        chunkSize: typeof params.chunkSize === 'number' ? params.chunkSize : undefined,
        chunkOverlap: typeof params.chunkOverlap === 'number' ? params.chunkOverlap : undefined,
        maxChunkSize: typeof params.maxChunkSize === 'number' ? params.maxChunkSize : undefined,
      });

      return this.createSuccessResult({
        knowledgeBaseId: result.knowledgeBase.id,
        knowledgeBaseName: result.knowledgeBase.name,
        fileId: result.fileId,
        totalChunks: result.totalChunks,
        documentsCount: result.documents.length,
        replaced: result.replaced,
      });
    } catch (error: any) {
      return this.createErrorResult(`vector_store failed: ${error.message}`);
    }
  }

  /**
   * 向量召回：在知识库中搜索（hybrid/vector/keyword）
   *
   * tool_params:
   * - knowledgeBaseId: string（必填，knowledge base 的 id 或 name）
   * - query: string（必填）
   * - search_type?: 'vector' | 'keyword' | 'hybrid'（默认 hybrid）
   * - limit?: number（默认 5）
   * - threshold?: number（默认 0.7）
   * - vector_weight?: number（默认 0.7）
   * - keyword_weight?: number（默认 0.3）
   */
  private async executeVectorRecall(params: any, context: ExecutionContext): Promise<ExecutorResult> {
    const knowledgeBaseId = String(params.knowledgeBaseId ?? params.knowledge_base_id ?? params.kbId ?? params.kb_id ?? '');
    const query = typeof params.query === 'string' ? params.query : String(params.query ?? '');
    if (!knowledgeBaseId) return this.createErrorResult('vector_recall requires knowledgeBaseId');
    if (!query.trim()) return this.createErrorResult('vector_recall requires query');

    try {
      const ks = await getKnowledgeService();
      const results = await ks.searchById({
        knowledgeBaseId,
        query,
        searchType: (params.search_type as any) || 'hybrid',
        limit: params.limit != null ? Number(params.limit) : 5,
        threshold: params.threshold != null ? Number(params.threshold) : 0.7,
        vectorWeight: params.vector_weight != null ? Number(params.vector_weight) : 0.7,
        keywordWeight: params.keyword_weight != null ? Number(params.keyword_weight) : 0.3,
        userId: context.execution?.user_id,
      });

      return this.createSuccessResult({
        results,
        count: Array.isArray(results) ? results.length : 0,
      });
    } catch (error: any) {
      return this.createErrorResult(`vector_recall failed: ${error.message}`);
    }
  }
}
