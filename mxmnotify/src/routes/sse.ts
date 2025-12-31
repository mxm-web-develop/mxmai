/**
 * Server-Sent Events (SSE) 路由
 * 用于实时推送通知
 */

import { Router, Request, Response } from 'express';
import { sseService } from '../services/sse.service';
import { logger } from '../utils/logger';

const router = Router();

/**
 * SSE 连接端点
 * GET /sse/:userId
 * 
 * 客户端连接示例：
 * const eventSource = new EventSource('/api/v1/notifications/sse/user-id');
 * eventSource.addEventListener('task_completed', (e) => {
 *   const data = JSON.parse(e.data);
 *   console.log('Task completed:', data);
 * });
 */
router.get('/:userId', (req: Request, res: Response) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_USER_ID',
        message: 'User ID is required',
      },
    });
  }

  // 添加 SSE 客户端
  sseService.addClient(userId, res);

  // 处理客户端断开
  req.on('close', () => {
    sseService.removeClient(userId, res);
    logger.info(`SSE connection closed for user ${userId}`);
  });
});

export default router;
