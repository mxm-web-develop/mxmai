/**
 * Smartflow Task API 路由
 */

import { Router, Request, Response } from 'express';
import { executionRepository } from '../core/engine/executionRepository';
import {
  requestCancelExecution,
  requestPauseExecution,
  unregisterRunningExecution,
} from '../core/engine/execution-control';
import type { SmartflowExecutionStatus } from '../core/models/types';

const router = Router();

const ACTIVE_STATUSES: SmartflowExecutionStatus[] = ['pending', 'running'];

function isActiveStatus(status: string): boolean {
  return ACTIVE_STATUSES.includes(status as SmartflowExecutionStatus);
}

async function loadOwnedExecution(id: string, userId: string) {
  const execution = await executionRepository.findById(id);
  if (!execution) {
    return { error: 'NOT_FOUND' as const, execution: null };
  }
  if (execution.user_id !== userId) {
    return { error: 'FORBIDDEN' as const, execution: null };
  }
  return { error: null, execution };
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'x-user-id header is required' },
      });
    }

    const { smartflowId, limit = '50', offset = '0' } = req.query;

    let executions;
    if (smartflowId) {
      executions = await executionRepository.findBySmartflowId(
        smartflowId as string,
        Number(limit),
        Number(offset),
      );
      executions = executions.filter((e) => e.user_id === userId);
    } else {
      executions = await executionRepository.findByUserId(userId, Number(limit), Number(offset));
    }

    res.json({
      success: true,
      data: executions,
      count: executions.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'x-user-id header is required' },
      });
    }

    const { error, execution } = await loadOwnedExecution(req.params.id, userId);
    if (error === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Task not found: ${req.params.id}` },
      });
    }
    if (error === 'FORBIDDEN') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: '无权访问该执行记录' },
      });
    }

    res.json({
      success: true,
      data: execution,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

router.post('/:id/pause', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'x-user-id header is required' },
      });
    }

    const { error, execution } = await loadOwnedExecution(req.params.id, userId);
    if (error === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Task not found: ${req.params.id}` },
      });
    }
    if (error === 'FORBIDDEN') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: '无权操作该执行记录' },
      });
    }

    if (!isActiveStatus(execution!.status)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_STATE', message: `当前状态 ${execution!.status} 不可暂停` },
      });
    }

    requestPauseExecution(req.params.id);
    await executionRepository.updateStatus(req.params.id, 'paused');
    await executionRepository.updateError(req.params.id, '执行已暂停');

    const updated = await executionRepository.findById(req.params.id);
    res.json({
      success: true,
      data: updated,
      message: 'Task paused successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'x-user-id header is required' },
      });
    }

    const { error, execution } = await loadOwnedExecution(req.params.id, userId);
    if (error === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Task not found: ${req.params.id}` },
      });
    }
    if (error === 'FORBIDDEN') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: '无权操作该执行记录' },
      });
    }

    if (!isActiveStatus(execution!.status) && execution!.status !== 'paused') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_STATE', message: `当前状态 ${execution!.status} 不可取消` },
      });
    }

    requestCancelExecution(req.params.id);
    await executionRepository.updateStatus(req.params.id, 'cancelled');
    await executionRepository.updateError(req.params.id, '执行已取消');

    const updated = await executionRepository.findById(req.params.id);
    res.json({
      success: true,
      data: updated,
      message: 'Task cancelled successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'x-user-id header is required' },
      });
    }

    const { error, execution } = await loadOwnedExecution(req.params.id, userId);
    if (error === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Task not found: ${req.params.id}` },
      });
    }
    if (error === 'FORBIDDEN') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: '无权删除该执行记录' },
      });
    }

    if (isActiveStatus(execution!.status)) {
      requestCancelExecution(req.params.id);
      try {
        await executionRepository.updateStatus(req.params.id, 'cancelled');
      } catch {
        // 可能已被引擎更新，忽略
      }
    }

    unregisterRunningExecution(req.params.id);
    await executionRepository.delete(req.params.id);

    res.json({
      success: true,
      message: 'Task deleted successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

export default router;
