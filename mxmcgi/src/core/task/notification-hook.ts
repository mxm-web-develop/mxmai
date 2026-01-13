/**
 * 任务通知 Hook
 * 在任务状态更新时自动发送通知到 mxmnotify
 */

import { Task, TaskStatus, TaskType } from './types';

// 简单的 logger 实现（mxmcgi 模块使用 console）
const logger = {
  debug: (message: string, ...args: any[]) => {
    if (process.env.DEBUG) {
      console.log(`[NotificationHook] ${message}`, ...args);
    }
  },
  info: (message: string, ...args: any[]) => {
    console.log(`[NotificationHook] ${message}`, ...args);
  },
  error: (message: string, ...args: any[]) => {
    console.error(`[NotificationHook] ${message}`, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    console.warn(`[NotificationHook] ${message}`, ...args);
  },
};

const MXMNOTIFY_URL = process.env.MXMNOTIFY_URL || 'http://localhost:4005';
const MODULE_TYPE = 'mxmcgi';

/**
 * 发送任务状态变更通知
 */
export async function sendTaskStatusNotification(
  task: Task,
  status: TaskStatus,
  statusMessage?: string
): Promise<void> {
  try {
    // 如果任务没有 userId，跳过通知
    if (!task.metadata.userId) {
      logger.debug(`[NotificationHook] Task ${task.id} has no userId, skipping notification`);
      return;
    }

    // 构建通知事件
    const event = {
      module_type: MODULE_TYPE,
      task_id: task.id,
      user_id: task.metadata.userId,
      task_status: status,
      task_status_message: statusMessage,
      metadata: {
        task_type: task.type,
        model_name: task.metadata.model,
        model_provider: task.metadata.provider,
        progress: task.progress.progress,
        error: task.progress.error,
        // 如果任务完成，包含结果信息
        ...(status === 'completed' && task.result
          ? {
              media_count: task.result.mediaUrls?.length || 0,
              result: {
                mediaUrls: task.result.mediaUrls,
                storageInfo: task.result.storageInfo,
              },
            }
          : {}),
      },
      notification_config: {
        notification_type: status === 'completed' ? 'reminder' : 'system',
        // 可以根据任务类型自定义标题和内容
        ...(getNotificationConfig(task.type, status)),
      },
    };

    // 发送到 mxmnotify
    const response = await fetch(`${MXMNOTIFY_URL}/task-events/status-changed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to send notification: ${response.status} ${errorText}`);
    }

    const responseData = await response.json().catch(() => ({}));
    logger.info(
      `[NotificationHook] Notification sent for task ${task.id}, status: ${status}, response: ${JSON.stringify(responseData)}`
    );
  } catch (error) {
    // 通知失败不应该影响主流程，只记录错误
    logger.error(`[NotificationHook] Failed to send notification for task ${task.id}:`, error);
    // 输出更详细的错误信息
    if (error instanceof Error) {
      logger.error(`[NotificationHook] Error details: ${error.message}`);
      if (error.stack) {
        logger.error(`[NotificationHook] Stack trace: ${error.stack}`);
      }
    }
  }
}

/**
 * 获取通知配置（根据任务类型和状态）
 */
function getNotificationConfig(
  taskType: TaskType,
  status: TaskStatus
): { title?: string; content?: string; action_url?: string } {
  const taskTypeName = getTaskTypeName(taskType);

  switch (status) {
    case 'completed':
      return {
        title: `${taskTypeName}生成完成`,
        action_url: getActionUrl(taskType),
      };
    case 'failed':
      return {
        title: `${taskTypeName}生成失败`,
      };
    case 'cancelled':
      return {
        title: `${taskTypeName}生成已取消`,
      };
    default:
      return {};
  }
}

/**
 * 获取任务类型名称
 */
function getTaskTypeName(taskType: TaskType): string {
  const typeNames: Record<TaskType, string> = {
    writing: '写作',
    image: '图片',
    video: '视频',
    audio: '音频',
    text: '文本',
    other: '任务',
  };
  return typeNames[taskType] || '任务';
}

/**
 * 获取跳转链接
 */
function getActionUrl(taskType: TaskType): string {
  switch (taskType) {
    case 'writing':
      return '/writing';
    case 'image':
      return '/media/graph';
    case 'video':
      return '/media/video';
    case 'audio':
      return '/media/audio';
    case 'text':
      return '/media/text';
    default:
      return '/media';
  }
}

