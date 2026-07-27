/**
 * 任务通知 Hook
 * 在任务状态更新时自动发送通知到 mxmnotify
 */

import { Task, TaskStatus, TaskType } from './types';
import type { TaskSnapshot } from './task-snapshot';
import { buildTaskSnapshot } from './task-snapshot';
import { buildTaskStatusChangedEvent, deliverToMxmnotify, enqueueOutboxEvent } from './notification-outbox';

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
  statusMessage?: string,
  taskSnapshot?: TaskSnapshot
): Promise<void> {
  try {
    // 如果任务没有 userId，跳过通知
    if (!task.metadata.userId) {
      logger.debug(`[NotificationHook] Task ${task.id} has no userId, skipping notification`);
      return;
    }

    const snapshot = taskSnapshot ?? buildTaskSnapshot(task);

    // 构建通知事件（加入 event_id/event_ts，便于幂等与回放）
    const event = buildTaskStatusChangedEvent({
      taskId: task.id,
      userId: task.metadata.userId,
      status,
      statusMessage,
      taskType: task.type,
      modelName: task.metadata.model,
      modelProvider: task.metadata.provider,
      progress: task.progress.progress,
      error: task.progress.error,
      task_snapshot: snapshot,
      result: task.result ? { mediaUrls: task.result.mediaUrls, storageInfo: task.result.storageInfo } : undefined,
      notification_config: {
        notification_type: status === 'completed' ? 'reminder' : 'system',
        ...(getNotificationConfig(task.type, status, task.metadata)),
      },
    });

    // Outbox：先落库，再投递；若数据库不可用则降级为“尽力投递”
    try {
      await enqueueOutboxEvent(event);
    } catch (e) {
      logger.warn(
        `[NotificationHook] Outbox unavailable, fallback to direct deliver. task=${task.id} status=${status}:`,
        e instanceof Error ? e.message : String(e)
      );
      await deliverToMxmnotify(event);
      return;
    }

    // 尝试立即投递一次（失败会由 outbox processor 重试）
    try {
      await deliverToMxmnotify(event);
      // sent_at 由 processor 标记；这里不强制更新，避免双写冲突
    } catch (e) {
      logger.warn(
        `[NotificationHook] Immediate deliver failed, will retry via outbox. event=${event.event_id}:`,
        e instanceof Error ? e.message : String(e)
      );
    }
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
  status: TaskStatus,
  metadata?: Record<string, unknown>
): { title?: string; content?: string; action_url?: string } {
  let taskTypeName = getTaskTypeName(taskType);
  if (taskType === 'task-v2-batch-parent') {
    const n = metadata?.parallelTotal;
    if (typeof n === 'number' && n > 1) {
      taskTypeName = `批量生成 ${n} 份`;
    }
  }

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
    outline: '大纲',
    image: '图片',
    video: '视频',
    audio: '音频',
    music: '音乐',
    text: '文本',
    other: '任务',
    graph: '图片',
    'graph-grid9-parent': '图片',
    'video-batch-parent': '视频',
    'task-v2-batch-parent': '批量生成',
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
    case 'outline':
      return '/outline';
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

