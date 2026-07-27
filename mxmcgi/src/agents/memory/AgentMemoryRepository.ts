/**
 * Agent Memory Repository
 * 复用 KnowledgeBase 基础设施存储用户记忆
 * 知识库名固定为 'agent_memory'（系统内置）
 */

import { RepositoryFactory } from '@mxmai/mxmdata';
import type {
  IKnowledgeBaseRepository,
  KnowledgeDocument,
  KnowledgeSearchResult,
} from '@mxmai/mxmdata';
import type {
  MemoryDocument,
  MemorySearchResult,
  CreateMemoryDto,
  SearchMemoryDto,
  UpdateMemoryDto,
  MemoryMetadata,
  MemoryType,
} from './types';

const AGENT_MEMORY_KB_NAME = 'agent_memory';

export class AgentMemoryRepository {
  private kbRepo: IKnowledgeBaseRepository;

  constructor(kbRepo?: IKnowledgeBaseRepository) {
    this.kbRepo = kbRepo || RepositoryFactory.createKnowledgeBaseRepository();
  }

  /**
   * 初始化 agent_memory 知识库（系统内置）
   */
  async ensureKnowledgeBase(): Promise<void> {
    const existing = await this.kbRepo.findKnowledgeBaseByName(AGENT_MEMORY_KB_NAME);
    if (!existing) {
      await this.kbRepo.createKnowledgeBase({
        name: AGENT_MEMORY_KB_NAME,
        display_name: 'Agent Memory',
        description: 'Agent user long-term memory storage',
        type: 'hybrid',
        embedding_model: 'qwen3-embedding-8b',
        is_builtin: true,
        is_public: false,
      });
    }
  }

  /**
   * 存储记忆
   */
  async store(dto: CreateMemoryDto & { embedding?: number[] }): Promise<MemoryDocument> {
    await this.ensureKnowledgeBase();

    const doc = await this.kbRepo.createDocument({
      knowledge_base_name: AGENT_MEMORY_KB_NAME,
      title: dto.memory_type || 'fact',
      content: dto.content,
      embedding: dto.embedding,
      metadata: {
        user_id: dto.user_id,
        memory_type: dto.memory_type || 'fact',
        importance: dto.importance || 5,
        ...dto.metadata,
      },
      is_public: false,
    });

    return this.mapToMemoryDocument(doc);
  }

  /**
   * 搜索记忆
   * 由于 RPC 函数 search_knowledge_base 的 user_id_filter 参数是 UUID 类型，
   * 而用户 ID 是字符串，直接传递会导致 RPC 失败或返回空结果。
   * 本方法使用混合策略：
   * 1. 优先使用向量检索（传入 NULL user_id_filter）
   * 2. 如果向量检索返回空结果（因为 is_public=false），使用关键词检索
   * 3. 用户过滤统一在应用层进行
   */
  async search(dto: SearchMemoryDto): Promise<MemorySearchResult[]> {
    const { user_id, query, query_embedding, memory_types, limit = 10, threshold = 0.6 } = dto;

    let results: KnowledgeSearchResult[] = [];

    if (query_embedding) {
      try {
        // 向量检索 - 不传 userId（会返回空结果因为 memory docs 不是 public）
        // 但我们仍尝试一下，以防 DB 行为不同
        const kbResults = await this.kbRepo.searchDocuments(query_embedding, AGENT_MEMORY_KB_NAME, {
          limit,
          threshold,
        });
        results = kbResults;
      } catch (err) {
        // 向量检索失败，尝试关键词检索作为后备
        console.warn('[AgentMemoryRepository] Vector search failed, falling back to keyword search:', err);
      }
    }

    // 如果向量检索没有结果（或没有向量检索），尝试关键词检索
    if (results.length === 0 && query) {
      try {
        const kbResults = await this.kbRepo.searchByKeyword(query, AGENT_MEMORY_KB_NAME, {
          limit,
          userId: user_id,
        });
        results = kbResults.map((doc) => ({
          id: doc.id,
          content: doc.content,
          title: doc.title,
          similarity: 1,
          metadata: doc.metadata,
          tags: doc.tags,
        }));
      } catch (err) {
        console.warn('[AgentMemoryRepository] Keyword search also failed:', err);
      }
    }

    // 过滤用户 + 类型
    return results
      .filter((r) => r.metadata?.user_id === user_id)
      .filter((r) => !memory_types || memory_types.includes(r.metadata?.memory_type))
      .map((r) => ({
        id: r.id,
        content: r.content,
        memory_type: (r.metadata?.memory_type as MemoryType) || 'fact',
        importance: r.metadata?.importance || 5,
        relevance_score: r.similarity,
        metadata: r.metadata as MemoryMetadata | undefined,
      }));
  }

  /**
   * 更新记忆
   */
  async update(id: string, dto: UpdateMemoryDto & { embedding?: number[] }): Promise<MemoryDocument> {
    const existing = await this.kbRepo.findDocumentById(id);
    if (!existing) {
      throw new Error(`Memory document not found: ${id}`);
    }

    const updateData: any = {
      metadata: {
        ...existing.metadata,
        memory_type: dto.memory_type || existing.metadata?.memory_type,
        importance: dto.importance || existing.metadata?.importance,
        ...dto.metadata,
      },
    };

    if (dto.content !== undefined) {
      updateData.content = dto.content;
    }

    if (dto.embedding !== undefined) {
      updateData.embedding = dto.embedding;
    }

    const updated = await this.kbRepo.updateDocument(id, updateData);

    return this.mapToMemoryDocument(updated);
  }

  /**
   * 删除记忆
   */
  async delete(id: string): Promise<void> {
    await this.kbRepo.deleteDocument(id);
  }

  /**
   * 获取用户的所有记忆
   */
  async listByUser(
    userId: string,
    options?: { memory_types?: MemoryType[]; limit?: number; offset?: number }
  ): Promise<MemoryDocument[]> {
    await this.ensureKnowledgeBase();

    const result = await this.kbRepo.listDocuments(AGENT_MEMORY_KB_NAME, {
      limit: options?.limit,
      offset: options?.offset,
    });

    return result.documents
      .filter((doc) => doc.metadata?.user_id === userId)
      .filter((doc) => !options?.memory_types || options.memory_types.includes(doc.metadata?.memory_type as MemoryType))
      .map((doc) => this.mapToMemoryDocument(doc));
  }

  /**
   * 将 KnowledgeDocument 映射为 MemoryDocument
   */
  private mapToMemoryDocument(doc: KnowledgeDocument): MemoryDocument {
    return {
      id: doc.id,
      user_id: doc.metadata?.user_id || doc.user_id || '',
      content: doc.content,
      memory_type: (doc.metadata?.memory_type as MemoryType) || 'fact',
      importance: doc.metadata?.importance || 5,
      embedding: doc.embedding,
      metadata: doc.metadata as MemoryMetadata | undefined,
      created_at: doc.created_at?.toString() || new Date().toISOString(),
      updated_at: doc.updated_at?.toString() || new Date().toISOString(),
    };
  }
}
