/**
 * Writing 异步任务处理
 * 处理写作相关的异步任务（生成、改写、润色）
 */

import { TaskManager } from '../task/task-manager';
import { taskExecutor } from '../task/task-executor';
import {
  generateOutline,
  generateWriting,
  rewriteWriting,
  polishWriting,
} from './writing-service';
import type {
  OutlineParams,
  WritingGenerateParams,
  RewritingParams,
  PolishingParams,
} from './type';

export interface WritingTaskParams {
  taskType: 'outline' | 'generate' | 'rewrite' | 'polish';
  params: OutlineParams | WritingGenerateParams | RewritingParams | PolishingParams;
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
        await taskManager.updateTaskProgress(taskId, {
          progress: 30,
          logs: ['开始生成大纲'],
        });

        const outlineParams = params.params as OutlineParams;
        const writingType = outlineParams.writing_type || 'outlines';

        const outlineResult = await generateOutline(
          outlineParams,
          params.userId,
          params.provider as any
        );

        await taskManager.updateTaskProgress(taskId, {
          progress: 90,
          logs: ['大纲生成完成'],
        });

        result = {
          outline: outlineResult,
          metadata: {
            type: writingType, // 使用 writing_type，默认 'outlines'
            uid: outlineParams.uid,
            outline: outlineResult, // 将大纲内容存储在 metadata 中，方便直接返回
          },
        };
        break;
      }

      case 'generate': {
        await taskManager.updateTaskProgress(taskId, {
          progress: 10,
          logs: ['开始生成文章'],
        });

        const generateParams = params.params as WritingGenerateParams;
        const writingType = generateParams.writing_type || 'articles';

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
        };
        break;
      }

      case 'rewrite': {
        await taskManager.updateTaskProgress(taskId, {
          progress: 30,
          logs: ['开始改写文章'],
        });

        const rewriteParams = params.params as RewritingParams;
        const writingType = rewriteParams.writing_type || 'articles';

        const rewriteResult = await rewriteWriting(
          rewriteParams,
          params.userId,
          params.provider as any
        );

        await taskManager.updateTaskProgress(taskId, {
          progress: 90,
          logs: ['文章改写完成'],
        });

        result = {
          text: rewriteResult.text,
          formattedContent: Buffer.isBuffer(rewriteResult.formattedContent)
            ? rewriteResult.formattedContent.toString('base64')
            : rewriteResult.formattedContent,
          format: rewriteResult.format,
          metadata: {
            ...rewriteResult.metadata,
            type: writingType, // 确保 metadata.type 设置为 writing_type
          },
        };
        break;
      }

      case 'polish': {
        await taskManager.updateTaskProgress(taskId, {
          progress: 30,
          logs: ['开始润色文章'],
        });

        const polishParams = params.params as PolishingParams;
        const writingType = polishParams.writing_type || 'articles';

        const polishResult = await polishWriting(
          polishParams,
          params.userId,
          params.provider as any
        );

        await taskManager.updateTaskProgress(taskId, {
          progress: 90,
          logs: ['文章润色完成'],
        });

        result = {
          text: polishResult.text,
          formattedContent: Buffer.isBuffer(polishResult.formattedContent)
            ? polishResult.formattedContent.toString('base64')
            : polishResult.formattedContent,
          format: polishResult.format,
          metadata: {
            ...polishResult.metadata,
            type: writingType, // 确保 metadata.type 设置为 writing_type
          },
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
  } catch (error) {
    await taskManager.setTaskError(
      taskId,
      error instanceof Error ? error.message : String(error)
    );
  }
}

