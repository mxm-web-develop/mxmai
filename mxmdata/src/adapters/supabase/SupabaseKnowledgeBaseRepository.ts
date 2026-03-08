/**
 * Supabase 知识库数据仓库实现
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { uid } from 'uid';
import type {
  IKnowledgeBaseRepository,
  KnowledgeBase,
  CreateKnowledgeBaseDto,
  UpdateKnowledgeBaseDto,
  KnowledgeDocument,
  CreateKnowledgeDocumentDto,
  UpdateKnowledgeDocumentDto,
  KnowledgeSearchResult,
  KnowledgeHybridSearchResult,
} from '../../interfaces/IKnowledgeBaseRepository';
import { DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

export class SupabaseKnowledgeBaseRepository implements IKnowledgeBaseRepository {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client || getSupabaseClient();
  }

  // ========== 知识库配置操作 ==========

  async createKnowledgeBase(data: CreateKnowledgeBaseDto): Promise<KnowledgeBase> {
    try {
      // 使用 uid 生成知识库 ID
      const kbId = data.id || `kb_${uid(21)}`;
      
      const { data: result, error } = await this.client
        .from('knowledge_bases')
        .insert({
          id: kbId,
          name: data.name,
          display_name: data.display_name,
          description: data.description,
          type: data.type || 'hybrid',
          embedding_model: data.embedding_model || 'text-embedding-3-small',
          agent_id: data.agent_id,
          agent_name: data.agent_name,
          is_builtin: data.is_builtin || false,
          is_public: data.is_public || false,
          owner_id: data.owner_id,
          config: data.config || {},
        })
        .select()
        .single();

      if (error) {
        throw new DataAccessError(
          `Failed to create knowledge base: ${error.message}`,
          'INSERT_ERROR',
          error
        );
      }

      return this.mapKnowledgeBase(result);
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error creating knowledge base: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  async findKnowledgeBaseByName(name: string): Promise<KnowledgeBase | null> {
    try {
      const { data, error } = await this.client
        .from('knowledge_bases')
        .select('*')
        .eq('name', name)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // 未找到记录
          return null;
        }
        throw new DataAccessError(
          `Failed to find knowledge base: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return data ? this.mapKnowledgeBase(data) : null;
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error finding knowledge base: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  async findKnowledgeBaseById(id: string): Promise<KnowledgeBase | null> {
    try {
      const { data, error } = await this.client
        .from('knowledge_bases')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new DataAccessError(
          `Failed to find knowledge base: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return data ? this.mapKnowledgeBase(data) : null;
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error finding knowledge base: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  async updateKnowledgeBase(name: string, data: UpdateKnowledgeBaseDto): Promise<KnowledgeBase> {
    try {
      const { data: result, error } = await this.client
        .from('knowledge_bases')
        .update({
          display_name: data.display_name,
          description: data.description,
          type: data.type,
          embedding_model: data.embedding_model, // 支持更新 embedding 模型
          agent_id: data.agent_id,
          agent_name: data.agent_name,
          is_public: data.is_public,
          config: data.config,
          updated_at: new Date().toISOString(),
        })
        .eq('name', name)
        .select()
        .single();

      if (error) {
        throw new DataAccessError(
          `Failed to update knowledge base: ${error.message}`,
          'UPDATE_ERROR',
          error
        );
      }

      return this.mapKnowledgeBase(result);
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error updating knowledge base: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  async updateKnowledgeBaseById(id: string, data: UpdateKnowledgeBaseDto): Promise<KnowledgeBase> {
    try {
      const { data: result, error } = await this.client
        .from('knowledge_bases')
        .update({
          display_name: data.display_name,
          description: data.description,
          type: data.type,
          embedding_model: data.embedding_model, // 支持更新 embedding 模型
          agent_id: data.agent_id,
          agent_name: data.agent_name,
          is_public: data.is_public,
          config: data.config,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw new DataAccessError(
          `Failed to update knowledge base: ${error.message}`,
          'UPDATE_ERROR',
          error
        );
      }

      return this.mapKnowledgeBase(result);
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error updating knowledge base: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  async deleteKnowledgeBase(name: string): Promise<void> {
    try {
      // 先删除所有文档（由于外键约束，会自动级联删除）
      const { error: deleteDocsError } = await this.client
        .from('knowledge_base_documents')
        .delete()
        .eq('knowledge_base_name', name);

      if (deleteDocsError) {
        throw new DataAccessError(
          `Failed to delete documents: ${deleteDocsError.message}`,
          'DELETE_ERROR',
          deleteDocsError
        );
      }

      // 删除知识库配置
      const { error } = await this.client
        .from('knowledge_bases')
        .delete()
        .eq('name', name);

      if (error) {
        throw new DataAccessError(
          `Failed to delete knowledge base: ${error.message}`,
          'DELETE_ERROR',
          error
        );
      }
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error deleting knowledge base: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  async deleteKnowledgeBaseById(id: string): Promise<void> {
    try {
      // 先通过 id 获取知识库的 name，因为文档表使用 name 关联
      const kb = await this.findKnowledgeBaseById(id);
      if (!kb) {
        throw new DataAccessError(
          `Knowledge base with id "${id}" not found`,
          'NOT_FOUND',
          undefined
        );
      }

      // 先删除所有文档（使用 name）
      const { error: deleteDocsError } = await this.client
        .from('knowledge_base_documents')
        .delete()
        .eq('knowledge_base_name', kb.name);

      if (deleteDocsError) {
        throw new DataAccessError(
          `Failed to delete documents: ${deleteDocsError.message}`,
          'DELETE_ERROR',
          deleteDocsError
        );
      }

      // 删除知识库配置（使用 id）
      const { error } = await this.client
        .from('knowledge_bases')
        .delete()
        .eq('id', id);

      if (error) {
        throw new DataAccessError(
          `Failed to delete knowledge base: ${error.message}`,
          'DELETE_ERROR',
          error
        );
      }
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error deleting knowledge base: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  async listKnowledgeBases(options?: {
    agent_id?: string;
    owner_id?: string;
    is_public?: boolean;
    public_or_builtin?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ knowledge_bases: KnowledgeBase[]; total: number }> {
    try {
      let query = this.client.from('knowledge_bases').select('*', { count: 'exact' });

      if (options?.agent_id) {
        query = query.eq('agent_id', options.agent_id);
      }
      if (options?.owner_id) {
        query = query.eq('owner_id', options.owner_id);
      }
      if (options?.is_public !== undefined) {
        query = query.eq('is_public', options.is_public);
      }
      if (options?.public_or_builtin === true) {
        query = query.or('is_public.eq.true,is_builtin.eq.true');
      }

      query = query.order('created_at', { ascending: false });

      // 使用 range 方法替代 offset（PostgREST 推荐方式）
      if (options?.limit) {
        const offset = options.offset || 0;
        query = query.range(offset, offset + options.limit - 1);
      }

      const { data, error, count } = await query;

      if (error) {
        throw new DataAccessError(
          `Failed to list knowledge bases: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return {
        knowledge_bases: (data || []).map(item => this.mapKnowledgeBase(item)),
        total: count || 0,
      };
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error listing knowledge bases: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  // ========== 文档操作 ==========

  async createDocument(data: CreateKnowledgeDocumentDto): Promise<KnowledgeDocument> {
    try {
      // 使用 uid 生成文档 ID
      const docId = data.id || `doc_${uid(21)}`;
      
      const { data: result, error } = await this.client
        .from('knowledge_base_documents')
        .insert({
          id: docId,
          knowledge_base_name: data.knowledge_base_name,
          title: data.title,
          content: data.content,
          content_type: data.content_type || 'text',
          embedding: data.embedding,
          metadata: data.metadata || {},
          tags: data.tags || [],
          user_id: data.user_id,
          is_public: data.is_public || false,
        })
        .select()
        .single();

      if (error) {
        throw new DataAccessError(
          `Failed to create document: ${error.message}`,
          'INSERT_ERROR',
          error
        );
      }

      return this.mapDocument(result);
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error creating document: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  async findDocumentById(id: string): Promise<KnowledgeDocument | null> {
    try {
      const { data, error } = await this.client
        .from('knowledge_base_documents')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new DataAccessError(
          `Failed to find document: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return data ? this.mapDocument(data) : null;
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error finding document: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  async updateDocument(id: string, data: UpdateKnowledgeDocumentDto): Promise<KnowledgeDocument> {
    try {
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (data.title !== undefined) updateData.title = data.title;
      if (data.content !== undefined) updateData.content = data.content;
      if (data.content_type !== undefined) updateData.content_type = data.content_type;
      if (data.embedding !== undefined) updateData.embedding = data.embedding;
      if (data.metadata !== undefined) updateData.metadata = data.metadata;
      if (data.tags !== undefined) updateData.tags = data.tags;
      if (data.is_public !== undefined) updateData.is_public = data.is_public;

      const { data: result, error } = await this.client
        .from('knowledge_base_documents')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw new DataAccessError(
          `Failed to update document: ${error.message}`,
          'UPDATE_ERROR',
          error
        );
      }

      return this.mapDocument(result);
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error updating document: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  async deleteDocument(id: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('knowledge_base_documents')
        .delete()
        .eq('id', id);

      if (error) {
        throw new DataAccessError(
          `Failed to delete document: ${error.message}`,
          'DELETE_ERROR',
          error
        );
      }
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error deleting document: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  async updateDocumentEmbedding(id: string, embedding: number[]): Promise<void> {
    try {
      const { error } = await this.client
        .from('knowledge_base_documents')
        .update({ embedding })
        .eq('id', id);

      if (error) {
        throw new DataAccessError(
          `Failed to update document embedding: ${error.message}`,
          'UPDATE_ERROR',
          error
        );
      }
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error updating document embedding: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  async listDocuments(
    knowledgeBaseName: string,
    options?: {
      user_id?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ documents: KnowledgeDocument[]; total: number }> {
    try {
      let query = this.client
        .from('knowledge_base_documents')
        .select('*', { count: 'exact' })
        .eq('knowledge_base_name', knowledgeBaseName);

      if (options?.user_id) {
        query = query.eq('user_id', options.user_id);
      }

      query = query.order('created_at', { ascending: false });

      // 使用 range 方法替代 offset（PostgREST 推荐方式）
      if (options?.limit) {
        const offset = options.offset || 0;
        query = query.range(offset, offset + options.limit - 1);
      }

      const { data, error, count } = await query;

      if (error) {
        throw new DataAccessError(
          `Failed to list documents: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return {
        documents: (data || []).map(item => this.mapDocument(item)),
        total: count || 0,
      };
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error listing documents: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  // ========== 检索操作 ==========

  async searchDocuments(
    queryEmbedding: number[],
    knowledgeBaseName: string,
    options?: {
      limit?: number;
      threshold?: number;
      userId?: string;
    }
  ): Promise<KnowledgeSearchResult[]> {
    try {
      const { data, error } = await this.client.rpc('search_knowledge_base', {
        query_embedding: queryEmbedding,
        kb_name: knowledgeBaseName,
        match_limit: options?.limit || 5,
        match_threshold: options?.threshold || 0.7,
        user_id_filter: options?.userId || null,
      });

      if (error) {
        throw new DataAccessError(
          `Failed to search documents: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return (data || []).map((item: any) => ({
        id: item.id,
        title: item.title,
        content: item.content,
        similarity: item.similarity,
        metadata: item.metadata,
        tags: item.tags,
      }));
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error searching documents: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  async searchByKeyword(
    keyword: string,
    knowledgeBaseName: string,
    options?: {
      limit?: number;
      userId?: string;
    }
  ): Promise<KnowledgeDocument[]> {
    try {
      let query = this.client
        .from('knowledge_base_documents')
        .select('*')
        .eq('knowledge_base_name', knowledgeBaseName)
        .or(`content.ilike.%${keyword}%,title.ilike.%${keyword}%`);

      if (options?.userId) {
        query = query.or(`is_public.eq.true,user_id.eq.${options.userId}`);
      } else {
        query = query.eq('is_public', true);
      }

      query = query.order('created_at', { ascending: false });

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) {
        throw new DataAccessError(
          `Failed to search by keyword: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return (data || []).map(item => this.mapDocument(item));
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error searching by keyword: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  async hybridSearch(
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
  ): Promise<KnowledgeHybridSearchResult[]> {
    try {
      const { data, error } = await this.client.rpc('hybrid_search_knowledge_base', {
        query_embedding: queryEmbedding,
        keyword: keyword,
        kb_name: knowledgeBaseName,
        match_limit: options?.limit || 5,
        match_threshold: options?.threshold || 0.7,
        vector_weight: options?.vectorWeight || 0.7,
        keyword_weight: options?.keywordWeight || 0.3,
        user_id_filter: options?.userId || null,
      });

      if (error) {
        throw new DataAccessError(
          `Failed to hybrid search: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return (data || []).map((item: any) => ({
        id: item.id,
        title: item.title,
        content: item.content,
        similarity: item.similarity,
        keyword_score: item.keyword_score,
        combined_score: item.combined_score,
        metadata: item.metadata,
        tags: item.tags,
      }));
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error hybrid searching: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  // ========== 辅助方法 ==========

  private mapKnowledgeBase(data: any): KnowledgeBase {
    return {
      id: data.id,
      name: data.name,
      display_name: data.display_name,
      description: data.description,
      type: data.type,
      embedding_model: data.embedding_model,
      agent_id: data.agent_id,
      agent_name: data.agent_name,
      is_builtin: data.is_builtin,
      is_public: data.is_public,
      owner_id: data.owner_id,
      document_count: data.document_count || 0,
      total_size_bytes: data.total_size_bytes || 0,
      config: data.config || {},
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  private mapDocument(data: any): KnowledgeDocument {
    return {
      id: data.id,
      knowledge_base_name: data.knowledge_base_name,
      title: data.title,
      content: data.content,
      content_type: data.content_type,
      embedding: data.embedding ? Array.from(data.embedding) : undefined,
      metadata: data.metadata || {},
      tags: data.tags || [],
      user_id: data.user_id,
      is_public: data.is_public,
      view_count: data.view_count || 0,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }
}

