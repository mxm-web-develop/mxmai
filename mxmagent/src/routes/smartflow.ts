/**
 * Smartflow API 路由
 * 提供 Smartflow 的 CRUD 和执行接口
 */

import { Router, Request, Response } from 'express';
import { createSmartflowService } from '../core/smartflow/service';
import type {
  CreateSmartflowDto,
  UpdateSmartflowDto,
} from '@mxmai/mxmdata';
import { NotFoundError } from '@mxmai/mxmdata';

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
 * GET /api/v1/smartflows
 * 获取 Smartflow 列表
 * Query params:
 *   - userId: 用户 ID（可选，获取用户的 Smartflow）
 *   - public: true/false（可选，获取公开的 Smartflow）
 *   - limit: 数量限制（可选，默认 50）
 *   - offset: 偏移量（可选，默认 0）
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const service = getService();
    const { userId, public: isPublic, limit, offset } = req.query;

    if (isPublic === 'true') {
      // 获取公开的 Smartflow
      const smartflows = await service.getPublicSmartflows(
        limit ? Number(limit) : undefined,
        offset ? Number(offset) : undefined
      );
      return res.json({
        success: true,
        data: smartflows,
        count: smartflows.length,
      });
    } else if (userId) {
      // 获取用户的 Smartflow
      const smartflows = await service.getUserSmartflows(
        userId as string,
        limit ? Number(limit) : undefined,
        offset ? Number(offset) : undefined
      );
      return res.json({
        success: true,
        data: smartflows,
        count: smartflows.length,
      });
    } else {
      // 默认返回所有 Smartflow
      const smartflows = await service.getAllSmartflows(
        limit ? Number(limit) : undefined,
        offset ? Number(offset) : undefined
      );
      return res.json({
        success: true,
        data: smartflows,
        count: smartflows.length,
      });
    }
  } catch (error) {
    console.error('Error getting smartflows:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/v1/smartflows/:id/status
 * 查询 Smartflow 执行状态（通过 task_id）
 * 这是一个便捷端点，用于查询执行状态
 */
router.get('/:id/status', async (req: Request, res: Response) => {
  try {
    const service = getService();
    const { id } = req.params; // id 是 task_id
    
    const execution = await service.getExecution(id);

    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
      });
    }

    return res.json({
      success: true,
      data: execution,
    });
  } catch (error) {
    console.error('Error getting task status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/v1/smartflows/:id/execute
 * 查询 Smartflow 执行状态（通过 task_id）
 * 支持通过 /execute 路径查询状态，更直观
 */
router.get('/:id/execute', async (req: Request, res: Response) => {
  try {
    const service = getService();
    const { id } = req.params; // id 是 task_id
    
    const execution = await service.getExecution(id);

    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
      });
    }

    return res.json({
      success: true,
      data: execution,
    });
  } catch (error) {
    console.error('Error getting task status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/v1/smartflows/:id
 * 获取单个 Smartflow
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const service = getService();
    const { id } = req.params;
    const smartflow = await service.getSmartflow(id);

    if (!smartflow) {
      return res.status(404).json({
        success: false,
        error: 'Smartflow not found',
      });
    }

    return res.json({
      success: true,
      data: smartflow,
    });
  } catch (error) {
    console.error('Error getting smartflow:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/v1/smartflows
 * 创建 Smartflow
 * Body: CreateSmartflowDto
 * 
 * 注意：author_id 会从认证 token 中自动获取（通过 x-user-id header），
 * 如果 body 中提供了 author_id，会验证是否与 token 中的用户 ID 一致
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const service = getService();
    const data = req.body as CreateSmartflowDto;

    // 验证必需字段
    if (!data.name || !data.schema) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, schema',
      });
    }

    // 从 Gateway 转发的 header 中获取用户 ID（Gateway 会从 token 中解析并转发）
    const userIdFromHeader = req.headers['x-user-id'] as string | undefined;
    
    // 如果 header 中有用户 ID，使用它（优先）
    if (userIdFromHeader) {
      // 如果 body 中也提供了 author_id，验证是否一致
      if (data.author_id && data.author_id !== userIdFromHeader) {
        return res.status(403).json({
          success: false,
          error: 'author_id in body does not match authenticated user',
        });
      }
      // 使用 header 中的用户 ID
      data.author_id = userIdFromHeader;
    } else if (!data.author_id) {
      // 如果没有 header 也没有 body 中的 author_id，返回错误
      return res.status(400).json({
        success: false,
        error: 'Missing author_id: either provide Authorization token or author_id in body',
      });
    }
    // 如果只有 body 中的 author_id（没有认证），允许继续（向后兼容，但不推荐）

    const smartflow = await service.createSmartflow(data);

    return res.status(201).json({
      success: true,
      data: smartflow,
    });
  } catch (error) {
    console.error('Error creating smartflow:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/v1/smartflows/:id
 * 更新 Smartflow
 * Body: UpdateSmartflowDto
 * 
 * 注意：只能更新自己创建的智能链
 * 用户ID会从认证token中自动获取（通过x-user-id header）
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const service = getService();
    const { id } = req.params;
    const data = req.body as UpdateSmartflowDto;

    // 从 Gateway 转发的 header 中获取用户 ID（Gateway 会从 token 中解析并转发）
    const userIdFromHeader = req.headers['x-user-id'] as string | undefined;
    
    // 如果没有用户ID，返回错误
    if (!userIdFromHeader) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required: missing user ID',
      });
    }

    // 先获取智能链，检查是否存在以及权限
    const existingSmartflow = await service.getSmartflow(id);
    
    if (!existingSmartflow) {
      return res.status(404).json({
        success: false,
        error: 'Smartflow not found',
      });
    }

    // 检查权限：只能更新自己创建的智能链
    if (existingSmartflow.author_id && existingSmartflow.author_id !== userIdFromHeader) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: you can only update your own smartflows',
      });
    }

    // 执行更新
    const smartflow = await service.updateSmartflow(id, data);

    return res.json({
      success: true,
      data: smartflow,
    });
  } catch (error) {
    console.error('Error updating smartflow:', error);
    
    // 处理 NotFoundError
    if (error instanceof NotFoundError) {
      return res.status(404).json({
        success: false,
        error: error.message || 'Smartflow not found',
      });
    }
    
    // 其他错误返回500
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/v1/smartflows/:id
 * 删除 Smartflow
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const service = getService();
    const { id } = req.params;
    await service.deleteSmartflow(id);

    return res.json({
      success: true,
      message: 'Smartflow deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting smartflow:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/v1/smartflows/:id/execute
 * 执行 Smartflow（异步）
 * 
 * 注意：userId 会从认证 token 中自动获取（通过 x-user-id header），
 * 如果 body 中提供了 userId，会验证是否与 token 中的用户 ID 一致
 */
router.post('/:id/execute', async (req: Request, res: Response) => {
  try {
    const service = getService();
    const { id } = req.params;
    const { userId: userIdFromBody, input, conversationId } = req.body;

    // 验证必需字段
    if (!input || !Array.isArray(input)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: input (array)',
      });
    }

    // 从 Gateway 转发的 header 中获取用户 ID（Gateway 会从 token 中解析并转发）
    const userIdFromHeader = req.headers['x-user-id'] as string | undefined;
    
    // 确定使用的 userId
    let userId: string;
    if (userIdFromHeader) {
      // 如果 header 中有用户 ID，使用它（优先）
      // 如果 body 中也提供了 userId，验证是否一致
      if (userIdFromBody && userIdFromBody !== userIdFromHeader) {
        return res.status(403).json({
          success: false,
          error: 'userId in body does not match authenticated user',
        });
      }
      userId = userIdFromHeader;
    } else if (userIdFromBody) {
      // 如果没有 header 但有 body 中的 userId，使用 body 中的（向后兼容）
      userId = userIdFromBody;
    } else {
      // 如果都没有，返回错误
      return res.status(400).json({
        success: false,
        error: 'Missing userId: either provide Authorization token or userId in body',
      });
    }

    // 从请求头中提取用户的 Authorization token
    // Gateway 会转发原始的 Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') 
      ? authHeader.substring(7) // 移除 'Bearer ' 前缀
      : authHeader || undefined;

    // 异步执行：立即返回 task_id，实际执行在后台进行
    const execution = await service.executeSmartflow(
      id,
      userId,
      input,
      conversationId,
      token
    );

    // 立即返回 task，不等待执行完成
    return res.status(202).json({
      success: true,
      data: {
        id: execution.id,
        smartflow_id: execution.smartflow_id,
        user_id: execution.user_id,
        status: execution.status,
        progress: execution.progress,
        created_at: execution.created_at,
        message: 'Task created successfully. Use the task ID to query execution status.',
        status_url: `/api/v1/smartflows/${execution.id}/status`, // 提供查询状态的 URL
      },
    });
  } catch (error) {
    console.error('Error executing smartflow:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/v1/smartflows/:id/stop
 * 停止执行 Smartflow Task
 * 参数：id 是 task_id（execution_id）
 */
router.post('/:id/stop', async (req: Request, res: Response) => {
  try {
    const service = getService();
    const { id } = req.params; // id 是 task_id（execution_id）

    // 从 Gateway 转发的 header 中获取用户 ID（Gateway 会从 token 中解析并转发）
    const userIdFromHeader = req.headers['x-user-id'] as string | undefined;
    
    // 如果没有用户ID，返回错误
    if (!userIdFromHeader) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required: missing user ID',
      });
    }

    // 先获取 task，检查是否存在以及权限
    const execution = await service.getExecution(id);
    
    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
      });
    }

    // 检查权限：只能停止自己的任务
    if (execution.user_id !== userIdFromHeader) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: you can only stop your own tasks',
      });
    }

    // 检查任务状态
    if (execution.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Task already completed',
      });
    }

    if (execution.status === 'failed') {
      return res.status(400).json({
        success: false,
        error: 'Task already failed',
      });
    }

    // 停止任务
    await service.stopExecution(id);

    return res.json({
      success: true,
      message: 'Task stopped successfully',
      data: {
        id: execution.id,
        status: 'failed',
      },
    });
  } catch (error) {
    console.error('Error stopping task:', error);
    
    // 处理特定错误
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }
      if (error.message.includes('already')) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }
    }
    
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
