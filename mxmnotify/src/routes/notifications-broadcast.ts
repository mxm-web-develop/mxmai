/**
 * 通知广播路由
 * 支持全局通知和批量用户通知
 */

import { Router, Request, Response } from 'express';
import { moduleNotificationService } from '../services/module-notification.service';
import { logger } from '../utils/logger';
import { NotificationEventType } from '../types/notification.types';

const router = Router();

/**
 * 发送全局通知（广播给所有在线用户）
 * POST /notifications/broadcast
 * 
 * Body:
 * {
 *   "event": "system_announcement",
 *   "title": "系统公告",
 *   "content": "这是一条系统公告",
 *   "action_url": "/announcements/123",
 *   "avatar_url": "https://...",
 *   "metadata": {},
 *   "exclude_user_ids": ["user-id-1", "user-id-2"] // 可选，排除的用户ID列表
 * }
 */
router.post('/broadcast', async (req: Request, res: Response) => {
  try {
    const { event, title, content, action_url, avatar_url, metadata, exclude_user_ids } = req.body;

    // 验证必需字段
    if (!event || !title || !content) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'event, title, and content are required',
        },
      });
    }

    // 发送全局通知
    await moduleNotificationService.sendGlobalNotification(
      event,
      {
        title,
        content,
        action_url,
        avatar_url,
        metadata: metadata || {},
      },
      exclude_user_ids
    );

    res.json({
      success: true,
      message: 'Global notification sent successfully',
    });
  } catch (error) {
    logger.error('[NotificationsBroadcast] Failed to send global notification:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SEND_NOTIFICATION_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

/**
 * 发送通知给多个指定用户
 * POST /notifications/broadcast/users
 * 
 * Body:
 * {
 *   "user_ids": ["user-id-1", "user-id-2", "user-id-3"],
 *   "event": "group_notification",
 *   "title": "群组通知",
 *   "content": "这是一条群组通知",
 *   "action_url": "/group/123",
 *   "avatar_url": "https://...",
 *   "metadata": {}
 * }
 */
router.post('/users', async (req: Request, res: Response) => {
  try {
    const { user_ids, event, title, content, action_url, avatar_url, metadata } = req.body;

    // 验证必需字段
    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'user_ids (array) is required',
        },
      });
    }

    if (!event || !title || !content) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'event, title, and content are required',
        },
      });
    }

    // 发送通知给多个用户
    await moduleNotificationService.sendNotificationToUsers(
      user_ids,
      event,
      {
        title,
        content,
        action_url,
        avatar_url,
        metadata: metadata || {},
      }
    );

    res.json({
      success: true,
      message: `Notification sent to ${user_ids.length} users`,
    });
  } catch (error) {
    logger.error('[NotificationsBroadcast] Failed to send notification to users:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SEND_NOTIFICATION_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

export default router;

