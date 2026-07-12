/**
 * 任务执行器
 * 统一处理同步和异步任务，将结果存储到数据库
 */

import { TaskManager, type TaskStorage } from './task-manager';
import { DatabaseTaskStorage } from './database-storage';
import type { GenerateResult, ProgressEvent, GenerateParams, ProviderType } from '../models/providers';
import { providerFactory } from '../models/providers';
import { runByModelKey, runByModelKeyAnyScope } from '../models/run';
import type { ModelScope } from '../models/types';
import { storeFromGenerateResult, type StorageConfig } from './data-store';
import { getGeneratedBucket } from '../storage/generated-temp';
import { isBase64 } from './reference-image';
import type { TaskStatus } from './types';
import { UsageService } from '../statistics/usage-service';
import { resolveUsageContextFromTaskMetadata } from '../statistics/usage-context';
import { BillingService } from '../statistics/billing-service';
import { maybeScheduleParallelChildRetry } from '../tasks/parallel-child-retry';

/** 异步任务 executeTask 调用模型时限定 DB scope，避免同名物理键在 graph/text 等多 scope 并存时误命中错误能力 */
function taskTypeToModelScope(taskType: string | undefined): ModelScope | undefined {
  switch (taskType) {
    case 'text':
      return 'text';
    case 'image':
    case 'graph-grid9-parent':
      return 'graph';
    case 'video':
    case 'video-batch-parent':
      return 'video';
    case 'task-v2-batch-parent':
      return undefined;
    case 'audio':
      return 'audio';
    case 'music':
      return 'music';
    default:
      return undefined;
  }
}

export interface ExecuteTaskOptions {
  taskId: string;
  modelName: string;
  provider?: ProviderType;
  params: Record<string, any>;
  userId?: string;
  storeToMinio?: boolean;
  storageConfig?: StorageConfig;
  /** Admin 预览：等待进度流/落库完成后再 resolve（与默认「后台跑」行为相反） */
  awaitFullCompletion?: boolean;
}

/**
 * 任务执行器
 * 统一处理同步（DeerAPI）和异步（Replicate）任务
 */
export class TaskExecutor {
  private taskManager: TaskManager;

  constructor(storage?: TaskStorage) {
    // 如果提供了存储，直接使用
    if (storage) {
      this.taskManager = new TaskManager(storage);
      return;
    }

    // 尝试使用数据库存储，如果失败则使用内存存储
    let taskStorage: TaskStorage;
    try {
      taskStorage = new DatabaseTaskStorage();
    } catch (error) {
      console.warn('[TaskExecutor] 数据库存储初始化失败，使用内存存储:', error instanceof Error ? error.message : String(error));
      // 使用内存存储作为回退
      const { MemoryTaskStorage } = require('./task-manager');
      taskStorage = new MemoryTaskStorage();
    }
    this.taskManager = new TaskManager(taskStorage);
  }

