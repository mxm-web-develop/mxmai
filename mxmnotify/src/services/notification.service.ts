/**
 * 通知服务
 * 用于创建和发送通知
 */

import { getSupabaseClient } from '@mxmai/mxmdata';
import { logger } from '../utils/logger';
import { GenerationTask } from './task.service';
import { sseService } from './sse.service';

export interface Notification {
  id: string;
  user_id: string;
  task_id?: string;
  type: 'task_completed' | 'task_failed' | 'system';
  title: string;
  content?: string;
  data?: Record<string, any>;
  is_read: boolean;
  read_at?: Date | string;
  created_at: Date | string;
}

export interface CreateNotificationDto {
  user_id: string;
  task_id?: string;
  type: 'task_completed' | 'task_failed' | 'system';
  title: string;
  content?: string;
  data?: Record<string, any>;
}

export class NotificationService {
  private supabase = getSupabaseClient();

  /**
   * 创建通知
   */
  async createNotification(dto: CreateNotificationDto): Promise<Notification> {
    try {
      const { data, error } = await this.supabase
        .from('notifications')
        .insert({
          user_id: dto.user_id,
          task_id: dto.task_id,
          type: dto.type,
          title: dto.title,
          content: dto.content,
          data: dto.data || {},
          is_read: false,
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create notification: ${error.message}`);
      }

      logger.info(`Notification created: ${data.id} for user ${dto.user_id}`);
      return data as Notification;
    } catch (error) {
      logger.error('Failed to create notification:', error);
      throw error;
    }
  }

  /**
   * 发送任务完成通知
   */
  async sendTaskCompletedNotification(task: GenerationTask): Promise<Notification> {
    const taskTypeLabel = task.task_type === 'graph' ? '图片生成' : '文本生成';
    const title = `${taskTypeLabel}任务已完成`;
    
    let content = `您的${taskTypeLabel}任务已完成。`;
    if (task.result?.image_urls?.length) {
      content += ` 生成了 ${task.result.image_urls.length} 张图片。`;
    } else if (task.result?.text) {
      content += ` 生成了 ${task.result.text.length} 个字符的文本。`;
    }

    const notification = await this.createNotification({
      user_id: task.user_id,
      task_id: task.id,
      type: 'task_completed',
      title,
      content,
      data: {
        task_id: task.id,
        task_type: task.task_type,
        model_name: task.model_name,
        result: task.result,
      },
    });

    // 通过 SSE 主动推送通知
    sseService.sendTaskCompleted(task.user_id, {
      notification,
      task,
    });

    return notification;
  }

  /**
   * 发送任务失败通知
   */
  async sendTaskFailedNotification(task: GenerationTask): Promise<Notification> {
    const taskTypeLabel = task.task_type === 'graph' ? '图片生成' : '文本生成';
    const title = `${taskTypeLabel}任务失败`;

    const notification = await this.createNotification({
      user_id: task.user_id,
      task_id: task.id,
      type: 'task_failed',
      title,
      content: task.error_message || '任务执行失败，请重试。',
      data: {
        task_id: task.id,
        task_type: task.task_type,
        model_name: task.model_name,
        error_message: task.error_message,
      },
    });

    // 通过 SSE 主动推送通知
    sseService.sendTaskFailed(task.user_id, {
      notification,
      task,
    });

    return notification;
  }

  /**
   * 获取用户的通知列表
   */
  async getUserNotifications(
    userId: string,
    options?: {
      is_read?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ notifications: Notification[]; total: number }> {
    try {
      let query = this.supabase
        .from('notifications')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (options?.is_read !== undefined) {
        query = query.eq('is_read', options.is_read);
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
      }

      const { data, error, count } = await query;

      if (error) {
        throw new Error(`Failed to get notifications: ${error.message}`);
      }

      return {
        notifications: (data || []) as Notification[],
        total: count || 0,
      };
    } catch (error) {
      logger.error('Failed to get notifications:', error);
      throw error;
    }
  }

  /**
   * 标记通知为已读
   */
  async markAsRead(notificationId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('notifications')
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq('id', notificationId);

      if (error) {
        throw new Error(`Failed to mark notification as read: ${error.message}`);
      }
    } catch (error) {
      logger.error('Failed to mark notification as read:', error);
      throw error;
    }
  }

  /**
   * 标记所有通知为已读
   */
  async markAllAsRead(userId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('notifications')
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) {
        throw new Error(`Failed to mark all notifications as read: ${error.message}`);
      }
    } catch (error) {
      logger.error('Failed to mark all notifications as read:', error);
      throw error;
    }
  }
}
