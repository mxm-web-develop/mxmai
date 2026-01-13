/**
 * 知识库服务
 * 提供知识库的完整生命周期管理：创建、更新、删除、召回
 */

import { uid } from 'uid';
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
  chunkSize?: number; // 每个 chunk 的最大字符数（默认 2000）
  chunkOverlap?: number; // chunk 之间的重叠字符数（默认 200）
  maxChunkSize?: number; // 单个 chunk 的最大字符数（默认 5000）
}

export interface UploadFileByIdParams {
  knowledgeBaseId: string;
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
  chunkSize?: number; // 每个 chunk 的最大字符数（默认 2000）
  chunkOverlap?: number; // chunk 之间的重叠字符数（默认 200）
  maxChunkSize?: number; // 单个 chunk 的最大字符数（默认 5000）
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

export interface SearchByIdParams {
  knowledgeBaseId: string;
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
    replaced: boolean; // 是否替换了已存在的文件
    fileId: string; // 文件唯一 ID
  }> {
    const { knowledgeBaseName, file, userId, tags, metadata, isPublic } = params;

    // 1. 验证知识库是否存在
    const knowledgeBase = await this.repository.findKnowledgeBaseByName(knowledgeBaseName);
    if (!knowledgeBase) {
      throw new Error(`知识库 "${knowledgeBaseName}" 不存在`);
    }

    // 2. 检查是否存在同名文件，如果存在则先删除旧文档并复用 fileId
    let replaced = false;
    let fileId: string;
    
    const existingDocs = await this.repository.listDocuments(knowledgeBaseName, {
      user_id: userId,
    });
    
    // 查找同名文件的文档
    const sameFileDocs = existingDocs.documents.filter((doc) => {
      return doc.metadata?.originalFileName === file.originalname;
    });

    if (sameFileDocs.length > 0) {
      // 复用旧文件的 fileId（确保同名文件始终使用相同的 fileId）
      const oldFileId = sameFileDocs[0]?.metadata?.fileId as string;
      if (oldFileId) {
        fileId = oldFileId;
      } else {
        // 如果旧文件没有 fileId（兼容旧数据），生成一个新的
        fileId = `file_${uid(21)}`;
      }
      
      // 删除同名文件的所有旧文档
      for (const doc of sameFileDocs) {
        await this.repository.deleteDocument(doc.id);
      }
      replaced = true;
      console.log(
        `[KnowledgeService] 发现同名文件 "${file.originalname}"，已删除 ${sameFileDocs.length} 个旧文档，将使用 fileId "${fileId}" 重新上传`
      );
    } else {
      // 如果没有同名文件，生成新的 fileId
      fileId = `file_${uid(21)}`;
    }

    // 3. 解析文件（支持自定义 chunk 大小和 overlap）
    const parsed = await this.fileParser.parseFile(file.buffer, file.originalname, {
      chunkSize: params.chunkSize,
      chunkOverlap: params.chunkOverlap,
      maxChunkSize: params.maxChunkSize,
    });

    // 4. 为每个 chunk 生成 embedding
    const chunkTexts = parsed.chunks.map((chunk) => chunk.text);
    const embeddings = await this.embeddingService.embedBatch(chunkTexts);

    // 5. 创建文档（每个 chunk 作为一个文档）

    // 5. 创建文档（每个 chunk 作为一个文档）
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
          fileId: fileId, // 文件唯一 ID
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

    // 重新获取知识库的最新信息（包含更新后的 document_count 等统计信息）
    const updatedKnowledgeBase = await this.repository.findKnowledgeBaseByName(knowledgeBaseName);
    if (!updatedKnowledgeBase) {
      // 如果获取失败，使用旧的数据（不应该发生）
      console.warn(`[KnowledgeService] Failed to get updated knowledge base: ${knowledgeBaseName}`);
    }

    return {
      knowledgeBase: updatedKnowledgeBase || knowledgeBase, // 使用更新后的知识库信息
      documents,
      totalChunks: parsed.chunks.length,
      replaced, // 返回是否替换了已存在的文件
      fileId, // 返回文件唯一 ID
    };
  }

  /**
   * 更新知识库配置（通过 name）
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
   * 更新知识库配置（通过 id）
   */
  async updateKnowledgeBaseById(id: string, params: Omit<UpdateKnowledgeBaseParams, 'name'>): Promise<KnowledgeBase> {
    const dto: UpdateKnowledgeBaseDto = {
      display_name: params.display_name,
      description: params.description,
      type: params.type,
      agent_id: params.agent_id,
      agent_name: params.agent_name,
      is_public: params.is_public,
      config: params.config,
    };

    return await this.repository.updateKnowledgeBaseById(id, dto);
  }

  /**
   * 删除知识库（包括所有文档，通过 name）
   */
  async deleteKnowledgeBase(name: string): Promise<void> {
    await this.repository.deleteKnowledgeBase(name);
  }

  /**
   * 删除知识库（包括所有文档，通过 id）
   */
  async deleteKnowledgeBaseById(id: string): Promise<void> {
    await this.repository.deleteKnowledgeBaseById(id);
  }