  /**
   * 执行任务
   * 统一处理同步和异步任务，通过进度流更新任务状态
   */
  async executeTask(options: ExecuteTaskOptions): Promise<void> {
    const { taskId, modelName, provider, params, userId, storeToMinio, storageConfig, awaitFullCompletion } = options;
    const executeStarted = Date.now();

    try {
      // 如果任务已被取消，直接退出
      try {
        const t = await this.taskManager.getTask(taskId);
        if (t?.task?.status === 'cancelled') {
          console.warn(`[TaskExecutor] 任务已取消，跳过执行: ${taskId}`);
          return;
        }
        if (
          t?.task?.type === 'video-batch-parent' ||
          t?.task?.type === 'task-v2-batch-parent'
        ) {
          console.log(`[TaskExecutor] 跳过批量父任务执行: ${taskId} (${t.task.type})`);
          return;
        }
      } catch {
        // ignore
      }

      // 1. 推进为 processing（claim RPC 可能已是 processing@0，勿再倒回 queued）
      let entryProgress = 0;
      try {
        const t0 = await this.taskManager.getTask(taskId);
        entryProgress = t0?.task?.progress?.progress ?? 0;
      } catch {
        // ignore
      }
      await this.taskManager.updateTaskStatus(taskId, 'processing', {
        progress: Math.max(entryProgress, 10),
        startedAt: new Date(),
      });

      // 2.1 直接使用传入的 provider + modelName（物理模型）写入 metadata
      let currentTask: Task | null = null;
      try {
        const taskResponse = await this.taskManager.getTask(taskId);
        currentTask = taskResponse?.task ?? null;
        if (currentTask?.metadata) {
          const requestParams = currentTask.requestParams as {
            taskType?: string;
            params?: { writing_type?: string; logicalModel?: string };
            graphType?: string;
          } | undefined;
          const merged: Record<string, unknown> = {
            ...currentTask.metadata,
            provider: provider ?? currentTask.metadata?.provider,
            model: modelName,
          };
          if (currentTask.type === 'writing') {
            const writingType = requestParams?.params?.writing_type;
            if (writingType) merged.writingBusinessType = writingType;
          }
          if (currentTask.type === 'graph' && requestParams?.graphType) {
            merged.graphBusinessType = requestParams.graphType;
          }
          const storage = (this.taskManager as any).storage;
          if (storage) {
            await storage.update(taskId, { metadata: merged });
          }
        }
      } catch (err) {
        console.warn(`[TaskExecutor] 写入任务 provider/model 失败 (taskId: ${taskId}):`, err);
      }

      // 3. 根据 task.type（scope）分发；前置管线统一在 worker 内执行后再进入各 handler
      const taskType = currentTask?.type ?? params?.taskType;
      const deferredPipelineTypes = new Set([
        'outline',
        'writing',
        'graph',
        'video',
        'audio',
        'music',
      ]);

      let execParams = params;
      if (deferredPipelineTypes.has(String(taskType))) {
        if (taskType === 'graph' && userId) {
          const root = execParams as Record<string, unknown>;
          const inner = (root.params ?? root) as Record<string, unknown>;
          const { hydrateReferenceImageParamsInPlace } = await import('../task/reference-image');
          await hydrateReferenceImageParamsInPlace(inner, userId);
          if (root.params && typeof root.params === 'object') {
            root.params = inner;
          }
          console.log(`[TaskExecutor] graph 参考图已预加载, taskId=${taskId}`);
        }

        const { applyDeferredMediaPrePipeline } = await import('../tasks/deferred-media-pipeline');
        execParams = await applyDeferredMediaPrePipeline({
          taskId,
          taskType: taskType as import('../tasks/deferred-media-pipeline').DeferredPrePipelineTaskType,
          params,
          userId,
          onProgress: async (update) => {
            await this.taskManager.updateTaskProgress(taskId, {
              progress: update.progress,
              logs: [update.message],
            });
          },
        });

        if ((execParams as Record<string, unknown>).__pauseForManualReview === true) {
          const {
            buildPersistedParamsForAwaitingReview,
            buildTaskMetadataForAwaitingReview,
          } = await import('../tasks/manual-review');
          const { setManualReviewDraft } = await import('../tasks/manual-review-store');

          const gate = (execParams as Record<string, unknown>).__manualReviewGate as
            | import('../tasks/manual-review-types').ManualReviewGateInfo
            | undefined;
          const draft = (execParams as Record<string, unknown>).__manualReviewDraft as
            | import('../tasks/manual-review-types').ReviewDraftPayload
            | undefined;

          if (gate && draft) {
            await setManualReviewDraft(taskId, gate.gateId, draft);
          }

          const persisted = buildPersistedParamsForAwaitingReview(execParams as Record<string, any>);
          await this.taskManager.updateTaskRequestParams(taskId, persisted);

          try {
            const snap = await this.taskManager.getTask(taskId);
            const existingMeta = (snap?.task?.metadata ?? {}) as Record<string, unknown>;
            const storage = (this.taskManager as any).storage;
            if (storage && gate) {
              await storage.update(taskId, {
                metadata: buildTaskMetadataForAwaitingReview(existingMeta, gate),
              });
            }
          } catch (metaErr) {
            console.warn('[TaskExecutor] awaiting_review metadata 回写失败:', metaErr);
          }

          const gateLabel = gate?.label ?? '人工审核';
          await this.taskManager.updateTaskStatus(taskId, 'awaiting_review', {
            progress: gate?.phase === 'post' ? 85 : 35,
            logs: [`${gateLabel}，等待人工审核`],
          });
          return;
        }

        if (taskType === 'audio') {
          const { isVoiceOverPlaceholderPrompt } = await import('../tasks/deferred-media-pipeline');
          const bps = (execParams.businessPipelineState ?? {}) as Record<string, unknown>;
          const ttsText = String(
            execParams.prompt ?? (execParams.parameters as { text?: string } | undefined)?.text ?? ''
          );
          if (
            bps.businessPipelinePreDeferred === true &&
            bps.businessPipelinePreDone !== true &&
            isVoiceOverPlaceholderPrompt(ttsText)
          ) {
            const { ConfigurationError } = await import('../tasks/errors');
            throw new ConfigurationError(
              '口播前置 nestedText 未生效，仍为占位/Markdown 源文本，已阻止 TTS。请检查 Worker 日志与 Admin 执行管线（voice-script-draft / tts-markup）。'
            );
          }
        }

        if (taskType === 'outline' || taskType === 'writing' || taskType === 'video') {
          await this.taskManager.updateTaskRequestParams(taskId, execParams as Record<string, any>);
        }
      }

      if (taskType === 'outline') {
        const { startOutlineTask } = await import('../core/writing/writing-task');
        await startOutlineTask(taskId);
        return;
      }
      if (taskType === 'writing') {
        const { startWritingTask } = await import('../core/writing/writing-task');
        await startWritingTask(taskId);
        return;
      }
      if (taskType === 'video') {
        const { startVideoTask } = await import('../core/video/video-task');
        await startVideoTask(taskId, execParams);
        return;
      }
      if (taskType === 'text') {
        const { startTextTask } = await import('../core/text/text-task');
        await startTextTask(taskId, execParams);
        return;
      }
      if (taskType === 'graph') {
        const { startGraphTask } = await import('../core/graph/graph-task');
        await startGraphTask(taskId, execParams);
        return;
      }

      // 4. 通过模型文件调用生成接口（audio / music 等）
      // 模型文件的 generate() 内部会使用 providerFactory.getProviderForModel() 自动选择支持的 provider
      // 如果默认 provider 不支持，会自动选择支持的 provider
      // 再次检查取消（queued/processing 期间用户可能点了取消）
      try {
        const t2 = await this.taskManager.getTask(taskId);
        if (t2?.task?.status === 'cancelled') {
          console.warn(`[TaskExecutor] 任务已取消，停止执行: ${taskId}`);
          return;
        }
      } catch {
        // ignore
      }
      await this.executeMediaModelTask({
        taskId,
        modelName,
        provider,
        params: execParams,
        userId,
        storeToMinio,
        storageConfig,
        awaitFullCompletion,
        scopeHint: taskTypeToModelScope(taskType),
      });
    } catch (error) {
      // 统一兜底日志，确保 Admin 看到简单错误信息时，终端里有完整堆栈可排查
      console.error('[TaskExecutor] ❌ 任务执行失败', {
        taskId,
        modelName,
        provider: provider || 'auto',
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : String(error),
      });
      const errMsg = error instanceof Error ? error.message : String(error);
      try {
        const failedSnap = await this.taskManager.getTask(taskId);
        if (failedSnap?.task && (await maybeScheduleParallelChildRetry(taskId, failedSnap.task, errMsg))) {
          return;
        }
      } catch {
        /* ignore retry scheduling errors */
      }
      try {
        const failSnap = await this.taskManager.getTask(taskId);
        if (failSnap?.task) {
          const { buildPipelineFailureSnapshot } = await import('./pipeline-retry');
          const snapshot = buildPipelineFailureSnapshot(failSnap.task);
          await this.taskManager.updateTaskRequestParams(taskId, snapshot);
        }
      } catch (persistErr) {
        console.warn('[TaskExecutor] pipeline failure snapshot persist failed:', persistErr);
      }
      await this.taskManager.setTaskError(taskId, errMsg);
      console.log(
        `[task_metric] event=terminal taskId=${taskId} status=failed executeMs=${Date.now() - executeStarted}`
      );
    }
  }

