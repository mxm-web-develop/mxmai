/**
 * 任务事件路由
 * 接收来自各业务模块的任务状态变更事件
 */

import { Router, Request, Response } from 'express';
import { moduleNotificationService } from '../services/module-notification.service';
import { logger } from '../utils/logger';
import { AsyncTaskStatusChangedEvent, ModuleType } from '../types/notification.types';

const router = Router();

/**
 * 接收异步任务状态变更事件
 * POST /task-events/status-changed
 * 
 * 业务模块调用示例：
 * POST /api/v1/task-events/status-changed
 * {
 *   "module_type": "mxmcgi",
 *   "task_id": "task-123",
 *   "user_id": "user-456",
 *   "task_status": "completed",
 *   "task_status_message": "任务完成",
 *   "metadata": {
 *     "task_type": "image",
 *     "model_name": "seedream-4"
 *   }
 * }
 */
router.post('/status-changed', async (req: Request, res: Response) => {
  try {
    const event: AsyncTaskStatusChangedEvent = {
      event_type: 'async_task.status_changed',
      module_type: req.body.module_type as ModuleType,
      task_id: req.body.task_id,
      user_id: req.body.user_id,
      task_status: req.body.task_status,
      task_status_message: req.body.task_status_message,
      metadata: req.body.metadata || {},
      notification_config: req.body.notification_config,
    };

    // 验证必需字段
    if (!event.module_type || !event.task_id || !event.user_id || !event.task_status) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'module_type, task_id, user_id, and task_status are required',
        },
      });
    }

    // 处理事件
    await moduleNotificationService.handleTaskStatusChanged(event);

    res.json({
      success: true,
      message: 'Event processed successfully',
    });
  } catch (error) {
    logger.error('[TaskEvents] Failed to process status changed event:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PROCESS_EVENT_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

export default router;

