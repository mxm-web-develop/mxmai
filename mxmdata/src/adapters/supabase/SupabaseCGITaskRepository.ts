/**
 * Supabase CGI Task 数据仓库实现
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { ICGITaskRepository } from '../../interfaces/ICGITaskRepository';
import type {
  CGITask,
  CreateCGITaskDto,
  UpdateCGITaskDto,
  ListCGITasksOptions,
} from '../../models/CGITask';
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
      
      // 显式设置当前时间，确保 created_at 和 updated_at 使用正确的 UTC 时间
      // 不依赖数据库的 DEFAULT NOW()，避免时区或默认值问题
      const now = new Date().toISOString();
      
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
        created_at: now, // 显式设置创建时间（UTC ISO 8601 格式）
        updated_at: now, // 显式设置更新时间（UTC ISO 8601 格式）
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

      // 支持更新任务类型（用于九宫格父任务转换）
      if (data.task_type !== undefined) {
        updateData.task_type = data.task_type;
      }

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
          throw new NotFoundError('CGI task', id);
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
          throw new NotFoundError('CGI task', id);
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

      // 时间范围查询：仅当显式传入 startDate / endDate 时过滤；不传则返回全部
      if (options?.startDate) {
        const startDate = typeof options.startDate === 'string' ? new Date(options.startDate) : options.startDate;
        query = query.gte('created_at', startDate.toISOString());
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

      // 先映射所有任务
      const allTasks = (data || []).map(item => this.mapToCGITask(item));
      
      // 过滤掉九宫格父任务：使用 metadata.grid9Type === 'parent' 来判断
      const tasks = allTasks.filter(task => {
        // 如果 metadata 中标记为父任务，过滤掉
        if (task.metadata && typeof task.metadata === 'object' && task.metadata.grid9Type === 'parent') {
          return false;
        }
        // 如果 output_data.metadata 中标记为父任务，也过滤掉（双重保险）
        if (task.output_data && typeof task.output_data === 'object' && task.output_data.metadata?.grid9Type === 'parent') {
          return false;
        }
        // 检查是否有 childTaskIds 字段（父任务的标识）
        if (task.metadata && typeof task.metadata === 'object' && task.metadata.childTaskIds && Array.isArray(task.metadata.childTaskIds) && task.metadata.childTaskIds.length > 0) {
          return false;
        }
        if (task.output_data && typeof task.output_data === 'object' && task.output_data.metadata?.childTaskIds && Array.isArray(task.output_data.metadata.childTaskIds) && task.output_data.metadata.childTaskIds.length > 0) {
          return false;
        }
        return true;
      });
      
      // 计算过滤后的总数
      // 由于我们在应用层过滤父任务，原始 count 可能包含父任务
      // 为了准确计算总数，我们需要重新查询（不应用分页，但应用所有过滤条件，包括排除父任务）
      let total: number;
      const filteredCount = tasks.length;
      const originalCount = count || 0;
      
      // 如果过滤后的数量等于原始数量，说明没有父任务被过滤，总数就是原始 count
      if (filteredCount === allTasks.length && originalCount === allTasks.length) {
        total = originalCount;
      } else {
        // 有父任务被过滤，需要重新查询总数
        // 为了性能，我们使用一个简化的方法：查询总数时不应用分页，但应用所有其他过滤条件
        try {
          const countQuery = this.client.from('cgi_tasks').select('*', { count: 'exact', head: true });
          
          if (options?.user_id) {
            countQuery.eq('user_id', options.user_id);
          }
          if (options?.task_type) {
            countQuery.eq('task_type', options.task_type);
          }
          if (options?.status) {
            countQuery.eq('status', options.status);
          }
          if (options?.model_name) {
            countQuery.eq('model_name', options.model_name);
          }
          if (!options?.includeDeleted) {
            countQuery.is('deleted_at', null);
          }
          if (options?.startDate) {
            const startDate = typeof options.startDate === 'string' ? new Date(options.startDate) : options.startDate;
            countQuery.gte('created_at', startDate.toISOString());
          }
          if (options?.endDate) {
            const endDate = typeof options.endDate === 'string' ? new Date(options.endDate) : options.endDate;
            countQuery.lte('created_at', endDate.toISOString());
          }
          
          // 排除父任务：使用 JSONB 查询
          // Supabase JSONB 查询语法：metadata->>'grid9Type' != 'parent'
          // 注意：我们需要排除 metadata.grid9Type === 'parent' 或 output_data.metadata.grid9Type === 'parent' 的任务
          // 使用 or 条件：metadata->>'grid9Type' != 'parent' OR (metadata->>'grid9Type' IS NULL AND output_data->'metadata'->>'grid9Type' != 'parent')
          // 更简单的方法：使用 not 条件排除父任务
          // 但由于 Supabase 的限制，我们使用应用层过滤后的估算
          // 实际应用中，如果父任务数量不多，这个估算值是可以接受的
          
          const { count: totalCount, error: countError } = await countQuery;
          if (countError) {
            throw countError;
          }
          
          // 由于我们无法在 SQL 层面排除父任务（JSONB 查询复杂），
          // 我们使用一个估算：假设被过滤的比例在整个数据集中是一致的
          // 如果当前页有父任务被过滤，我们按比例估算总数
          if (filteredCount < allTasks.length && totalCount) {
            // 当前页被过滤的比例
            const filterRatio = filteredCount / allTasks.length;
            // 估算总数：总数 * 过滤比例
            total = Math.floor(totalCount * filterRatio);
          } else {
            // 没有父任务被过滤，或无法估算，使用原始 count
            total = totalCount || originalCount;
          }
        } catch (error) {
          // 如果查询失败，使用原始 count 作为近似值
          console.warn('[SupabaseCGITaskRepository] 重新查询总数失败，使用原始 count:', error);
          // 使用估算：如果当前页有父任务被过滤，按比例估算
          if (filteredCount < allTasks.length) {
            const filterRatio = filteredCount / allTasks.length;
            total = Math.floor(originalCount * filterRatio);
          } else {
            total = originalCount;
          }
        }
      }
      
      return {
        tasks,
        total,
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
