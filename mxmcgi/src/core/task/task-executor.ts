/**
 * 任务执行器
 * 统一处理同步和异步任务，将结果存储到数据库
 */

import { TaskManager, type TaskStorage } from './task-manager';
import { DatabaseTaskStorage } from './database-storage';
import type { GenerateResult, ProgressEvent, GenerateParams } from '../providers/types';
import type { ProviderType } from '../providers/types';
import { providerFactory } from '../providers';
import { storeFromGenerateResult, type StorageConfig } from '../utils/data-store';
import type { TaskStatus } from './types';
import { RepositoryFactory, type UploadOptions } from '@mxmai/mxmdata';

export interface ExecuteTaskOptions {
  taskId: string;
  modelName: string;
  provider?: ProviderType;
  params: Record<string, any>;
  userId?: string;
  storeToMinio?: boolean;
  storageConfig?: StorageConfig;
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
    const { taskId, modelName, provider, params, userId, storeToMinio, storageConfig } = options;

    try {
      // 1. 更新任务状态为 queued
      await this.taskManager.updateTaskStatus(taskId, 'queued', {
        progress: 0,
      });

      // 2. 更新任务状态为 processing
      await this.taskManager.updateTaskStatus(taskId, 'processing', {
        progress: 10,
        startedAt: new Date(),
      });

      // 3. 检查是否是 writing 任务
      if (modelName.startsWith('writing-')) {
        // Writing 任务使用特殊的处理逻辑
        const { startWritingTask } = await import('../writing/writing-task');
        await startWritingTask(taskId);
        return; // Writing 任务在 startWritingTask 内部处理完成
      }

      // 4. 通过模型文件调用生成接口（与 text 路由逻辑一致）
      // 模型文件的 generate() 内部会使用 providerFactory.getProviderForModel() 自动选择支持的 provider
      // 如果默认 provider 不支持，会自动选择支持的 provider
      const result = await this.callModelGenerate(modelName, params, provider);
      
      // 5. 更新任务的 metadata 中的 provider（从 result.metadata 中获取，确保正确）
      // 这确保即使任务创建时 provider 是 undefined，执行时也会正确设置
      if (result.metadata?.provider) {
        try {
          const taskResponse = await this.taskManager.getTask(taskId);
          if (taskResponse?.task && taskResponse.task.metadata && taskResponse.task.metadata.provider !== result.metadata.provider) {
            // 通过 storage 直接更新 metadata（TaskManager 没有专门的 updateMetadata 方法）
            const storage = (this.taskManager as any).storage;
            if (storage) {
              await storage.update(taskId, {
                metadata: {
                  ...(taskResponse.task.metadata || {}),
                  provider: result.metadata.provider,
                },
              });
            }
          }
        } catch (error) {
          // 如果更新 metadata 失败，记录警告但不影响任务执行
          console.warn(`[TaskExecutor] 更新任务 metadata 失败 (taskId: ${taskId}):`, error);
        }
      }

      // 6. 如果有进度流，监听进度更新（异步任务）
      if (result.progress) {
        // 异步处理进度流（不阻塞，在后台执行）
        this.processProgressStream(taskId, result.progress, result, storeToMinio, storageConfig, userId, modelName, provider).catch(
          (error) => {
            console.error(`[TaskExecutor] 处理进度流失败 (taskId: ${taskId}):`, error);
            this.taskManager.setTaskError(
              taskId,
              `处理进度流失败: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        );
      } else {
        // 没有进度流（同步返回，如 DeerAPI）
        // 如果启用了 MinIO 存储，先更新进度为 90%（表示生成完成，正在存储）
        if (storeToMinio && result.mediaUrls && result.mediaUrls.length > 0) {
          await this.taskManager.updateTaskProgress(taskId, {
            progress: 90,
            logs: ['媒体生成完成，正在上传到存储...'],
          });
        } else {
          // 如果没有存储需求，直接更新为 100%
          await this.taskManager.updateTaskProgress(taskId, {
            progress: 100,
          });
        }
        
        // 处理结果（包括 MinIO 存储）
        await this.processResult(taskId, result, storeToMinio, storageConfig, userId, modelName, provider);
      }
    } catch (error) {
      await this.taskManager.setTaskError(
        taskId,
        error instanceof Error ? error.message : String(error)
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

          // 如果是 Deer Sora 视频任务且还没有 mediaUrls，则在任务层主动拉取视频并上传到 MinIO
          // 使用 finalResult.metadata 而不是 result.metadata，确保使用最新的 metadata
          // 确保 metadata 存在后再访问 provider
          const isDeerVideo =
            finalResult.metadata &&
            finalResult.metadata.provider === 'deer' &&
            modelName &&
            /^sora-2/.test(modelName) &&
            typeof finalResult.metadata.taskId === 'string';

          if (
            isDeerVideo &&
            storeToMinio &&
            (!finalResult.mediaUrls || finalResult.mediaUrls.length === 0) &&
            storageConfig
          ) {
            await this.taskManager.updateTaskProgress(taskId, {
              progress: 90,
              logs: ['视频生成完成，正在从 DeerAPI 下载并上传到存储...'],
            });

            const deerTaskId = finalResult.metadata?.taskId as string | undefined;
            if (!deerTaskId) {
              throw new Error('DeerAPI 视频结果缺少 taskId，无法下载视频内容');
            }

            const uploadResult = await this.downloadAndStoreDeerVideo(
              deerTaskId,
              storageConfig,
              userId,
              modelName,
            );

            finalResult = {
              ...finalResult,
              mediaUrls: [uploadResult.url],
              metadata: finalResult.metadata || { model: modelName || 'unknown', provider: 'deer' },
            };

            // 直接设置任务结果并将进度更新为 100%
            await this.taskManager.setTaskResult(taskId, {
              mediaUrls: [uploadResult.url],
              storageInfo: {
                keys: [uploadResult.key],
                bucket: uploadResult.bucket,
                urls: [uploadResult.url],
              },
              metadata: finalResult.metadata || {
                model: modelName || 'unknown',
                provider: 'deer', // 这是 Deer Sora 视频任务，provider 应该是 'deer'
              },
            });

            await this.taskManager.updateTaskProgress(taskId, {
              progress: 100,
              logs: ['视频已成功上传到存储'],
            });
            break;
          }
          
          // 检查是否有 Base64 数据，如果有则强制使用 MinIO
          const hasBase64InProgress = finalResult.mediaUrls?.some(url => url.startsWith('data:'));
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
          if (url.startsWith('data:')) {
            hasBase64Data = true;
            // 计算 Base64 数据大小（data URI 前缀 + Base64 数据）
            const base64Size = Buffer.byteLength(url, 'utf8');
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
      let finalStorageConfig = storageConfig;
      if (shouldForceMinIO && !finalStorageConfig) {
        // 根据任务类型自动生成存储路径模板
        const taskResponse = await this.taskManager.getTask(taskId);
        const taskType = taskResponse?.task?.type || 'other';
        const pathTemplateMap: Record<string, string> = {
          image: '{userId}/graph/{timestamp}-{randomId}.{ext}',
          video: '{userId}/video/{timestamp}-{randomId}.{ext}',
          audio: '{userId}/audio/{timestamp}-{randomId}.{ext}',
          text: '{userId}/text/{timestamp}-{randomId}.{ext}',
          writing: '{userId}/writing/{timestamp}-{randomId}.{ext}',
          outlines: '{userId}/outlines/{timestamp}-{randomId}.{ext}',
          other: '{userId}/other/{timestamp}-{randomId}.{ext}',
        };
        
        finalStorageConfig = {
          bucket: process.env.CGI_STORAGE_BUCKET || 'user-media',
          pathTemplate: pathTemplateMap[taskType] || pathTemplateMap.other,
        };
        console.log(
          `[TaskExecutor] 自动生成存储配置 (taskId: ${taskId}, type: ${taskType})`
        );
      }

      // 如果需要存储到 MinIO（用户指定或强制）
      if ((storeToMinio || shouldForceMinIO) && finalStorageConfig && mediaUrls.length > 0) {
        const { storeFromGenerateResult } = await import('../utils/data-store');
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
        const proxyBasePath = `/api/v1/media/graph/${taskId}`;

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

      // 设置任务结果
      // 确保 metadata 中包含正确的 provider（从 result.metadata 中获取，如果没有则保持原有值）
      const taskResponse = await this.taskManager.getTask(taskId);
      
      // 安全地合并 metadata，确保所有字段都存在
      const taskMetadata = taskResponse?.task?.metadata || {};
      const resultMetadata = result.metadata || {};
      
      const finalMetadata = {
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
      
      await this.taskManager.setTaskResult(taskId, {
        mediaUrls,
        storageInfo,
        metadata: finalMetadata,
      });
    } catch (error) {
      await this.taskManager.setTaskError(
        taskId,
        `处理结果失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Deer Sora 视频：从 DeerAPI 下载视频并上传到 MinIO
   * 只在任务层处理，不改动通用存储工具
   */
  private async downloadAndStoreDeerVideo(
    deerVideoId: string,
    storageConfig: StorageConfig,
    userId?: string,
    modelName?: string,
  ): Promise<{ key: string; bucket: string; url: string }> {
    const baseUrl = process.env.DEERAPI_BASE_URL;
    const apiKey = process.env.DEERAPI_API_KEY;

    if (!baseUrl || !apiKey) {
      throw new Error('DEERAPI_BASE_URL 或 DEERAPI_API_KEY 未配置，无法下载 Deer 视频');
    }

    const url = `${baseUrl}/v1/videos/${deerVideoId}/content`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeerAPI 获取视频内容失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'video/mp4';
    const ext = contentType.includes('webm') ? 'webm' : 'mp4';

    // 生成 MinIO 路径（不改动通用存储逻辑，这里简化一版）
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate(),
    ).padStart(2, '0')}`;
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).slice(2, 8);

    const pathVariables: Record<string, string | number> = {
      userId: userId || 'anonymous',
      modelName: modelName || 'unknown',
      date: dateStr,
      timestamp,
      randomId,
      ext,
    };

    let key = storageConfig.pathTemplate;
    for (const [k, v] of Object.entries(pathVariables)) {
      key = key.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }

    const storageRepo = RepositoryFactory.createStorageRepository();
    const uploadOptions: UploadOptions = {
      contentType,
      metadata: {
        userId: userId || 'anonymous',
        originalUrl: `deerapi://${deerVideoId}/content`,
        mediaType: 'video',
      },
    };

    const uploadResult = await storageRepo.uploadFile(
      storageConfig.bucket,
      key,
      buffer,
      uploadOptions,
    );

    return {
      key: uploadResult.key,
      bucket: uploadResult.bucket,
      url: uploadResult.url,
    };
  }

  /**
   * 通过模型文件调用生成接口
   * 与 text 路由逻辑一致：使用模型文件的 generate() 函数，内部自动选择 provider
   * 如果默认 provider 不支持该模型，会自动选择支持的 provider
   */
  private async callModelGenerate(
    modelName: string,
    params: Record<string, any>,
    provider?: ProviderType
  ): Promise<GenerateResult> {
    // 动态导入模型文件（根据模型类型选择 video / graph / text）
    // 先尝试 video（视频生成），再尝试 graph（图片生成），最后尝试 text（文本生成）
    let modelModule: any = null;
    let importError: Error | null = null;
    
    // 1. 尝试导入 video 模型文件（例如 sora-2 / sora-2-all）
    try {
      modelModule = await import(`../video/${modelName}`);
      if (modelModule && typeof modelModule.generate === 'function') {
        return await modelModule.generate(params, provider);
      }
    } catch (videoError) {
      importError = videoError instanceof Error ? videoError : new Error(String(videoError));
    }

    // 2. 尝试导入 graph 模型文件
    // 尝试导入 graph 模型文件
    try {
      modelModule = await import(`../graph/${modelName}`);
      if (modelModule && typeof modelModule.generate === 'function') {
        // 模型文件的 generate() 内部会调用 providerFactory.getProviderForModel()
        // 自动选择支持的 provider（如果默认 provider 不支持，会自动选择支持的）
        return await modelModule.generate(params, provider);
      }
    } catch (graphError) {
      importError = graphError instanceof Error ? graphError : new Error(String(graphError));
    }

    // 3. 如果 graph 不存在，尝试 text
    try {
      modelModule = await import(`../text/${modelName}`);
      if (modelModule && typeof modelModule.generate === 'function') {
        return await modelModule.generate(params, provider);
      }
    } catch (textError) {
      // 如果都不存在，回退到直接调用 provider（兼容旧逻辑）
      console.warn(
        `[TaskExecutor] 未找到模型文件 ${modelName}（graph 和 text 都不存在），使用直接 provider 调用`
      );
      const modelProvider = providerFactory.getProviderForModel(modelName, provider);
      const generateParams: GenerateParams = {
        prompt: params.prompt || '',
        ...params,
        enableProgress: true,
        outputFormat: 'json' as const,
      };
      return await modelProvider.generate(modelName, generateParams);
    }

    // 如果模型文件没有 generate 函数，回退到直接调用 provider
    console.warn(`[TaskExecutor] 模型文件 ${modelName} 没有 generate 函数，使用直接 provider 调用`);
    const modelProvider = providerFactory.getProviderForModel(modelName, provider);
    const generateParams: GenerateParams = {
      prompt: params.prompt || '',
      ...params,
      enableProgress: true,
      outputFormat: 'json' as const,
    };
    return await modelProvider.generate(modelName, generateParams);
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
