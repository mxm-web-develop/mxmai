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
import { sanitizeBase64InObject } from './reference-image';
import { mediaUrlNeedsObjectStorage, persistTaskResultInlineMedia, sanitizeTaskResultForApiResponse } from './task-result-media-persist';
import { persistTtsSubtitleInResult } from './tts-subtitle-persist';
import { slimTtsTaskResultMetadata } from './tts-result-metadata';
import { normalizeStaleTaskStatus } from './task-status-normalize';
import { deductForTask } from './payment-client';
import { extractRequestLabelFromParams } from './extract-request-label';
import { cleanupStoryboardTempForTaskMetadata } from '../core/video/video-grid-storyboard';
import { cleanupUserUploadTempForTask } from '../storage/user-upload-temp-cleanup';
import {
  isOpenApiTaskMetadata,
  TASK_CREATION_SOURCE_OPEN_API,
  TASK_CREATION_SOURCE_WEB,
  pickOpenApiMetadataFromParams,
} from './creation-source';
import { mergeMetadataWithProgressUx } from './progress-ux';
import {
  extractContentPreviewFromResult,
  extractOutputFormatFromResult,
} from './task-list-summary';

/** 生成类任务完成后 result.mediaUrls 必须为可引用的 http(s)，禁止 data:/纯 base64 落库 */
function taskTypeMustPersistRemoteMediaUrls(type: TaskType): boolean {
  return (
    type === 'graph' ||
    type === 'graph-grid9-parent' ||
    type === 'image' ||
    type === 'video' ||
    type === 'audio' ||
    type === 'music'
  );
}

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
    if (params.creationSource === 'open_api') {
      tasks = tasks.filter((t) => isOpenApiTaskMetadata(t.metadata as Record<string, unknown>));
    } else if (params.creationSource === 'web') {
      tasks = tasks.filter((t) => !isOpenApiTaskMetadata(t.metadata as Record<string, unknown>));
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

    // label 统一入口：前端可传 params.label / params.metadata.label；Task V2 亦可能写在 params.params.metadata.label
    const requestLabel = extractRequestLabelFromParams(request.params as Record<string, unknown>);

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
      
      const refreshed = await this.storage.get(taskId);
      if (refreshed) {
        const { maybeNotifyTaskSnapshot } = await import('./task-notify');
        maybeNotifyTaskSnapshot(refreshed, 'pending', {
          statusMessage: '任务已创建',
          reason: 'create',
          force: true,
        }).catch((error) => {
          console.error(`[TaskManager] Failed to send task creation notification for task ${taskId}:`, error);
        });
        const { enqueueTaskWake } = await import('./task-queue');
        enqueueTaskWake(taskId).catch((error) => {
          console.warn(`[TaskManager] enqueueTaskWake failed for ${taskId}:`, error instanceof Error ? error.message : error);
        });
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

    let params = request.params ? ({ ...request.params } as Record<string, unknown>) : {};
    if (request.type === 'video') {
      const { prepareStoryboardGridForTaskPersist, STORYBOARD_TEMP_KEYS_META } = await import(
        '../core/video/video-grid-storyboard'
      );
      const storyMeta = await prepareStoryboardGridForTaskPersist(taskId, params, {
        provider: provider as string | undefined,
      });
      if (storyMeta) {
        const meta = (params.metadata as Record<string, unknown>) ?? {};
        params = {
          ...params,
          metadata: {
            ...meta,
            [STORYBOARD_TEMP_KEYS_META]: storyMeta.tempR2Keys,
            storyboardTempR2Bucket: storyMeta.bucket,
          },
        };
      }
    }
    if (request.type === 'graph') {
      const { prepareGraphToolsHdForTaskPersist, HD_SOURCE_TEMP_R2_META } = await import(
        '../core/graph/tools/graph-tools-hd-persist'
      );
      const hdMeta = await prepareGraphToolsHdForTaskPersist(taskId, params);
      if (hdMeta) {
        const meta = (params.metadata as Record<string, unknown>) ?? {};
        params = {
          ...params,
          metadata: {
            ...meta,
            [HD_SOURCE_TEMP_R2_META]: hdMeta.tempR2Key,
            hdSourceTempR2Bucket: hdMeta.bucket,
          },
        };
      }
    }
    
    // 清理 requestParams 中的 base64 数据（避免存储和返回时数据过大）
    const sanitizedParams = sanitizeBase64InObject(params);
    const openApiMeta = pickOpenApiMetadataFromParams(request.params);

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
        ...openApiMeta,
        creationSource: openApiMeta.creationSource ?? TASK_CREATION_SOURCE_WEB,
        ...((params.metadata as Record<string, unknown>) ?? {}),
      },
      createdAt: now,
      updatedAt: now,
      requestParams: sanitizedParams, // 使用清理后的参数
    };

    await this.storage.save(task);

    const { maybeNotifyTaskSnapshot } = await import('./task-notify');
    maybeNotifyTaskSnapshot(task, 'pending', {
      statusMessage: '任务已创建',
      reason: 'create',
      force: true,
    }).catch((error) => {
      console.error(`[TaskManager] Failed to send task creation notification for task ${taskId}:`, error);
    });

    const { enqueueTaskWake } = await import('./task-queue');
    enqueueTaskWake(taskId).catch((error) => {
      console.warn(`[TaskManager] enqueueTaskWake failed for ${taskId}:`, error instanceof Error ? error.message : error);
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
   * 详情 API：修正陈旧 awaiting_review、lazy 转存内联媒体，响应体不含巨型 base64
   */
  async getTaskForApi(taskId: string, includeDeleted: boolean = false): Promise<GetTaskResponse> {
    const raw = await this.storage.get(taskId, includeDeleted);
    if (!raw) {
      throw new Error(`Task ${taskId} not found`);
    }

    let task = raw;
    const { task: normalized, repaired: statusRepaired } = normalizeStaleTaskStatus(task);
    task = normalized;

    let mediaRepaired = false;
    const hasInlineMedia = task.result?.mediaUrls?.some(
      (u) => typeof u === 'string' && mediaUrlNeedsObjectStorage(u)
    );

    if (hasInlineMedia && task.result) {
      try {
        const persisted = await persistTaskResultInlineMedia(task, task.result);
        task = { ...task, result: persisted };
        mediaRepaired = true;
      } catch (err) {
        console.warn('[TaskManager] getTaskForApi 内联媒体转存失败，仅净化响应体', {
          taskId,
          error: err instanceof Error ? err.message : String(err),
        });
        task = sanitizeTaskResultForApiResponse(task);
      }
    } else {
      task = sanitizeTaskResultForApiResponse(task);
    }

    if (statusRepaired || mediaRepaired) {
      const updates: Partial<Task> = {};
      if (statusRepaired) {
        updates.status = task.status;
        updates.progress = task.progress;
      }
      if (mediaRepaired && task.result) {
        updates.result = task.result;
      }
      await this.storage.update(taskId, updates);
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

    const metaWithUx = mergeMetadataWithProgressUx(
      task.metadata as Record<string, unknown> | undefined,
      progress
    );
    if (metaWithUx) {
      updates.metadata = metaWithUx as Task['metadata'];
    }

    // 重新入队（如前置审核通过后继续 TTS）：清空 started_at，否则 claim RPC 无法领取
    if (status === 'pending') {
      updates.progress = {
        ...updates.progress,
        startedAt: null,
        completedAt: null,
      } as TaskProgress;
    }

    // 非 failed 终态：清空历史 error（重试/进入审核后列表不应再显示旧失败信息）
    if (
      status === 'queued' ||
      status === 'processing' ||
      status === 'pending' ||
      status === 'awaiting_review' ||
      status === 'completed'
    ) {
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
      if (status === 'cancelled') {
        void cleanupStoryboardTempForTaskMetadata(task.metadata as Record<string, unknown>).catch((err) => {
          console.warn('[TaskManager] storyboard temp cleanup on cancel failed:', err);
        });
        const uid = (task.metadata as Record<string, unknown>)?.userId;
        if (typeof uid === 'string' && uid) {
          void cleanupUserUploadTempForTask(taskId, uid).catch((err) => {
            console.warn('[TaskManager] user upload temp cleanup on cancel failed:', err);
          });
        }
      }
    }

    await this.storage.update(taskId, updates);

    const notifyStatuses: TaskStatus[] = [
      'pending',
      'queued',
      'processing',
      'awaiting_review',
      'completed',
      'failed',
      'cancelled',
    ];

    if (notifyStatuses.includes(status)) {
      const updatedTask = await this.storage.get(taskId);
      if (updatedTask) {
        let statusMessage: string | undefined;
        switch (status) {
          case 'completed':
            statusMessage = progress?.logs?.[progress.logs.length - 1] || '任务已完成';
            break;
          case 'failed':
            statusMessage = progress?.logs?.[progress.logs.length - 1] || progress?.error || '任务失败';
            break;
          default:
            break;
        }

        const reason =
          status === 'completed' || status === 'failed' || status === 'cancelled'
            ? 'terminal'
            : 'status';

        const { maybeNotifyTaskSnapshot } = await import('./task-notify');
        maybeNotifyTaskSnapshot(updatedTask, status, {
          statusMessage,
          reason,
          force:
            status === 'pending' ||
            status === 'completed' ||
            status === 'failed' ||
            status === 'cancelled',
        }).catch((err) => {
          console.error(`[TaskManager] Failed to send status notification for task ${taskId}:`, err);
        });
      }
    }
  }

  /**
   * 更新任务进度（非终态下百分比单调不减，避免管道阶段硬编码回跳）
   */
  async updateTaskProgress(
    taskId: string,
    progress: Partial<TaskProgress>
  ): Promise<void> {
    const task = await this.storage.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const prevPct = typeof task.progress?.progress === 'number' ? task.progress.progress : 0;
    const nextPct = typeof progress.progress === 'number' ? progress.progress : undefined;
    const terminal =
      task.status === 'completed' ||
      task.status === 'failed' ||
      task.status === 'cancelled' ||
      task.status === 'network_error';
    const mergedPct =
      nextPct == null
        ? task.progress?.progress
        : terminal
          ? nextPct
          : Math.max(prevPct, nextPct);

    const nextProgress: TaskProgress = {
      ...task.progress,
      ...progress,
      ...(mergedPct != null ? { progress: mergedPct } : {}),
      status: progress.status ?? task.status,
    };

    const updates: Partial<Task> = {
      progress: nextProgress,
      updatedAt: new Date(),
    };
    const metaWithUx = mergeMetadataWithProgressUx(
      task.metadata as Record<string, unknown> | undefined,
      progress
    );
    if (metaWithUx) {
      updates.metadata = metaWithUx as Task['metadata'];
    }

    await this.storage.update(taskId, updates);

    const updatedTask = await this.storage.get(taskId);
    if (updatedTask) {
      const notifyStatus = updatedTask.status;
      const { maybeNotifyTaskSnapshot } = await import('./task-notify');
      maybeNotifyTaskSnapshot(updatedTask, notifyStatus, { reason: 'progress' }).catch((err) => {
        console.error(`[TaskManager] Failed to send progress notification for task ${taskId}:`, err);
      });
    }
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

    let resultToSave = result;
    if (result?.mediaUrls?.length) {
      try {
        resultToSave = await persistTaskResultInlineMedia(task, result);
      } catch (e) {
        console.error('[TaskManager] result 内联媒体转存失败（避免将大 base64 写入 DB）', {
          taskId,
          error: e instanceof Error ? e.message : String(e),
        });
        throw e;
      }
    }

    if (task.type === 'audio' || task.type === 'music') {
      try {
        resultToSave = await persistTtsSubtitleInResult(task, resultToSave);
      } catch (e) {
        console.error('[TaskManager] TTS 字幕持久化失败', {
          taskId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      if (resultToSave.metadata) {
        const hasPersistedMedia = Boolean(
          resultToSave.storageInfo?.keys?.length ||
            resultToSave.mediaUrls?.some(
              (u) => typeof u === 'string' && /^https?:\/\//i.test(u.trim())
            )
        );
        resultToSave = {
          ...resultToSave,
          metadata: slimTtsTaskResultMetadata(
            task.type,
            resultToSave.metadata as Record<string, unknown>,
            hasPersistedMedia
          ),
        };
      }
    }

    if (
      resultToSave.mediaUrls?.length &&
      taskTypeMustPersistRemoteMediaUrls(task.type) &&
      task.metadata?.storeToMinio !== false
    ) {
      const leftover = resultToSave.mediaUrls.filter(
        (u) => typeof u === 'string' && mediaUrlNeedsObjectStorage(u)
      );
      if (leftover.length > 0) {
        throw new Error(
          `[TaskManager] 禁止将内联媒体写入已完成任务（${leftover.length} 条）taskId=${taskId} type=${task.type}`
        );
      }
    }

    // 先更新结果和状态
    const listOutputFormat = extractOutputFormatFromResult(resultToSave);
    const listContentPreview = extractContentPreviewFromResult(resultToSave);
    const listMediaCount = Array.isArray(resultToSave.mediaUrls)
      ? resultToSave.mediaUrls.length
      : Array.isArray(resultToSave.storageInfo?.keys)
        ? resultToSave.storageInfo.keys.length
        : 0;
    const { scrubTaskMetadataReviewFlags } = await import('../tasks/manual-review');
    const mergedMetadata = scrubTaskMetadataReviewFlags({
      ...(task.metadata as Record<string, unknown>),
      ...(listOutputFormat ? { listOutputFormat } : {}),
      ...(listContentPreview ? { listContentPreview } : {}),
      listHasMedia: listMediaCount > 0,
      listMediaCount,
    });

    await this.storage.update(taskId, {
      result: resultToSave,
      status: 'completed',
      metadata: mergedMetadata,
      progress: {
        ...task.progress,
        status: 'completed',
        progress: 100,
        error: undefined, // 任务成功完成，清空错误信息
        completedAt: new Date(),
      },
      updatedAt: new Date(),
    });

    void cleanupStoryboardTempForTaskMetadata(task.metadata as Record<string, unknown>).catch((err) => {
      console.warn('[TaskManager] storyboard temp cleanup on complete failed:', err);
    });
    const completeUserId = (task.metadata as Record<string, unknown>)?.userId;
    if (typeof completeUserId === 'string' && completeUserId) {
      void cleanupUserUploadTempForTask(taskId, completeUserId).catch((err) => {
        console.warn('[TaskManager] user upload temp cleanup on complete failed:', err);
      });
    }

    try {
      const { deleteAllManualReviewDrafts } = await import('../tasks/manual-review-store');
      const { scrubPersistedReviewArtifacts, scrubTaskMetadataReviewFlags } = await import(
        '../tasks/manual-review'
      );
      await deleteAllManualReviewDrafts(taskId);
      const fresh = await this.storage.get(taskId);
      if (fresh) {
        await this.storage.update(taskId, {
          requestParams: scrubPersistedReviewArtifacts(fresh.requestParams as Record<string, any>),
          metadata: scrubTaskMetadataReviewFlags(fresh.metadata as Record<string, unknown>),
        });
      }
    } catch (scrubErr) {
      console.warn('[TaskManager] 清理前置审核草稿失败:', scrubErr);
    }

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

    void cleanupStoryboardTempForTaskMetadata(task.metadata as Record<string, unknown>).catch((err) => {
      console.warn('[TaskManager] storyboard temp cleanup on failed failed:', err);
    });
    const failedUserId = (task.metadata as Record<string, unknown>)?.userId;
    if (typeof failedUserId === 'string' && failedUserId) {
      void cleanupUserUploadTempForTask(taskId, failedUserId).catch((err) => {
        console.warn('[TaskManager] user upload temp cleanup on failed failed:', err);
      });
    }

    // 通过 updateTaskStatus 发送通知（统一处理所有状态变化）
    await this.updateTaskStatus(taskId, 'failed', {
      error,
      completedAt,
      logs: [error],
    });

    if (isOpenApiTaskMetadata(task.metadata as Record<string, unknown>)) {
      try {
        const { failOpenApiUsage } = await import('../open-api/usage');
        await failOpenApiUsage(taskId, error);
      } catch (usageErr) {
        console.warn('[TaskManager] failOpenApiUsage failed:', usageErr);
      }
    }
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
   * 更新任务 requestParams（持久化到 input_data）
   */
  async updateTaskRequestParams(taskId: string, requestParams: Record<string, any>): Promise<void> {
    const task = await this.storage.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    const sanitized = sanitizeBase64InObject(requestParams);
    await this.storage.update(taskId, {
      requestParams: sanitized,
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
  async claimPendingTasks(workerId: string, limit: number = 1): Promise<Task[]> {
    if (!(this.storage instanceof DatabaseTaskStorage)) {
      return [];
    }
    return this.storage.claimPendingTasks(workerId, limit);
  }

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
