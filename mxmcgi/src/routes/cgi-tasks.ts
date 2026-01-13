/**
 * CGI Task API 路由
 * 提供异步任务管理接口
 */

import { Router, Request, Response } from 'express';
import { taskExecutor } from '../core/task/task-executor';
import type { TaskType } from '../core/task/types';
import type { ProviderType } from '../core/providers/types';

const router = Router();

/**
 * 创建异步任务
 * POST /api/v1/cgi-tasks
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
      });
    }

    const {
      type, // 'text' | 'image' | 'video' | 'audio'
      model, // 模型名称
      provider, // 可选：'replicate' | 'ppio' | 'deer'
      params, // 生成参数
      storeToMinio = false, // 是否存储到 MinIO（默认 false，返回 base64）
      storageConfig, // MinIO 存储配置
    } = req.body;

    // 验证必需参数
    if (!type || !model || !params) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: type, model, params',
      });
    }

    // 验证任务类型
    const validTypes: TaskType[] = ['text', 'image', 'video', 'audio'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid task type: ${type}. Valid types: ${validTypes.join(', ')}`,
      });
    }

    // 创建任务
    const taskManager = taskExecutor.getTaskManager();
    const createResponse = await taskManager.createTask({
      type,
      model,
      provider: provider as ProviderType | undefined,
      params,
      userId,
      storeToMinio,
      storageConfig,
    });

    // 异步执行任务（不阻塞响应）
    taskExecutor.executeTask({
      taskId: createResponse.taskId,
      modelName: model,
      provider: provider as ProviderType | undefined,
      params,
      userId,
      storeToMinio,
      storageConfig,
    }).catch((error) => {
      console.error(`[CGI Task] 任务执行失败 (taskId: ${createResponse.taskId}):`, error);
    });

    return res.json({
      success: true,
      data: {
        taskId: createResponse.taskId,
        status: createResponse.status,
        createdAt: createResponse.createdAt,
      },
    });
  } catch (error) {
    console.error('[CGI Task Route] 创建任务失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 查询任务详情
 * GET /api/v1/cgi-tasks/:taskId
 * 支持通过可选查询参数 type 进一步限制任务类型：
 *   GET /api/v1/cgi-tasks/:taskId?type=image
 */
