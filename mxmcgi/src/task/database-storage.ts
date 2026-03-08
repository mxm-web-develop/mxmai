/**
 * 数据库任务存储实现
 * 使用 mxmdata 的 ICGITaskRepository
 *
 * === 时间字段与时区约定（startedAt / completedAt / created_at / updated_at）===
 * - 写入：一律用 UTC。Node 侧用 new Date() 得到“当前时刻”，toISOString() 得到带 Z 的 UTC 字符串写入 DB。
 * - 数据库：cgi_tasks 表使用 TIMESTAMP（无时区），Supabase 返回时会把 ISO 字符串的 Z 去掉，例如 "2026-01-29T22:32:37.654"。
 * - 读取：若直接用 new Date("2026-01-29T22:32:37.654")，按 ES 规范会按本地时间解析，导致与写入时刻不一致。
 *   因此从 DB 读出的时间字符串若无时区后缀（无 Z 或 ±HH:mm），一律按 UTC 解析（见 parseUtcFromDb）。
 * - startedAt：仅在 updateTaskStatus(..., 'processing', ...) 时由 task-manager 设为 new Date()，时区同上。
 * - completedAt：在 setTaskResult / setTaskError 或 updateTaskStatus(..., 'failed'|'completed', ...) 时设为 new Date()。
 * - updatedAt：每次 storage.update 由 task-manager 设为 new Date()；DB 还有触发器可能覆盖 updated_at，读回时仍按 UTC 解析。
 */

import { uid } from 'uid';
import { RepositoryFactory, getSupabaseClient } from '@mxmai/mxmdata';
import type {
  CGITask,
  CreateCGITaskDto,
  UpdateCGITaskDto,
  ListCGITasksOptions,
} from '@mxmai/mxmdata';
import type {
  Task,
  TaskStatus,
  TaskType,
  CreateTaskRequest,
  ListTasksParams,
  TaskProgress,
  TaskResult,
} from './types';
import { sanitizeBase64InObject } from '../core/graph/reference-image';

/**
 * 从数据库读出的时间统一按 UTC 解析。
 * Supabase 对 TIMESTAMP（无时区）返回的 ISO 字符串常无 'Z' 后缀，new Date(s) 会按本地时间解析导致错位。
 */
function parseUtcFromDb(value: string | Date | undefined): Date | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return value;
  const s = String(value).trim();
  if (!s) return undefined;
  if (!/Z|[+-]\d{2}:?\d{2}$/.test(s)) {
    return new Date(s + 'Z');
  }
  return new Date(s);
}

/**
 * 数据库任务存储适配器
 * 将 TaskManager 的 Task 接口适配到 CGITask 数据库模型
 */
export class DatabaseTaskStorage implements TaskStorage {
  private repo;

