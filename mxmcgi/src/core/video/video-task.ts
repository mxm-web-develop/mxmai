/**
 * Video 任务处理（对齐 graph-task：Task V2 专用执行入口）
 */

import { taskExecutor } from '../../task/task-executor';
import { isCompleteStorageConfig, mediaUrlNeedsObjectStorage } from '../../task/task-result-media-persist';
import type { ProviderType } from '../providers/types';
import { maybeScheduleParallelChildRetry } from '../../tasks/parallel-child-retry';
import {
  getVideoProtocolForModel,
  mapFormParamsToProviderGenerate,
} from './provider-param-map';
import { resolveVideoTaskKey } from './video-task-keys';
import {
  processStoryboardGridForVideoTask,
  STORYBOARD_TEMP_KEYS_META,
} from './video-grid-storyboard';
import { mergeBusinessPipelineState } from '../../tasks/manual-review';
import { getGeneratedBucket } from '../../storage/generated-temp';

function assertNoInlineVideoMediaUrls(storeToMinio: boolean, mediaUrls: string[], label: string): void {
  if (!storeToMinio) return;
  for (const u of mediaUrls) {
    if (typeof u === 'string' && mediaUrlNeedsObjectStorage(u)) {
      throw new Error(`[VideoTask] 禁止将内联媒体写入任务结果（须先写入 MinIO）${label}`);
    }
  }
}

/**
 * 启动 Video 任务（由 task-executor 在 type=video 时分派）
 * @param options.awaitFullCompletion ephemeral / 同步等待场景必须为 true，否则 Atlas 已扣费时任务结果可能尚未落库
 */
