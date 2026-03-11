/**
 * JWT 认证中间件
 * 支持：JWT、API Key（Bearer 中为 API Key 时按 hash 查表）、ADMIN_TOKEN
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { logger } from '../utils/logger';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    username: string;
    type: 'access' | 'refresh';
    role?: 'user' | 'admin';
  };
}

/**
 * JWT 认证中间件
 * 支持两种认证方式：
 * 1. ADMIN_TOKEN（用于测试，生产环境应移除）
 * 2. JWT Token（正常用户认证）
 */
export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    // 增强日志：记录收到的 authorization header（隐藏敏感信息）
    if (!authHeader) {
      logger.warn(`[Auth] Missing authorization header for ${req.method} ${req.path}`);
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid authorization header',
        },
      });
      return;
    }

    // 检查格式：必须是 "Bearer <token>"
    if (!authHeader.startsWith('Bearer ')) {
      // 检查是否是拼写错误
      const lowerHeader = authHeader.toLowerCase();
      if (lowerHeader.startsWith('bearer') || lowerHeader.startsWith('beaerer')) {
        logger.warn(`[Auth] Authorization header format error: expected "Bearer <token>", got "${authHeader.substring(0, 20)}..."`);
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid authorization header format. Expected: "Bearer <token>"',
            hint: 'Make sure there is a space after "Bearer" and the spelling is correct.',
          },
        });
        return;
      }
      
      logger.warn(`[Auth] Invalid authorization header format for ${req.method} ${req.path}: "${authHeader.substring(0, 20)}..."`);
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid authorization header',
        },
      });
      return;
    }

    const token = authHeader.substring(7); // 移除 'Bearer ' 前缀
    
    if (!token || token.trim().length === 0) {
      logger.warn(`[Auth] Empty token provided for ${req.method} ${req.path}`);
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Token is empty',
        },
      });
      return;
    }

    const adminToken = process.env.ADMIN_TOKEN;

    // 如果提供了 ADMIN_TOKEN 且匹配，直接通过（用于测试）
    if (adminToken && token === adminToken) {
      logger.debug(`[Auth] Admin token authenticated for ${req.method} ${req.path}`);
      // 设置一个虚拟的 admin 用户信息（用于测试），role 供下游免查库
      req.user = {
        userId: 'admin-test-user',
        username: 'admin-test',
        type: 'access',
        role: 'admin',
      };
      return next();
    }

    // 否则，执行正常的 JWT 验证
    const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

    // 增强日志：记录 JWT_SECRET 配置状态（不记录实际值）
    if (!process.env.JWT_SECRET) {
      logger.warn(`[Auth] JWT_SECRET not set in environment, using default value`);
      logger.warn(`[Auth] ⚠️  警告: 使用默认 JWT_SECRET 可能导致认证失败`);
      logger.warn(`[Auth] 💡 提示: 请确保 gateway 和 mxmauth 使用相同的 JWT_SECRET`);
      logger.warn(`[Auth] 💡 建议: 在 mxmdata/.env 中配置 JWT_SECRET`);
    } else {
      logger.debug(`[Auth] JWT_SECRET is configured (length: ${process.env.JWT_SECRET.length})`);
      logger.debug(`[Auth] JWT_SECRET 前10个字符: ${process.env.JWT_SECRET.substring(0, 10)}...`);
    }

    try {
      // clockTolerance：允许签发端与校验端时钟偏差（秒），避免“刚登录就报过期”
      const clockTolerance = Number(process.env.JWT_CLOCK_TOLERANCE_SECONDS) || 120;
      const decoded = jwt.verify(token, secret, { clockTolerance }) as {
        userId: string;
        username: string;
        type: 'access' | 'refresh';
        role?: 'user' | 'admin';
      };

      // 只接受 access token
      if (decoded.type !== 'access') {
        logger.warn(`[Auth] Invalid token type: expected 'access', got '${decoded.type}'`);
        res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN_TYPE',
            message: 'Access token required',
          },
        });
        return;
      }

      // 将用户信息附加到请求对象（含 role，供 /system/admin 等下游免查库校验）
      req.user = {
        userId: decoded.userId,
        username: decoded.username,
        type: decoded.type,
        role: decoded.role,
      };

      logger.debug(`[Auth] JWT token authenticated for user ${decoded.username} (${req.method} ${req.path})`);
      next();
    } catch (error: any) {
      // JWT 校验失败时，尝试作为用户 API Key 校验（懒加载 mxmdata，避免启动时依赖导致 Gateway 起不来）
      try {
        const { RepositoryFactory } = require('@mxmai/mxmdata');
        const keyHash = createHash('sha256').update(token).digest('hex');
        const userApiKeyRepo = RepositoryFactory.createUserApiKeyRepository();
        const keyRecord = await userApiKeyRepo.findByKeyHash(keyHash);
        if (keyRecord) {
          const expiresAt = keyRecord.expires_at ? new Date(keyRecord.expires_at).getTime() : null;
          if (expiresAt != null && Date.now() > expiresAt) {
            res.status(401).json({
              success: false,
              error: { code: 'API_KEY_EXPIRED', message: 'API key has expired' },
            });
            return;
          }
          const userRepo = RepositoryFactory.createUserRepository();
          const user = await userRepo.findById(keyRecord.user_id);
          if (!user) {
            res.status(401).json({
              success: false,
              error: { code: 'USER_NOT_FOUND', message: 'User not found' },
            });
            return;
          }
          req.user = {
            userId: user.id,
            username: user.username ?? user.id,
            type: 'access',
            role: user.role === 'admin' ? 'admin' : 'user',
          };
          await userApiKeyRepo.updateLastUsedAt(keyRecord.id).catch(() => {});
          logger.debug(`[Auth] API Key authenticated for user ${req.user.username} (${req.method} ${req.path})`);
          return next();
        }
      } catch (apiKeyErr) {
        logger.debug(`[Auth] API Key lookup failed:`, apiKeyErr instanceof Error ? apiKeyErr.message : apiKeyErr);
      }

      if (error.name === 'TokenExpiredError') {
        logger.warn(`[Auth] Token expired for ${req.method} ${req.path}`);
        res.status(401).json({
          success: false,
          error: {
            code: 'TOKEN_EXPIRED',
            message: 'Token has expired',
          },
        });
        return;
      }

      if (error.name === 'JsonWebTokenError') {
        logger.warn(`[Auth] Invalid JWT token for ${req.method} ${req.path}: ${error.message}`);
        logger.warn(`[Auth] Token verification failed. Possible causes:`);
        logger.warn(`[Auth] 1. JWT_SECRET mismatch between gateway and mxmauth`);
        logger.warn(`[Auth] 2. Token was signed with a different secret`);
        logger.warn(`[Auth] 3. Token format is invalid`);
        logger.warn(`[Auth] Current JWT_SECRET configured: ${process.env.JWT_SECRET ? 'YES (length: ' + process.env.JWT_SECRET.length + ')' : 'NO (using default)'}`);
        res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid token',
            details: error.message,
            hint: error.message === 'invalid signature'
              ? 'JWT_SECRET mismatch. Please ensure gateway and mxmauth use the same JWT_SECRET.'
              : error.message,
          },
        });
        return;
      }

      logger.error(`[Auth] Unexpected error during token verification:`, error);
      throw error;
    }
  } catch (error) {
    logger.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication error',
      },
    });
  }
}

