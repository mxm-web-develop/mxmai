/**
 * Smartflow Task API 路由
 */

import { Router, Request, Response } from 'express';
import { executionRepository } from '../core/engine/executionRepository';

const router = Router();

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
      executions = await executionRepository.findBySmartflowId(smartflowId as string, Number(limit), Number(offset));
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
    const execution = await executionRepository.findById(req.params.id);
    
    if (!execution) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Task not found: ${req.params.id}` },
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

router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    await executionRepository.updateStatus(req.params.id, 'cancelled');

    res.json({
      success: true,
      message: 'Task cancelled successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

export default router;
