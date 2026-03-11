/**
 * 认证中间件
 */

import { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader } from '../auth/jwt';

// 扩展 Request 类型以包含用户信息与原始 token（供登出时删除会话）
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        username: string;
      };
      token?: string;
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

    // 注入用户信息与原始 token 到请求对象（token 供登出时按会话删除）
    req.user = {
      userId: payload.userId,
      username: payload.username,
    };
    req.token = token;

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
 * Gateway 或 JWT 认证：优先信任 Gateway 转发的 x-user-id（API Key 或 JWT 已在 Gateway 校验）
 * 无 x-user-id 时走 JWT 校验（直连 mxmauth 场景）
 */
export function gatewayOrJwtAuth(req: Request, res: Response, next: NextFunction): void {
  const userId = req.headers['x-user-id'] as string | undefined;
  if (userId && userId.trim()) {
    req.user = {
      userId: userId.trim(),
      username: (req.headers['x-username'] as string) || userId.trim(),
    };
    return next();
  }
  return authMiddleware(req, res, next);
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

