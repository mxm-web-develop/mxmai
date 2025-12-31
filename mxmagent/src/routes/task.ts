/**
 * Task API 路由
 * 提供 Task（Smartflow 执行实例）的查询接口
 */

import { Router, Request, Response } from 'express';
import { createSmartflowService } from '../core/smartflow/service';

const router = Router();

// 延迟初始化 service，避免在模块加载时就初始化 RepositoryFactory
let serviceInstance: ReturnType<typeof createSmartflowService> | null = null;

function getService() {
  if (!serviceInstance) {
    serviceInstance = createSmartflowService();
  }
  return serviceInstance;
}

/**
 * GET /api/v1/tasks
 * 获取当前用户的所有 Task 列表（包括正在运行和已完成的）
 * Query params:
 *   - status: 状态过滤（可选，如：pending, running, completed, failed）
 *   - limit: 数量限制（可选，默认 50）
 *   - offset: 偏移量（可选，默认 0）
 * 
 * 注意：用户ID会从认证token中自动获取（通过x-user-id header）
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const service = getService();
    const { status, limit, offset } = req.query;

    // 从 Gateway 转发的 header 中获取用户 ID（Gateway 会从 token 中解析并转发）
    const userIdFromHeader = req.headers['x-user-id'] as string | undefined;
    
    // 如果没有用户ID，返回错误
    if (!userIdFromHeader) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required: missing user ID',
      });
    }

    // 获取用户的所有执行实例
    let executions = await service.getUserExecutions(
      userIdFromHeader,
      limit ? Number(limit) : undefined,
      offset ? Number(offset) : undefined
    );

    // 如果指定了状态过滤，进行过滤
    if (status) {
      executions = executions.filter(exec => exec.status === status);
    }

    return res.json({
      success: true,
      data: executions,
      count: executions.length,
    });
  } catch (error) {
    console.error('Error getting tasks:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/v1/tasks/:id
 * 获取单个 Task 详情
 * 
 * 注意：只能获取自己的任务
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const service = getService();
    const { id } = req.params;
    
    // 从 Gateway 转发的 header 中获取用户 ID（Gateway 会从 token 中解析并转发）
    const userIdFromHeader = req.headers['x-user-id'] as string | undefined;
    
    const execution = await service.getExecution(id);

    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
      });
    }

    // 检查权限：只能获取自己的任务
    if (userIdFromHeader && execution.user_id !== userIdFromHeader) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: you can only access your own tasks',
      });
    }

    return res.json({
      success: true,
      data: execution,
    });
  } catch (error) {
    console.error('Error getting task:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
