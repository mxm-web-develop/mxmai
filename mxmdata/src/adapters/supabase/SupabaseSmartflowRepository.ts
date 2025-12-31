/**
 * Supabase Smartflow 数据仓库实现
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { ISmartflowRepository } from '../../interfaces/ISmartflowRepository';
import type {
  Smartflow,
  CreateSmartflowDto,
  UpdateSmartflowDto,
} from '../../models/Smartflow';
import { NotFoundError, DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

export class SupabaseSmartflowRepository implements ISmartflowRepository {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client || getSupabaseClient();
  }

  /**
   * 根据 ID 查找 Smartflow
   */
  async findById(id: string): Promise<Smartflow | null> {
    try {
      const { data, error } = await this.client
        .from('smartflows')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new DataAccessError(
          `Failed to find smartflow by id: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return data ? this.mapToSmartflow(data) : null;
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error finding smartflow by id: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  /**
   * 根据用户 ID 查找所有 Smartflow 列表
   */
  async findByUserId(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Smartflow[]> {
    try {
      const { data, error } = await this.client
        .from('smartflows')
        .select('*')
        .eq('author_id', userId)
        .order('updated_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new DataAccessError(
          `Failed to find smartflows by user id: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return (data || []).map((item) => this.mapToSmartflow(item));
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error finding smartflows by user id: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  /**
   * 查找所有公开的 Smartflow
   */
  async findPublic(
    limit: number = 50,
    offset: number = 0
  ): Promise<Smartflow[]> {
    try {
      const { data, error } = await this.client
        .from('smartflows')
        .select('*')
        .eq('is_public', true)
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new DataAccessError(
          `Failed to find public smartflows: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return (data || []).map((item) => this.mapToSmartflow(item));
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error finding public smartflows: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  /**
   * 查找所有 Smartflow（默认返回所有，包括公开和私有的）
   */
  async findAll(
    limit: number = 50,
    offset: number = 0
  ): Promise<Smartflow[]> {
    try {
      const { data, error } = await this.client
        .from('smartflows')
        .select('*')
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new DataAccessError(
          `Failed to find all smartflows: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return (data || []).map((item) => this.mapToSmartflow(item));
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error finding all smartflows: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  /**
   * 创建 Smartflow
   */
  async create(data: CreateSmartflowDto): Promise<Smartflow> {
    try {
      const now = new Date().toISOString();
      const smartflowData = {
        id: data.id || `smartflow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: data.name,
        description: data.description || null,
        category: data.category || null,
        icon: data.icon || null,
        tags: data.tags || [],
        schema: data.schema,
        status: data.status || 'draft',
        version: data.version || '1.0.0',
        author_id: data.author_id || null,
        is_public: data.is_public || false,
        created_at: now,
        updated_at: now,
      };

      const { data: result, error } = await this.client
        .from('smartflows')
        .insert(smartflowData)
        .select()
        .single();

      if (error) {
        throw new DataAccessError(
          `Failed to create smartflow: ${error.message}`,
          'INSERT_ERROR',
          error
        );
      }

      return this.mapToSmartflow(result);
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error creating smartflow: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  /**
   * 更新 Smartflow
   */
  async update(id: string, data: UpdateSmartflowDto): Promise<Smartflow> {
    try {
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.category !== undefined) updateData.category = data.category;
      if (data.icon !== undefined) updateData.icon = data.icon;
      if (data.tags !== undefined) updateData.tags = data.tags;
      if (data.schema !== undefined) updateData.schema = data.schema;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.version !== undefined) updateData.version = data.version;

      const { data: result, error } = await this.client
        .from('smartflows')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundError('Smartflow', id);
        }
        throw new DataAccessError(
          `Failed to update smartflow: ${error.message}`,
          'UPDATE_ERROR',
          error
        );
      }

      return this.mapToSmartflow(result);
    } catch (error) {
      if (error instanceof DataAccessError || error instanceof NotFoundError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error updating smartflow: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  /**
   * 删除 Smartflow
   */
  async delete(id: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('smartflows')
        .delete()
        .eq('id', id);

      if (error) {
        throw new DataAccessError(
          `Failed to delete smartflow: ${error.message}`,
          'DELETE_ERROR',
          error
        );
      }
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error deleting smartflow: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  /**
   * 映射数据库记录到 Smartflow 模型
   */
  private mapToSmartflow(data: any): Smartflow {
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      category: data.category,
      icon: data.icon,
      tags: data.tags || [],
      schema: data.schema || data.workflow_schema, // 兼容旧字段名
      status: data.status || 'draft',
      version: data.version || '1.0.0',
      author_id: data.author_id,
      is_public: data.is_public || false,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }
}
