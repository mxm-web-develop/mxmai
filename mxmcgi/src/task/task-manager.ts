/**
 * 任务管理器
 * 统一管理异步生成任务
 */

import { uid } from 'uid';
import {
  Task,
  TaskStatus,
  TaskType,
  CreateTaskRequest,
  CreateTaskResponse,
  GetTaskResponse,
  ListTasksParams,
  ListTasksResponse,
  TaskProgress,
  TaskResult,
} from './types';
import { DatabaseTaskStorage } from './database-storage';
import { sanitizeBase64InObject } from '../core/graph/reference-image';
import { deductForTask } from './payment-client';

/**
 * 任务列表结果
 */
export interface TaskListResult {
  tasks: Task[];
  total: number; // 符合条件的任务总数（不受分页限制）
}

/**
 * 任务存储接口（可以替换为 Redis、数据库等）
 */
export interface TaskStorage {
  save(task: Task): Promise<void>;
  get(taskId: string): Promise<Task | null>;
  list(params: ListTasksParams): Promise<TaskListResult>;
  update(taskId: string, updates: Partial<Task>): Promise<void>;
  delete(taskId: string): Promise<void>;
}

/**
 * 内存任务存储（用于开发测试，生产环境应使用 Redis 或数据库）
 */
export class MemoryTaskStorage implements TaskStorage {
  private tasks: Map<string, Task> = new Map();

  async save(task: Task): Promise<void> {
    this.tasks.set(task.id, task);
  }

  async get(taskId: string): Promise<Task | null> {
    return this.tasks.get(taskId) || null;
  }

  async list(params: ListTasksParams): Promise<TaskListResult> {
    let tasks = Array.from(this.tasks.values());

    // 过滤
    if (params.userId) {
      tasks = tasks.filter(t => t.metadata.userId === params.userId);
    }
    if (params.type) {
      tasks = tasks.filter(t => t.type === params.type);
    }
    if (params.status) {
      tasks = tasks.filter(t => t.status === params.status);
    }
    if (params.model) {
      tasks = tasks.filter(t => t.metadata.model === params.model);
    }

    // 排序（最新的在前）
    tasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // 计算总数（在分页前）
    const total = tasks.length;

    // 分页
    const offset = params.offset || 0;
    const limit = params.limit || 100;
    const paginatedTasks = tasks.slice(offset, offset + limit);

    return {
      tasks: paginatedTasks,
      total,
    };
  }

  async update(taskId: string, updates: Partial<Task>): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    Object.assign(task, updates, { updatedAt: new Date() });
    this.tasks.set(taskId, task);
  }

  async delete(taskId: string): Promise<void> {
    this.tasks.delete(taskId);
  }
}

/**
 * 任务管理器
 */
export class TaskManager {
  private storage: TaskStorage;
  private runningTasks: Map<string, Promise<void>> = new Map();

  constructor(storage?: TaskStorage) {
    // 如果提供了存储，直接使用
    if (storage) {
      this.storage = storage;
      return;
    }

    // 延迟初始化：尝试使用数据库存储，如果失败则使用内存存储
    try {
      this.storage = new DatabaseTaskStorage();
    } catch (error) {
      console.warn('[TaskManager] 数据库存储初始化失败，使用内存存储:', error instanceof Error ? error.message : String(error));
      // 使用内存存储作为回退
      this.storage = new MemoryTaskStorage();
    }
  }

