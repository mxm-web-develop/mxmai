/**
 * 知识库服务
 * 提供知识库的完整生命周期管理：创建、更新、删除、召回
 */

import { RepositoryFactory } from '@mxmai/mxmdata';
import type {
  IKnowledgeBaseRepository,
  KnowledgeBase,
  CreateKnowledgeBaseDto,
  UpdateKnowledgeBaseDto,
  KnowledgeDocument,
  CreateKnowledgeDocumentDto,
  KnowledgeSearchResult,
  KnowledgeHybridSearchResult,
} from '@mxmai/mxmdata';
import { EmbeddingService } from './embedding/service';
import { FileParser, ParsedDocument } from './file-parser';

export interface CreateKnowledgeBaseParams {
  name: string;
  display_name: string;
  description?: string;
  type?: 'vector' | 'keyword' | 'hybrid';
  embedding_model?: string;
  agent_id?: string;
  agent_name?: string;
  is_builtin?: boolean;
  is_public?: boolean;
  owner_id?: string;
  config?: Record<string, any>;
}

export interface UploadFileParams {
  knowledgeBaseName: string;
  file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  };
  userId?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  isPublic?: boolean;
}

export interface UpdateKnowledgeBaseParams {
  name: string;
  display_name?: string;
  description?: string;
  type?: 'vector' | 'keyword' | 'hybrid';
  agent_id?: string;
  agent_name?: string;
  is_public?: boolean;
  config?: Record<string, any>;
}

export interface SearchParams {
  knowledgeBaseName: string;
  query: string;
  searchType?: 'vector' | 'keyword' | 'hybrid';
  limit?: number;
  threshold?: number;
  vectorWeight?: number;
  keywordWeight?: number;
  userId?: string;
}

export class KnowledgeService {
  private repository: IKnowledgeBaseRepository;
  private embeddingService: EmbeddingService;
  private fileParser: FileParser;

  constructor(
    repository?: IKnowledgeBaseRepository,
    embeddingService?: EmbeddingService,
    fileParser?: FileParser
  ) {
    this.repository = repository || RepositoryFactory.createKnowledgeBaseRepository();
    this.embeddingService = embeddingService || EmbeddingService.fromEnv();
    this.fileParser = fileParser || new FileParser();
  }

  /**
   * 创建知识库
   */
  async createKnowledgeBase(params: CreateKnowledgeBaseParams): Promise<KnowledgeBase> {
    const dto: CreateKnowledgeBaseDto = {
      name: params.name,
      display_name: params.display_name,
      description: params.description,
      type: params.type || 'hybrid',
      embedding_model: params.embedding_model || 'text-embedding-3-small',
      agent_id: params.agent_id,
      agent_name: params.agent_name,
      is_builtin: params.is_builtin || false,
      is_public: params.is_public || false,
      owner_id: params.owner_id,
      config: params.config || {},
    };

    return await this.repository.createKnowledgeBase(dto);
  }

  /**
   * 上传文件并解析为知识库文档
   */
  async uploadFile(params: UploadFileParams): Promise<{
    knowledgeBase: KnowledgeBase;
    documents: KnowledgeDocument[];
    totalChunks: number;
  }> {
    const { knowledgeBaseName, file, userId, tags, metadata, isPublic } = params;

    // 1. 验证知识库是否存在
    const knowledgeBase = await this.repository.findKnowledgeBaseByName(knowledgeBaseName);
    if (!knowledgeBase) {
      throw new Error(`知识库 "${knowledgeBaseName}" 不存在`);
    }

    // 2. 解析文件
    const parsed = await this.fileParser.parseFile(file.buffer, file.originalname);

    // 3. 为每个 chunk 生成 embedding
    const chunkTexts = parsed.chunks.map((chunk) => chunk.text);
    const embeddings = await this.embeddingService.embedBatch(chunkTexts);

    // 4. 创建文档（每个 chunk 作为一个文档）
    const documents: KnowledgeDocument[] = [];

    for (let i = 0; i < parsed.chunks.length; i++) {
      const chunk = parsed.chunks[i];
      const embedding = embeddings[i];

      const docDto: CreateKnowledgeDocumentDto = {
        knowledge_base_name: knowledgeBaseName,
        title: i === 0 ? parsed.title : `${parsed.title} (Part ${i + 1})`,
        content: chunk.text,
        content_type: this.getContentType(file.originalname),
        embedding: embedding,
        tags: tags || [],
        metadata: {
          ...metadata,
          ...parsed.metadata,
          chunkIndex: chunk.index,
          totalChunks: parsed.chunks.length,
          originalFileName: file.originalname,
        },
        user_id: userId,
        is_public: isPublic !== undefined ? isPublic : knowledgeBase.is_public,
      };

      const doc = await this.repository.createDocument(docDto);
      documents.push(doc);
    }

    return {
      knowledgeBase,
      documents,
      totalChunks: parsed.chunks.length,
    };
  }