router.get('/:taskId', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const userId = req.headers['x-user-id'] as string | undefined;
    const { type } = req.query;

    // 检查用户是否为管理员（admin 可以查看已删除的任务）
    const isAdmin = await isAdminUser(req);

    const taskManager = taskExecutor.getTaskManager();
    // 如果是 admin，可以查看已删除的任务；普通用户只能查看未删除的任务
    const response = await taskManager.getTask(taskId, isAdmin);

    // 检查权限：只能查看自己的任务
    if (userId && response.task.metadata.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You can only view your own tasks',
      });
    }

    // 如果提供了 type 查询参数，则要求任务类型匹配
    if (type) {
      const expectedType = type as TaskType;
      if (response.task.type !== expectedType) {
        return res.status(404).json({
          success: false,
          error: `Task type mismatch: expected ${expectedType}, got ${response.task.type}`,
        });
      }
    }

    return res.json({
      success: true,
      data: response.task,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    console.error('[CGI Task Route] 查询任务失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 查询任务列表
 * GET /api/v1/cgi-tasks
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
      });
    }

    const {
      type,
      status,
      model,
      limit = 20,
      offset = 0,
    } = req.query;

    const taskManager = taskExecutor.getTaskManager();
    const response = await taskManager.listTasks({
      userId,
      type: type as TaskType | undefined,
      status: status as any,
      model: model as string | undefined,
      limit: Number(limit),
      offset: Number(offset),
    });

    return res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('[CGI Task Route] 查询任务列表失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 按用户 ID 查询任务列表（管理/运营用途）
 * GET /api/v1/cgi-tasks/by-user/:userId
 *
 * 支持查询参数：
 *   - type?: 'text' | 'image' | 'video' | 'audio'
 *   - status?: TaskStatus
 *   - model?: string
 *   - limit?: number
 *   - offset?: number
 */
router.get('/by-user/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const {
      type,
      status,
      model,
      limit = 20,
      offset = 0,
    } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing userId in path params',
      });
    }

    const taskManager = taskExecutor.getTaskManager();
    const response = await taskManager.listTasks({
      userId,
      type: type as TaskType | undefined,
      status: status as any,
      model: model as string | undefined,
      limit: Number(limit),
      offset: Number(offset),
    });

    return res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('[CGI Task Route] 按用户查询任务列表失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 取消任务
 * POST /api/v1/cgi-tasks/:taskId/cancel
 */
router.post('/:taskId/cancel', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const userId = req.headers['x-user-id'] as string | undefined;

    const taskManager = taskExecutor.getTaskManager();
    const taskResponse = await taskManager.getTask(taskId);

    // 检查权限
    if (userId && taskResponse.task.metadata.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You can only cancel your own tasks',
      });
    }

    // 检查任务状态
    if (['completed', 'failed', 'cancelled'].includes(taskResponse.task.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot cancel task in status: ${taskResponse.task.status}`,
      });
    }

    await taskManager.cancelTask(taskId);

    return res.json({
      success: true,
      message: 'Task cancelled successfully',
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    console.error('[CGI Task Route] 取消任务失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 恢复卡住的任务
 * POST /api/v1/cgi-tasks/:taskId/recover
 * GET /api/v1/cgi-tasks/:taskId/recover (兼容)
 */
const handleRecover = async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const userId = req.headers['x-user-id'] as string | undefined;

    const taskManager = taskExecutor.getTaskManager();
    const taskResponse = await taskManager.getTask(taskId);

    // 检查权限
    if (userId && taskResponse.task.metadata.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You can only recover your own tasks',
      });
    }

    // 检查任务状态
    if (taskResponse.task.status !== 'processing') {
      return res.status(400).json({
        success: false,
        error: `Cannot recover task in status: ${taskResponse.task.status}. Only processing tasks can be recovered.`,
      });
    }

    const { taskRecoveryService } = await import('../core/task/task-recovery');
    await taskRecoveryService.recoverTask(taskId);

    return res.json({
      success: true,
      message: 'Task recovered successfully',
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    console.error('[CGI Task Route] 恢复任务失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

// 同时支持 POST 和 GET（兼容性）
router.post('/:taskId/recover', handleRecover);
router.get('/:taskId/recover', handleRecover);

/**
 * 重试失败的任务
 * POST /api/v1/cgi-tasks/:taskId/retry
 * GET /api/v1/cgi-tasks/:taskId/retry (兼容)
 */
const handleRetry = async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const userId = req.headers['x-user-id'] as string | undefined;

    const taskManager = taskExecutor.getTaskManager();
    const taskResponse = await taskManager.getTask(taskId);

    // 检查权限
    if (userId && taskResponse.task.metadata.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You can only retry your own tasks',
      });
    }

    // 检查任务状态
    if (!['failed', 'processing'].includes(taskResponse.task.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot retry task in status: ${taskResponse.task.status}. Only failed or processing tasks can be retried.`,
      });
    }

    const { taskRecoveryService } = await import('../core/task/task-recovery');
    await taskRecoveryService.retryTaskById(taskId);

    return res.json({
      success: true,
      message: 'Task retry initiated successfully',
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }
    console.error('[CGI Task Route] 重试任务失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

// 同时支持 POST 和 GET（兼容性）
router.post('/:taskId/retry', handleRetry);
router.get('/:taskId/retry', handleRetry);

/**
 * 检查用户是否为管理员
 * @param req Express 请求对象
 * @returns 是否为管理员
 */
async function isAdminUser(req: Request): Promise<boolean> {
  try {
    // 方法1: 从请求头获取用户角色（如果 Gateway 传递了）
    const userRole = req.headers['x-user-role'] as string | undefined;
    if (userRole === 'admin') {
      return true;
    }

    // 方法2: 从请求头获取用户 ID，然后查询数据库
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return false;
    }

    // 尝试从数据库查询用户信息
    try {
      const { RepositoryFactory } = await import('@mxmai/mxmdata');
      const userRepo = RepositoryFactory.createUserRepository();
      const user = await userRepo.findById(userId);
      
      if (user && user.role === 'admin') {
        return true;
      }
    } catch (dbError) {
      // 如果数据库查询失败，记录日志但不影响流程
      console.warn('[CGI Task Route] 查询用户角色失败:', dbError);
    }

    return false;
  } catch (error) {
    console.warn('[CGI Task Route] 检查管理员权限失败:', error);
    return false;
  }
}

/**
 * 删除任务
 * DELETE /api/v1/cgi-tasks/:taskId
 * 
 * 行为：
 * - 普通用户：软删除（标记 deleted_at），任务数据保留在数据库中，但查询时不会返回
 * - Admin 用户：硬删除（真正从数据库删除）
 */
router.delete('/:taskId', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const userId = req.headers['x-user-id'] as string | undefined;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
      });
    }

    // 检查用户是否为管理员（admin 可以查看已删除的任务）
    const isAdmin = await isAdminUser(req);

    const taskManager = taskExecutor.getTaskManager();
    // 如果是 admin，可以查看已删除的任务；普通用户只能查看未删除的任务
    const taskResponse = await taskManager.getTask(taskId, isAdmin);

    // 如果任务不存在（普通用户查询已软删除的任务会返回 null）
    // 使用 410 Gone 表示任务已不存在（可能是已删除），区别于 404（接口错误）
    if (!taskResponse || !taskResponse.task) {
      return res.status(410).json({
        success: false,
        error: 'Task not found or already deleted',
        code: 'TASK_NOT_FOUND_OR_DELETED',
      });
    }

    // 检查权限：只能删除自己的任务
    if (taskResponse.task.metadata.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You can only delete your own tasks',
      });
    }

    if (isAdmin) {
      // Admin 用户：硬删除（真正从数据库删除）
      await taskManager.hardDeleteTask(taskId);
      return res.json({
        success: true,
        message: 'Task deleted permanently (admin)',
      });
    } else {
      // 普通用户：软删除（标记 deleted_at）
      await taskManager.softDeleteTask(taskId);
      return res.json({
        success: true,
        message: 'Task deleted successfully',
      });
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      // 使用 410 Gone 表示任务已不存在（可能是已删除），区别于 404（接口错误）
      return res.status(410).json({
        success: false,
        error: error.message,
        code: 'TASK_NOT_FOUND_OR_DELETED',
      });
    }
    console.error('[CGI Task Route] 删除任务失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
