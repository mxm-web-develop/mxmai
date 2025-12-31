/**
 * 通知管理路由
 */

import { Router, Request, Response } from 'express';
import { NotificationService } from '../services/notification.service';
import { TaskService } from '../services/task.service';
import { logger } from '../utils/logger';

const router = Router();

// 延迟初始化 service，避免在模块加载时就初始化 Supabase 客户端
let notificationServiceInstance: NotificationService | null = null;
let taskServiceInstance: TaskService | null = null;

function getNotificationService() {
  if (!notificationServiceInstance) {
    notificationServiceInstance = new NotificationService();
  }
  return notificationServiceInstance;
}

function getTaskService() {
  if (!taskServiceInstance) {
    taskServiceInstance = new TaskService();
  }
  return taskServiceInstance;
}

/**
 * 发送任务完成通知（内部接口）
 * POST /notifications/task-completed
 */
router.post('/task-completed', async (req: Request, res: Response) => {
  try {
    const notificationService = getNotificationService();
    const taskService = getTaskService();
    const { task_id } = req.body;

    if (!task_id) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'task_id is required',
        },
      });
    }

    const task = await taskService.getTaskById(task_id);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TASK_NOT_FOUND',
          message: 'Task not found',
        },
      });
    }

    const notification = await notificationService.sendTaskCompletedNotification(task);

    res.json({
      success: true,
      notification,
    });
  } catch (error) {
    logger.error('Failed to send task completed notification:', error);
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
 * 发送任务失败通知（内部接口）
 * POST /notifications/task-failed
 */
router.post('/task-failed', async (req: Request, res: Response) => {
  try {
    const notificationService = getNotificationService();
    const taskService = getTaskService();
    const { task_id } = req.body;

    if (!task_id) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'task_id is required',
        },
      });
    }

    const task = await taskService.getTaskById(task_id);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TASK_NOT_FOUND',
          message: 'Task not found',
        },
      });
    }

    const notification = await notificationService.sendTaskFailedNotification(task);

    res.json({
      success: true,
      notification,
    });
  } catch (error) {
    logger.error('Failed to send task failed notification:', error);
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
 * 获取用户的通知列表
 * GET /notifications/user/:userId
 */
router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const notificationService = getNotificationService();
    const { userId } = req.params;
    const { is_read, limit, offset } = req.query;

    const result = await notificationService.getUserNotifications(userId, {
      is_read: is_read === 'true' ? true : is_read === 'false' ? false : undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error('Failed to get notifications:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_NOTIFICATIONS_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

/**
 * 标记通知为已读
 * PUT /notifications/:notificationId/read
 */
router.put('/:notificationId/read', async (req: Request, res: Response) => {
  try {
    const notificationService = getNotificationService();
    const { notificationId } = req.params;
    await notificationService.markAsRead(notificationId);

    res.json({
      success: true,
    });
  } catch (error) {
    logger.error('Failed to mark notification as read:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'MARK_READ_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

/**
 * 标记所有通知为已读
 * PUT /notifications/user/:userId/read-all
 */
router.put('/user/:userId/read-all', async (req: Request, res: Response) => {
  try {
    const notificationService = getNotificationService();
    const { userId } = req.params;
    await notificationService.markAllAsRead(userId);

    res.json({
      success: true,
    });
  } catch (error) {
    logger.error('Failed to mark all notifications as read:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'MARK_ALL_READ_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

export default router;
