/**
 * 认证中间件
 */

import { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader } from '../auth/jwt';

// 扩展 Request 类型以包含用户信息
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        username: string;
      };
    }
  }
}

/**
 * JWT 认证中间件
 * 验证请求中的 Access Token 并注入用户信息
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      res.status(401).json({
        code: 401,
        message: 'Authentication required',
        error: 'UNAUTHORIZED',
      });
      return;
    }

    const payload = verifyToken(token);

    // 只接受 access token
    if (payload.type !== 'access') {
      res.status(401).json({
        code: 401,
        message: 'Invalid token type',
        error: 'UNAUTHORIZED',
      });
      return;
    }

    // 注入用户信息到请求对象
    req.user = {
      userId: payload.userId,
      username: payload.username,
    };

    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token verification failed';
    res.status(401).json({
      code: 401,
      message,
      error: 'UNAUTHORIZED',
    });
  }
}

/**
 * 可选的认证中间件
 * 如果提供了 Token 则验证，否则继续（不要求认证）
 */
export function optionalAuthMiddleware(req: Request, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (token) {
      const payload = verifyToken(token);
      if (payload.type === 'access') {
        req.user = {
          userId: payload.userId,
          username: payload.username,
        };
      }
    }
  } catch (error) {
    // 忽略错误，继续处理请求
  }

  next();
}