  /**
   * 处理进度流（异步任务）
   */
  private async processProgressStream(
    taskId: string,
    progressStream: AsyncIterable<ProgressEvent>,
    result: GenerateResult,
    storeToMinio?: boolean,
    storageConfig?: StorageConfig,
    userId?: string,
    modelName?: string,
    provider?: ProviderType
  ): Promise<void> {
    try {
      // 确保 result 有 metadata，如果没有则初始化
      // 如果 result.metadata.provider 不存在，尝试从 providerFactory 获取
      let resultProvider = result.metadata?.provider;
      if (!resultProvider && modelName) {
        try {
          const modelProvider = providerFactory.getProviderForModel(modelName, provider);
          if (modelProvider && typeof (modelProvider as any).provider !== 'undefined') {
            resultProvider = (modelProvider as any).provider;
            console.log(`[TaskExecutor] 为模型 "${modelName}" 自动确定 provider: ${resultProvider}`);
          }
        } catch (error) {
          console.warn(`[TaskExecutor] 无法为模型 "${modelName}" 确定 provider:`, error instanceof Error ? error.message : String(error));
        }
      }
      
      let finalResult: GenerateResult = {
        ...result,
        metadata: result.metadata || {
          model: modelName || 'unknown',
          provider: resultProvider || 'unknown',
        },
      };
      
      // 如果 result.metadata 存在但没有 provider，补充 provider
      if (finalResult.metadata && !finalResult.metadata.provider && resultProvider) {
        finalResult.metadata.provider = resultProvider;
      }
      
      for await (const event of progressStream) {
        // 若任务被取消，停止继续处理进度/下载/存储
        try {
          const current = await this.taskManager.getTask(taskId);
          if (current?.task?.status === 'cancelled') {
            console.warn(`[TaskExecutor] 任务已取消，停止处理进度流: ${taskId}`);
            return;
          }
        } catch {
          // ignore
        }

        console.log(`[TaskExecutor] 收到进度事件 (taskId: ${taskId}):`, {
          status: event.status,
          progress: event.progress,
          hasOutput: !!event.output,
          hasError: !!event.error,
        });
        
        // 更新任务进度
        const progress = event.progress || 0;
        await this.taskManager.updateTaskProgress(taskId, {
          progress,
          logs: event.logs,
        });

        // 如果事件中包含输出，更新最终结果
        if (event.output) {
          // 确保 metadata 始终存在（在外部定义，确保所有分支都能访问）
          // 如果 finalResult.metadata.provider 不存在，尝试从 providerFactory 获取
          let currentProvider = finalResult.metadata?.provider;
          if (!currentProvider && modelName) {
            try {
              const modelProvider = providerFactory.getProviderForModel(modelName, provider);
              if (modelProvider && typeof (modelProvider as any).provider !== 'undefined') {
                currentProvider = (modelProvider as any).provider;
              }
            } catch (error) {
              // 忽略错误，使用 'unknown'
            }
          }
          const currentMetadata = finalResult.metadata || { model: modelName || 'unknown', provider: currentProvider || 'unknown' };
          // 如果 metadata 存在但没有 provider，补充 provider
          if (currentMetadata && !currentMetadata.provider && currentProvider) {
            currentMetadata.provider = currentProvider;
          }
          
          // 从进度事件中提取 mediaUrls
          if (event.output && typeof event.output === 'object') {
            const outputAny = event.output as any;
            
            if (Array.isArray(outputAny)) {
              // 直接是 URL 数组
              finalResult = { ...finalResult, mediaUrls: outputAny, metadata: currentMetadata };
            } else if (outputAny.mediaUrls && Array.isArray(outputAny.mediaUrls)) {
              finalResult = { ...finalResult, mediaUrls: outputAny.mediaUrls, metadata: currentMetadata };
            } else if (outputAny.image_urls && Array.isArray(outputAny.image_urls)) {
              finalResult = { ...finalResult, mediaUrls: outputAny.image_urls, metadata: currentMetadata };
            } else if (outputAny.video_urls && Array.isArray(outputAny.video_urls)) {
              // 处理视频 URL 数组
              finalResult = { ...finalResult, mediaUrls: outputAny.video_urls, metadata: currentMetadata };
            } else if (outputAny.video_url && typeof outputAny.video_url === 'string') {
              // 处理单个视频 URL
              finalResult = { ...finalResult, mediaUrls: [outputAny.video_url], metadata: currentMetadata };
            } else if (outputAny.items && Array.isArray(outputAny.items)) {
              // 处理 seedream-4 等模型的 { items: [...] } 格式
              const extractedUrls: string[] = [];
              for (const item of outputAny.items) {
                if (typeof item === 'string' && item.length > 0) {
                  extractedUrls.push(item);
                } else if (item && typeof item === 'object') {
                  // 可能是 { url: "..." } 或 { image_url: "..." } 格式
                  if (item.url && typeof item.url === 'string') {
                    extractedUrls.push(item.url);
                  } else if (item.image_url && typeof item.image_url === 'string') {
                    extractedUrls.push(item.image_url);
                  } else if (item.image && typeof item.image === 'string') {
                    extractedUrls.push(item.image);
                  } else {
                    // 尝试查找任何以 http 开头的字符串属性
                    for (const key in item) {
                      if (typeof item[key] === 'string' && (item[key].startsWith('http://') || item[key].startsWith('https://'))) {
                        extractedUrls.push(item[key]);
                        break;
                      }
                    }
                  }
                }
              }
              if (extractedUrls.length > 0) {
                finalResult = { 
                  ...finalResult, 
                  mediaUrls: extractedUrls,
                  metadata: currentMetadata,
                };
              }
            }
            
            // 如果 output 中包含 metadata，合并到 finalResult
            if (outputAny.metadata) {
              finalResult = { 
                ...finalResult, 
                metadata: { 
                  ...currentMetadata, 
                  ...outputAny.metadata 
                },
              };
            }
          } else if (typeof event.output === 'string' && event.output.length > 0) {
            // 直接是字符串 URL
            finalResult = { 
              ...finalResult, 
              mediaUrls: [event.output],
              metadata: currentMetadata,
            };
          }
          
          // 如果 event.output 包含 metadata，合并到 finalResult（无论 output 是对象还是字符串）
          if (event.output && typeof event.output === 'object' && (event.output as any).metadata) {
            finalResult = {
              ...finalResult,
              metadata: { 
                ...currentMetadata, 
                ...(event.output as any).metadata 
              },
            };
          }
        }

        // 如果任务完成或失败，处理结果
        if (event.status === 'succeeded') {
          // succeeded 前再次检查取消（避免在下载/上传前继续消耗资源）
          try {
            const current = await this.taskManager.getTask(taskId);
            if (current?.task?.status === 'cancelled') {
              console.warn(`[TaskExecutor] 任务已取消（succeeded 后），跳过落库/存储: ${taskId}`);
              return;
            }
          } catch {
            // ignore
          }
          console.log(`[TaskExecutor] ✅ 任务成功完成 (taskId: ${taskId})`);
          console.log(`[TaskExecutor] 最终结果 mediaUrls 数量: ${finalResult.mediaUrls?.length || 0}`);
          if (finalResult.mediaUrls && finalResult.mediaUrls.length > 0) {
            console.log(`[TaskExecutor] 第一个 mediaUrl: ${finalResult.mediaUrls[0].substring(0, 80)}...`);
          }
          // 确保 finalResult 包含 mediaUrls（从进度事件的 output 中提取）
          if (event.output) {
            const outputAny = event.output as any;
            let extractedUrls: string[] = [];
            
            if (Array.isArray(outputAny)) {
              // 直接是 URL 数组
              extractedUrls = outputAny.filter(
                (url: any): url is string => typeof url === 'string' && url.length > 0,
              );
            } else if (outputAny && typeof outputAny === 'object') {
              // 处理对象格式
              if (outputAny.items && Array.isArray(outputAny.items)) {
                // seedream-4 格式：{ items: [...] }
                for (const item of outputAny.items) {
                  if (typeof item === 'string' && item.length > 0) {
                    extractedUrls.push(item);
                  } else if (item && typeof item === 'object') {
                    if (item.url && typeof item.url === 'string') {
                      extractedUrls.push(item.url);
                    } else if (item.image_url && typeof item.image_url === 'string') {
                      extractedUrls.push(item.image_url);
                    } else if (item.image && typeof item.image === 'string') {
                      extractedUrls.push(item.image);
                    } else {
                      // 尝试查找任何以 http 开头的字符串属性
                      for (const key in item) {
                        if (
                          typeof item[key] === 'string' &&
                          (item[key].startsWith('http://') || item[key].startsWith('https://'))
                        ) {
                          extractedUrls.push(item[key]);
                          break;
                        }
                      }
                    }
                  }
                }
              } else if (outputAny.mediaUrls && Array.isArray(outputAny.mediaUrls)) {
                extractedUrls = outputAny.mediaUrls.filter(
                  (url: any): url is string => typeof url === 'string' && url.length > 0,
                );
              } else if (outputAny.image_urls && Array.isArray(outputAny.image_urls)) {
                extractedUrls = outputAny.image_urls.filter(
                  (url: any): url is string => typeof url === 'string' && url.length > 0,
                );
              } else if (typeof outputAny === 'string' && outputAny.length > 0) {
                extractedUrls = [outputAny];
              }
            } else if (typeof outputAny === 'string' && outputAny.length > 0) {
              extractedUrls = [outputAny];
            }
            
            if (extractedUrls.length > 0) {
              // 确保 metadata 存在
              const currentMetadata = finalResult.metadata || { model: modelName || 'unknown', provider: 'unknown' };
              finalResult = { 
                ...finalResult, 
                mediaUrls: extractedUrls,
                metadata: currentMetadata,
              };
            }
          }

          // 检查是否有 Base64 数据，如果有则强制使用 MinIO
          const hasBase64InProgress = finalResult.mediaUrls?.some((url) => typeof url === 'string' && isBase64(url));
          const shouldForceMinIOInProgress = hasBase64InProgress;
          
          // 如果启用了 MinIO 存储或检测到 Base64，先更新进度为 90%（表示生成完成，正在存储）
          if ((storeToMinio || shouldForceMinIOInProgress) && finalResult.mediaUrls && finalResult.mediaUrls.length > 0) {
            await this.taskManager.updateTaskProgress(taskId, {
              progress: 90,
              logs: ['媒体生成完成，正在上传到存储...'],
            });
          }
          
          // 处理结果（包括 MinIO 存储，processResult 内部会强制 Base64 转 MinIO）
          await this.processResult(taskId, finalResult, storeToMinio || shouldForceMinIOInProgress, storageConfig, userId, modelName);
          break;
        } else if (event.status === 'failed') {
          await this.taskManager.setTaskError(taskId, event.error || '任务执行失败');
          break;
        }
      }
    } catch (error) {
      await this.taskManager.setTaskError(
        taskId,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * 处理任务结果
   */
  private async processResult(
    taskId: string,
    result: GenerateResult,
    storeToMinio?: boolean,
    storageConfig?: StorageConfig,
    userId?: string,
    modelName?: string,
    provider?: ProviderType
  ): Promise<void> {
    try {
      let mediaUrls = result.mediaUrls || [];
      let storageInfo: { keys: string[]; bucket: string; urls: string[]; proxyUrls?: string[] } | undefined;

      // 强制 MinIO 存储：检查是否有 Base64 数据，如果有则强制转换为 MinIO
      // 这是性能优化：避免 base64 数据存储在数据库中，导致表过大
      let shouldForceMinIO = false;
      let hasBase64Data = false;
      let totalBase64Size = 0;

      if (mediaUrls.length > 0) {
        for (const url of mediaUrls) {
          if (typeof url === 'string' && isBase64(url)) {
            hasBase64Data = true;
            // 计算 Base64 数据大小（近似：字符串长度字节数）
            const base64Size = Buffer.byteLength(String(url), 'utf8');
            totalBase64Size += base64Size;
          }
        }

        // 如果检测到 Base64 数据，强制使用 MinIO 存储
        if (hasBase64Data) {
          shouldForceMinIO = true;
          console.log(
            `[TaskExecutor] 检测到 Base64 数据 (${(totalBase64Size / 1024 / 1024).toFixed(2)}MB)，` +
            `强制启用 MinIO 存储以避免数据库过大 (taskId: ${taskId})`
          );
        }
      }

      // 如果没有 storageConfig 但需要强制 MinIO，自动生成配置
      // 同时获取 taskType，用于后续生成 proxyUrls
      let finalStorageConfig = storageConfig;
      let taskType = 'other'; // 默认值
      
      // 获取任务类型（用于生成 proxyUrls）
      const taskResponse = await this.taskManager.getTask(taskId);
      taskType = taskResponse?.task?.type || 'other';
      
      // storeToMinio 为 true 时（含 music 外链 URL），自动生成 MinIO 路径配置并转存
      if ((storeToMinio || shouldForceMinIO) && !finalStorageConfig && mediaUrls.length > 0) {
        const pathTemplateMap: Record<string, string> = {
          image: '{userId}/graph/{timestamp}-{randomId}.{ext}',
          video: '{userId}/video/{timestamp}-{randomId}.{ext}',
          audio: '{userId}/audio/{timestamp}-{randomId}.{ext}',
          music: '{userId}/music/{timestamp}-{randomId}.{ext}',
          text: '{userId}/text/{timestamp}-{randomId}.{ext}',
          writing: '{userId}/writing/{timestamp}-{randomId}.{ext}',
          outlines: '{userId}/outlines/{timestamp}-{randomId}.{ext}',
          other: '{userId}/other/{timestamp}-{randomId}.{ext}',
        };

        finalStorageConfig = {
          bucket: getGeneratedBucket(),
          pathTemplate: pathTemplateMap[taskType] || pathTemplateMap.other,
        };
        console.log(
          `[TaskExecutor] 自动生成存储配置 (taskId: ${taskId}, type: ${taskType}, storeToMinio=${!!storeToMinio})`,
        );
      }

      // 如果需要存储到 MinIO（用户指定或强制）
      if ((storeToMinio || shouldForceMinIO) && finalStorageConfig && mediaUrls.length > 0) {
        const { storeFromGenerateResult } = await import('./data-store');
        // 从 result.metadata 中获取 modelName（确保 metadata 存在）
        const finalModelName = modelName || (result.metadata && result.metadata.model) || 'unknown';
        const storageResults = await storeFromGenerateResult(result, finalStorageConfig, userId, finalModelName);

        // 仍然保留 MinIO URL（向后兼容）
        // 同时增加 proxyUrls 字段，用于通过 Gateway 访问内部媒体地址
        mediaUrls = storageResults.map(r => {
          let url = r.url;
          // 修复双冒号问题
          url = url.replace(/http:+\/\//g, 'http://');
          url = url.replace(/https:+\/\//g, 'https://');
          return url;
        });

        const keys = storageResults.map(r => r.key);
        const bucket = storageResults[0].bucket;
        // 为每个文件生成一个内部代理 URL（基于 taskId）
        // 注意：不同任务类型对应不同的 media 路由
        const proxyType =
          taskType === 'video'
            ? 'video'
            : taskType === 'audio'
            ? 'audio'
            : taskType === 'music'
            ? 'music'
            : taskType === 'image'
            ? 'graph'
            : 'graph';
        const proxyBasePath = `/api/v1/media/${proxyType}/${taskId}`;

        storageInfo = {
          keys,
          bucket,
          urls: mediaUrls,
          proxyUrls: keys.map(() => proxyBasePath),
        };
        
        // MinIO 存储完成后，更新进度为 100%
        await this.taskManager.updateTaskProgress(taskId, {
          progress: 100,
          logs: ['文件已成功上传到存储'],
        });
      } else {
        // 如果没有存储到 MinIO，也更新进度为 100%
        // 注意：如果是从同步任务调用的，可能已经在调用前更新了进度，这里再次更新确保一致性
        await this.taskManager.updateTaskProgress(taskId, {
          progress: 100,
        });
        
        // 如果仍然有 Base64 数据（理论上不应该发生，因为已经强制 MinIO），记录警告
        if (hasBase64Data) {
          console.warn(
            `[TaskExecutor] 警告：检测到 Base64 数据但未存储到 MinIO (taskId: ${taskId})，` +
            `这可能导致数据库过大。请检查存储配置。`
          );
        }
      }

      // Business Pipeline 后置步骤（text 改写 / post 阶段 context / 格式化 / manualReview）
      let processedResult = result;
      try {
        const postOutcome = await this.applyBusinessPostPipeline(taskId, result, userId, taskType);
        if (postOutcome === 'paused') {
          return;
        }
        processedResult = postOutcome;
      } catch (postErr) {
        console.error(`[TaskExecutor] Business post pipeline failed (taskId: ${taskId}):`, postErr);
        await this.taskManager.setTaskError(
          taskId,
          postErr instanceof Error ? postErr.message : String(postErr)
        );
        return;
      }

      const resultText =
        typeof (processedResult as { text?: string }).text === 'string'
          ? (processedResult as { text?: string }).text
          : undefined;
      if (resultText && resultText.trim()) {
        mediaUrls = processedResult.mediaUrls || mediaUrls;
      }

      // 设置任务结果
      // 确保 metadata 中包含正确的 provider（从 result.metadata 中获取，如果没有则保持原有值）
      // 注意：taskResponse 已经在上面获取过了（第 536 行），这里直接使用
      // 安全地合并 metadata，确保所有字段都存在
      const taskMetadata = taskResponse?.task?.metadata || {};
      const resultMetadata = processedResult.metadata || {};
      
      const finalMetadataBase = {
        userId: taskMetadata.userId || userId,
        storeToMinio: taskMetadata.storeToMinio !== undefined ? taskMetadata.storeToMinio : storeToMinio,
        storageConfig: taskMetadata.storageConfig || storageConfig,
        // 合并其他 metadata 字段
        ...taskMetadata,
        ...resultMetadata,
        // 确保关键字段不被覆盖（放在最后，优先级最高）
        model: resultMetadata.model || taskMetadata.model || modelName || 'unknown',
        // 如果 provider 不存在，尝试从 providerFactory 获取
        provider: (() => {
          if (resultMetadata.provider) return resultMetadata.provider;
          if (taskMetadata.provider && taskMetadata.provider !== 'unknown') return taskMetadata.provider;
          // 如果都不存在，尝试从 providerFactory 获取
          if (modelName) {
            try {
              const modelProvider = providerFactory.getProviderForModel(modelName, provider);
              if (modelProvider && typeof (modelProvider as any).provider !== 'undefined') {
                const autoProvider = (modelProvider as any).provider;
                console.log(`[TaskExecutor] 为模型 "${modelName}" 自动确定 provider: ${autoProvider}`);
                return autoProvider;
              }
            } catch (error) {
              console.warn(`[TaskExecutor] 无法为模型 "${modelName}" 确定 provider:`, error instanceof Error ? error.message : String(error));
            }
          }
          return 'unknown';
        })(),
      };

      // 若生成结果包含纯文本（如 writing / outlines 的 JSON 文本），也一并挂到 metadata.text，方便前端回显/解析
      const finalMetadata =
        typeof (processedResult as any)?.text === 'string' && (processedResult as any).text.trim()
          ? {
              ...finalMetadataBase,
              text: (processedResult as any).text as string,
            }
          : finalMetadataBase;
      
      await this.taskManager.setTaskResult(taskId, {
        mediaUrls,
        storageInfo,
        metadata: finalMetadata,
      });

      // 记录底层 Provider Usage 并按 provider_pricing 扣减余额（无定价/余额不足时抛错截断）
      const taskSnapForUsage = await this.taskManager.getTask(taskId, true);
      const metaForUsage = taskSnapForUsage?.task?.metadata as Record<string, unknown> | undefined;
      const { costUsd } = await UsageService.logProviderUsage({
        taskId,
        userId,
        logicalModel: modelName,
        taskType: taskResponse?.task?.type,
        result: {
          ...result,
          mediaUrls,
          metadata: finalMetadata,
        },
        providerOverride: finalMetadata.provider as ProviderType | undefined,
        usageContext: resolveUsageContextFromTaskMetadata(metaForUsage),
      });

      // 扣减用户 MXM-TOKEN（所有任务类型统一入口）
      if (userId) {
        const usageMetadata = finalMetadata as Record<string, any>;
        const mediaCount = Array.isArray(mediaUrls) ? mediaUrls.length : 0;
        const durationRaw = usageMetadata.duration ?? usageMetadata.duration_sec ?? usageMetadata.seconds;
        const duration = typeof durationRaw === 'number' ? durationRaw : Number(durationRaw) || 0;
        const scope = UsageService.inferScopePublic(
          modelName || '',
          usageMetadata,
          taskResponse?.task?.type
        );

        try {
          const meta = metaForUsage;
          await BillingService.consumeForTask({
            taskId,
            userId,
            provider: String(finalMetadata.provider || 'unknown'),
            modelKey: String(finalMetadata.model || modelName || 'unknown'),
            scope,
            inputTokens: Number((usageMetadata.usage as any)?.prompt_tokens ?? (usageMetadata.usage as any)?.input_tokens ?? 0),
            outputTokens: Number((usageMetadata.usage as any)?.completion_tokens ?? (usageMetadata.usage as any)?.output_tokens ?? 0),
            totalTokens: Number((usageMetadata.usage as any)?.total_tokens ?? 0),
            imageCount: scope === 'graph' ? mediaCount : 0,
            audioSeconds: scope === 'audio' || scope === 'music' ? duration : 0,
            videoSeconds: scope === 'video' ? duration : 0,
            requestCount: 1,
            providerCostUsd: costUsd,
            publishedSlug: typeof meta?.publishedSlug === 'string' ? meta.publishedSlug : undefined,
            publishedApiId: typeof meta?.publishedApiId === 'string' ? meta.publishedApiId : undefined,
            openApiCallerId: typeof meta?.openApiCallerId === 'string' ? meta.openApiCallerId : undefined,
          });
        } catch (billingErr) {
          // 余额不足：记录日志但不影响已完成任务的结果落库
          console.warn(
            `[TaskExecutor] 用户扣费失败 (taskId: ${taskId}):`,
            billingErr instanceof Error ? billingErr.message : String(billingErr),
          );
        }
      }
    } catch (error) {
      console.error('[TaskExecutor] ❌ 处理结果失败', {
        taskId,
        modelName,
        provider: provider || 'auto',
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : String(error),
      });
      await this.taskManager.setTaskError(
        taskId,
        `处理结果失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 通用媒体模型调用：generate + 进度流 + MinIO + 计费（video-task 等复用）
   */
  async executeMediaModelTask(
    options: ExecuteTaskOptions & { scopeHint?: ModelScope },
  ): Promise<void> {
    const {
      taskId,
      modelName,
      provider,
      params,
      userId,
      storeToMinio,
      storageConfig,
      awaitFullCompletion,
      scopeHint = 'video',
    } = options;

    const pipelineState = (params.businessPipelineState ?? {}) as Record<string, unknown>;
    if (pipelineState.businessPipelinePostDeferred === true && pipelineState.pendingPostResult) {
      await this.resumeDeferredPostPipeline({
        taskId,
        pendingResult: pipelineState.pendingPostResult as GenerateResult,
        params,
        userId,
        storeToMinio,
        storageConfig,
        modelName,
        provider,
        scopeHint,
      });
      return;
    }

    const result = await this.callModelGenerate(modelName, params, provider, scopeHint);

    if (result.metadata) {
      try {
        const taskResponse = await this.taskManager.getTask(taskId);
        if (taskResponse?.task?.metadata) {
          const needsUpdate =
            (result.metadata.provider &&
              taskResponse.task.metadata.provider !== result.metadata.provider) ||
            (result.metadata.taskId &&
              taskResponse.task.metadata.taskId !== result.metadata.taskId);
          const hasModel =
            result.metadata.model && taskResponse.task.metadata?.model !== result.metadata.model;
          if (needsUpdate || hasModel) {
            const storage = (this.taskManager as any).storage;
            if (storage) {
              await storage.update(taskId, {
                metadata: {
                  ...(taskResponse.task.metadata || {}),
                  ...(result.metadata.provider && { provider: result.metadata.provider }),
                  ...(result.metadata.model && { model: result.metadata.model }),
                  ...(result.metadata.taskId && { taskId: result.metadata.taskId }),
                },
              });
            }
          }
        }
      } catch (error) {
        console.warn(`[TaskExecutor] 更新任务 metadata 失败 (taskId: ${taskId}):`, error);
      }
    }

    if (result.progress) {
      const progressPromise = this.processProgressStream(
        taskId,
        result.progress,
        result,
        storeToMinio,
        storageConfig,
        userId,
        modelName,
        provider,
      );
      if (awaitFullCompletion) {
        await progressPromise;
      } else {
        progressPromise.catch((error) => {
          console.error(`[TaskExecutor] 处理进度流失败 (taskId: ${taskId}):`, error);
          this.taskManager.setTaskError(
            taskId,
            `处理进度流失败: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      }
      return;
    }

    if (storeToMinio && result.mediaUrls && result.mediaUrls.length > 0) {
      await this.taskManager.updateTaskProgress(taskId, {
        progress: 90,
        logs: ['媒体生成完成，正在上传到存储...'],
      });
    } else {
      await this.taskManager.updateTaskProgress(taskId, { progress: 100 });
    }

    await this.processResult(taskId, result, storeToMinio, storageConfig, userId, modelName, provider);
  }

  /**
   * 供 video-task 等专用 handler 复用：MinIO 落库、计费、setTaskResult
   */
  async finalizeMediaTaskResult(
    taskId: string,
    result: GenerateResult,
    options: {
      storeToMinio?: boolean;
      storageConfig?: StorageConfig;
      userId?: string;
      modelName?: string;
      provider?: ProviderType;
    },
  ): Promise<void> {
    return this.processResult(
      taskId,
      result,
      options.storeToMinio,
      options.storageConfig,
      options.userId,
      options.modelName,
      options.provider,
    );
  }

  /**
   * 通过模型文件调用生成接口
   * 与 text 路由逻辑一致：使用模型文件的 generate() 函数，内部自动选择 provider
   * 如果默认 provider 不支持该模型，会自动选择支持的 provider
   */
  /** 供 Task v2（如 scope=text 同步执行）复用，与异步任务内调用路径一致 */
  async callModelGenerate(
    modelName: string,
    params: Record<string, any>,
    provider?: ProviderType,
    scopeHint?: ModelScope
  ): Promise<GenerateResult> {
    const taskParams = { ...params, enableProgress: true };
    if (scopeHint) {
      return await runByModelKey(scopeHint, modelName, taskParams, { providerOverride: provider });
    }
    // 无 hint 时跨 scope 查找（如 music 等未纳入 ModelScope 的任务类型）
    return await runByModelKeyAnyScope(modelName, taskParams, { providerOverride: provider });
  }

  private async applyBusinessPostPipeline(
    taskId: string,
    result: GenerateResult,
    userId?: string,
    taskType?: string
  ): Promise<GenerateResult | 'paused'> {
    const taskResponse = await this.taskManager.getTask(taskId);
    const taskMeta = (taskResponse?.task?.metadata ?? {}) as Record<string, unknown>;
    const taskParams = (taskResponse?.task?.requestParams ?? {}) as Record<string, unknown>;
    const nestedParams = (taskParams.params ?? taskParams) as Record<string, unknown>;

    const taskV2 = (nestedParams.taskV2 ?? taskMeta.taskV2) as
      | { scope?: string; taskKey?: string; subtype?: string | null }
      | undefined;
    if (!taskV2?.scope || !taskV2.taskKey) {
      return result;
    }

    const { loadTaskDefinition } = await import('../tasks/task-definition');
    const { buildCoreArtifactFromResult, applyFinalArtifactToGenerateResult } =
      await import('../tasks/business-pipeline');
    const {
      runPostPipelineWithCheckpoints,
      persistManualReviewPause,
      buildPersistedParamsForAwaitingReview,
      buildTaskMetadataForAwaitingReview,
      mergeBusinessPipelineState,
    } = await import('../tasks/manual-review');
    const { mergeEffectivePipeline } = await import('../tasks/business-pipeline-defaults');

    const { row, template } = await loadTaskDefinition({
      scope: taskV2.scope as import('../tasks/types').TaskScope,
      taskKey: taskV2.taskKey,
      subtype: taskV2.subtype ?? null,
    });

    const { post } = mergeEffectivePipeline(
      taskV2.scope,
      template,
      (row.extra ?? null) as Record<string, unknown> | null
    );
    if (!post.length) {
      return result;
    }

    const meta = result.metadata ?? {};
    const text =
      typeof (result as { text?: string }).text === 'string'
        ? (result as { text?: string }).text
        : typeof meta.text === 'string'
          ? meta.text
          : undefined;

    const coreArtifact = buildCoreArtifactFromResult(taskV2.scope, {
      text,
      mediaUrls: result.mediaUrls,
      metadata: meta as Record<string, unknown>,
    });

    const pipelineState = mergeBusinessPipelineState(
      taskParams as Record<string, unknown>,
      nestedParams as Record<string, unknown>,
      taskMeta
    );

    const reviewedFinalArtifact = pipelineState.finalArtifact as
      | import('../tasks/types').CoreArtifact
      | undefined;
    const effectiveArtifact = reviewedFinalArtifact?.text?.trim()
      ? reviewedFinalArtifact
      : coreArtifact;

    let ctx: import('../tasks/types').TaskContext = {
      scope: taskV2.scope,
      taskKey: taskV2.taskKey,
      subtype: taskV2.subtype ?? null,
      userId,
      taskId,
      params: { ...nestedParams, metadata: meta },
      state: {
        ...pipelineState,
        coreArtifact: effectiveArtifact,
        finalArtifact: effectiveArtifact,
        _formSchema: template.formSchema,
      },
    };

    const outcome = await runPostPipelineWithCheckpoints({
      ctx,
      template,
      scope: taskV2.scope,
      rowExtra: (row.extra ?? null) as Record<string, unknown> | null,
      onStepCheckpoint: async (stepCtx) => {
        const { mergeParamsWithPipelineState } = await import('../task/pipeline-retry');
        const merged = mergeParamsWithPipelineState(taskParams as Record<string, unknown>, {
          ...pipelineState,
          ...stepCtx.state,
          pendingPostResult: result,
          businessPipelinePostDeferred: true,
          pipelineRetryEligible: true,
        });
        await this.taskManager.updateTaskRequestParams(taskId, merged);
      },
    });

    if (outcome.kind === 'paused') {
      const execParams = {
        ...(taskParams as Record<string, any>),
        businessPipelineState: {
          ...(pipelineState ?? {}),
          ...outcome.ctx.state,
          pendingPostResult: result,
          businessPipelinePostDeferred: true,
        },
      };
      const pausedParams = await persistManualReviewPause({
        taskId,
        gate: outcome.gate,
        draft: outcome.draft,
        execParams,
        taskType: String(taskType ?? taskResponse?.task?.type ?? ''),
      });
      const persisted = buildPersistedParamsForAwaitingReview(pausedParams);
      await this.taskManager.updateTaskRequestParams(taskId, persisted);

      try {
        const storage = (this.taskManager as any).storage;
        if (storage) {
          await storage.update(taskId, {
            metadata: buildTaskMetadataForAwaitingReview(taskMeta, outcome.gate),
          });
        }
      } catch (metaErr) {
        console.warn('[TaskExecutor] post awaiting_review metadata 回写失败:', metaErr);
      }

      await this.taskManager.updateTaskStatus(taskId, 'awaiting_review', {
        progress: 85,
        logs: [`${outcome.gate.label ?? '产出审核'}，等待人工审核`],
      });
      return 'paused';
    }

    if (outcome.kind === 'awaitingNestedVideo') {
      const { persistNestedVideoRenderPause } = await import('../tasks/manual-review');
      const mergedState = {
        ...(pipelineState ?? {}),
        ...outcome.ctx.state,
        pendingPostResult: result,
      };
      // videoEditRenderTaskId / nestedVideoRenderPending 一并塞进 businessPipelineState，
      // 不再二次重写 root metadata（避免大 jsonb update 超时——已踩过坑：
      // SupabaseJS update 全 jsonb 替换单条 update 在 metadata 巨大时易触发 statement timeout）。
      const pausedParams = await persistNestedVideoRenderPause({
        taskId,
        renderTaskId: outcome.renderTaskId,
        execParams: taskParams as Record<string, any>,
        checkpoint: outcome.checkpoint,
        pipelineState: mergedState,
      });
      await this.taskManager.updateTaskRequestParams(taskId, pausedParams);

      await this.taskManager.updateTaskStatus(taskId, 'processing', {
        progress: 92,
        logs: [`逐段渲染进行中（子任务 ${outcome.renderTaskId}）…`],
      });
      return 'paused';
    }

    ctx = outcome.ctx;

    const finalArtifact = ctx.state.finalArtifact as import('../tasks/types').CoreArtifact | undefined;
    const merged = applyFinalArtifactToGenerateResult(finalArtifact, {
      text,
      mediaUrls: result.mediaUrls,
      metadata: {
        ...meta,
        pipelineTrace: ctx.state.pipelineTrace,
        pipelineNestedUsage: ctx.state.pipelineNestedUsage,
        contextFieldMeta: ctx.state.contextFieldMeta,
      },
    });

    return {
      ...result,
      text: merged.text ?? (result as { text?: string }).text,
      mediaUrls: merged.mediaUrls ?? result.mediaUrls,
      metadata: merged.metadata as GenerateResult['metadata'],
    };
  }

  /** render 子任务完成后续跑父任务 post 管线（进入第二次 manualReview） */
  async resumeParentPipelineAfterNestedRender(
    parentTaskId: string,
    renderTaskId: string
  ): Promise<void> {
    const taskResponse = await this.taskManager.getTask(parentTaskId);
    const parent = taskResponse?.task;
    if (!parent) return;

    const { getMergedPipelineState } = await import('./pipeline-retry');
    const bps = getMergedPipelineState(parent);
    const meta = (parent.metadata ?? {}) as Record<string, unknown>;

    const renderPending =
      bps.nestedVideoRenderPending === true || meta.nestedVideoRenderPending === true;
    if (!renderPending) return;
    if (!bps.pendingPostResult) return;

    let effectiveRenderId = String(
      bps.videoEditRenderTaskId ?? meta.videoEditRenderTaskId ?? ''
    ).trim();

    if (effectiveRenderId !== renderTaskId) {
      const { readParentPipelineTaskId } = await import('../tasks/nested-video-render');
      const incomingSnap = await this.taskManager.getTask(renderTaskId);
      const incomingParent = incomingSnap?.task
        ? readParentPipelineTaskId(incomingSnap.task)
        : undefined;
      if (
        incomingParent === parentTaskId &&
        incomingSnap?.task?.status === 'completed'
      ) {
        effectiveRenderId = renderTaskId;
      } else {
        return;
      }
    }

    const taskParams = (parent.requestParams ?? {}) as Record<string, any>;
    const renderSnap = await this.taskManager.getTask(effectiveRenderId);
    const renderStatus = renderSnap?.task?.status;
    if (renderStatus === 'failed' || renderStatus === 'cancelled') {
      const err =
        renderSnap?.task?.progress?.error ??
        renderSnap?.task?.result?.metadata ??
        renderStatus;
      const errMsg = `逐段渲染失败（${effectiveRenderId}）: ${typeof err === 'string' ? err : renderStatus}`;
      try {
        const { buildPipelineFailureSnapshot } = await import('./pipeline-retry');
        const snapshot = buildPipelineFailureSnapshot(parent, {
          nestedVideoRenderPending: false,
          videoEditRenderTaskId: undefined,
          businessPipelinePostDeferred: true,
          pipelineRenderRetry: true,
        });
        await this.taskManager.updateTaskRequestParams(parentTaskId, snapshot);
      } catch (persistErr) {
        console.warn('[TaskExecutor] nested render failure snapshot failed:', persistErr);
      }
      await this.taskManager.setTaskError(parentTaskId, errMsg);
      return;
    }
    if (renderStatus !== 'completed') return;

    const { mergeParamsWithPipelineState } = await import('./pipeline-retry');
    const mergedParams = mergeParamsWithPipelineState(taskParams, {
      ...bps,
      videoEditRenderTaskId: effectiveRenderId,
      nestedVideoRenderPending: true,
    });
    await this.taskManager.updateTaskRequestParams(parentTaskId, mergedParams);

    try {
      const storage = (this.taskManager as any).storage;
      if (storage) {
        await storage.update(parentTaskId, {
          metadata: {
            ...meta,
            videoEditRenderTaskId: effectiveRenderId,
            nestedVideoRenderPending: true,
          },
        });
      }
    } catch (metaErr) {
      console.warn('[TaskExecutor] nested render parent metadata patch failed:', metaErr);
    }

    const modelName =
      (parent.metadata?.model as string) ||
      (taskParams.params as Record<string, unknown> | undefined)?.logicalModel as string ||
      'video-pipeline-orchestrator';
    const provider = (parent.metadata?.provider || taskParams.provider) as ProviderType | undefined;
    const userId =
      (taskParams.userId as string) ||
      (parent.metadata?.userId as string) ||
      (parent.metadata?.billingUserId as string);

    await this.resumeDeferredPostPipeline({
      taskId: parentTaskId,
      pendingResult: bps.pendingPostResult as GenerateResult,
      params: taskParams,
      userId,
      storeToMinio: parent.metadata?.storeToMinio !== false,
      modelName,
      provider,
      scopeHint: 'video',
    });
  }

  /** 后置 manualReview 审核通过后，从 pendingPostResult 续跑 post 管线并完成落库 */
  private async resumeDeferredPostPipeline(options: {
    taskId: string;
    pendingResult: GenerateResult;
    params: Record<string, any>;
    userId?: string;
    storeToMinio?: boolean;
    storageConfig?: StorageConfig;
    modelName: string;
    provider?: ProviderType;
    scopeHint: ModelScope;
  }): Promise<void> {
    const { taskId, pendingResult, params, userId, modelName, provider } = options;
    const taskResponse = await this.taskManager.getTask(taskId);
    const taskType = taskResponse?.task?.type;

    await this.taskManager.updateTaskStatus(taskId, 'processing', {
      progress: 90,
      logs: ['用户已确认产出，继续后置步骤…'],
    });

    const postOutcome = await this.applyBusinessPostPipeline(
      taskId,
      pendingResult,
      userId,
      taskType
    );
    if (postOutcome === 'paused') {
      return;
    }

    const processedResult = postOutcome;
    const mediaUrls = processedResult.mediaUrls ?? pendingResult.mediaUrls ?? [];
    const taskMetadata = taskResponse?.task?.metadata ?? {};
    const resultMetadata = processedResult.metadata ?? {};

    const { scrubPersistedReviewArtifacts } = await import('../tasks/manual-review');
    const cleaned = scrubPersistedReviewArtifacts(params);
    const bps = { ...((cleaned.businessPipelineState ?? {}) as Record<string, unknown>) };
    delete bps.pendingPostResult;
    delete bps.businessPipelinePostDeferred;
    cleaned.businessPipelineState = bps;
    await this.taskManager.updateTaskRequestParams(taskId, cleaned);

    const finalMetadata = {
      ...taskMetadata,
      ...resultMetadata,
      model: resultMetadata.model || taskMetadata.model || modelName || 'unknown',
      provider: resultMetadata.provider || taskMetadata.provider || 'unknown',
      ...(typeof processedResult.text === 'string' && processedResult.text.trim()
        ? { text: processedResult.text }
        : {}),
    };

    await this.taskManager.setTaskResult(taskId, {
      mediaUrls,
      metadata: finalMetadata,
    });

    const { deleteManualReviewDraft } = await import('../tasks/manual-review-store');
    const gateId = (taskMetadata.manualReviewGate as { gateId?: string } | undefined)?.gateId;
    if (gateId) {
      await deleteManualReviewDraft(taskId, gateId);
    }
  }

  /**
   * 获取任务管理器实例
   */
  getTaskManager(): TaskManager {
    return this.taskManager;
  }
}

// 延迟初始化单例（避免在模块加载时创建，此时环境变量可能还未加载）
let _taskExecutor: TaskExecutor | null = null;

function getTaskExecutor(): TaskExecutor {
  if (!_taskExecutor) {
    _taskExecutor = new TaskExecutor();
  }
  return _taskExecutor;
}

// 导出延迟初始化的 taskExecutor
export const taskExecutor = new Proxy({} as TaskExecutor, {
  get(target, prop) {
    const executor = getTaskExecutor();
    const value = (executor as any)[prop];
    // 如果是方法，绑定 this
    if (typeof value === 'function') {
      return value.bind(executor);
    }
    return value;
  }
});
