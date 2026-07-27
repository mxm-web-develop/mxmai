/**
 * Agent Memory Service
 * 整合 Embedding 和 Repository，提供完整的记忆存取接口
 */

import { AgentMemoryRepository } from './AgentMemoryRepository';
import { EmbeddingService } from '../../knowledge/embedding/service';
import type {
  MemoryDocument,
  MemorySearchResult,
  CreateMemoryDto,
  SearchMemoryDto,
  UpdateMemoryDto,
  ConversationSummary,
} from './types';

export class AgentMemoryService {
  private memoryRepo: AgentMemoryRepository;
  private embeddingService: EmbeddingService;

  constructor(memoryRepo?: AgentMemoryRepository, embeddingService?: EmbeddingService) {
    this.memoryRepo = memoryRepo || new AgentMemoryRepository();
    this.embeddingService = embeddingService || EmbeddingService.fromEnv();
  }

  /**
   * 召回相关记忆
   * 1. 生成 query embedding
   * 2. 向量 + 关键词混合检索
   * 3. 过滤用户 + 类型
   */
  async recall(dto: SearchMemoryDto): Promise<MemorySearchResult[]> {
    const { user_id, query, memory_types, limit = 5, threshold = 0.6 } = dto;

    // 生成 embedding
    const queryEmbedding = await this.embeddingService.embedQuery(query);

    return await this.memoryRepo.search({
      user_id,
      query,
      query_embedding: queryEmbedding,
      memory_types,
      limit,
      threshold,
    });
  }

  /**
   * 存储记忆（自动生成 embedding）
   */
  async store(dto: CreateMemoryDto): Promise<MemoryDocument> {
    const { user_id, content, memory_type, importance, metadata } = dto;

    // 生成 embedding
    const embedding = await this.embeddingService.embedQuery(content);

    return await this.memoryRepo.store({
      user_id,
      content,
      memory_type,
      importance,
      embedding,
      metadata: {
        ...metadata,
        extracted_from: metadata?.extracted_from || 'auto_summary',
      },
    });
  }

  /**
   * 存储对话摘要为记忆
   */
  async storeSummary(
    userId: string,
    summary: ConversationSummary,
    conversationId?: string,
    relatedNode?: string
  ): Promise<MemoryDocument> {
    return await this.store({
      user_id: userId,
      content: summary.summary,
      memory_type: summary.memory_type,
      importance: summary.importance,
      metadata: {
        conversation_id: conversationId,
        related_node: relatedNode,
        keywords: summary.keywords,
        extracted_from: 'auto_summary',
      },
    });
  }

  /**
   * 更新记忆
   */
  async update(id: string, dto: UpdateMemoryDto): Promise<MemoryDocument> {
    // 如果更新了内容，需要重新生成 embedding
    let embedding: number[] | undefined;
    if (dto.content) {
      embedding = await this.embeddingService.embedQuery(dto.content);
    }

    return await this.memoryRepo.update(id, { ...dto, embedding });
  }

  /**
   * 删除记忆
   */
  async delete(id: string): Promise<void> {
    await this.memoryRepo.delete(id);
  }

  /**
   * 获取用户的所有记忆
   */
  async listByUser(
    userId: string,
    options?: { memory_types?: Array<'summary' | 'preference' | 'fact' | 'context'>; limit?: number }
  ): Promise<MemoryDocument[]> {
    return await this.memoryRepo.listByUser(userId, options);
  }

  /**
   * 评估对话的重要性，决定是否需要存储
   * 返回是否应该存储
   */
  shouldStoreConversation(
    messages: Array<{ role: string; content: string }>,
    lastAssistantMessage?: string
  ): { shouldStore: boolean; importance: number } {
    let score = 3; // 基础分

    // 检测是否包含决策/答案
    if (this.containsDecision(messages)) score += 3;

    // 检测偏好表达
    if (this.containsPreference(messages)) score += 2;

    // 检测事实信息
    if (this.containsFact(messages)) score += 2;

    // 对话轮数
    if (messages.length > 5) score += 2;

    // 用户明确表示感谢或确认
    if (lastAssistantMessage && /谢谢|感谢|好的|明白|知道了|有帮助/i.test(lastAssistantMessage)) {
      score += 1;
    }

    return {
      shouldStore: score >= 7,
      importance: Math.min(score, 10),
    };
  }

  /**
   * 检测是否包含决策
   */
  private containsDecision(messages: Array<{ role: string; content: string }>): boolean {
    const decisionKeywords = ['决定了', '选择', '采用', '确定', '就这样', '行', '好的', '开始', '执行'];
    const content = messages.map((m) => m.content).join('');
    return decisionKeywords.some((kw) => content.includes(kw));
  }

  /**
   * 检测是否包含偏好
   */
  private containsPreference(messages: Array<{ role: string; content: string }>): boolean {
    const preferenceKeywords = ['喜欢', '想要', '偏好', '希望', '倾向', '比较喜欢', '不喜欢', '不要'];
    const content = messages.map((m) => m.content).join('');
    return preferenceKeywords.some((kw) => content.includes(kw));
  }

  /**
   * 检测是否包含事实信息
   */
  private containsFact(messages: Array<{ role: string; content: string }>): boolean {
    const factKeywords = ['我的', '我是', '我在', '我有', '名字', '公司', '产品', '品牌'];
    const content = messages.map((m) => m.content).join('');
    return factKeywords.some((kw) => content.includes(kw));
  }
}
