/**
 * WebSocket 代理路由
 * 将 WebSocket 连接代理到 mxmnotify
 */

import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

// 从 MXMNOTIFY_URL 环境变量获取，如果没有则使用默认值
const MXMNOTIFY_URL = process.env.MXMNOTIFY_URL || 'http://localhost:4005';
// 转换为 WebSocket URL
const MXMNOTIFY_WS_URL = MXMNOTIFY_URL.replace('http://', 'ws://').replace('https://', 'wss://');

/**
 * 从请求中获取 JWT Token
 */
function getTokenFromRequest(url: string, headers: any): string | null {
  // 1. 从 URL query 参数获取
  try {
    const urlObj = new URL(url, 'http://localhost');
    const tokenFromQuery = urlObj.searchParams.get('token');
    if (tokenFromQuery) {
      return tokenFromQuery;
    }
  } catch (error) {
    // URL 解析失败，继续尝试其他方式
  }

  // 2. 从 Authorization header 获取（WebSocket 升级请求中可能包含）
  const authHeader = headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
}

/**
 * 验证 JWT Token 并获取用户信息
 * 使用与 authMiddleware 相同的验证逻辑
 */
function authenticateToken(token: string): { userId: string; username: string } | null {
  try {
    const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    
    // 检查 ADMIN_TOKEN（用于测试）
    const adminToken = process.env.ADMIN_TOKEN;
    if (adminToken && token === adminToken) {
      return {
        userId: 'admin-test-user',
        username: 'admin-test',
      };
    }

    // 验证 JWT Token
    const decoded = jwt.verify(token, secret) as {
      userId: string;
      username: string;
      type: 'access' | 'refresh';
    };

    // 只接受 access token
    if (decoded.type !== 'access') {
      logger.warn(`[WebSocketProxy] Invalid token type: expected 'access', got '${decoded.type}'`);
      return null;
    }

    return {
      userId: decoded.userId,
      username: decoded.username,
    };
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      logger.warn('[WebSocketProxy] Token expired');
      return null;
    }
    if (error.name === 'JsonWebTokenError') {
      logger.warn(`[WebSocketProxy] Invalid JWT token: ${error.message}`);
      return null;
    }
    logger.error('[WebSocketProxy] Failed to authenticate token:', error);
    return null;
  }
}

/**
 * 设置 WebSocket 代理
 */
export function setupWebSocketProxy(server: Server): void {
  const wss = new WebSocketServer({
    server,
    path: '/api/v1/ws/notifications',
  });

  wss.on('connection', async (socket: WebSocket, req: any) => {
    logger.info('[WebSocketProxy] New WebSocket connection attempt');

    try {
      // 1. 获取 token
      const url = req.url || '';
      const token = getTokenFromRequest(url, req.headers);
      
      if (!token) {
        logger.warn('[WebSocketProxy] No token provided, closing connection');
        socket.close(1008, 'Unauthorized: No token provided');
        return;
      }

      // 2. 验证 token
      const user = authenticateToken(token);
      if (!user) {
        logger.warn('[WebSocketProxy] Token validation failed, closing connection');
        socket.close(1008, 'Unauthorized: Invalid token');
        return;
      }

      logger.info(`[WebSocketProxy] Client authenticated: user ${user.userId}`);

      // 3. 建立到 mxmnotify 的 WebSocket 连接
      const notifyUrl = `${MXMNOTIFY_WS_URL}/ws/notifications?token=${token}`;
      
      logger.info(`[WebSocketProxy] Connecting to mxmnotify: ${notifyUrl.replace(/token=[^&]+/, 'token=***')}`);
      
      const notifySocket = new WebSocket(notifyUrl);

      // 先设置错误处理，避免连接失败时没有处理
      notifySocket.on('error', (error) => {
        logger.error(`[WebSocketProxy] mxmnotify socket error for user ${user.userId}:`, error);
        logger.error(`[WebSocketProxy] Error details:`, {
          message: error.message,
          code: (error as any).code,
          url: notifyUrl.replace(/token=[^&]+/, 'token=***'),
        });
        // 如果 mxmnotify 连接失败，关闭客户端连接
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close(1011, 'Failed to connect to notification service');
        }
      });

      // 连接成功
      notifySocket.on('open', () => {
        logger.info(`[WebSocketProxy] ✅ Connected to mxmnotify for user ${user.userId}`);
      });

      // 4. 双向转发消息
      socket.on('message', (data: Buffer) => {
        if (notifySocket.readyState === WebSocket.OPEN) {
          notifySocket.send(data);
        } else {
          logger.warn(`[WebSocketProxy] Cannot forward message: mxmnotify socket not open (state: ${notifySocket.readyState})`);
        }
      });

      notifySocket.on('message', (data: Buffer) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(data);
        } else {
          logger.warn(`[WebSocketProxy] Cannot forward message: client socket not open (state: ${socket.readyState})`);
        }
      });

      // 5. 处理连接关闭
      socket.on('close', (code, reason) => {
        logger.info(`[WebSocketProxy] Client disconnected: user ${user.userId}, code: ${code}, reason: ${reason.toString()}`);
        if (notifySocket.readyState === WebSocket.OPEN || notifySocket.readyState === WebSocket.CONNECTING) {
          notifySocket.close();
        }
      });

      notifySocket.on('close', (code, reason) => {
        logger.info(
          `[WebSocketProxy] mxmnotify connection closed for user ${user.userId}, code: ${code}, reason: ${reason.toString()}`
        );

        // 如果 mxmnotify 连接关闭，也关闭客户端连接
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          /**
           * 注意：
           * WebSocket 关闭码必须是 1000-4999 之间的合法值，且不能是保留码 1005、1006、1015。
           * mxmnotify 返回的关闭码可能是 1005（NO_STATUS_RECEIVED），这是一个保留码，
           * 不能被用作主动关闭连接时发送给对端的 code，否则 ws 会抛出 TypeError。
           *
           * 这里对关闭码做一次「安全转换」：
           * - 如果是非法或保留代码，则转换为 1000（正常关闭）
           * - reason 转换为字符串（如果是 Buffer）
           */
          const isValidCloseCode =
            typeof code === 'number' && code >= 1000 && code <= 4999 && code !== 1005 && code !== 1006 && code !== 1015;

          const safeCode = isValidCloseCode ? code : 1000;
          const safeReason =
            reason && typeof reason.toString === 'function' ? reason.toString() : 'Connection closed by upstream';

          try {
            socket.close(safeCode, safeReason);
          } catch (closeError) {
            logger.error(
              `[WebSocketProxy] Failed to close client socket safely for user ${user.userId}:`,
              closeError
            );
            // 如果仍然失败，强制终止连接
            try {
              socket.terminate?.();
            } catch {
              // ignore
            }
          }
        }
      });

      // 6. 处理客户端错误
      socket.on('error', (error) => {
        logger.error(`[WebSocketProxy] Client socket error for user ${user.userId}:`, error);
        if (notifySocket.readyState === WebSocket.OPEN || notifySocket.readyState === WebSocket.CONNECTING) {
          notifySocket.close();
        }
      });

    } catch (error) {
      logger.error('[WebSocketProxy] Connection error:', error);
      socket.close(1011, 'Internal server error');
    }
  });

  wss.on('error', (error) => {
    logger.error('[WebSocketProxy] WebSocket server error:', error);
  });

  logger.info('[WebSocketProxy] WebSocket proxy server initialized on path /api/v1/ws/notifications');
}

