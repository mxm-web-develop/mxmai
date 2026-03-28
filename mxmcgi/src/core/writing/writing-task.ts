/**
 * Writing 异步任务处理
 * 处理写作相关的异步任务（生成、改写、润色）
 */

import { TaskManager } from '../../task/task-manager';
import { taskExecutor } from '../../task/task-executor';
import { UsageService } from '../usage/usage-service';
import { BillingService } from '../billing/billing-service';
import {
  generateOutline,
  generateWriting,
} from './writing-service';
import type {
  OutlineParams,
  WritingGenerateParams,
} from './type';
import { OUTLINE_APPLY_TO_VALUES } from './type';

export interface WritingTaskParams {
  taskType: 'outline' | 'generate';
  params: OutlineParams | WritingGenerateParams;
  userId: string;
  provider?: string;
}

/**
 * 执行写作任务
 * 注意：这个函数会被 task-executor 调用，但任务已经在 task-executor 中创建
 * 我们需要从任务中提取参数并执行相应的写作操作
 */
export async function startWritingTask(taskId: string): Promise<void> {
  const taskManager: TaskManager = taskExecutor.getTaskManager();

  try {
    const taskResponse = await taskManager.getTask(taskId);
    // 从 requestParams 中提取 WritingTaskParams
    const taskParams = taskResponse.task.requestParams as any;
    
    // 检查是否是 writing 任务
    if (!taskParams || !taskParams.taskType) {
      await taskManager.setTaskError(taskId, '写作任务参数不完整：缺少 taskType');
      return;
    }

    const params: WritingTaskParams = {
      taskType: taskParams.taskType,
      params: taskParams.params,
      userId: taskParams.userId,
      provider: taskParams.provider,
    };

    if (!params || !params.taskType || !params.userId) {
      await taskManager.setTaskError(taskId, '写作任务参数不完整');
      return;
    }

    await taskManager.updateTaskStatus(taskId, 'queued', {
      progress: 0,
      logs: [`写作任务已创建，类型: ${params.taskType}`],
    });

    await taskManager.updateTaskStatus(taskId, 'processing', {
      progress: 10,
      logs: ['开始处理写作任务'],
      startedAt: new Date(),
    });

    let result: any;

    switch (params.taskType) {
      case 'outline': {
        const outlineParams = params.params as OutlineParams;
        const writingType = outlineParams.writing_type || 'outlines';

        // 参数验证（提前验证，避免任务开始后才发现错误）
        try {
          if (outlineParams.applyto) {
            if (!OUTLINE_APPLY_TO_VALUES.includes(outlineParams.applyto)) {
              throw new Error(`不支持的 applyto 类型: ${outlineParams.applyto}。仅支持: ${OUTLINE_APPLY_TO_VALUES.join(', ')}`);
            }

            // voice-scripts / storyboard-scripts 的 total_duration_seconds 为选填：不填则可在写作时再补充
          }
        } catch (validationError) {
          // 验证失败，立即抛出错误，不继续执行
          throw validationError;
        }

        await taskManager.updateTaskProgress(taskId, {
          progress: 30,
          logs: ['开始生成大纲'],
        });

        const outlineResult = await generateOutline(
          {
            uid: outlineParams.uid,
            prompt: outlineParams.prompt,
            logicalModel: outlineParams.logicalModel,
            maxDepth: outlineParams.maxDepth,
            expectedNodes: outlineParams.expectedNodes,
            total_textcount: outlineParams.total_textcount,
            total_duration_seconds: outlineParams.total_duration_seconds,
            applyto: outlineParams.applyto,
            outline_type: outlineParams.outline_type,
            outline_structure_type: outlineParams.outline_structure_type,
            stance: outlineParams.stance,
            tone: outlineParams.tone,
            speech_rate: outlineParams.speech_rate,
            rhythm: outlineParams.rhythm,
            knowledgeBase: outlineParams.knowledgeBase,
            cast_character_count: outlineParams.cast_character_count,
            cast_character_ids: outlineParams.cast_character_ids,
            language: outlineParams.language,
            useConfiguredPrompt: outlineParams.useConfiguredPrompt,
          },
          params.userId,
          params.provider as any
        );

        await taskManager.updateTaskProgress(taskId, {
          progress: 90,
          logs: ['大纲生成完成'],
        });

        // 注意：生成的角色不会自动保存，用户可以在编辑大纲时手动保存角色
        // 保留 _llmMetadata 用于 Provider 扣费和用户 MXM-TOKEN 扣费
        result = {
          outline: outlineResult.outline,
          metadata: {
            type: writingType, // 使用 writing_type，默认 'outlines'
            uid: outlineParams.uid,
            outline: outlineResult.outline, // 将大纲内容存储在 metadata 中，方便直接返回
            ...(outlineParams.total_duration_seconds != null ? { total_duration_seconds: outlineParams.total_duration_seconds } : {}),
            ...(outlineResult.characters && outlineResult.characters.length > 0
              ? { characters: outlineResult.characters }
              : {}),
          },
          _llmMetadata: (outlineResult as { _llmMetadata?: unknown })._llmMetadata,
        };
        break;
      }

      case 'generate': {
        const generateParams = params.params as WritingGenerateParams;
        const writingType = generateParams.writing_type || 'articles';

        // outlines 类型特殊处理：调用 generateOutline 而不是 generateWriting
        if (writingType === 'outlines') {
          await taskManager.updateTaskProgress(taskId, {
            progress: 30,
            logs: ['开始生成大纲'],
          });

          // 构建 outline 参数
          const outlineParams: OutlineParams = {
            uid: generateParams.metadata?.uid || `outline-${Date.now()}`,
            prompt: generateParams.prompt,
            writing_type: 'outlines',
            maxDepth: (generateParams as any).maxDepth,
            expectedNodes: (generateParams as any).expectedNodes,
            total_textcount: (generateParams as any).total_textcount,
            total_duration_seconds: (generateParams as any).total_duration_seconds ?? ((generateParams as any).total_duration_minutes != null ? (generateParams as any).total_duration_minutes * 60 : undefined),
            applyto: (generateParams as any).applyto,
            outline_type: (generateParams as any).outline_type,
            outline_structure_type: (generateParams as any).outline_structure_type,
            stance: (generateParams as any).stance,
            tone: (generateParams as any).tone,
            speech_rate: (generateParams as any).speech_rate,
            rhythm: (generateParams as any).rhythm,
            knowledgeBase: generateParams.knowledgeBase?.map(kb => ({
              knowledgeBaseId: kb.knowledgeBaseId,
              query: kb.query,
              limit: kb.limit,
            })),
            process_style: generateParams.process_style,
            outputFormat: 'json',
            language: (generateParams as any).language,
          };

          const outlineResult = await generateOutline(
            {
              uid: outlineParams.uid,
              prompt: outlineParams.prompt,
              maxDepth: outlineParams.maxDepth,
              expectedNodes: outlineParams.expectedNodes,
              total_textcount: outlineParams.total_textcount,
              total_duration_seconds: outlineParams.total_duration_seconds,
              applyto: outlineParams.applyto,
              outline_type: outlineParams.outline_type,
              outline_structure_type: outlineParams.outline_structure_type,
              knowledgeBase: outlineParams.knowledgeBase,
              language: outlineParams.language,
            },
            params.userId,
            params.provider as any
          );

          await taskManager.updateTaskProgress(taskId, {
            progress: 90,
            logs: ['大纲生成完成'],
          });

          // outlines 类型返回 JSON 格式，不存储到 MinIO
          // 保留 _llmMetadata 用于 Provider 扣费和用户 MXM-TOKEN 扣费
          result = {
            outline: outlineResult.outline,
            metadata: {
              type: 'outlines',
              uid: outlineParams.uid,
              outline: outlineResult.outline, // 将大纲内容存储在 metadata 中，方便直接返回
              ...(outlineParams.total_duration_seconds != null ? { total_duration_seconds: outlineParams.total_duration_seconds } : {}),
              ...(outlineResult.characters && outlineResult.characters.length > 0
                ? { characters: outlineResult.characters }
                : {}),
            },
            _llmMetadata: (outlineResult as { _llmMetadata?: unknown })._llmMetadata,
          };
          break;
        }

        // 其他类型使用正常的 generateWriting
        await taskManager.updateTaskProgress(taskId, {
          progress: 10,
          logs: ['开始生成文章'],
        });

        // 创建进度回调函数
        const onProgress = async (progress: number, message: string) => {
          await taskManager.updateTaskProgress(taskId, {
            progress,
            logs: [message],
          });
        };

        const writingResult = await generateWriting(
          generateParams,
          params.userId,
          params.provider as any,
          onProgress
        );

        await taskManager.updateTaskProgress(taskId, {
          progress: 95,
          logs: ['文章生成完成'],
        });

        result = {
          text: writingResult.text,
          formattedContent: Buffer.isBuffer(writingResult.formattedContent)
            ? writingResult.formattedContent.toString('base64')
            : writingResult.formattedContent,
          format: writingResult.format,
          storageInfo: writingResult.storageInfo,
          metadata: {
            ...writingResult.metadata,
            type: writingType, // 确保 metadata.type 设置为 writing_type
          },
          _llmMetadata: (writingResult as { _llmMetadata?: unknown })._llmMetadata,
        };
        break;
      }

      default:
        await taskManager.setTaskError(taskId, `不支持的任务类型: ${params.taskType}`);
        return;
    }

    await taskManager.updateTaskProgress(taskId, {
      progress: 95,
      logs: ['正在保存任务结果'],
    });

    // 对于 outline 任务，将大纲内容直接存储在 metadata 中
    const taskResult: any = {
      mediaUrls: [],
      metadata: result.metadata || {},
      ...(result.storageInfo ? { storageInfo: result.storageInfo } : {}),
    };

    // 如果是 outline 任务，将 outline 对象也包含在结果中
    if (params.taskType === 'outline' && result.outline) {
      taskResult.metadata.outline = result.outline;
    }
    // 如果 outline 任务包含角色画像，写入 result.metadata.characters
    if (params.taskType === 'outline' && (result as any).metadata?.characters) {
      taskResult.metadata.characters = (result as any).metadata.characters;
    }

    // 如果是其他任务类型，将文本内容存储在 metadata 中（如果没有存储到 MinIO）
    if (params.taskType !== 'outline' && result.text && !result.storageInfo) {
      taskResult.metadata.text = result.text;
      if (result.formattedContent) {
        taskResult.metadata.formattedContent = result.formattedContent;
        taskResult.metadata.format = result.format;
      }
    }

    // setTaskResult 内部会调用 updateTaskStatus 发送通知，不需要重复调用
    await taskManager.setTaskResult(taskId, taskResult);

    // 记录 Provider 用量并按 provider_pricing 扣减余额（outline、长文写作等所有带 _llmMetadata 的任务）
    const llmMeta = (result as { _llmMetadata?: { usage?: unknown; model?: string; provider?: string } })._llmMetadata;
    const needsUsageLog = !!llmMeta;
    if (needsUsageLog && llmMeta) {
      const billingScope = params.taskType === 'outline' ? 'outline' : 'writing';
      const usageTaskType = params.taskType === 'outline' ? 'outline' : 'writing';
      const { costUsd } = await UsageService.logProviderUsage({
        taskId,
        userId: params.userId,
        logicalModel: llmMeta.model,
        result: {
          metadata: {
            usage: llmMeta.usage,
            model: llmMeta.model,
            provider: llmMeta.provider,
            taskType: usageTaskType,
          },
        } as any,
        providerOverride: llmMeta.provider as any,
      });

      // 扣减用户 MXM-TOKEN
      if (params.userId) {
        const usageAny = llmMeta.usage as any;
        try {
          await BillingService.consumeForTask({
            taskId,
            userId: params.userId,
            provider: llmMeta.provider || 'unknown',
            modelKey: llmMeta.model || 'unknown',
            scope: billingScope,
            inputTokens: Number(usageAny?.prompt_tokens ?? usageAny?.input_tokens ?? 0),
            outputTokens: Number(usageAny?.completion_tokens ?? usageAny?.output_tokens ?? 0),
            totalTokens: Number(usageAny?.total_tokens ?? 0),
            requestCount: 1,
            providerCostUsd: costUsd,
          });
        } catch (billingErr) {
          console.warn('[WritingTask] 用户扣费失败:', billingErr instanceof Error ? billingErr.message : String(billingErr));
        }
      }
    }
  } catch (error) {
    await taskManager.setTaskError(
      taskId,
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * outline 独立任务入口
 * 当前实现复用 startWritingTask 内部的 outline 分支，避免重复落库/扣费/通知逻辑。
 */
export async function startOutlineTask(taskId: string): Promise<void> {
  // 为了安全地复用现有编排逻辑，确保 requestParams.taskType 确实是 outline
  const taskManager: TaskManager = taskExecutor.getTaskManager();
  const taskResponse = await taskManager.getTask(taskId);
  const requestParams = taskResponse?.task?.requestParams as any;
  if (!requestParams || requestParams.taskType !== 'outline') {
    throw new Error(`[OutlineTask] task ${taskId} requestParams.taskType 不是 outline`);
  }
  await startWritingTask(taskId);
}

