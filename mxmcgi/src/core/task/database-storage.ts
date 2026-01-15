/**
 * 数据库任务存储实现
 * 使用 mxmdata 的 ICGITaskRepository
 */

import { uid } from 'uid';
import { RepositoryFactory } from '@mxmai/mxmdata';
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
import { sanitizeBase64InObject } from '../graph/reference-image';

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
   * 将 CreateTaskRequest 转换为 CreateCGITaskDto
   */
  private async toCreateDto(request: CreateTaskRequest): Promise<CreateCGITaskDto> {
    // 如果 provider 未指定，使用默认 provider（从环境变量读取）
    let modelProvider = request.provider;
    if (!modelProvider) {
      try {
        const { providerFactory } = await import('../providers');
        modelProvider = providerFactory.getDefaultProvider();
        console.log(`[DatabaseTaskStorage] Provider 未指定，使用默认 provider: ${modelProvider}`);
      } catch (error) {
        // 如果连默认 provider 都无法获取，抛出错误（不应该发生，因为环境变量已设置）
        throw new Error(`无法获取默认 provider，请检查 DEFAULT_PROVIDER 环境变量: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
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
        startedAt: cgiTask.started_at ? new Date(cgiTask.started_at) : undefined,
        completedAt: cgiTask.completed_at ? new Date(cgiTask.completed_at) : undefined,
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
      },
      createdAt: new Date(cgiTask.created_at),
      updatedAt: new Date(cgiTask.updated_at),
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

  async list(params: ListTasksParams): Promise<Task[]> {
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

    const { tasks } = await this.repo.findMany(options);
    return tasks.map(t => this.toTask(t));
  }

  async update(taskId: string, updates: Partial<Task>): Promise<void> {
    const updateDto: UpdateCGITaskDto = {};

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
        updateDto.started_at = updates.progress.startedAt.toISOString();
      }
      if (updates.progress.completedAt !== undefined) {
        updateDto.completed_at = updates.progress.completedAt.toISOString();
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
