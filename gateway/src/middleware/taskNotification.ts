/**
 * 任务和通知中间件
 * 在生成任务开始时创建任务，完成后发送通知
 */

import { Request, Response } from 'express';
import { AuthRequest } from './auth';
import { logger } from '../utils/logger';

const MXMNOTIFY_URL = process.env.MXMNOTIFY_URL || 'http://localhost:4005';

/**
 * 创建任务
 */
async function createTask(
  userId: string,
  taskType: 'graph' | 'text' | 'audio' | 'video',
  modelName: string,
  prompt: string,
  params?: Record<string, any>
): Promise<string | null> {
  try {
    const response = await fetch(`${MXMNOTIFY_URL}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        task_type: taskType,
        model_name: modelName,
        prompt,
        params,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create task: ${error.error?.message || response.statusText}`);
    }

    const result = await response.json();
    return result.task?.id || null;
  } catch (error) {
    logger.error('Failed to create task:', error);
    return null;
  }
}

/**
 * 更新任务状态
 */
async function updateTask(
  taskId: string,
  status: 'processing' | 'completed' | 'failed',
  result?: Record<string, any>,
  errorMessage?: string
): Promise<void> {
  try {
    const response = await fetch(`${MXMNOTIFY_URL}/tasks/${taskId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status,
        result,
        error_message: errorMessage,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to update task: ${error.error?.message || response.statusText}`);
    }
  } catch (error) {
    logger.error('Failed to update task:', error);
  }
}

/**
 * 发送任务完成通知
 */
async function sendTaskCompletedNotification(taskId: string): Promise<void> {
  try {
    const response = await fetch(`${MXMNOTIFY_URL}/notifications/task-completed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task_id: taskId,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to send notification: ${error.error?.message || response.statusText}`);
    }
  } catch (error) {
    logger.error('Failed to send task completed notification:', error);
  }
}

/**
 * 发送任务失败通知
 */
async function sendTaskFailedNotification(taskId: string): Promise<void> {
  try {
    const response = await fetch(`${MXMNOTIFY_URL}/notifications/task-failed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task_id: taskId,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to send notification: ${error.error?.message || response.statusText}`);
    }
  } catch (error) {
    logger.error('Failed to send task failed notification:', error);
  }
}

/**
 * 创建任务和通知处理器
 */
export function createTaskNotificationHandler(req: AuthRequest): {
  onProxyReq: (proxyReq: any, req: Request) => void;
  onProxyRes: (proxyRes: any, req: Request, res: Response) => void;
  onError: (err: Error, req: Request, res: Response) => void;
} {
  let taskId: string | null = null;

  return {
    // 在请求发送前创建任务
    onProxyReq: async (proxyReq: any, req: Request) => {
      const authReq = req as AuthRequest;
      
      // 只处理仍走旧代理的生成接口（graph 已 410 迁至 /api/v2/tasks，不再在网关侧建任务）
      if (!req.path.includes('/cgi/text') && !req.path.includes('/cgi/audio') && !req.path.includes('/cgi/video')) {
        return;
      }

      // 需要用户已认证
      if (!authReq.user) {
        return;
      }

      // 检查是否有 enable_notification 参数（默认启用）
      const enableNotification = (authReq.body?.enable_notification !== false);
      if (!enableNotification) {
        return;
      }

      const mediaType = req.path.includes('/audio')
        ? 'audio'
        : req.path.includes('/video')
          ? 'video'
          : 'text';
      const modelName = req.params.modelName || 'unknown';
      const prompt = authReq.body?.prompt || '';
      const params = authReq.body;

      // 创建任务
      taskId = await createTask(
        authReq.user.userId,
        mediaType,
        modelName,
        prompt,
        params
      );

      if (taskId) {
        logger.info(`Task created: ${taskId} for user ${authReq.user.userId}`);
        // 更新任务状态为 processing
        await updateTask(taskId, 'processing');
      }
    },

    // 在响应返回后更新任务并发送通知
    onProxyRes: async (proxyRes: any, req: Request, res: Response) => {
      if (!taskId) {
        return;
      }

      // 只处理成功的响应
      if (proxyRes.statusCode === 200) {
        // 检查是否是流式响应（text/event-stream）
        const contentType = proxyRes.headers['content-type'] || '';
        const isStream = contentType.includes('text/event-stream');

        if (isStream) {
          // 流式响应：在流结束时处理
          const originalEnd = res.end.bind(res);
          res.end = function (chunk?: any, encoding?: any) {
            // 流式响应通常不包含完整结果，任务会在流完成后标记为完成
            // 这里我们只记录，实际完成状态由客户端或后续处理决定
            setImmediate(async () => {
              // 对于流式响应，我们假设任务已完成（实际可能需要客户端确认）
              // 或者可以等待一段时间后标记为完成
              logger.info(`Stream task completed: ${taskId}`);
            });
            return originalEnd(chunk, encoding);
          };
        } else {
          // JSON 响应：读取完整响应体
          const chunks: Buffer[] = [];
          const originalWrite = res.write.bind(res);
          const originalEnd = res.end.bind(res);

          res.write = function (chunk: any, encoding?: any) {
            if (chunk) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
            }
            return originalWrite(chunk, encoding);
          };

          res.end = function (chunk?: any, encoding?: any) {
            if (chunk) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
            }

            // 异步处理任务更新和通知
            setImmediate(async () => {
              try {
                const responseBody = Buffer.concat(chunks).toString('utf-8');
                const body = JSON.parse(responseBody);

                if (body && body.success && body.result) {
                  // 更新任务为完成状态
                  await updateTask(taskId!, 'completed', body.result);
                  // 发送完成通知
                  await sendTaskCompletedNotification(taskId!);
                  logger.info(`Task completed: ${taskId}`);
                }
              } catch (error) {
                logger.error('Failed to process task completion:', error);
              }
            });

            return originalEnd(chunk, encoding);
          };
        }
      }
    },

    // 处理错误
    onError: async (err: Error, req: Request, res: Response) => {
      if (taskId) {
        // 更新任务为失败状态
        await updateTask(taskId, 'failed', undefined, err.message);
        // 发送失败通知
        await sendTaskFailedNotification(taskId);
        logger.info(`Task failed: ${taskId}`);
      }
    },
  };
}
