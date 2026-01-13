/**
 * 通知管理路由
 * 权限模型与其他业务模块统一：
 * - mxmauth 负责颁发 JWT
 * - gateway 负责校验 JWT，并通过 x-user-id/x-username 透传用户身份
 * - 本模块只依赖 x-user-id，不再自行验证 JWT
 */

import { Router, Request, Response } from 'express';
import { NotificationService } from '../services/notification.service';
import { TaskService } from '../services/task.service';
import { getSupabaseClient } from '@mxmai/mxmdata';
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
 * 从请求中获取用户 ID
 * 统一依赖 gateway 透传的 x-user-id，不再在本模块验证 JWT
 */
function getUserIdFromRequest(req: Request): string | null {
  const userId = req.headers['x-user-id'] as string;
  return userId || null;
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
 * 获取当前用户的通知列表
 * GET /notifications
 * 从 Token 或 x-user-id header 获取用户 ID
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const notificationService = getNotificationService();
    // 从 Token 或 header 获取用户 ID
    const userId = getUserIdFromRequest(req);
    
    if (!userId) {
      // 添加调试日志
      const token = getTokenFromRequest(req);
      logger.warn('[Notifications] Failed to get userId from request:', {
        hasToken: !!token,
        hasAuthHeader: !!req.headers.authorization || !!req.headers.Authorization,
        authHeader: req.headers.authorization || req.headers.Authorization,
        headers: Object.keys(req.headers),
      });
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or missing authentication token',
        },
      });
    }

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
 * 获取用户的通知列表（兼容旧接口）
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
 * 验证通知属于当前用户
 */
router.put('/:notificationId/read', async (req: Request, res: Response) => {
  try {
    const notificationService = getNotificationService();
    const { notificationId } = req.params;
    const userId = getUserIdFromRequest(req);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or missing authentication token',
        },
      });
    }

    // 验证通知属于该用户
    const supabase = getSupabaseClient();
    const { data: notification, error: fetchError } = await supabase
      .from('notifications')
      .select('user_id')
      .eq('id', notificationId)
      .single();

    if (fetchError || !notification) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOTIFICATION_NOT_FOUND',
          message: 'Notification not found',
        },
      });
    }

    if (notification.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Notification does not belong to user',
        },
      });
    }

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
 * PUT /notifications/read-all
 * 从 Token 或 x-user-id header 获取用户 ID
 */
router.put('/read-all', async (req: Request, res: Response) => {
  try {
    const notificationService = getNotificationService();
    const userId = getUserIdFromRequest(req);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or missing authentication token',
        },
      });
    }

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

/**
 * 标记所有通知为已读（兼容旧接口）
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

/**
 * 删除通知
 * DELETE /notifications/:notificationId
 * 验证通知属于当前用户
 */
router.delete('/:notificationId', async (req: Request, res: Response) => {
  try {
    const notificationService = getNotificationService();
    const { notificationId } = req.params;
    const userId = getUserIdFromRequest(req);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or missing authentication token',
        },
      });
    }

    await notificationService.deleteNotification(notificationId, userId);

    res.json({
      success: true,
    });
  } catch (error) {
    logger.error('Failed to delete notification:', error);
    
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: error.message,
        },
      });
    }
    
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOTIFICATION_NOT_FOUND',
          message: error.message,
        },
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_NOTIFICATION_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

/**
 * 批量删除通知
 * POST /notifications/delete-batch
 * Body: { notification_ids: string[] }
 * 验证所有通知属于当前用户
 */
router.post('/delete-batch', async (req: Request, res: Response) => {
  try {
    const notificationService = getNotificationService();
    const userId = getUserIdFromRequest(req);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or missing authentication token',
        },
      });
    }

    const { notification_ids } = req.body;

    if (!notification_ids || !Array.isArray(notification_ids) || notification_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'notification_ids array is required and must not be empty',
        },
      });
    }

    const deletedIds = await notificationService.deleteNotifications(notification_ids, userId);

    res.json({
      success: true,
      data: {
        deleted_count: deletedIds.length,
        deleted_ids: deletedIds,
      },
    });
  } catch (error) {
    logger.error('Failed to delete notifications:', error);
    
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: error.message,
        },
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_NOTIFICATIONS_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

export default router;