export async function startVideoTask(
  taskId: string,
  originalParams?: Record<string, unknown>,
  options?: { awaitFullCompletion?: boolean },
): Promise<void> {
  const awaitFullCompletion = options?.awaitFullCompletion === true;
  const taskManager = taskExecutor.getTaskManager();

  try {
    console.log(`\n========== [VideoTask] 开始处理任务 ${taskId} ==========`);

    const taskResponse = await taskManager.getTask(taskId);
    if (!taskResponse?.task) {
      throw new Error(`任务 ${taskId} 不存在`);
    }
    const task = taskResponse.task;

    // 状态/进度由 TaskExecutor 统一推进（含 deferred 前置）
    await taskManager.updateTaskProgress(taskId, {
      progress: Math.max(task.progress?.progress ?? 0, 25),
      logs: ['开始视频生成'],
    });

    const requestParams = (task.requestParams || originalParams || {}) as Record<string, unknown>;
    const innerParams = (requestParams.params as Record<string, unknown>) || {};
    const pipelineState = mergeBusinessPipelineState(
      requestParams,
      innerParams,
      (task.metadata ?? {}) as Record<string, unknown>
    ) as Record<string, unknown> | undefined;

    const videoSubtype =
      String(
        requestParams.videoSubtype ??
          task.metadata?.videoSubtype ??
          innerParams.videoSubtype ??
          'default',
      ).trim() || 'default';

    const taskV2 = (requestParams.taskV2 ?? innerParams.taskV2) as
      | { scope?: string; taskKey?: string; subtype?: string | null }
      | undefined;

    const modelName =
      (task.metadata?.model as string) ||
      (requestParams.model as string) ||
      (innerParams.logicalModel as string);

    const userId =
      (requestParams.userId as string) ||
      (task.metadata?.userId as string) ||
      (task.metadata?.billingUserId as string);

    // video/edit/render 子任务：不依赖 prompt
    if (videoSubtype === 'render' || modelName === 'video-edit-dispatcher') {
      const { startVideoEditRenderTask } = await import('../video-edit/video-edit-task');
      await startVideoEditRenderTask(taskId, originalParams);
      return;
    }

    // 后置人工审核通过后：续跑 nestedVideo 等 post 步骤（awaiting_review 时 prompt 已被 scrub）
    if (pipelineState?.businessPipelinePostDeferred === true && pipelineState?.pendingPostResult) {
      const storeToMinio = task.metadata?.storeToMinio !== false;
      let storageConfig = isCompleteStorageConfig(task.metadata?.storageConfig)
        ? task.metadata.storageConfig
        : undefined;
      if (storeToMinio && !storageConfig) {
        storageConfig = {
          bucket: getGeneratedBucket(),
          pathTemplate: '{userId}/video/{timestamp}-{randomId}.{ext}',
        };
      }
      await taskExecutor.executeMediaModelTask({
        taskId,
        modelName: modelName || 'video-pipeline-orchestrator',
        provider: (task.metadata?.provider || requestParams.provider || 'internal') as ProviderType,
        params: {
          ...innerParams,
          ...requestParams,
          businessPipelineState: pipelineState,
        },
        userId,
        storeToMinio,
        storageConfig,
        awaitFullCompletion,
        scopeHint: 'video',
      });
      return;
    }

    const { isVideoPipelineOrchestrator, extractOrchestratorScriptText } = await import(
      '../video-edit/video-pipeline-orchestrator'
    );
    const { loadTaskDefinition } = await import('../../tasks/task-definition');
    let templateExtra: Record<string, unknown> | null = null;
    if (taskV2?.scope && taskV2.taskKey) {
      const { row } = await loadTaskDefinition({
        scope: taskV2.scope as import('../../tasks/types').TaskScope,
        taskKey: taskV2.taskKey,
        subtype: taskV2.subtype ?? null,
      });
      templateExtra = (row.extra ?? null) as Record<string, unknown> | null;
    }
    const orchestrator = isVideoPipelineOrchestrator({
      videoSubtype,
      templateExtra,
    });

    // 口播剪辑编排任务：前置已生成分镜 JSON，不走外部视频模型，也不需要 prompt
    if (orchestrator) {
      const scriptText = extractOrchestratorScriptText(requestParams);
      await taskManager.updateTaskProgress(taskId, {
        progress: 45,
        logs: ['口播分镜已生成，进入审核与渲染管线…'],
      });
      await taskExecutor.finalizeMediaTaskResult(
        taskId,
        {
          text: scriptText,
          mediaUrls: [],
          metadata: {
            orchestrator: true,
            model: modelName || 'video-pipeline-orchestrator',
            provider: 'internal',
          },
        },
        {
          userId,
          modelName: modelName || 'video-pipeline-orchestrator',
          provider: 'internal' as ProviderType,
          storeToMinio: false,
        },
      );
      console.log(`[VideoTask] 编排任务 ${taskId} 已进入后置管线`);
      return;
    }

    const mergedParams: Record<string, unknown> = {
      ...innerParams,
      ...requestParams,
    };
    delete mergedParams.taskType;
    delete mergedParams.params;
    delete mergedParams.userId;
    delete mergedParams.provider;
    delete mergedParams.prompt;

    const prompt =
      (typeof requestParams.prompt === 'string' && requestParams.prompt.trim()) ||
      (typeof innerParams.prompt === 'string' && innerParams.prompt.trim()) ||
      '';
    if (!prompt) {
      throw new Error('Video 任务缺少 prompt');
    }
    mergedParams.prompt = prompt;

    const storyboardCleanup = await processStoryboardGridForVideoTask(taskId, mergedParams, {
      provider: (task.metadata?.provider || requestParams.provider) as string | undefined,
    });
    if (storyboardCleanup) {
      const storageEarly = (taskManager as any).storage;
      if (storageEarly) {
        await storageEarly.update(taskId, {
          metadata: {
            ...(task.metadata || {}),
            [STORYBOARD_TEMP_KEYS_META]: storyboardCleanup.tempR2Keys,
            storyboardTempR2Bucket: storyboardCleanup.bucket,
          },
        });
      }
    }
    delete mergedParams._storyboardGridMeta;

    const videoTaskKey = resolveVideoTaskKey({
      taskKey:
        (requestParams.videoTaskKey as string) ||
        (task.metadata?.videoTaskKey as string) ||
        (mergedParams.videoTaskKey as string),
      scriptType: mergedParams.scriptType as string | undefined,
    });

    if (!modelName || typeof modelName !== 'string') {
      throw new Error('Video 任务缺少物理模型名（metadata.model）');
    }

    const provider = (task.metadata?.provider ||
      requestParams.provider ||
      mergedParams.provider) as ProviderType | undefined;

    const protocol = getVideoProtocolForModel(provider || 'deer', modelName);
    const providerParams = { ...mergedParams, videoSubtype };
    delete providerParams.storyboard_grid;
    delete providerParams._storyboardGridMeta;
    const { prompt: mappedPrompt, parameters } = mapFormParamsToProviderGenerate(protocol, providerParams);

    const generateParams = {
      prompt: mappedPrompt,
      parameters: {
        ...parameters,
        videoSubtype,
        videoTaskKey,
        ...(userId ? { userId } : {}),
      },
      enableProgress: true,
      useConfiguredPrompt: mergedParams.useConfiguredPrompt === true,
      ...(userId ? { userId } : {}),
    };

    const storeToMinio = task.metadata?.storeToMinio !== false;
    let storageConfig = isCompleteStorageConfig(task.metadata?.storageConfig)
      ? task.metadata.storageConfig
      : undefined;
    if (storeToMinio && !storageConfig) {
      storageConfig = {
        bucket: getGeneratedBucket(),
        pathTemplate: '{userId}/video/{timestamp}-{randomId}.{ext}',
      };
    }

    const storage = (taskManager as any).storage;
    if (storage) {
      await storage.update(taskId, {
        metadata: {
          ...(task.metadata || {}),
          videoTaskKey,
          videoSubtype,
          model: modelName,
          provider: provider ?? task.metadata?.provider,
        },
      });
    }

    await taskManager.updateTaskProgress(taskId, {
      progress: 20,
      logs: ['正在生成视频...'],
    });

    await taskExecutor.executeMediaModelTask({
      taskId,
      modelName,
      provider,
      params: generateParams,
      userId,
      storeToMinio,
      storageConfig,
      awaitFullCompletion,
      scopeHint: 'video',
    });

    const snap = await taskManager.getTask(taskId);
    const urls = snap?.task?.result?.mediaUrls ?? [];
    assertNoInlineVideoMediaUrls(storeToMinio, urls, `taskId=${taskId}`);
    if (awaitFullCompletion) {
      const st = snap?.task?.status;
      if (st !== 'completed' && st !== 'awaiting_review') {
        throw new Error(
          `Video 任务同步等待结束但状态仍为 ${st ?? 'unknown'}（预期 completed）。` +
            '常见原因：Atlas 已生成但结果未落库 / progress 未 await。'
        );
      }
      if (urls.length === 0) {
        throw new Error(
          'Video 任务同步等待结束但未落库 mediaUrls（Atlas/上游可能已扣费）。请检查输出解析与 MinIO 转存。'
        );
      }
    }

    console.log(`[VideoTask] 任务 ${taskId} 完成`);
    console.log(`========== [VideoTask] 任务处理完成 ==========\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[VideoTask] 任务 ${taskId} 执行失败:`, error);

    const snap = await taskManager.getTask(taskId);
    if (snap?.task && (await maybeScheduleParallelChildRetry(taskId, snap.task, message))) {
      return;
    }

    await taskManager.setTaskError(taskId, message);
    throw error;
  }
}
