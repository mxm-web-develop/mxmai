/**
 * 健康检查路由
 */

import { Router } from 'express';

const router = Router();

/**
 * GET /health
 * 健康检查
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'gateway',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /
 * 根路径
 */
router.get('/', (req, res) => {
  res.json({
    service: 'gateway',
    version: '1.0.0',
    message: 'API Gateway is running',
  });
});

export default router;
