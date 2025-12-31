/**
 * Recall 节点执行器
 * 从知识库召回内容（支持向量检索、关键词检索、混合检索）
 */

import type { SmartflowNode } from '@mxmai/mxmdata';
import type { ExecutionContext, NodeExecutionResult } from './types';
import { VariableResolver } from './variable-resolver';
import { getKnowledgeBase, getKnowledgeBaseType } from '../knowledge-base/registry';

export class RecallExecutor {
  /**
   * 执行 recall 节点
   */
  static async execute(
    node: SmartflowNode,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    try {
      // 验证必需字段
      if (!node.knowledge_base) {
        return {
          success: false,
          error: 'Recall 节点缺少必需字段: knowledge_base',
        };
      }
      
      if (!node.query) {
        return {
          success: false,
          error: 'Recall 节点缺少必需字段: query',
        };
      }
      
      // 验证知识库是否存在
      const kb = getKnowledgeBase(node.knowledge_base);
      if (!kb) {
        return {
          success: false,
          error: `知识库 "${node.knowledge_base}" 不存在`,
        };
      }
      
      // 解析查询内容中的变量
      const resolvedQuery = VariableResolver.resolve(node.query, context);
      
      // 获取检索参数
      const params = node.recall_params || {};
      const topK = params.top_k || 5;
      const similarityThreshold = params.similarity_threshold || 0.7;
      const searchType = params.search_type || 'hybrid';
      
      // 根据知识库类型和检索类型执行检索
      const results = await this.performRetrieval(
        kb,
        resolvedQuery,
        {
          topK,
          similarityThreshold,
          searchType,
        },
        context.userId
      );
      
      // 格式化检索结果，方便后续节点使用
      const retrievedContent = results
        .map((r, index) => {
          const similarity = (r.similarity || r.score || 0).toFixed(2);
          return `[文档 ${index + 1}, 相似度: ${similarity}]\n${r.content}`;
        })
        .join('\n\n---\n\n');
      
      return {
        success: true,
        output: {
          query: resolvedQuery,
          results,
          retrieved_content: retrievedContent, // 格式化后的内容，方便直接使用
          count: results.length,
        },
        metadata: {
          knowledge_base: node.knowledge_base,
          search_type: searchType,
          top_k: topK,
          similarity_threshold: similarityThreshold,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  
  /**
   * 执行检索
   * 实际调用知识库 API 进行检索
   */
  private static async performRetrieval(
    kb: any,
    query: string,
    options: {
      topK: number;
      similarityThreshold: number;
      searchType: string;
    },
    userId?: string
  ): Promise<Array<{ content: string; score?: number; similarity?: number; metadata?: any }>> {
    try {
      // 调用知识库 API 进行检索
      const mxmcgiUrl = process.env.MXMCGI_URL || 'http://localhost:4003';
      const searchUrl = `${mxmcgiUrl}/knowledge/bases/${kb.name}/search`;

      const response = await fetch(searchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(userId && { 'x-user-id': userId }),
        },
        body: JSON.stringify({
          query: query,
          search_type: options.searchType || 'hybrid',
          limit: options.topK,
          threshold: options.similarityThreshold,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`知识库检索失败: ${response.status} ${errorText}`);
      }

      const result = await response.json();

      if (!result.success || !result.data || !result.data.results) {
        throw new Error('知识库检索返回格式错误');
      }

      // 转换结果格式
      return result.data.results.map((item: any) => ({
        content: item.content,
        score: item.similarity || item.combined_score || 0,
        similarity: item.similarity,
        metadata: {
          ...item.metadata,
          id: item.id,
          title: item.title,
          tags: item.tags,
        },
      }));
    } catch (error) {
      console.error('[RecallExecutor] 知识库检索失败:', error);
      // 如果检索失败，返回空结果而不是抛出错误
      // 这样可以让 Smartflow 继续执行，只是没有知识库内容
      return [];
    }
  }
}