  /**
   * 更新知识库配置
   */
  async updateKnowledgeBase(params: UpdateKnowledgeBaseParams): Promise<KnowledgeBase> {
    const { name, ...updateData } = params;

    const dto: UpdateKnowledgeBaseDto = {
      display_name: updateData.display_name,
      description: updateData.description,
      type: updateData.type,
      agent_id: updateData.agent_id,
      agent_name: updateData.agent_name,
      is_public: updateData.is_public,
      config: updateData.config,
    };

    return await this.repository.updateKnowledgeBase(name, dto);
  }

  /**
   * 删除知识库（包括所有文档）
   */
  async deleteKnowledgeBase(name: string): Promise<void> {
    await this.repository.deleteKnowledgeBase(name);
  }

  /**
   * 搜索知识库
   */
  async search(params: SearchParams): Promise<KnowledgeSearchResult[] | KnowledgeHybridSearchResult[]> {
    const {
      knowledgeBaseName,
      query,
      searchType = 'hybrid',
      limit = 5,
      threshold = 0.7,
      vectorWeight = 0.7,
      keywordWeight = 0.3,
      userId,
    } = params;

    // 验证知识库是否存在
    const knowledgeBase = await this.repository.findKnowledgeBaseByName(knowledgeBaseName);
    if (!knowledgeBase) {
      throw new Error(`知识库 "${knowledgeBaseName}" 不存在`);
    }

    switch (searchType) {
      case 'vector': {
        // 向量检索
        const queryEmbedding = await this.embeddingService.embedQuery(query);
        return await this.repository.searchDocuments(queryEmbedding, knowledgeBaseName, {
          limit,
          threshold,
          userId,
        });
      }

      case 'keyword': {
        // 关键词检索
        return await this.repository.searchByKeyword(query, knowledgeBaseName, {
          limit,
          userId,
        });
      }

      case 'hybrid': {
        // 混合检索
        const queryEmbedding = await this.embeddingService.embedQuery(query);
        return await this.repository.hybridSearch(queryEmbedding, query, knowledgeBaseName, {
          limit,
          threshold,
          vectorWeight,
          keywordWeight,
          userId,
        });
      }

      default:
        throw new Error(`不支持的搜索类型: ${searchType}`);
    }
  }

  /**
   * 获取知识库信息
   */
  async getKnowledgeBase(name: string): Promise<KnowledgeBase | null> {
    return await this.repository.findKnowledgeBaseByName(name);
  }

  /**
   * 列出知识库
   */
  async listKnowledgeBases(options?: {
    agent_id?: string;
    owner_id?: string;
    is_public?: boolean;
    limit?: number;
    offset?: number;
  }) {
    return await this.repository.listKnowledgeBases(options);
  }

  /**
   * 列出知识库中的文档
   */
  async listDocuments(
    knowledgeBaseName: string,
    options?: {
      user_id?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    return await this.repository.listDocuments(knowledgeBaseName, options);
  }

  /**
   * 删除文档
   */
  async deleteDocument(documentId: string): Promise<void> {
    await this.repository.deleteDocument(documentId);
  }

  /**
   * 获取内容类型
   */
  private getContentType(fileName: string): string {
    const ext = fileName.toLowerCase().split('.').pop() || '';
    const typeMap: Record<string, string> = {
      txt: 'text',
      md: 'markdown',
      markdown: 'markdown',
      pdf: 'pdf',
      html: 'html',
      htm: 'html',
    };
    return typeMap[ext] || 'text';
  }
}