  /**
   * 搜索知识库（通过 name）
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
   * 搜索知识库（通过 id）
   */
  async searchById(params: SearchByIdParams): Promise<KnowledgeSearchResult[] | KnowledgeHybridSearchResult[]> {
    // 先通过 id 获取知识库信息
    const knowledgeBase = await this.repository.findKnowledgeBaseById(params.knowledgeBaseId);
    if (!knowledgeBase) {
      throw new Error(`知识库 ID "${params.knowledgeBaseId}" 不存在`);
    }

    // 使用 name 调用原有方法（因为文档表使用 name 关联）
    return await this.search({
      ...params,
      knowledgeBaseName: knowledgeBase.name,
    });
  }

  /**
   * 获取知识库信息（通过 name）
   */
  async getKnowledgeBase(name: string): Promise<KnowledgeBase | null> {
    return await this.repository.findKnowledgeBaseByName(name);
  }

  /**
   * 获取知识库信息（通过 id）
   */
  async getKnowledgeBaseById(id: string): Promise<KnowledgeBase | null> {
    return await this.repository.findKnowledgeBaseById(id);
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
   * 列出知识库中的文档（通过 name）
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
   * 列出知识库中的文档（通过 id）
   */
  async listDocumentsById(
    knowledgeBaseId: string,
    options?: {
      user_id?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    // 先通过 id 获取知识库信息
    const knowledgeBase = await this.repository.findKnowledgeBaseById(knowledgeBaseId);
    if (!knowledgeBase) {
      throw new Error(`知识库 ID "${knowledgeBaseId}" 不存在`);
    }

    // 使用 name 调用原有方法（因为文档表使用 name 关联）
    return await this.repository.listDocuments(knowledgeBase.name, options);
  }

  /**
   * 删除文档
   */
  async deleteDocument(documentId: string): Promise<void> {
    await this.repository.deleteDocument(documentId);
  }

  /**
   * 删除知识库中的某个文件（删除该文件的所有 chunks，通过 name）
   * 使用 fileId 而不是 fileName，避免特殊字符问题
   */
  async deleteFile(knowledgeBaseName: string, fileId: string, userId?: string): Promise<{
    deletedCount: number;
    fileName?: string;
  }> {
    // 1. 验证知识库是否存在
    const knowledgeBase = await this.repository.findKnowledgeBaseByName(knowledgeBaseName);
    if (!knowledgeBase) {
      throw new Error(`知识库 "${knowledgeBaseName}" 不存在`);
    }

    // 2. 查找该文件的所有文档
    const documentsResult = await this.repository.listDocuments(knowledgeBaseName, {
      user_id: userId,
    });

    // 3. 筛选出相同 fileId 的文档
    const fileDocuments = documentsResult.documents.filter(
      (doc) => doc.metadata?.fileId === fileId
    );

    if (fileDocuments.length === 0) {
      return {
        deletedCount: 0,
      };
    }

    // 4. 获取文件名（用于返回信息）
    const fileName = fileDocuments[0]?.metadata?.originalFileName as string | undefined;

    // 5. 删除所有相关文档
    for (const doc of fileDocuments) {
      await this.repository.deleteDocument(doc.id);
    }

    return {
      deletedCount: fileDocuments.length,
      fileName,
    };
  }

  /**
   * 删除知识库中的某个文件（删除该文件的所有 chunks，通过 id）
   */
  async deleteFileById(knowledgeBaseId: string, fileId: string, userId?: string): Promise<{
    deletedCount: number;
    fileName?: string;
  }> {
    // 先通过 id 获取知识库信息
    const knowledgeBase = await this.repository.findKnowledgeBaseById(knowledgeBaseId);
    if (!knowledgeBase) {
      throw new Error(`知识库 ID "${knowledgeBaseId}" 不存在`);
    }

    // 使用 name 调用原有方法（因为文档表使用 name 关联）
    return await this.deleteFile(knowledgeBase.name, fileId, userId);
  }

  /**
   * 上传文件并解析为知识库文档（通过 id）
   */
  async uploadFileById(params: UploadFileByIdParams): Promise<{
    knowledgeBase: KnowledgeBase;
    documents: KnowledgeDocument[];
    totalChunks: number;
    replaced: boolean;
    fileId: string;
  }> {
    // 验证参数
    if (!params.knowledgeBaseId) {
      throw new Error(`知识库 ID 不能为空`);
    }

    // 先通过 id 获取知识库信息
    const knowledgeBase = await this.repository.findKnowledgeBaseById(params.knowledgeBaseId);
    if (!knowledgeBase) {
      throw new Error(`知识库 ID "${params.knowledgeBaseId}" 不存在`);
    }

    // 使用 name 调用原有方法（因为文档表使用 name 关联）
    // 注意：只传递 uploadFile 需要的参数，排除 knowledgeBaseId
    const { knowledgeBaseId, ...restParams } = params;
    return await this.uploadFile({
      ...restParams,
      knowledgeBaseName: knowledgeBase.name,
    });
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

