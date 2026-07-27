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
      if (data.input_data !== undefined) {
        updateData.input_data = data.input_data;
      }
      if (data.prompt !== undefined) {
        updateData.prompt = data.prompt;
      }

      const { data: updated, error } = await runWithSingleUpdateRetry(() =>
        this.client.from('cgi_tasks').update(updateData).eq('id', id).select().single()
      );

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundError('CGI task', id);
        }
        throw new DataAccessError(
          `Failed to update CGI task: ${error.message}`,
          'UPDATE_ERROR',
          error instanceof Error ? error : new Error(error.message)
        );
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
      const listColumns = options?.summary
        ? 'id, user_id, task_type, model_name, model_provider, status, progress, error_message, prompt, result_format, metadata, storage_info, started_at, completed_at, created_at, updated_at, deleted_at'
        : '*';
      let query = this.client.from('cgi_tasks').select(listColumns, { count: 'exact' });

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

      // 创作来源：open_api 有 publishedSlug；web 无（兼容历史无 creationSource 字段）
      if (options?.creationSource === 'open_api') {
        query = query.not('metadata->>publishedSlug', 'is', null).neq('metadata->>publishedSlug', '');
      } else if (options?.creationSource === 'web') {
        query = query.or('metadata->>publishedSlug.is.null,metadata->>publishedSlug.eq.');
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
      const total = count ?? tasks.length;

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

  async claimPendingTasks(workerId: string, limit: number = 1): Promise<CGITask[]> {
    try {
      const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 50) : 1;
      const { data, error } = await this.client.rpc('claim_pending_cgi_tasks', {
        p_worker_id: workerId,
        p_limit: safeLimit,
      });

      if (error) {
        throw new DataAccessError(
          `Failed to claim pending CGI tasks: ${error.message}`,
          'RPC_ERROR',
          error
        );
      }

      const rows = Array.isArray(data) ? data : data ? [data] : [];
      return rows.map((row) => this.mapToCGITask(row));
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(
        `Unexpected error claiming pending CGI tasks: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
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

type SupabaseQueryResult<T> = { data: T | null; error: { code?: string; message: string } | null };

/**
 * 单次 cgi_tasks update 在以下情况重试一次：
 * - Supabase / PostgREST 命中 PG `statement_timeout`（错误信息含 `canceling statement`）
 * - 网络瞬断（错误 code `PGRST000` / `ECONNRESET` / `fetch failed`）
 * 单次重试 + 100ms 退避，避免无限重试放大 DB 压力。
 * 注意：retry 内仍可能瞬时失败（DB 真实并发），最终 throw 让上层 catch。
 */
async function runWithSingleUpdateRetry<T>(
  fn: () => PromiseLike<SupabaseQueryResult<T>>
): Promise<SupabaseQueryResult<T>> {
  const first = await fn();
  if (!first.error) return first;

  const msg = first.error.message || '';
  const code = first.error.code || '';
  const retriable =
    msg.includes('canceling statement due to statement timeout') ||
    msg.includes('canceling statement due to conflict') ||
    msg.toLowerCase().includes('fetch failed') ||
    code === 'PGRST000' ||
    code === '408' ||
    code === '503' ||
    code === '504' ||
    code === 'ECONNRESET';
  if (!retriable) return first;

  await sleep(150);
  const second = await fn();
  return second;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
