/**
 * 任务管理路由
 */

import { Router, Request, Response } from 'express';
import { TaskService } from '../services/task.service';
import { logger } from '../utils/logger';

const router = Router();

// 延迟初始化 service，避免在模块加载时就初始化 Supabase 客户端
let taskServiceInstance: TaskService | null = null;

function getTaskService() {
  if (!taskServiceInstance) {
    taskServiceInstance = new TaskService();
  }
  return taskServiceInstance;
}

/**
 * 创建任务
 * POST /tasks
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const taskService = getTaskService();
    const { user_id, task_type, model_name, prompt, params } = req.body;

    if (!user_id || !task_type || !model_name || !prompt) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'user_id, task_type, model_name, and prompt are required',
        },
      });
    }

    const task = await taskService.createTask({
      user_id,
      task_type,
      model_name,
      prompt,
      params,
    });

    res.json({
      success: true,
      task,
    });
  } catch (error) {
    logger.error('Failed to create task:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_TASK_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

/**
 * 更新任务
 * PUT /tasks/:taskId
 */
router.put('/:taskId', async (req: Request, res: Response) => {
  try {
    const taskService = getTaskService();
    const { taskId } = req.params;
    const { status, result, error_message } = req.body;

    const task = await taskService.updateTask(taskId, {
      status,
      result,
      error_message,
    });

    res.json({
      success: true,
      task,
    });
  } catch (error) {
    logger.error('Failed to update task:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_TASK_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

/**
 * 获取任务详情
 * GET /tasks/:taskId
 */
router.get('/:taskId', async (req: Request, res: Response) => {
  try {
    const taskService = getTaskService();
    const { taskId } = req.params;
    const task = await taskService.getTaskById(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TASK_NOT_FOUND',
          message: 'Task not found',
        },
      });
    }

    res.json({
      success: true,
      task,
    });
  } catch (error) {
    logger.error('Failed to get task:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_TASK_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

/**
 * 获取用户的任务列表
 * GET /tasks/user/:userId
 */
router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const taskService = getTaskService();
    const { userId } = req.params;
    const { status, task_type, limit, offset } = req.query;

    const result = await taskService.getUserTasks(userId, {
      status: status as any,
      task_type: task_type as any,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error('Failed to get user tasks:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_USER_TASKS_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

export default router;
