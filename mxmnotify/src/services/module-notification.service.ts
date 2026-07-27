/**
 * 模块化通知服务
 * 支持按模块管理的通知处理
 */

import { getSupabaseClient } from '@mxmai/mxmdata';
import { logger } from '../utils/logger';
import {
  AsyncTaskStatusChangedEvent,
  NotificationHandler,
  ModuleType,
  TaskStatus,
} from '../types/notification.types';
import { BaseNotificationHandler } from '../handlers/base.handler';
import { CgiTaskNotificationHandler } from '../handlers/cgi-task.handler';
import { websocketService } from './websocket.service';
import { sseService } from './sse.service';
import { NotificationEventType } from '../types/notification.types';

/**
 * 模块化通知服务
 */
export class ModuleNotificationService {
  private supabase: ReturnType<typeof getSupabaseClient> | null = null;
  private handlers: Map<string, NotificationHandler> = new Map();
  private defaultHandler: NotificationHandler;

  constructor() {
    // 注册默认处理器
    this.defaultHandler = new BaseNotificationHandler();

    // 注册各模块的处理器
    this.registerHandler(new CgiTaskNotificationHandler());
    // 未来可以注册其他模块的处理器：
    // this.registerHandler(new PaymentNotificationHandler());
    // this.registerHandler(new AuthNotificationHandler());
  }

  /**
   * 获取 Supabase 客户端（延迟初始化）
   */
  private getSupabase() {
    if (!this.supabase) {
      this.supabase = getSupabaseClient();
    }
    return this.supabase;
  }

  /**
   * 注册通知处理器
   */
  registerHandler(handler: NotificationHandler): void {
    // 根据支持的模块类型注册
    Object.values(ModuleType).forEach((moduleType) => {
      if (handler.supports(moduleType)) {
        this.handlers.set(moduleType, handler);
        logger.info(`[ModuleNotification] Registered handler for module: ${moduleType}`);
      }
    });
  }

  /**
   * 处理异步任务状态变更事件
   */
  async handleTaskStatusChanged(event: AsyncTaskStatusChangedEvent): Promise<void> {
    try {
      logger.info(
        `[ModuleNotification] Handling task status changed: module=${event.module_type}, task=${event.task_id}, status=${event.task_status}`
      );

      // 1. 获取对应的处理器
      const handler = this.handlers.get(event.module_type) || this.defaultHandler;

      // 2. 生成通知内容
      const notificationContent = handler.generateNotification(event);

      // 3. 创建通知记录（存储到数据库）
      const notification = await this.createNotification({
        user_id: event.user_id,
        module_type: event.module_type,
        task_id: event.task_id,
        task_status: event.task_status,
        task_status_message: event.task_status_message,
        notification_type: notificationContent.notification_type,
        title: notificationContent.title,
        content: notificationContent.content,
        action_url: notificationContent.action_url,
        avatar_url: notificationContent.avatar_url,
        metadata: event.metadata || {},
      });

      // 4. 调用处理器的 handle 方法（可能包含额外的业务逻辑）
      await handler.handle(event);

      // 5. 通过 WebSocket 推送通知
      this.sendWebSocketNotification(event, notification);

      // 6. 通过 SSE 推送通知（向后兼容）
      this.sendSSENotification(event, notification);

      logger.info(
        `[ModuleNotification] Notification created and sent: ${notification.id} for user ${event.user_id}`
      );
    } catch (error) {
      logger.error('[ModuleNotification] Failed to handle task status changed:', error);
      throw error;
    }
  }

  /**
   * 发送全局通知（广播给所有在线用户）
   * @param event 事件类型
   * @param data 通知数据
   * @param excludeUserIds 排除的用户ID列表（可选）
   */
  async sendGlobalNotification(
    event: NotificationEventType | string,
    data: {
      title: string;
      content: string;
      action_url?: string;
      avatar_url?: string;
      metadata?: Record<string, any>;
    },
    excludeUserIds?: string[]
  ): Promise<void> {
    try {
      // 获取所有在线用户ID
      const onlineUserIds = websocketService.getOnlineUserIds();
      
      // 如果需要排除某些用户，过滤掉
      const targetUserIds = excludeUserIds
        ? onlineUserIds.filter((id) => !excludeUserIds.includes(id))
        : onlineUserIds;

      if (targetUserIds.length === 0) {
        logger.debug('[ModuleNotification] No online users to send global notification');
        return;
      }

      // 为每个用户创建通知记录（可选，如果需要持久化）
      // 这里可以选择是否存储到数据库，或者只通过 WebSocket 推送

      // 通过 WebSocket 广播通知
      websocketService.broadcast(event, {
        type: 'global_notification',
        notification: data,
      }, excludeUserIds);

      logger.info(
        `[ModuleNotification] Global notification sent: ${event} to ${targetUserIds.length} users`
      );
    } catch (error) {
      logger.error('[ModuleNotification] Failed to send global notification:', error);
      throw error;
    }
  }

