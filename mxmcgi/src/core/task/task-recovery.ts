/**
 * 任务恢复服务
 * 处理服务器重启或网络问题导致的任务卡住问题
 */

import { taskManager } from './task-manager';
import { taskExecutor } from './task-executor';
import type { Task, TaskStatus } from './types';

export interface TaskRecoveryConfig {
  /**
   * 任务超时时间（毫秒）
   * 默认：30 分钟（图片生成）或 10 分钟（文本生成）
   */
  timeoutMs?: number;
  
  /**
   * 检查间隔（毫秒）
   * 默认：5 分钟
   */
  checkIntervalMs?: number;
  
  /**
   * 是否在启动时自动恢复卡住的任务
   * 默认：true
   */
  autoRecoverOnStartup?: boolean;
  
  /**
   * 是否自动重试失败的任务
   * 默认：false（只标记为失败）
   */
  autoRetry?: boolean;
}

/**
 * 任务恢复服务
 */
export class TaskRecoveryService {
  private config: Required<TaskRecoveryConfig>;
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(config: TaskRecoveryConfig = {}) {
    this.config = {
      timeoutMs: config.timeoutMs || 30 * 60 * 1000, // 默认 30 分钟
      checkIntervalMs: config.checkIntervalMs || 5 * 60 * 1000, // 默认 5 分钟
      autoRecoverOnStartup: config.autoRecoverOnStartup !== false,
      autoRetry: config.autoRetry || false,
    };
  }

  /**
   * 启动恢复服务
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[TaskRecovery] 恢复服务已在运行');
      return;
    }

    this.isRunning = true;
    console.log('[TaskRecovery] 启动任务恢复服务...');

    // 启动时恢复卡住的任务（如果失败，不阻止服务启动）
    if (this.config.autoRecoverOnStartup) {
      try {
      await this.recoverStuckTasksOnStartup();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // 检查是否是 Supabase 连接错误
        if (errorMessage.includes('fetch failed') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('QUERY_ERROR')) {
          console.warn('[TaskRecovery] ⚠️  启动时恢复失败：Supabase 连接不可用');
          console.warn('[TaskRecovery] ⚠️  提示：请检查 SUPABASE_URL 和 SUPABASE_ANON_KEY 环境变量是否正确');
          console.warn('[TaskRecovery] ⚠️  恢复服务将继续运行，但启动时恢复功能暂时不可用');
        } else {
          console.error('[TaskRecovery] ⚠️  启动时恢复失败:', errorMessage);
        }
        // 不阻止服务启动，允许定期检查继续运行
      }
    }

    // 定期检查超时任务
    this.checkInterval = setInterval(() => {
      this.checkAndRecoverStuckTasks().catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // 如果是连接错误，只记录一次警告，避免日志刷屏
        if (errorMessage.includes('fetch failed') || errorMessage.includes('ECONNREFUSED')) {
          // 静默处理连接错误，避免日志过多
          // console.warn('[TaskRecovery] 检查超时任务失败：Supabase 连接不可用');
        } else {
          console.error('[TaskRecovery] 检查超时任务失败:', errorMessage);
        }
      });
    }, this.config.checkIntervalMs);

    console.log(`[TaskRecovery] 恢复服务已启动，检查间隔: ${this.config.checkIntervalMs / 1000}秒`);
  }

  /**
   * 停止恢复服务
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log('[TaskRecovery] 恢复服务已停止');
  }

  /**
   * 启动时恢复卡住的任务
   */
  private async recoverStuckTasksOnStartup(): Promise<void> {
    try {
      console.log('[TaskRecovery] 检查启动时卡住的任务...');
      
      // 查找所有 processing 状态的任务
      const stuckTasks = await taskManager.listTasks({
        status: 'processing',
        limit: 1000, // 限制数量，避免一次性处理太多
      });

      if (stuckTasks.tasks.length === 0) {
        console.log('[TaskRecovery] 没有发现卡住的任务');
        return;
      }

      console.log(`[TaskRecovery] 发现 ${stuckTasks.tasks.length} 个 processing 状态的任务，开始恢复...`);

      const now = Date.now();
      for (const task of stuckTasks.tasks) {
        // 检查任务是否真的卡住了（通过 updated_at 判断）
        const lastUpdateTime = task.updatedAt.getTime();
        const timeSinceLastUpdate = now - lastUpdateTime;
        
        // 根据任务类型设置检查间隔
        let checkInterval: number;
        if (task.type === 'video') {
          checkInterval = 10 * 60 * 1000; // 视频任务 10 分钟
        } else if (task.type === 'writing' || task.type === 'text') {
          checkInterval = 2 * 60 * 1000; // 写作和文本任务 2 分钟（通常较快）
        } else {
          checkInterval = 5 * 60 * 1000; // 其他任务 5 分钟
        }
        
        if (timeSinceLastUpdate < checkInterval) {
          console.log(`[TaskRecovery] 任务 ${task.id} 最近有更新（${Math.round(timeSinceLastUpdate / 1000)}秒前），跳过恢复`);
          continue;
        }
        
        await this.handleStuckTask(task);
      }

      console.log('[TaskRecovery] 启动时恢复完成');
    } catch (error) {
      console.error('[TaskRecovery] 启动时恢复失败:', error);
    }
  }

