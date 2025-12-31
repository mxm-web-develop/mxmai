/**
 * Supabase CGI Task 数据仓库实现
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type {
  ICGITaskRepository,
  CGITask,
  CreateCGITaskDto,
  UpdateCGITaskDto,
  ListCGITasksOptions,
} from '../../interfaces/ICGITaskRepository';
import { NotFoundError, DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

export class SupabaseCGITaskRepository implements ICGITaskRepository {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client || getSupabaseClient();
  }

  async findById(id: string, includeDeleted: boolean = false): Promise<CGITask | null> {
    try {
      let query = this.client
        .from('cgi_tasks')
        .select('*')
        .eq('id', id);

      // 普通用户查询时，过滤掉已软删除的任务
      if (!includeDeleted) {
        query = query.is('deleted_at', null);
      }

      const { data, error } = await query.single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new DataAccessError(`Failed to find CGI task by id: ${error.message}`, 'QUERY_ERROR', error);
      }

      return data ? this.mapToCGITask(data) : null;
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error finding CGI task by id: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async create(data: CreateCGITaskDto): Promise<CGITask> {
    try {
      // 如果没有提供 id，使用 uid 生成（21 字符长度）
      const { uid } = await import('uid');
      const taskId = data.id || uid(21);
      
      const insertData = {
        id: taskId,
        user_id: data.user_id,
        task_type: data.task_type,
        model_name: data.model_name,
        model_provider: data.model_provider || null,
        status: 'pending' as const,
        progress: 0,
        input_data: data.input_data,
        prompt: data.prompt || null,
        result_format: data.result_format || 'base64',
        metadata: data.metadata || null,
      };

      const { data: created, error } = await this.client
        .from('cgi_tasks')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        throw new DataAccessError(`Failed to create CGI task: ${error.message}`, 'INSERT_ERROR', error);
      }

      return this.mapToCGITask(created);
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error creating CGI task: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async update(id: string, data: UpdateCGITaskDto): Promise<CGITask> {
    try {
      const updateData: any = {};

      if (data.status !== undefined) {
        updateData.status = data.status;
      }
      if (data.progress !== undefined) {
        updateData.progress = data.progress;
      }
      if (data.error_message !== undefined) {
        updateData.error_message = data.error_message;
      }
      if (data.output_data !== undefined) {
        updateData.output_data = data.output_data;
      }
      if (data.storage_info !== undefined) {
        updateData.storage_info = data.storage_info;
      }
      if (data.queued_at !== undefined) {
        updateData.queued_at = data.queued_at;
      }
      if (data.started_at !== undefined) {
        updateData.started_at = data.started_at;
      }
      if (data.completed_at !== undefined) {
        updateData.completed_at = data.completed_at;
      }
      if (data.metadata !== undefined) {
        updateData.metadata = data.metadata;
      }

      const { data: updated, error } = await this.client
        .from('cgi_tasks')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundError(`CGI task not found: ${id}`);
        }
        throw new DataAccessError(`Failed to update CGI task: ${error.message}`, 'UPDATE_ERROR', error);
      }

      return this.mapToCGITask(updated);
    } catch (error) {
      if (error instanceof DataAccessError || error instanceof NotFoundError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error updating CGI task: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('cgi_tasks')
        .delete()
        .eq('id', id);

      if (error) {
        throw new DataAccessError(`Failed to delete CGI task: ${error.message}`, 'DELETE_ERROR', error);
      }
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error deleting CGI task: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async softDelete(id: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('cgi_tasks')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundError(`CGI task not found: ${id}`);
        }
        throw new DataAccessError(`Failed to soft delete CGI task: ${error.message}`, 'UPDATE_ERROR', error);
      }
    } catch (error) {
      if (error instanceof DataAccessError || error instanceof NotFoundError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error soft deleting CGI task: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async findMany(options?: ListCGITasksOptions): Promise<{ tasks: CGITask[]; total: number }> {
    try {
      let query = this.client.from('cgi_tasks').select('*', { count: 'exact' });

      if (options?.user_id) {
        query = query.eq('user_id', options.user_id);
      }
      if (options?.task_type) {
        query = query.eq('task_type', options.task_type);
      }
      if (options?.status) {
        query = query.eq('status', options.status);
      }
      if (options?.model_name) {
        query = query.eq('model_name', options.model_name);
      }

      // 普通用户查询时，过滤掉已软删除的任务（deleted_at IS NULL）
      // admin 用户可以通过 includeDeleted 选项查看所有任务
      if (!options?.includeDeleted) {
        query = query.is('deleted_at', null);
      }

      // 时间范围查询：如果提供了 startDate 或 endDate，使用提供的值
      // 如果没有提供且不是 admin 查询，默认只查询最近 30 天的任务（性能优化）
      const defaultDays = 30;
      const now = new Date();
      const defaultStartDate = new Date(now.getTime() - defaultDays * 24 * 60 * 60 * 1000);

      if (options?.startDate) {
        const startDate = typeof options.startDate === 'string' ? new Date(options.startDate) : options.startDate;
        query = query.gte('created_at', startDate.toISOString());
      } else if (!options?.includeDeleted) {
        // 普通用户查询时，默认添加时间范围限制（最近 30 天）
        query = query.gte('created_at', defaultStartDate.toISOString());
      }

      if (options?.endDate) {
        const endDate = typeof options.endDate === 'string' ? new Date(options.endDate) : options.endDate;
        query = query.lte('created_at', endDate.toISOString());
      }

      query = query.order('created_at', { ascending: false });

      if (options?.limit) {
        query = query.limit(options.limit);
      }
      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 100) - 1);
      }

      const { data, error, count } = await query;

      if (error) {
        throw new DataAccessError(`Failed to list CGI tasks: ${error.message}`, 'QUERY_ERROR', error);
      }

      const tasks = (data || []).map(item => this.mapToCGITask(item));
      return {
        tasks,
        total: count || 0,
      };
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error listing CGI tasks: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async findByUserId(userId: string, options?: Omit<ListCGITasksOptions, 'user_id'>): Promise<{ tasks: CGITask[]; total: number }> {
    return this.findMany({ ...options, user_id: userId });
  }

  private mapToCGITask(data: any): CGITask {
    return {
      id: data.id,
      user_id: data.user_id,
      task_type: data.task_type,
      model_name: data.model_name,
      model_provider: data.model_provider,
      status: data.status,
      progress: data.progress || 0,
      error_message: data.error_message,
      input_data: data.input_data || {},
      prompt: data.prompt,
      output_data: data.output_data,
      result_format: data.result_format || 'base64',
      storage_info: data.storage_info,
      queued_at: data.queued_at,
      started_at: data.started_at,
      completed_at: data.completed_at,
      created_at: data.created_at,
      updated_at: data.updated_at,
      deleted_at: data.deleted_at,
      metadata: data.metadata,
    };
  }
}
