/**
 * Supabase Prompt 模板数据仓库实现
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { IPromptTemplateRepository } from '../../interfaces/IPromptTemplateRepository';
import type {
  PromptTemplate,
  CreatePromptTemplateDto,
  UpdatePromptTemplateDto,
} from '../../models/PromptTemplate';
import { NotFoundError, DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

export class SupabasePromptTemplateRepository implements IPromptTemplateRepository {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client || getSupabaseClient();
  }

  /**
   * 根据 ID 查找模板
   */
  async findById(id: string): Promise<PromptTemplate | null> {
    try {
      const { data, error } = await this.client
        .from('prompt_templates')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new DataAccessError(
          `Failed to find prompt template by id: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return data ? this.mapToPromptTemplate(data) : null;
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error finding prompt template by id: ${error}`,
        'UNKNOWN_ERROR',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 根据名称查找模板
   */
  async findByName(name: string): Promise<PromptTemplate | null> {
    try {
      const { data, error } = await this.client
        .from('prompt_templates')
        .select('*')
        .eq('name', name)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new DataAccessError(
          `Failed to find prompt template by name: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return data ? this.mapToPromptTemplate(data) : null;
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error finding prompt template by name: ${error}`,
        'UNKNOWN_ERROR',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 根据用户 ID 查找所有模板列表
   */
  async findByUserId(
    userId: string,
    limit?: number,
    offset?: number
  ): Promise<PromptTemplate[]> {
    try {
      let query = this.client
        .from('prompt_templates')
        .select('*')
        .eq('author_id', userId)
        .order('updated_at', { ascending: false });

      if (limit) {
        query = query.limit(limit);
      }
      if (offset) {
        query = query.range(offset, offset + (limit || 50) - 1);
      }

      const { data, error } = await query;

      if (error) {
        throw new DataAccessError(
          `Failed to find prompt templates by user id: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return (data || []).map((item) => this.mapToPromptTemplate(item));
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error finding prompt templates by user id: ${error}`,
        'UNKNOWN_ERROR',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 查找所有公开的模板
   */
  async findPublic(limit?: number, offset?: number): Promise<PromptTemplate[]> {
    try {
      let query = this.client
        .from('prompt_templates')
        .select('*')
        .eq('is_public', true)
        .order('usage_count', { ascending: false })
        .order('updated_at', { ascending: false });

      if (limit) {
        query = query.limit(limit);
      }
      if (offset) {
        query = query.range(offset, offset + (limit || 50) - 1);
      }

      const { data, error } = await query;

      if (error) {
        throw new DataAccessError(
          `Failed to find public prompt templates: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return (data || []).map((item) => this.mapToPromptTemplate(item));
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error finding public prompt templates: ${error}`,
        'UNKNOWN_ERROR',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 查找所有模板（默认返回所有，包括公开和私有的）
   */
  async findAll(limit?: number, offset?: number): Promise<PromptTemplate[]> {
    try {
      let query = this.client
        .from('prompt_templates')
        .select('*')
        .order('updated_at', { ascending: false });

      if (limit) {
        query = query.limit(limit);
      }
      if (offset) {
        query = query.range(offset, offset + (limit || 50) - 1);
      }

      const { data, error } = await query;

      if (error) {
        throw new DataAccessError(
          `Failed to find all prompt templates: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return (data || []).map((item) => this.mapToPromptTemplate(item));
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error finding all prompt templates: ${error}`,
        'UNKNOWN_ERROR',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 按分类查找模板
   */
  async findByCategory(
    category: string,
    limit?: number,
    offset?: number
  ): Promise<PromptTemplate[]> {
    try {
      let query = this.client
        .from('prompt_templates')
        .select('*')
        .eq('category', category)
        .order('usage_count', { ascending: false })
        .order('updated_at', { ascending: false });

      if (limit) {
        query = query.limit(limit);
      }
      if (offset) {
        query = query.range(offset, offset + (limit || 50) - 1);
      }

      const { data, error } = await query;

      if (error) {
        throw new DataAccessError(
          `Failed to find prompt templates by category: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return (data || []).map((item) => this.mapToPromptTemplate(item));
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error finding prompt templates by category: ${error}`,
        'UNKNOWN_ERROR',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 创建模板
   */
  async create(data: CreatePromptTemplateDto): Promise<PromptTemplate> {
    try {
      const templateId = data.id || `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const insertData: any = {
        id: templateId,
        name: data.name,
        display_name: data.display_name,
        template: data.template,
        variables: data.variables || [],
        is_public: data.is_public ?? false,
        usage_count: 0,
      };

      if (data.description) {
        insertData.description = data.description;
      }
      if (data.category) {
        insertData.category = data.category;
      }
      if (data.author_id) {
        insertData.author_id = data.author_id;
      }

      const { data: result, error } = await this.client
        .from('prompt_templates')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        throw new DataAccessError(
          `Failed to create prompt template: ${error.message}`,
          'INSERT_ERROR',
          error
        );
      }

      return this.mapToPromptTemplate(result);
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error creating prompt template: ${error}`,
        'UNKNOWN_ERROR',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 更新模板
   */
  async update(id: string, data: UpdatePromptTemplateDto): Promise<PromptTemplate> {
    try {
      const updateData: any = {};

      if (data.display_name !== undefined) {
        updateData.display_name = data.display_name;
      }
      if (data.description !== undefined) {
        updateData.description = data.description;
      }
      if (data.template !== undefined) {
        updateData.template = data.template;
      }
      if (data.variables !== undefined) {
        updateData.variables = data.variables;
      }
      if (data.category !== undefined) {
        updateData.category = data.category;
      }
      if (data.is_public !== undefined) {
        updateData.is_public = data.is_public;
      }

      const { data: result, error } = await this.client
        .from('prompt_templates')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundError('Prompt template', id);
        }
        throw new DataAccessError(
          `Failed to update prompt template: ${error.message}`,
          'UPDATE_ERROR',
          error instanceof Error ? error : new Error(String(error))
        );
      }

      return this.mapToPromptTemplate(result);
    } catch (error) {
      if (error instanceof DataAccessError || error instanceof NotFoundError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error updating prompt template: ${error}`,
        'UNKNOWN_ERROR',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 删除模板
   */
  async delete(id: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('prompt_templates')
        .delete()
        .eq('id', id);

      if (error) {
        throw new DataAccessError(
          `Failed to delete prompt template: ${error.message}`,
          'DELETE_ERROR',
          error
        );
      }
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error deleting prompt template: ${error}`,
        'UNKNOWN_ERROR',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 增加模板使用次数
   */
  async incrementUsageCount(id: string): Promise<void> {
    try {
      const { error } = await this.client.rpc('increment_prompt_template_usage', {
        template_id: id,
      });

      // 如果 RPC 函数不存在，先查询当前值再更新
      if (error && error.message.includes('function') && error.message.includes('does not exist')) {
        const { data: current, error: fetchError } = await this.client
          .from('prompt_templates')
          .select('usage_count')
          .eq('id', id)
          .single();

        if (fetchError) {
          throw new DataAccessError(
            `Failed to fetch current usage count: ${fetchError.message}`,
            'QUERY_ERROR',
            fetchError
          );
        }

        const { error: updateError } = await this.client
          .from('prompt_templates')
          .update({ usage_count: (current?.usage_count || 0) + 1 })
          .eq('id', id);

        if (updateError) {
          throw new DataAccessError(
            `Failed to increment usage count: ${updateError.message}`,
            'UPDATE_ERROR',
            updateError
          );
        }
      } else if (error) {
        throw new DataAccessError(
          `Failed to increment usage count: ${error.message}`,
          'UPDATE_ERROR',
          error
        );
      }
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error incrementing usage count: ${error}`,
        'UNKNOWN_ERROR',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * 映射数据库记录到 PromptTemplate 对象
   */
  private mapToPromptTemplate(data: any): PromptTemplate {
    return {
      id: data.id,
      name: data.name,
      display_name: data.display_name,
      description: data.description || undefined,
      template: data.template,
      variables: data.variables || [],
      category: data.category || undefined,
      author_id: data.author_id || undefined,
      is_public: data.is_public ?? false,
      usage_count: data.usage_count || 0,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }
}