  /**
   * 定期检查并恢复超时任务
   */
  private async checkAndRecoverStuckTasks(): Promise<void> {
    try {
      // 查找所有 processing 状态的任务
      const processingTasks = await taskManager.listTasks({
        status: 'processing',
        limit: 1000,
      });

      if (processingTasks.tasks.length === 0) {
        return;
      }

      const now = Date.now();
      const timeoutMs = this.config.timeoutMs;
      let recoveredCount = 0;

      for (const task of processingTasks.tasks) {
        // 首先检查任务是否真的卡住了（通过 updated_at 判断）
        // 如果最近有更新，说明任务还在正常进行，跳过检查
        const lastUpdateTime = task.updatedAt.getTime();
        const timeSinceLastUpdate = now - lastUpdateTime;
        
        // 根据任务类型设置检查间隔
        let checkInterval: number;
        if (task.type === 'video') {
          checkInterval = 10 * 60 * 1000; // 视频任务 10 分钟
        } else if (task.type === 'writing' || task.type === 'text') {
          checkInterval = 2 * 60 * 1000; // 写作和文本任务 2 分钟（通常较快）
        } else {
          checkInterval = 5 * 60 * 1000; // 其他任务 5 分钟
        }
        
        if (timeSinceLastUpdate < checkInterval) {
          // 最近有更新，任务还在正常进行，跳过
          continue;
        }

        // 对于视频任务，特别是使用 DeerAPI 的任务，先检查实际状态
        // 判断是否为 DeerAPI 任务：provider === 'deer' 或 model 是 sora/runway 相关
        const model = task.metadata?.model || '';
        const provider = task.metadata?.provider || 'unknown';
        const isDeerAPITask = 
          task.type === 'video' && (
            provider === 'deer' || 
            /^sora-2/.test(model) || 
            /^sora/.test(model) || 
            model.includes('runway') || 
            model.includes('gen3') || 
            model.includes('gen4')
          );
        
        // 如果是 DeerAPI 任务，先查询实际状态，避免误判超时
        if (isDeerAPITask) {
          console.log(`[TaskRecovery] 检测到 DeerAPI 视频任务 (model: ${model}, provider: ${provider})，先查询实际状态...`);
          const checkResult = await this.checkAndRecoverDeerAPITask(task);
          if (checkResult === 'completed') {
            // 任务已成功恢复为完成状态
            console.log(`[TaskRecovery] 任务 ${task.id} 已成功恢复为完成状态`);
            recoveredCount++;
            continue;
          } else if (checkResult === 'failed') {
            // 任务已标记为失败
            console.log(`[TaskRecovery] 任务 ${task.id} 已标记为失败`);
            recoveredCount++;
            continue;
          } else if (checkResult === 'processing' || checkResult === 'queued') {
            // 任务仍在处理中，继续等待，不标记为失败
            console.log(`[TaskRecovery] 任务 ${task.id} 在 DeerAPI 中状态为 ${checkResult}，继续等待`);
            continue;
          }
          // 如果查询失败，继续使用超时逻辑
          console.log(`[TaskRecovery] 无法查询任务 ${task.id} 在 DeerAPI 中的状态，使用超时逻辑`);
        }

        // 计算任务运行时间
        // 优先使用 createdAt，因为 startedAt 可能不准确（可能是之前任务的时间）
        // 对于视频任务，从创建到完成可能需要较长时间，使用 createdAt 更准确
        const taskStartTime = task.createdAt.getTime();
        const taskDuration = now - taskStartTime;

        // 根据任务类型确定超时时间
        const taskTimeout = this.getTaskTimeout(task.type, timeoutMs);

        // 只有当任务运行时间超过阈值，并且最近没有更新时，才认为任务超时
        if (taskDuration > taskTimeout) {
          console.warn(
            `[TaskRecovery] 发现超时任务: ${task.id}, 类型: ${task.type}, 运行时间: ${Math.round(taskDuration / 1000)}秒 (${Math.round(taskDuration / 1000 / 60)}分钟), 超时阈值: ${Math.round(taskTimeout / 1000)}秒 (${Math.round(taskTimeout / 1000 / 60)}分钟), 最后更新: ${Math.round(timeSinceLastUpdate / 1000)}秒前`
          );
          await this.handleStuckTask(task);
          recoveredCount++;
        }
      }

      if (recoveredCount > 0) {
        console.log(`[TaskRecovery] 本次检查恢复了 ${recoveredCount} 个超时任务`);
      }
    } catch (error) {
      console.error('[TaskRecovery] 检查超时任务失败:', error);
    }
  }