  /**
   * 创建任务
   */
  async createTask(request: CreateTaskRequest): Promise<CreateTaskResponse> {
    // -------- 幂等：优先复用已有任务（避免重复点击/重复扣费）--------
    const idempotencyKeyFromParams =
      request.params?.metadata && typeof request.params.metadata.idempotencyKey === 'string'
        ? request.params.metadata.idempotencyKey
        : undefined;
    const idempotencyKey =
      (typeof request.idempotencyKey === 'string' && request.idempotencyKey.trim().length > 0
        ? request.idempotencyKey.trim()
        : undefined) ||
      (idempotencyKeyFromParams && idempotencyKeyFromParams.trim().length > 0
        ? idempotencyKeyFromParams.trim()
        : undefined);

    if (idempotencyKey && request.userId) {
      try {
        // 数据库存储：直接用 supabase 查询 metadata->>idempotencyKey
        if (this.storage instanceof DatabaseTaskStorage) {
          const existing = await (this.storage as any).findByIdempotencyKey({
            userId: request.userId,
            idempotencyKey,
            type: request.type,
            model: request.model,
          });
          if (existing) {
            return {
              taskId: existing.id,
              status: existing.status,
              createdAt: existing.createdAt,
            };
          }
        } else if (this.storage instanceof MemoryTaskStorage) {
          // 内存存储：遍历 map
          const tasks = Array.from((this.storage as any).tasks?.values?.() || []) as any[];
          const existing = tasks.find((t: any) => {
            const metaKey = t?.metadata?.idempotencyKey;
            return (
              t?.metadata?.userId === request.userId &&
              t?.type === request.type &&
              t?.metadata?.model === request.model &&
              typeof metaKey === 'string' &&
              metaKey === idempotencyKey &&
              t?.status !== 'cancelled'
            );
          });
          if (existing) {
            return {
              taskId: existing.id,
              status: existing.status,
              createdAt: existing.createdAt,
            };
          }
        }
      } catch (e) {
        // 幂等查询失败不阻断主流程
        console.warn('[TaskManager] 幂等查询失败，将继续创建新任务:', e instanceof Error ? e.message : String(e));
      }
    }

    // 预扣款：任务创建前调用 mxmpay 扣款（ENABLE_TASK_PAYMENT=true 且 TASK_PRICE_* > 0 时生效）
    if (request.userId) {
      try {
        await deductForTask(request.userId, request.type, idempotencyKey);
      } catch (e) {
        throw new Error(`任务扣款失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // label 统一入口：前端可传 params.label 或 params.metadata.label
    const requestLabel =
      (request.params?.metadata && typeof request.params.metadata.label === 'string' ? request.params.metadata.label : undefined) ||
      (typeof (request.params as any)?.label === 'string' ? (request.params as any).label : undefined) ||
      undefined;

    // 如果 provider 未指定，尝试通过 providerFactory 确定应该使用的 provider
    let provider: string | undefined = request.provider;
    if (!provider && request.model) {
      try {
        const { providerFactory } = await import('../models/providers');
        const modelProvider = providerFactory.getProviderForModel(request.model);
        // 从 provider 实例中获取 provider 类型
        if (modelProvider && typeof (modelProvider as any).provider !== 'undefined') {
          provider = (modelProvider as any).provider;
          console.log(`[TaskManager] 为模型 "${request.model}" 自动选择 provider: ${provider}`);
        } else {
          // 如果无法从 provider 实例获取类型，使用默认 provider
          const defaultProvider = providerFactory.getDefaultProvider();
          provider = defaultProvider;
          console.log(`[TaskManager] 无法从 provider 实例获取类型，使用默认 provider: ${defaultProvider}`);
        }
      } catch (error) {
        // 如果无法确定 provider，使用默认 provider（从环境变量读取）
        console.warn(`[TaskManager] 无法为模型 "${request.model}" 确定 provider，使用默认 provider:`, error instanceof Error ? error.message : String(error));
        try {
          const { providerFactory } = await import('../models/providers');
          provider = providerFactory.getDefaultProvider();
          console.log(`[TaskManager] 使用默认 provider: ${provider}`);
        } catch (defaultError) {
          // 如果连默认 provider 都无法获取，抛出错误（不应该发生，因为环境变量已设置）
          throw new Error(`无法获取默认 provider，请检查 DEFAULT_PROVIDER 环境变量: ${defaultError instanceof Error ? defaultError.message : String(defaultError)}`);
        }
      }
    }
    
    // 如果仍然没有 provider（理论上不应该发生），使用默认 provider
    if (!provider) {
      try {
        const { providerFactory } = await import('../models/providers');
        provider = providerFactory.getDefaultProvider();
        console.log(`[TaskManager] Provider 未指定，使用默认 provider: ${provider}`);
      } catch (error) {
        // 如果连默认 provider 都无法获取，抛出错误
        throw new Error(`无法获取默认 provider，请检查 DEFAULT_PROVIDER 环境变量: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // 如果使用数据库存储，直接通过存储层创建（数据库会生成 ID）
    if (this.storage instanceof DatabaseTaskStorage) {
      // 使用数据库存储的特殊方法创建任务
      const taskId = await (this.storage as DatabaseTaskStorage & { createAndGetId: (req: CreateTaskRequest) => Promise<string> }).createAndGetId({
        ...request,
        provider: provider as any,
        // 兜底：把 idempotencyKey 写入 params.metadata，便于 DB 查询
        params: {
          ...(request.params || {}),
          metadata: {
            ...((request.params && (request.params as any).metadata) || {}),
            ...(idempotencyKey ? { idempotencyKey } : {}),
          },
        },
      });
      const createdTask = await this.storage.get(taskId);
      if (!createdTask) {
        throw new Error('Failed to create task');
      }

      // 数据库存储的 metadata 由存储层组装；这里兜底：若存储层没写入 label，则补一份
      if (requestLabel && !createdTask.metadata?.label) {
        await this.storage.update(taskId, {
          metadata: {
            ...(createdTask.metadata || {}),
            label: requestLabel,
          },
        });
      }
      
      // 任务创建时发送通知
      const { sendTaskStatusNotification } = await import('./notification-hook');
      sendTaskStatusNotification(
        createdTask,
        'pending',
        '任务已创建'
      ).catch((error) => {
        // 通知失败不影响主流程
        console.error(`[TaskManager] Failed to send task creation notification for task ${taskId}:`, error);
      });
      
      return {
        taskId: createdTask.id,
        status: createdTask.status,
        createdAt: createdTask.createdAt,
      };
    }

    // 内存存储：使用 UID
    const now = new Date();
    const taskId = uid(21); // 生成 21 字符长度的唯一 ID
    
    // 清理 requestParams 中的 base64 数据（避免存储和返回时数据过大）
    const sanitizedParams = sanitizeBase64InObject(request.params);
    
    const task: Task = {
      id: taskId,
      type: request.type,
      status: 'pending',
      progress: {
        status: 'pending',
        progress: 0,
      },
      metadata: {
        model: request.model,
        provider: provider || 'unknown',
        userId: request.userId,
        storeToMinio: request.storeToMinio || false,
        storageConfig: request.storageConfig,
        ...(requestLabel ? { label: requestLabel } : {}),
        ...(idempotencyKey ? { idempotencyKey } : {}),
      },
      createdAt: now,
      updatedAt: now,
      requestParams: sanitizedParams, // 使用清理后的参数
    };

    await this.storage.save(task);

    // 任务创建时发送通知
    const { sendTaskStatusNotification } = await import('./notification-hook');
    sendTaskStatusNotification(
      task,
      'pending',
      '任务已创建'
    ).catch((error) => {
      // 通知失败不影响主流程
      console.error(`[TaskManager] Failed to send task creation notification for task ${taskId}:`, error);
    });

    return {
      taskId,
      status: task.status,
      createdAt: task.createdAt,
    };
  }

  /**
   * 获取任务
   * @param includeDeleted 是否包含已软删除的任务（仅 admin 使用）
   */
  async getTask(taskId: string, includeDeleted: boolean = false): Promise<GetTaskResponse> {
    const task = await this.storage.get(taskId, includeDeleted);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    return { task };
  }

  /**
   * 更新任务状态
   */
  async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    progress?: Partial<TaskProgress>
  ): Promise<void> {
    const task = await this.storage.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const updates: Partial<Task> = {
      status,
      progress: {
        ...task.progress,
        ...progress,
        status,
      },
      updatedAt: new Date(),
    };

    // 如果状态重置为 queued 或 processing，清空之前的错误信息
    if (status === 'queued' || status === 'processing') {
      updates.progress = {
        ...updates.progress,
        error: undefined,
      } as TaskProgress;
    }

    // 如果状态更新为 processing，强制更新 startedAt（避免使用数据库中的旧数据）
    // 注意：即使 startedAt 已存在，也要更新，因为可能是之前任务的残留数据
    if (status === 'processing') {
      updates.progress = {
        ...updates.progress,
        startedAt: new Date(),
      } as TaskProgress;
    }

    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      updates.progress = {
        ...updates.progress,
        completedAt: new Date(),
      } as TaskProgress;
    }

    await this.storage.update(taskId, updates);

    // 只在关键状态变化时发送通知：创建（pending）、完成（completed）、失败（failed）
    // 其他状态（queued、processing）不发送通知，避免通知过多
    const shouldNotify = status === 'pending' || status === 'completed' || status === 'failed';
    
    if (shouldNotify) {
      const updatedTask = await this.storage.get(taskId);
      if (updatedTask) {
        // 根据状态生成通知消息
        let statusMessage: string;
        switch (status) {
          case 'pending':
            statusMessage = '任务已创建';
            break;
          case 'completed':
            statusMessage = progress?.logs?.[progress.logs.length - 1] || '任务已完成';
            break;
          case 'failed':
            statusMessage = progress?.logs?.[progress.logs.length - 1] || progress?.error || '任务失败';
            break;
          default:
            statusMessage = `任务状态变更为 ${status}`;
        }

        console.log(`[TaskManager] Sending status notification for task ${taskId}, status: ${status}, userId: ${updatedTask.metadata.userId}`);
        const { sendTaskStatusNotification } = await import('./notification-hook');
        sendTaskStatusNotification(
          updatedTask,
          status,
          statusMessage
        ).catch((err) => {
          // 通知失败不影响主流程
          console.error(`[TaskManager] Failed to send status notification for task ${taskId}:`, err);
        });
      } else {
        console.warn(`[TaskManager] Task ${taskId} not found after status update, cannot send notification`);
      }
    } else {
      // 其他状态变化不发送通知，只记录日志
      console.log(`[TaskManager] Task ${taskId} status changed to ${status}, skipping notification (only notify on pending/completed/failed)`);
    }
  }

  /**
   * 更新任务进度
   */
  async updateTaskProgress(
    taskId: string,
    progress: Partial<TaskProgress>
  ): Promise<void> {
    const task = await this.storage.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    await this.storage.update(taskId, {
      progress: {
        ...task.progress,
        ...progress,
      },
      updatedAt: new Date(),
    });
  }

  /**
   * 设置任务结果
   * 注意：此方法会设置状态为 completed，通知由 updateTaskStatus 统一发送
   */
  async setTaskResult(taskId: string, result: TaskResult): Promise<void> {
    const task = await this.storage.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // 先更新结果和状态
    await this.storage.update(taskId, {
      result,
      status: 'completed',
      progress: {
        ...task.progress,
        status: 'completed',
        progress: 100,
        error: undefined, // 任务成功完成，清空错误信息
        completedAt: new Date(),
      },
      updatedAt: new Date(),
    });

    // 通过 updateTaskStatus 发送通知（统一处理所有状态变化）
    // 这样可以确保通知逻辑一致，并且可以获取到最新的任务数据（包括 result）
    await this.updateTaskStatus(taskId, 'completed', {
      progress: 100,
      completedAt: new Date(),
      logs: ['任务已完成'],
    });
  }

  /**
   * 设置任务错误
   * @param options.completedAt 可选。不传则用当前时间。任务恢复服务标记超时失败时建议传入「startedAt + 超时阈值」，避免显示时间差达数十小时
   */
  async setTaskError(taskId: string, error: string, options?: { completedAt?: Date }): Promise<void> {
    const task = await this.storage.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const completedAt = options?.completedAt ?? new Date();

    await this.storage.update(taskId, {
      status: 'failed',
      progress: {
        ...task.progress,
        status: 'failed',
        error,
        completedAt,
      },
      updatedAt: new Date(),
    });

    // 通过 updateTaskStatus 发送通知（统一处理所有状态变化）
    await this.updateTaskStatus(taskId, 'failed', {
      error,
      completedAt,
      logs: [error],
    });
  }

  /**
   * 仅合并更新任务 result.metadata（用于「保存角色后」将任务中的角色详情替换为 character_ids）
   */
  async patchTaskResultMetadata(taskId: string, metadataPatch: Record<string, unknown>): Promise<void> {
    const task = await this.storage.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    const current = task.result ?? { mediaUrls: [], metadata: {} };
    const newMetadata = { ...(current.metadata || {}), ...metadataPatch };
    await this.storage.update(taskId, {
      result: { ...current, metadata: newMetadata },
      updatedAt: new Date(),
    });
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: string): Promise<void> {
    await this.updateTaskStatus(taskId, 'cancelled');
    
    // 如果任务正在运行，尝试取消
    const runningTask = this.runningTasks.get(taskId);
    if (runningTask) {
      // 注意：这里只是标记为取消，实际的取消逻辑需要在任务执行器中实现
      this.runningTasks.delete(taskId);
    }
  }

  /**
   * 软删除任务（标记 deleted_at，普通用户使用）
   */
  async softDeleteTask(taskId: string): Promise<void> {
    // 检查任务是否存在
    const task = await this.storage.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // 如果存储是 DatabaseTaskStorage，使用软删除
    if (this.storage instanceof DatabaseTaskStorage) {
      await this.storage.softDelete(taskId);
    } else {
      // 内存存储不支持软删除，直接删除
      await this.storage.delete(taskId);
    }
  }

  /**
   * 硬删除任务（真正删除，仅 admin 使用）
   */
  async hardDeleteTask(taskId: string): Promise<void> {
    await this.storage.delete(taskId);
  }

  /**
   * 列出任务
   * 普通用户查询时自动过滤已软删除的任务（deleted_at IS NULL）
   * Admin 用户可以通过 includeDeleted 选项查看所有任务
   */
  async listTasks(params: ListTasksParams): Promise<ListTasksResponse> {
    // 默认不包含已删除的任务（普通用户）
    const listParams = {
      ...params,
      includeDeleted: params.includeDeleted || false,
    };
    const result = await this.storage.list(listParams);
    const limit = params.limit || 100;
    const offset = params.offset || 0;

    return {
      tasks: result.tasks,
      total: result.total, // 符合条件的任务总数（不受分页限制）
      count: result.tasks.length, // 当前分页返回的任务数量
      limit,
      offset,
    };
  }

  /**
   * 注册运行中的任务（用于跟踪和取消）
   */
  registerRunningTask(taskId: string, promise: Promise<void>): void {
    this.runningTasks.set(taskId, promise);
    promise.finally(() => {
      this.runningTasks.delete(taskId);
    });
  }
}

// 延迟初始化单例（避免在模块加载时创建，此时环境变量可能还未加载）
let _taskManager: TaskManager | null = null;

function getTaskManager(): TaskManager {
  if (!_taskManager) {
    _taskManager = new TaskManager();
  }
  return _taskManager;
}

// 导出延迟初始化的 taskManager
export const taskManager = new Proxy({} as TaskManager, {
  get(target, prop) {
    const manager = getTaskManager();
    const value = (manager as any)[prop];
    // 如果是方法，绑定 this
    if (typeof value === 'function') {
      return value.bind(manager);
    }
    return value;
  }
});
