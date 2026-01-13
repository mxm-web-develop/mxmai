/**
 * WebSocket 路由
 * 用于实时推送通知
 */

import { Router, Request, Response } from 'express';
import { WebSocketServer } from 'ws';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { websocketService } from '../services/websocket.service';
import { logger } from '../utils/logger';

let wss: WebSocketServer | null = null;

/**
 * 从请求中获取 JWT Token
 * WebSocket 升级请求中，token 在 URL query 参数中
 */
function getTokenFromRequest(req: any): string | null {
  // WebSocket 升级请求，从 URL 中解析 token
  if (req.url) {
    try {
      // 解析 URL，提取 query 参数
      const url = new URL(req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      if (token) {
        return token;
      }
    } catch (error) {
      // URL 解析失败，尝试手动解析
      const match = req.url.match(/[?&]token=([^&]+)/);
      if (match && match[1]) {
        return decodeURIComponent(match[1]);
      }
    }
  }

  // 从 query 参数获取（如果 Express 已解析）
  if (req.query && req.query.token) {
    return req.query.token as string;
  }

  // 从 Authorization header 获取
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
}

/**
 * 验证 JWT Token 并获取用户 ID
 * 使用与 Gateway 相同的 JWT 验证方式
 */
function authenticateToken(token: string): string | null {
  try {
    const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    
    // 检查 ADMIN_TOKEN（用于测试）
    const adminToken = process.env.ADMIN_TOKEN;
    if (adminToken && token === adminToken) {
      return 'admin-test-user';
    }

    // 验证 JWT Token
    const decoded = jwt.verify(token, secret) as {
      userId: string;
      username: string;
      type: 'access' | 'refresh';
    };

    // 只接受 access token
    if (decoded.type !== 'access') {
      logger.warn(`[WebSocket] Invalid token type: expected 'access', got '${decoded.type}'`);
      return null;
    }

    return decoded.userId;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      logger.warn('[WebSocket] Token expired');
      return null;
    }
    if (error.name === 'JsonWebTokenError') {
      logger.warn(`[WebSocket] Invalid JWT token: ${error.message}`);
      return null;
    }
    logger.error('[WebSocket] Failed to authenticate token:', error);
    return null;
  }
}

/**
 * 设置 WebSocket 服务器
 */
export function setupWebSocketServer(server: Server): void {
  if (wss) {
    logger.warn('[WebSocket] WebSocket server already initialized');
    return;
  }

  wss = new WebSocketServer({
    server,
    path: '/ws/notifications',
  });

  wss.on('connection', (socket, req) => {
    logger.info('[WebSocket] New connection attempt');

    try {
      // 1. 获取 token
      const token = getTokenFromRequest(req as any);
      if (!token) {
        logger.warn('[WebSocket] No token provided, closing connection');
        socket.close(1008, 'Unauthorized: No token provided');
        return;
      }

      // 2. 验证 token 并获取 userId
      const userId = authenticateToken(token);
      if (!userId) {
        logger.warn('[WebSocket] Token validation failed, closing connection');
        socket.close(1008, 'Unauthorized: Invalid token');
        return;
      }

      // 3. 添加到连接管理
      websocketService.addClient(userId, socket);

      logger.info(`[WebSocket] Client authenticated and connected: user ${userId}`);
    } catch (error) {
      logger.error('[WebSocket] Connection error:', error);
      socket.close(1011, 'Internal server error');
    }
  });

  wss.on('error', (error) => {
    logger.error('[WebSocket] Server error:', error);
  });

  logger.info('[WebSocket] WebSocket server initialized on path /ws/notifications');
}

/**
 * 关闭 WebSocket 服务器
 */
export function closeWebSocketServer(): void {
  if (wss) {
    wss.close();
    wss = null;
    websocketService.cleanup();
    logger.info('[WebSocket] WebSocket server closed');
  }
}

/**
 * HTTP 路由（用于健康检查等）
 */
const router = Router();

router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      online: wss !== null,
      connections: websocketService.getTotalConnectionCount(),
      users: websocketService.getOnlineUserCount(),
    },
  });
});

export default router;