  /**
   * 处理卡住的任务
   */
  private async handleStuckTask(task: Task): Promise<void> {
    try {
      // 检查任务是否真的卡住了（通过 updated_at 判断）
      const now = Date.now();
      const lastUpdateTime = task.updatedAt.getTime();
      const timeSinceLastUpdate = now - lastUpdateTime;

      // 根据任务类型设置检查间隔
      let checkInterval: number;
      if (task.type === 'video') {
        checkInterval = 10 * 60 * 1000; // 视频任务 10 分钟
      } else if (task.type === 'writing' || task.type === 'text') {
        checkInterval = 2 * 60 * 1000; // 写作和文本任务 2 分钟（通常较快）
      } else {
        checkInterval = 5 * 60 * 1000; // 其他任务 5 分钟
      }
      
      if (timeSinceLastUpdate < checkInterval) {
        console.log(`[TaskRecovery] 任务 ${task.id} 最近有更新（${Math.round(timeSinceLastUpdate / 1000)}秒前），跳过恢复`);
        return;
      }

      console.log(`[TaskRecovery] 处理卡住的任务: ${task.id}, 最后更新: ${Math.round(timeSinceLastUpdate / 1000)}秒前`);

      // 对于视频任务，特别是使用 DeerAPI 的任务，先检查实际状态
      // 判断是否为 DeerAPI 任务：provider === 'deer' 或 model 是 sora/runway 相关
      const model = task.metadata?.model || '';
      const provider = task.metadata?.provider || 'unknown';
      const isDeerAPITask = 
        task.type === 'video' && (
          provider === 'deer' || 
          /^sora-2/.test(model) || 
          /^sora/.test(model) || 
          model.includes('runway') || 
          model.includes('gen3') || 
          model.includes('gen4')
        );
      
      if (isDeerAPITask) {
        console.log(`[TaskRecovery] 检测到 DeerAPI 视频任务 (model: ${model}, provider: ${provider})，查询实际状态...`);
        const checkResult = await this.checkAndRecoverDeerAPITask(task);
        if (checkResult === 'completed') {
          // 任务已成功恢复为完成状态
          console.log(`[TaskRecovery] 任务 ${task.id} 已成功恢复为完成状态`);
          return;
        } else if (checkResult === 'failed') {
          // 任务已标记为失败
          console.log(`[TaskRecovery] 任务 ${task.id} 已标记为失败`);
          return;
        } else if (checkResult === 'processing' || checkResult === 'queued') {
          // 任务仍在处理中，继续等待，不标记为失败
          console.log(`[TaskRecovery] 任务 ${task.id} 在 DeerAPI 中状态为 ${checkResult}，继续等待`);
          return;
        }
        // 如果查询失败，继续使用超时逻辑
        console.log(`[TaskRecovery] 无法查询任务 ${task.id} 在 DeerAPI 中的状态，使用超时逻辑`);
      }

      if (this.config.autoRetry) {
        // 自动重试：重新执行任务
        console.log(`[TaskRecovery] 尝试重新执行任务: ${task.id}`);
        await this.retryTask(task);
      } else {
        // 标记为失败
        await taskManager.setTaskError(
          task.id,
          `任务超时：任务运行时间超过 ${Math.round(this.getTaskTimeout(task.type, this.config.timeoutMs) / 1000 / 60)} 分钟，可能是服务器重启或网络问题导致。`
        );
        console.log(`[TaskRecovery] 任务 ${task.id} 已标记为失败`);
      }
    } catch (error) {
      console.error(`[TaskRecovery] 处理卡住的任务失败 (${task.id}):`, error);
      // 即使处理失败，也尝试标记为失败
      try {
        await taskManager.setTaskError(
          task.id,
          `任务恢复失败: ${error instanceof Error ? error.message : String(error)}`
        );
      } catch (e) {
        console.error(`[TaskRecovery] 标记任务失败也失败 (${task.id}):`, e);
      }
    }
  }