  /**
   * 发送通知给多个指定用户
   * @param userIds 用户ID列表
   * @param event 事件类型
   * @param data 通知数据
   */
  async sendNotificationToUsers(
    userIds: string[],
    event: NotificationEventType | string,
    data: {
      title: string;
      content: string;
      action_url?: string;
      avatar_url?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    try {
      if (userIds.length === 0) {
        logger.debug('[ModuleNotification] No users specified for notification');
        return;
      }

      // 通过 WebSocket 发送给多个用户
      websocketService.sendToUsers(userIds, event, {
        type: 'multi_user_notification',
        notification: data,
      });

      logger.info(
        `[ModuleNotification] Notification sent to ${userIds.length} users: ${event}`
      );
    } catch (error) {
      logger.error('[ModuleNotification] Failed to send notification to users:', error);
      throw error;
    }
  }

  /**
   * 创建通知记录
   */
  private async createNotification(data: {
    user_id: string;
    module_type: string;
    task_id: string;
    task_status: string;
    task_status_message?: string;
    notification_type: string;
    title: string;
    content: string;
    action_url?: string;
    avatar_url?: string;
    metadata: Record<string, any>;
  }): Promise<any> {
    try {
      // 检查任务是否存在于 generation_tasks 表中
      // 如果不存在（比如 mxmcgi 的任务在 cgi_tasks 表中），则不设置 task_id
      let taskId: string | null = null;
      if (data.module_type === 'mxmcgi') {
        // mxmcgi 的任务存储在 cgi_tasks 表中，不在 generation_tasks 中
        // 所以不设置 task_id，避免外键约束错误
        taskId = null;
      } else {
        // 对于其他模块，检查任务是否存在
        const { data: task } = await this.getSupabase()
          .from('generation_tasks')
          .select('id')
          .eq('id', data.task_id)
          .single();
        
        if (task) {
          taskId = data.task_id;
        }
      }

      // 使用 async_task_notifications 表（如果存在）
      // 否则使用 notifications 表
      const insertData: any = {
        user_id: data.user_id,
        type: data.notification_type,
        title: data.title,
        content: data.content,
        data: {
          module_type: data.module_type,
          task_id: data.task_id, // 在 data 字段中保存原始 task_id，即使不在 generation_tasks 中
          task_status: data.task_status,
          task_status_message: data.task_status_message,
          action_url: data.action_url,
          avatar_url: data.avatar_url,
          ...data.metadata,
        },
        is_read: false,
      };

      // 只有当任务存在于 generation_tasks 表中时才设置 task_id
      if (taskId) {
        insertData.task_id = taskId;
      }

      const { data: notification, error } = await this.getSupabase()
        .from('notifications')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create notification: ${error.message}`);
      }

      return notification;
    } catch (error) {
      logger.error('[ModuleNotification] Failed to create notification:', error);
      throw error;
    }
  }

  /**
   * 通过 WebSocket 推送通知
   */
  private sendWebSocketNotification(
    event: AsyncTaskStatusChangedEvent,
    notification: any
  ): void {
    // 根据任务状态选择事件类型
    let eventType: NotificationEventType;
    switch (event.task_status) {
      case TaskStatus.COMPLETED:
        eventType = NotificationEventType.TASK_COMPLETED;
        break;
      case TaskStatus.FAILED:
        eventType = NotificationEventType.TASK_FAILED;
        break;
      default:
        eventType = NotificationEventType.TASK_UPDATED;
    }

    const snapshot = event.metadata?.task_snapshot;
    const taskPayload = snapshot
      ? {
          ...snapshot,
          module_type: event.module_type,
          task_type: snapshot.type ?? event.metadata?.task_type,
        }
      : {
          id: event.task_id,
          status: event.task_status,
          module_type: event.module_type,
          ...event.metadata,
        };

    websocketService.sendToUser(event.user_id, eventType, {
      notification,
      task: taskPayload,
    });
  }

  /**
   * 通过 SSE 推送通知（向后兼容）
   */
  private sendSSENotification(
    event: AsyncTaskStatusChangedEvent,
    notification: any
  ): void {
    // 根据任务状态发送 SSE 通知
    if (event.task_status === TaskStatus.COMPLETED) {
      sseService.sendTaskCompleted(event.user_id, {
        notification,
        task: {
          id: event.task_id,
          status: event.task_status,
          ...event.metadata,
        },
      });
    } else if (event.task_status === TaskStatus.FAILED) {
      sseService.sendTaskFailed(event.user_id, {
        notification,
        task: {
          id: event.task_id,
          status: event.task_status,
          ...event.metadata,
        },
      });
    }
  }
}

// 单例模式
export const moduleNotificationService = new ModuleNotificationService();

