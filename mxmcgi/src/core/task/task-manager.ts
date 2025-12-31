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

/**
 * 任务存储接口（可以替换为 Redis、数据库等）
 */
export interface TaskStorage {
  save(task: Task): Promise<void>;
  get(taskId: string): Promise<Task | null>;
  list(params: ListTasksParams): Promise<Task[]>;
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

  async list(params: ListTasksParams): Promise<Task[]> {
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

    // 分页
    const offset = params.offset || 0;
    const limit = params.limit || 100;
    return tasks.slice(offset, offset + limit);
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
    // 如果 provider 未指定，尝试通过 providerFactory 确定应该使用的 provider
    let provider: string | undefined = request.provider;
    if (!provider && request.model) {
      try {
        const { providerFactory } = await import('../providers');
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
          const { providerFactory } = await import('../providers');
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
        const { providerFactory } = await import('../providers');
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
      });
      const createdTask = await this.storage.get(taskId);
      if (!createdTask) {
        throw new Error('Failed to create task');
      }
      return {
        taskId: createdTask.id,
        status: createdTask.status,
        createdAt: createdTask.createdAt,
      };
    }

    // 内存存储：使用 UID
    const now = new Date();
    const taskId = uid(21); // 生成 21 字符长度的唯一 ID
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
      },
      createdAt: now,
      updatedAt: now,
      requestParams: request.params,
    };

    await this.storage.save(task);

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

    if (status === 'processing' && !task.progress.startedAt) {
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
   */
  async setTaskResult(taskId: string, result: TaskResult): Promise<void> {
    const task = await this.storage.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

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
  }

  /**
   * 设置任务错误
   */
  async setTaskError(taskId: string, error: string): Promise<void> {
    const task = await this.storage.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    await this.storage.update(taskId, {
      status: 'failed',
      progress: {
        ...task.progress,
        status: 'failed',
        error,
        completedAt: new Date(),
      },
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
    const tasks = await this.storage.list(listParams);
    const total = tasks.length; // 简化实现，实际应该从存储层获取总数
    const limit = params.limit || 100;
    const offset = params.offset || 0;

    return {
      tasks,
      total,
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
