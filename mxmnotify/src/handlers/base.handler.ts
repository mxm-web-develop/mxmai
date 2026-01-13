/**
 * 基础通知处理器
 * 提供默认的通知生成逻辑
 */

import {
  NotificationHandler,
  AsyncTaskStatusChangedEvent,
  ModuleType,
  TaskStatus,
  NotificationType,
} from '../types/notification.types';
import { logger } from '../utils/logger';

/**
 * 默认通知处理器
 * 提供通用的通知生成逻辑
 */
export class BaseNotificationHandler implements NotificationHandler {
  supports(module_type: ModuleType | string): boolean {
    // 基础处理器支持所有模块（作为兜底）
    return true;
  }

  async handle(event: AsyncTaskStatusChangedEvent): Promise<void> {
    // 基础处理器只生成通知，不做额外处理
    logger.debug(`[BaseHandler] Handling event for module ${event.module_type}, task ${event.task_id}`);
  }

  generateNotification(event: AsyncTaskStatusChangedEvent): {
    notification_type: NotificationType;
    title: string;
    content: string;
    action_url?: string;
    avatar_url?: string;
  } {
    // 如果事件中提供了自定义配置，使用自定义配置
    if (event.notification_config) {
      const config = event.notification_config;
      return {
        notification_type: config.notification_type || NotificationType.SYSTEM,
        title: config.title || this.getDefaultTitle(event),
        content: config.content || this.getDefaultContent(event),
        action_url: config.action_url,
        avatar_url: config.avatar_url,
      };
    }

    // 否则使用默认模板
    return {
      notification_type: NotificationType.SYSTEM,
      title: this.getDefaultTitle(event),
      content: this.getDefaultContent(event),
      action_url: this.getDefaultActionUrl(event),
    };
  }

  /**
   * 获取默认标题
   */
  protected getDefaultTitle(event: AsyncTaskStatusChangedEvent): string {
    const moduleName = this.getModuleName(event.module_type);
    
    switch (event.task_status) {
      case TaskStatus.COMPLETED:
        return `${moduleName}任务已完成`;
      case TaskStatus.FAILED:
        return `${moduleName}任务失败`;
      case TaskStatus.CANCELLED:
        return `${moduleName}任务已取消`;
      default:
        return `${moduleName}任务状态更新`;
    }
  }

  /**
   * 获取默认内容
   */
  protected getDefaultContent(event: AsyncTaskStatusChangedEvent): string {
    const moduleName = this.getModuleName(event.module_type);
    
    if (event.task_status_message) {
      return event.task_status_message;
    }
    
    switch (event.task_status) {
      case TaskStatus.COMPLETED:
        return `您的${moduleName}任务已完成，点击查看详情。`;
      case TaskStatus.FAILED:
        return `您的${moduleName}任务执行失败，请重试。`;
      case TaskStatus.CANCELLED:
        return `您的${moduleName}任务已取消。`;
      default:
        return `您的${moduleName}任务状态已更新为：${event.task_status}。`;
    }
  }

  /**
   * 获取默认跳转链接
   */
  protected getDefaultActionUrl(event: AsyncTaskStatusChangedEvent): string {
    // 根据模块类型和任务类型生成默认链接
    const moduleType = event.module_type;
    const taskType = event.metadata?.task_type || event.metadata?.type;
    
    if (moduleType === ModuleType.MXMCGI) {
      if (taskType === 'writing') {
        return `/writing/${event.task_id}`;
      }
      return `/media/${taskType}/${event.task_id}`;
    }
    
    return `/tasks/${event.task_id}`;
  }

  /**
   * 获取模块名称
   */
  protected getModuleName(module_type: ModuleType | string): string {
    const moduleNames: Record<string, string> = {
      [ModuleType.MXMCGI]: '内容生成',
      [ModuleType.MXMPAY]: '支付',
      [ModuleType.MXMAUTH]: '认证',
      [ModuleType.MXMAGENT]: '智能体',
    };
    
    return moduleNames[module_type] || '任务';
  }
}

