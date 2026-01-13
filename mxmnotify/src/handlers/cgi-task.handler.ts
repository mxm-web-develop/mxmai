/**
 * CGI Task 通知处理器
 * 专门处理 mxmcgi 模块的任务通知
 */

import {
  NotificationHandler,
  AsyncTaskStatusChangedEvent,
  ModuleType,
  TaskStatus,
  NotificationType,
} from '../types/notification.types';
import { BaseNotificationHandler } from './base.handler';
import { logger } from '../utils/logger';

/**
 * CGI Task 通知处理器
 */
export class CgiTaskNotificationHandler extends BaseNotificationHandler {
  supports(module_type: ModuleType | string): boolean {
    return module_type === ModuleType.MXMCGI;
  }

  async handle(event: AsyncTaskStatusChangedEvent): Promise<void> {
    logger.info(`[CgiTaskHandler] Handling CGI task event: ${event.task_id}, status: ${event.task_status}`);
    
    // CGI 任务可以在这里添加特殊处理逻辑
    // 例如：更新缓存、触发其他业务逻辑等
  }

  generateNotification(event: AsyncTaskStatusChangedEvent): {
    notification_type: NotificationType;
    title: string;
    content: string;
    action_url?: string;
    avatar_url?: string;
  } {
    // 如果事件中提供了自定义配置，优先使用
    if (event.notification_config) {
      const config = event.notification_config;
      return {
        notification_type: config.notification_type || NotificationType.REMINDER,
        title: config.title || this.getCgiTaskTitle(event),
        content: config.content || this.getCgiTaskContent(event),
        action_url: config.action_url || this.getCgiTaskActionUrl(event),
        avatar_url: config.avatar_url,
      };
    }

    // 使用 CGI 任务专用模板
    return {
      notification_type: NotificationType.REMINDER,
      title: this.getCgiTaskTitle(event),
      content: this.getCgiTaskContent(event),
      action_url: this.getCgiTaskActionUrl(event),
    };
  }

  /**
   * 获取 CGI 任务标题
   */
  private getCgiTaskTitle(event: AsyncTaskStatusChangedEvent): string {
    const taskType = event.metadata?.task_type || event.metadata?.type || '任务';
    const taskTypeName = this.getTaskTypeName(taskType);
    
    switch (event.task_status) {
      case TaskStatus.COMPLETED:
        return `${taskTypeName}生成完成`;
      case TaskStatus.FAILED:
        return `${taskTypeName}生成失败`;
      case TaskStatus.CANCELLED:
        return `${taskTypeName}生成已取消`;
      case TaskStatus.PROCESSING:
        return `${taskTypeName}生成中`;
      default:
        return `${taskTypeName}任务状态更新`;
    }
  }

  /**
   * 获取 CGI 任务内容
   */
  private getCgiTaskContent(event: AsyncTaskStatusChangedEvent): string {
    const taskType = event.metadata?.task_type || event.metadata?.type || '任务';
    const taskTypeName = this.getTaskTypeName(taskType);
    
    if (event.task_status_message) {
      return event.task_status_message;
    }
    
    switch (event.task_status) {
      case TaskStatus.COMPLETED:
        // 尝试从 metadata 中获取结果信息
        const mediaCount = event.metadata?.media_count || event.metadata?.result?.mediaUrls?.length;
        if (mediaCount) {
          return `您的${taskTypeName}已生成完成，共生成 ${mediaCount} 个文件，点击查看。`;
        }
        return `您的${taskTypeName}已生成完成，点击查看。`;
        
      case TaskStatus.FAILED:
        const errorMsg = event.metadata?.error || event.metadata?.error_message;
        if (errorMsg) {
          return `您的${taskTypeName}生成失败：${errorMsg}。请重试。`;
        }
        return `您的${taskTypeName}生成失败，请重试。`;
        
      case TaskStatus.CANCELLED:
        return `您的${taskTypeName}生成已取消。`;
        
      case TaskStatus.PROCESSING:
        const progress = event.metadata?.progress;
        if (progress !== undefined) {
          return `您的${taskTypeName}正在生成中，进度：${progress}%`;
        }
        return `您的${taskTypeName}正在生成中，请稍候...`;
        
      default:
        return `您的${taskTypeName}状态已更新为：${event.task_status}。`;
    }
  }

  /**
   * 获取 CGI 任务跳转链接
   */
  private getCgiTaskActionUrl(event: AsyncTaskStatusChangedEvent): string {
    const taskType = event.metadata?.task_type || event.metadata?.type;
    
    // 根据任务类型生成不同的跳转链接
    switch (taskType) {
      case 'writing':
        return `/writing/${event.task_id}`;
      case 'image':
      case 'graph':
        return `/media/graph/${event.task_id}`;
      case 'video':
        return `/media/video/${event.task_id}`;
      case 'audio':
        return `/media/audio/${event.task_id}`;
      case 'text':
        return `/media/text/${event.task_id}`;
      default:
        return `/media/${taskType}/${event.task_id}`;
    }
  }

  /**
   * 获取任务类型名称
   */
  private getTaskTypeName(taskType: string): string {
    const typeNames: Record<string, string> = {
      writing: '写作',
      image: '图片',
      graph: '图片',
      video: '视频',
      audio: '音频',
      text: '文本',
    };
    
    return typeNames[taskType] || '内容';
  }
}