  /**
   * 检查并恢复 DeerAPI 任务的实际状态
   * 如果任务已完成，更新任务状态和结果
   * 返回实际状态，如果无法查询则返回 null
   */
  private async checkAndRecoverDeerAPITask(task: Task): Promise<'completed' | 'failed' | 'processing' | 'queued' | null> {
    try {
      // 从任务 metadata 中获取 taskId（可能是 Runway taskId 或 Sora videoId）
      // 注意：Sora 任务的 videoId 保存在 metadata.taskId 中
      const taskId = task.metadata?.taskId || task.metadata?.videoId || task.metadata?.runwayTaskId;
      if (!taskId) {
        console.log(`[TaskRecovery] 任务 ${task.id} 没有 taskId，无法查询 DeerAPI 状态`);
        console.log(`[TaskRecovery] 任务 metadata:`, JSON.stringify(task.metadata, null, 2));
        return null;
      }

      // 判断是 Runway 还是 Sora 任务
      const model = task.metadata?.model || '';
      const isRunway = model.includes('runway') || model.includes('gen3') || model.includes('gen4');
      
      if (isRunway) {
        // Runway 任务：使用 getRunwayTaskStatus
        const { DeerAPIClient } = await import('../utils/deerapi-client');
        const client = new DeerAPIClient();
        const status = await client.getRunwayTaskStatus(taskId);
        
        if (status.status === 'SUCCEEDED') {
          // 任务已完成，更新任务状态和结果
          console.log(`[TaskRecovery] 任务 ${task.id} 在 Runway 中已完成，更新任务状态`);
          await this.recoverCompletedRunwayTask(task, status);
          return 'completed';
        } else if (status.status === 'FAILED' || status.status === 'CANCELLED') {
          return 'failed';
        } else if (status.status === 'RUNNING') {
          return 'processing';
        } else if (status.status === 'PENDING') {
          return 'queued';
        }
        return null;
      } else {
        // Sora 任务：使用 getVideoStatusUnified
        // 直接使用 DeerAPIClient，不依赖 provider 实例
        const { DeerAPIClient } = await import('../utils/deerapi-client');
        const client = new DeerAPIClient();
        
        console.log(`[TaskRecovery] 查询 Sora 任务状态: taskId=${taskId}, model=${model}`);
        const status = await client.getVideoStatusUnified(taskId);
        
        console.log(`[TaskRecovery] Sora 任务状态查询结果: status=${status.status}, progress=${status.progress}, video_url=${status.video_url ? '存在' : '不存在'}`);
        
        if (status.status === 'completed') {
          // 任务已完成，更新任务状态和结果
          console.log(`[TaskRecovery] 任务 ${task.id} 在 Sora 中已完成，更新任务状态`);
          await this.recoverCompletedSoraTask(task, status);
          return 'completed';
        } else if (status.status === 'failed') {
          return 'failed';
        } else if (status.status === 'in_progress') {
          return 'processing';
        } else if (status.status === 'queued') {
          return 'queued';
        }
        return null;
      }
    } catch (error) {
      console.error(`[TaskRecovery] 查询 DeerAPI 任务状态失败 (${task.id}):`, error);
      if (error instanceof Error) {
        console.error(`[TaskRecovery] 错误详情:`, error.message, error.stack);
      }
      return null;
    }
  }