  constructor() {
    try {
      this.repo = RepositoryFactory.createCGITaskRepository();
    } catch (error) {
      throw new Error(`DatabaseTaskStorage 初始化失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 幂等查询：按 userId + (type, model) + metadata.idempotencyKey 查找已有任务
   * - 用于避免重复创建（重复点击/网络重试）
   */
  async findByIdempotencyKey(input: {
    userId: string;
    idempotencyKey: string;
    type: TaskType;
    model: string;
  }): Promise<Task | null> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('cgi_tasks')
      .select('*')
      .eq('user_id', input.userId)
      .eq('task_type', input.type)
      .eq('model_name', input.model)
      // PostgREST 支持 json path：metadata->>idempotencyKey
      .eq('metadata->>idempotencyKey', input.idempotencyKey)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(`findByIdempotencyKey query failed: ${error.message}`);
    }
    return data ? this.toTask(data as any) : null;
  }

  /**
   * 将 CreateTaskRequest 转换为 CreateCGITaskDto
   */
  private async toCreateDto(request: CreateTaskRequest): Promise<CreateCGITaskDto> {
    // 如果 provider 未指定，使用默认 provider（从环境变量读取）
    let modelProvider = request.provider;
    if (!modelProvider) {
      try {
        const { providerFactory } = await import('../models/providers');
        modelProvider = providerFactory.getDefaultProvider();
        console.log(`[DatabaseTaskStorage] Provider 未指定，使用默认 provider: ${modelProvider}`);
      } catch (error) {
        // 如果连默认 provider 都无法获取，抛出错误（不应该发生，因为环境变量已设置）
        throw new Error(`无法获取默认 provider，请检查 DEFAULT_PROVIDER 环境变量: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    const label =
      (request.params?.metadata && typeof request.params.metadata.label === 'string' ? request.params.metadata.label : undefined) ||
      (typeof (request.params as any)?.label === 'string' ? (request.params as any).label : undefined) ||
      undefined;

    return {
      user_id: request.userId || 'anonymous',
      task_type: request.type,
      model_name: request.model,
      model_provider: modelProvider,
      input_data: request.params,
      prompt: request.params.prompt,
      result_format: request.storeToMinio ? 'minio' : 'base64',
      storage_config: request.storageConfig,
      metadata: {
        storeToMinio: request.storeToMinio || false,
        storageConfig: request.storageConfig,
        ...(label ? { label } : {}),
        ...(request.idempotencyKey ? { idempotencyKey: request.idempotencyKey } : {}),
      },
    };
  }

  /**
   * 将 CGITask 转换为 Task
   */
  private toTask(cgiTask: CGITask): Task {
    return {
      id: cgiTask.id,
      type: cgiTask.task_type,
      status: cgiTask.status as TaskStatus,
      progress: {
        status: cgiTask.status as TaskStatus,
        progress: cgiTask.progress,
        error: cgiTask.error_message,
        startedAt: parseUtcFromDb(cgiTask.started_at),
        completedAt: parseUtcFromDb(cgiTask.completed_at),
      },
      result: cgiTask.output_data
        ? {
            mediaUrls: cgiTask.output_data.mediaUrls || [],
            storageInfo: cgiTask.storage_info,
            metadata: cgiTask.output_data.metadata,
          }
        : undefined,
      metadata: {
        model: cgiTask.model_name,
        provider: cgiTask.model_provider || 'unknown',
        userId: cgiTask.user_id,
        storeToMinio: cgiTask.result_format === 'minio',
        storageConfig: cgiTask.metadata?.storageConfig,
        // 合并数据库中的 metadata（可能包含 graphType, type, childTaskIds 等）
        ...(cgiTask.metadata || {}),
      },
      createdAt: parseUtcFromDb(cgiTask.created_at) ?? new Date(0),
      updatedAt: parseUtcFromDb(cgiTask.updated_at) ?? new Date(0),
      requestParams: cgiTask.input_data,
    };
  }

  /**
   * 创建任务并返回 ID（用于 TaskManager）
   */
  async createAndGetId(request: CreateTaskRequest): Promise<string> {
    // 清理 requestParams 中的 base64 数据（避免存储和返回时数据过大）
    const sanitizedParams = sanitizeBase64InObject(request.params);
    
    // 生成 uid 作为任务 ID
    const taskId = uid(21);
    // 使用清理后的参数创建 DTO
    const dto = await this.toCreateDto({
      ...request,
      params: sanitizedParams,
    });
    // 设置 id
    const created = await this.repo.create({ ...dto, id: taskId });
    return created.id;
  }

  async save(task: Task): Promise<void> {
    // Task 已经存在，使用 update
    if (task.id) {
      const cgiTask = await this.repo.findById(task.id);
      if (cgiTask) {
        await this.update(task.id, {
          status: task.status,
          progress: task.progress,
          result: task.result,
        });
        return;
      }
    }
    
    // 新任务，使用 create
    // 注意：如果 task.id 为空，数据库会自动生成 UUID
    const dto = await this.toCreateDto({
      type: task.type,
      model: task.metadata.model,
      provider: task.metadata.provider,
      params: task.requestParams,
      userId: task.metadata.userId,
      storeToMinio: task.metadata.storeToMinio,
      storageConfig: task.metadata.storageConfig,
    });
    const created = await this.repo.create(dto);
    
    // 如果创建后需要立即更新状态（如已设置进度），进行更新
    if (task.status !== 'pending' || task.progress.progress !== 0 || task.result) {
      await this.repo.update(created.id, {
        status: task.status as any,
        progress: task.progress.progress || 0,
        error_message: task.progress.error,
        output_data: task.result
          ? {
              mediaUrls: task.result.mediaUrls,
              metadata: task.result.metadata,
            }
          : undefined,
        storage_info: task.result?.storageInfo,
        started_at: task.progress.startedAt?.toISOString(),
        completed_at: task.progress.completedAt?.toISOString(),
      });
    }
  }

  async get(taskId: string, includeDeleted: boolean = false): Promise<Task | null> {
    const cgiTask = await this.repo.findById(taskId, includeDeleted);
    return cgiTask ? this.toTask(cgiTask) : null;
  }

  async list(params: ListTasksParams): Promise<{ tasks: Task[]; total: number }> {
    const options: ListCGITasksOptions = {
      user_id: params.userId,
      task_type: params.type,
      status: params.status,
      model_name: params.model,
      limit: params.limit,
      offset: params.offset,
      includeDeleted: (params as any).includeDeleted || false, // 默认不包含已删除的任务
      startDate: params.startDate,
      endDate: params.endDate,
    };

    const { tasks, total } = await this.repo.findMany(options);
    return {
      tasks: tasks.map(t => this.toTask(t)),
      total, // 符合条件的任务总数（不受分页限制，已排除父任务）
    };
  }

  async update(taskId: string, updates: Partial<Task>): Promise<void> {
    const updateDto: UpdateCGITaskDto = {};

    // 支持更新任务类型（用于九宫格父任务转换）
    if (updates.type !== undefined) {
      updateDto.task_type = updates.type as any;
    }

    if (updates.status !== undefined) {
      updateDto.status = updates.status as any;
    }
    if (updates.progress !== undefined) {
      updateDto.progress = updates.progress.progress;
      // 如果 error 字段存在（包括 undefined），更新 error_message
      // undefined 表示要清空错误信息，设置为 null
      if ('error' in updates.progress) {
        updateDto.error_message = updates.progress.error || null;
      }
      if (updates.progress.startedAt !== undefined) {
        // 确保使用 UTC 时间（ISO 8601 格式），统一时区
        // toISOString() 返回的是 UTC 时间的 ISO 8601 格式字符串（如 "2026-01-21T06:44:37.907Z"）
        const startedAtDate = updates.progress.startedAt instanceof Date 
          ? updates.progress.startedAt 
          : new Date(updates.progress.startedAt);
        updateDto.started_at = startedAtDate.toISOString();
      }
      if (updates.progress.completedAt !== undefined) {
        // 确保使用 UTC 时间（ISO 8601 格式），统一时区
        const completedAtDate = updates.progress.completedAt instanceof Date 
          ? updates.progress.completedAt 
          : new Date(updates.progress.completedAt);
        updateDto.completed_at = completedAtDate.toISOString();
      }
    }
    if (updates.result !== undefined) {
      updateDto.output_data = {
        mediaUrls: updates.result.mediaUrls,
        metadata: updates.result.metadata,
      };
      updateDto.storage_info = updates.result.storageInfo;
    }
    // 支持更新任务 metadata（例如：provider/model/graph-type 等）
    if (updates.metadata !== undefined) {
      updateDto.metadata = updates.metadata as any;
    }

    await this.repo.update(taskId, updateDto);
  }

  async delete(taskId: string): Promise<void> {
    await this.repo.delete(taskId);
  }

  async softDelete(taskId: string): Promise<void> {
    await this.repo.softDelete(taskId);
  }
}
