/**
 * 知识库增强器
 * 从知识库检索相关内容并增强 prompt
 */

import { KnowledgeService } from '../knowledge/knowledge-service';
import type { KnowledgeSearchResult, KnowledgeHybridSearchResult } from '@mxmai/mxmdata';

export interface KnowledgeBaseConfig {
  knowledgeBaseId: string;
  query: string;
  limit?: number;
  relate_outline?: string; // 关联的大纲节点 UID（可选）
}

/**
 * 从知识库检索内容
 */
export async function retrieveKnowledge(
  knowledgeBases: KnowledgeBaseConfig[],
  userId?: string
): Promise<Map<string, (KnowledgeSearchResult | KnowledgeHybridSearchResult)[]>> {
  const knowledgeService = new KnowledgeService();
  const results = new Map<string, (KnowledgeSearchResult | KnowledgeHybridSearchResult)[]>();

  for (const kb of knowledgeBases) {
    try {
      const searchResults = await knowledgeService.searchById({
        knowledgeBaseId: kb.knowledgeBaseId,
        query: kb.query,
        searchType: 'hybrid', // 默认使用混合搜索
        limit: kb.limit || 5,
        userId,
      });

      // 使用 knowledgeBaseId 作为 key，存储搜索结果
      results.set(kb.knowledgeBaseId, searchResults);
      console.log(`[KnowledgeEnhancer] 从知识库 "${kb.knowledgeBaseId}" 检索到 ${searchResults.length} 条相关内容`);
    } catch (error) {
      console.error(`[KnowledgeEnhancer] 从知识库 "${kb.knowledgeBaseId}" 检索失败:`, error);
      // 继续处理其他知识库，不中断流程
      results.set(kb.knowledgeBaseId, []);
    }
  }

  return results;
}

/**
 * 检查知识库是否有召回内容
 */
export function hasKnowledgeResults(
  knowledgeResults: Map<string, (KnowledgeSearchResult | KnowledgeHybridSearchResult)[]>,
  knowledgeBases: KnowledgeBaseConfig[]
): boolean {
  if (knowledgeResults.size === 0) {
    return false;
  }

  for (const kb of knowledgeBases) {
    const results = knowledgeResults.get(kb.knowledgeBaseId) || [];
    if (results.length > 0) {
      return true;
    }
  }

  return false;
}

/**
 * 将知识库内容格式化为 prompt 上下文
 */
export function formatKnowledgeContext(
  knowledgeResults: Map<string, (KnowledgeSearchResult | KnowledgeHybridSearchResult)[]>,
  knowledgeBases: KnowledgeBaseConfig[]
): string {
  if (knowledgeResults.size === 0) {
    return '';
  }

  const contextParts: string[] = [];

  for (const kb of knowledgeBases) {
    const results = knowledgeResults.get(kb.knowledgeBaseId) || [];
    if (results.length === 0) {
      continue;
    }

    // 如果有 relate_outline，在上下文中标注关联的大纲节点
    const outlineNote = kb.relate_outline 
      ? `（关联大纲节点: ${kb.relate_outline}）`
      : '';

    const kbContext = results
      .map((result, index) => {
        const content = 'content' in result ? result.content : result.content;
        const similarity = 'similarity' in result ? result.similarity : undefined;
        const score = 'combined_score' in result ? result.combined_score : undefined;
        
        let contextItem = `[参考 ${index + 1}] ${content}`;
        if (similarity !== undefined) {
          contextItem += ` (相似度: ${(similarity * 100).toFixed(1)}%)`;
        } else if (score !== undefined) {
          contextItem += ` (综合得分: ${(score * 100).toFixed(1)}%)`;
        }
        return contextItem;
      })
      .join('\n\n');

    const kbHeader = outlineNote 
      ? `知识库 "${kb.knowledgeBaseId}" 相关内容 ${outlineNote}：`
      : `知识库 "${kb.knowledgeBaseId}" 相关内容：`;
    
    contextParts.push(`${kbHeader}\n${kbContext}`);
  }

  return contextParts.join('\n\n---\n\n');
}

/**
 * 增强 prompt（添加知识库上下文）
 */
export function enhancePromptWithKnowledge(
  originalPrompt: string,
  knowledgeContext: string
): string {
  if (!knowledgeContext) {
    return originalPrompt;
  }

  return `基于以下知识库内容进行写作：

${knowledgeContext}

---
写作要求：
${originalPrompt}`;
}