  /**
   * 恢复已完成的 Runway 任务
   */
  private async recoverCompletedRunwayTask(
    task: Task,
    runwayStatus: {
      id: string;
      status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
      output?: string | string[];
      error?: { code?: string; message?: string };
    }
  ): Promise<void> {
    try {
      // 提取视频 URL
      let videoUrl: string | undefined;
      if (runwayStatus.output) {
        if (Array.isArray(runwayStatus.output) && runwayStatus.output.length > 0) {
          videoUrl = runwayStatus.output[0];
        } else if (typeof runwayStatus.output === 'string') {
          videoUrl = runwayStatus.output;
        }
      }

      if (!videoUrl) {
        console.warn(`[TaskRecovery] 任务 ${task.id} 已完成但没有视频 URL`);
        await taskManager.setTaskError(task.id, '任务已完成但未返回视频 URL');
        return;
      }

      // 如果启用了 storeToMinio，下载并上传到 MinIO
      const storeToMinio = task.metadata?.storeToMinio;
      const storageConfig = task.metadata?.storageConfig;
      let mediaUrls = [videoUrl];
      let storageInfo: { keys: string[]; bucket: string; urls: string[] } | undefined;

      if (storeToMinio && storageConfig) {
        try {
          // 使用 storeFromGenerateResult 下载视频并上传到 MinIO
          const { storeFromGenerateResult } = await import('../utils/data-store');
          const storageResults = await storeFromGenerateResult(
            { mediaUrls: [videoUrl] },
            storageConfig,
            task.metadata?.userId,
            task.metadata?.model
          );
          
          if (storageResults.length > 0) {
            mediaUrls = [storageResults[0].url];
            storageInfo = {
              keys: storageResults.map(r => r.key),
              bucket: storageResults[0].bucket,
              urls: storageResults.map(r => r.url),
            };
            console.log(`[TaskRecovery] 任务 ${task.id} 的视频已上传到 MinIO: ${storageResults[0].url}`);
          }
        } catch (error) {
          console.error(`[TaskRecovery] 下载并上传视频失败:`, error);
          // 即使上传失败，也使用原始 URL
        }
      }

      // 更新任务状态为完成
      await taskManager.setTaskResult(task.id, {
        mediaUrls,
        storageInfo,
        metadata: {
          ...task.metadata,
          taskId: runwayStatus.id,
          runwayTaskId: runwayStatus.id,
          videoUrl,
        },
      });

      console.log(`[TaskRecovery] ✅ 任务 ${task.id} 已成功恢复为完成状态`);
    } catch (error) {
      console.error(`[TaskRecovery] 恢复 Runway 任务失败 (${task.id}):`, error);
      throw error;
    }
  }

  /**
   * 恢复已完成的 Sora 任务
   */
  private async recoverCompletedSoraTask(
    task: Task,
    soraStatus: {
      status: 'queued' | 'in_progress' | 'completed' | 'failed';
      video_url?: string;
      progress?: number;
      error?: any;
    }
  ): Promise<void> {
    try {
      const videoUrl = soraStatus.video_url;
      if (!videoUrl) {
        console.warn(`[TaskRecovery] 任务 ${task.id} 已完成但没有视频 URL`);
        await taskManager.setTaskError(task.id, '任务已完成但未返回视频 URL');
        return;
      }

      // 如果启用了 storeToMinio，下载并上传到 MinIO
      const storeToMinio = task.metadata?.storeToMinio;
      const storageConfig = task.metadata?.storageConfig;
      let mediaUrls = [videoUrl];
      let storageInfo: { keys: string[]; bucket: string; urls: string[] } | undefined;

      if (storeToMinio && storageConfig) {
        try {
          // 下载视频并上传到 MinIO
          const { taskExecutor } = await import('./task-executor');
          const executor = taskExecutor.getTaskExecutor();
          const downloadAndStore = (executor as any).downloadAndStoreDeerVideo;
          
          if (downloadAndStore && typeof downloadAndStore === 'function') {
            const taskId = task.metadata?.taskId || task.metadata?.videoId;
            if (taskId) {
              const uploadResult = await downloadAndStore.call(
                executor,
                taskId,
                storageConfig,
                task.metadata?.userId,
                task.metadata?.model
              );
              mediaUrls = [uploadResult.url];
              storageInfo = {
                keys: [uploadResult.key],
                bucket: uploadResult.bucket,
                urls: [uploadResult.url],
              };
              console.log(`[TaskRecovery] 任务 ${task.id} 的视频已上传到 MinIO: ${uploadResult.url}`);
            }
          } else {
            // 如果没有 downloadAndStore 方法，直接使用视频 URL
            console.warn(`[TaskRecovery] 无法下载并上传视频，使用原始 URL`);
          }
        } catch (error) {
          console.error(`[TaskRecovery] 下载并上传视频失败:`, error);
          // 即使上传失败，也使用原始 URL
        }
      }

      // 更新任务状态为完成
      await taskManager.setTaskResult(task.id, {
        mediaUrls,
        storageInfo,
        metadata: {
          ...task.metadata,
          videoId: task.metadata?.taskId || task.metadata?.videoId,
          videoUrl,
        },
      });

      console.log(`[TaskRecovery] ✅ 任务 ${task.id} 已成功恢复为完成状态`);
    } catch (error) {
      console.error(`[TaskRecovery] 恢复 Sora 任务失败 (${task.id}):`, error);
      throw error;
    }
  }

