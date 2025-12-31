/**
 * 知识库数据仓库接口
 * 提供知识库和文档的 CRUD 操作，以及向量检索、关键词检索、混合检索
 */

import type {
  KnowledgeBase,
  CreateKnowledgeBaseDto,
  UpdateKnowledgeBaseDto,
  KnowledgeDocument,
  CreateKnowledgeDocumentDto,
  UpdateKnowledgeDocumentDto,
  KnowledgeSearchResult,
  KnowledgeHybridSearchResult,
} from '../models/KnowledgeBase';

// 重新导出类型，方便使用
export type {
  KnowledgeBase,
  CreateKnowledgeBaseDto,
  UpdateKnowledgeBaseDto,
  KnowledgeDocument,
  CreateKnowledgeDocumentDto,
  UpdateKnowledgeDocumentDto,
  KnowledgeSearchResult,
  KnowledgeHybridSearchResult,
} from '../models/KnowledgeBase';

/**
 * 知识库数据仓库接口
 */
export interface IKnowledgeBaseRepository {
  // ========== 知识库配置操作 ==========

  /**
   * 创建知识库配置
   */
  createKnowledgeBase(data: CreateKnowledgeBaseDto): Promise<KnowledgeBase>;

  /**
   * 根据名称查找知识库
   */
  findKnowledgeBaseByName(name: string): Promise<KnowledgeBase | null>;

  /**
   * 根据 ID 查找知识库
   */
  findKnowledgeBaseById(id: string): Promise<KnowledgeBase | null>;

  /**
   * 更新知识库配置
   */
  updateKnowledgeBase(name: string, data: UpdateKnowledgeBaseDto): Promise<KnowledgeBase>;

  /**
   * 删除知识库配置（同时删除所有文档）
   */
  deleteKnowledgeBase(name: string): Promise<void>;

  /**
   * 查询知识库列表
   */
  listKnowledgeBases(options?: {
    agent_id?: string;
    owner_id?: string;
    is_public?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ knowledge_bases: KnowledgeBase[]; total: number }>;

  // ========== 文档操作 ==========

  /**
   * 创建文档
   */
  createDocument(data: CreateKnowledgeDocumentDto): Promise<KnowledgeDocument>;

  /**
   * 根据 ID 查找文档
   */
  findDocumentById(id: string): Promise<KnowledgeDocument | null>;

  /**
   * 更新文档
   */
  updateDocument(id: string, data: UpdateKnowledgeDocumentDto): Promise<KnowledgeDocument>;

  /**
   * 删除文档
   */
  deleteDocument(id: string): Promise<void>;

  /**
   * 更新文档的 embedding
   */
  updateDocumentEmbedding(id: string, embedding: number[]): Promise<void>;

  /**
   * 查询知识库中的文档列表
   */
  listDocuments(
    knowledgeBaseName: string,
    options?: {
      user_id?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ documents: KnowledgeDocument[]; total: number }>;

  // ========== 检索操作 ==========

  /**
   * 向量检索（基于语义相似度）
   */
  searchDocuments(
    queryEmbedding: number[],
    knowledgeBaseName: string,
    options?: {
      limit?: number;
      threshold?: number;
      userId?: string;
    }
  ): Promise<KnowledgeSearchResult[]>;

  /**
   * 关键词检索（基于文本匹配）
   */
  searchByKeyword(
    keyword: string,
    knowledgeBaseName: string,
    options?: {
      limit?: number;
      userId?: string;
    }
  ): Promise<KnowledgeDocument[]>;

  /**
   * 混合检索（向量 + 关键词，加权排序）
   */
  hybridSearch(
    queryEmbedding: number[],
    keyword: string,
    knowledgeBaseName: string,
    options?: {
      limit?: number;
      threshold?: number;
      vectorWeight?: number;
      keywordWeight?: number;
      userId?: string;
    }
  ): Promise<KnowledgeHybridSearchResult[]>;
}