  /**
   * 重试任务
   */
  private async retryTask(task: Task): Promise<void> {
    try {
      // 重置任务状态，清空错误信息
      await taskManager.updateTaskStatus(task.id, 'queued', {
        progress: 0,
        error: undefined, // 清空之前的错误信息
      });

      // 重新执行任务
      await taskExecutor.executeTask({
        taskId: task.id,
        modelName: task.metadata.model,
        provider: task.metadata.provider as any,
        params: task.requestParams,
        userId: task.metadata.userId,
        storeToMinio: task.metadata.storeToMinio,
        storageConfig: task.metadata.storageConfig,
      });

      console.log(`[TaskRecovery] 任务 ${task.id} 已重新执行`);
    } catch (error) {
      console.error(`[TaskRecovery] 重试任务失败 (${task.id}):`, error);
      await taskManager.setTaskError(
        task.id,
        `任务重试失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 根据任务类型获取超时时间
   */
  private getTaskTimeout(taskType: string, defaultTimeout: number): number {
    // 图片生成任务通常需要更长时间
    if (taskType === 'image') {
      return defaultTimeout; // 使用配置的超时时间（默认 30 分钟）
    }
    // Graph 任务（图片生成，可能包含参考图，需要更长时间）
    if (taskType === 'graph') {
      return Math.max(defaultTimeout, 60 * 60 * 1000); // 至少 60 分钟（参考图处理可能需要更长时间）
    }
    // 文本生成任务通常较快
    if (taskType === 'text') {
      return Math.min(defaultTimeout, 10 * 60 * 1000); // 最多 10 分钟
    }
    // 写作任务通常较快（生成文章、大纲等）
    if (taskType === 'writing') {
      return Math.min(defaultTimeout, 15 * 60 * 1000); // 最多 15 分钟
    }
    // 视频生成任务需要更长时间（Runway 视频生成可能需要 10-30 分钟甚至更长）
    if (taskType === 'video') {
      // 视频任务使用更长的超时时间：60 分钟
      return Math.max(defaultTimeout, 60 * 60 * 1000); // 至少 60 分钟
    }
    // 音频生成任务
    if (taskType === 'audio') {
      return defaultTimeout; // 使用配置的超时时间（默认 30 分钟）
    }
    // 其他类型使用默认值
    return defaultTimeout;
  }

  /**
   * 手动恢复指定任务
   */
  async recoverTask(taskId: string): Promise<void> {
    const task = await taskManager.getTask(taskId);
    if (!task) {
      throw new Error(`任务 ${taskId} 不存在`);
    }

    if (task.status !== 'processing') {
      throw new Error(`任务 ${taskId} 状态不是 processing，无法恢复`);
    }

    await this.handleStuckTask(task.task);
  }

  /**
   * 手动重试指定任务
   */
  async retryTaskById(taskId: string): Promise<void> {
    const task = await taskManager.getTask(taskId);
    if (!task) {
      throw new Error(`任务 ${taskId} 不存在`);
    }

    if (task.task.status !== 'failed' && task.task.status !== 'processing') {
      throw new Error(`任务 ${taskId} 状态不是 failed 或 processing，无法重试`);
    }

    await this.retryTask(task.task);
  }
}

// 单例实例
let _taskRecoveryService: TaskRecoveryService | null = null;

/**
 * 获取任务恢复服务实例
 * 如果已存在实例，返回现有实例；否则使用配置创建新实例
 */
export function getTaskRecoveryService(config?: TaskRecoveryConfig): TaskRecoveryService {
  if (!_taskRecoveryService) {
    _taskRecoveryService = new TaskRecoveryService(config);
  } else if (config) {
    // 如果已存在实例但提供了新配置，更新配置（重新创建实例）
    _taskRecoveryService.stop();
    _taskRecoveryService = new TaskRecoveryService(config);
  }
  return _taskRecoveryService;
}

// 导出单例（使用默认配置）
export const taskRecoveryService = getTaskRecoveryService();
