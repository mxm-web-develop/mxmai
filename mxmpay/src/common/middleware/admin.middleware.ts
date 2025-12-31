/**
 * 管理员权限中间件
 * 检查用户是否为管理员
 */

import { Request, Response, NextFunction } from 'express';
import { RepositoryFactory } from '@mxmai/mxmdata';

export interface AdminRequest extends Request {
  user?: {
    userId: string;
    username?: string;
  };
}

/**
 * 管理员权限中间件
 * 支持两种方式验证管理员权限：
 * 1. 使用环境变量 ADMIN_TOKEN（用于测试，生产环境应移除）
 * 2. 检查用户角色是否为 admin
 * 
 * 使用方式：
 * router.get('/admin/orders', adminMiddleware, handler);
 * 
 * 注意：此中间件需要 Gateway 传递 x-user-id header
 */
export function adminMiddleware(req: AdminRequest, res: Response, next: NextFunction): void {
  (async () => {
    try {
      // 检查是否是测试用的 ADMIN_TOKEN
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
      const adminToken = process.env.ADMIN_TOKEN;

      // 如果提供了 ADMIN_TOKEN 且匹配，直接通过（用于测试）
      if (adminToken && token === adminToken) {
        // 设置一个虚拟的 admin 用户信息（用于测试）
        req.user = {
          userId: 'admin-test-user',
          username: 'admin-test',
        };
        return next();
      }

      // 从 header 获取 userId（Gateway 会传递）
      const userId = req.headers['x-user-id'] as string;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'User ID is required',
          },
        });
      }

      // 如果 userId 是 Gateway 设置的测试用户 ID，直接通过（用于测试）
      // 这样可以避免在 mxmpay 中也需要设置 ADMIN_TOKEN
      if (userId === 'admin-test-user') {
        req.user = {
          userId: 'admin-test-user',
          username: 'admin-test',
        };
        return next();
      }

      // 延迟初始化 userRepo（避免模块加载时环境变量未加载）
      const userRepo = RepositoryFactory.createUserRepository();
      
      // 查询用户信息
      const user = await userRepo.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'User not found',
          },
        });
      }

      // 检查用户角色
      if (user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required',
          },
        });
      }

      // 设置用户信息到请求对象
      req.user = {
        userId: user.id,
        username: user.username,
      };

      // 继续处理请求
      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Admin check failed';
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message,
        },
      });
    }
  })();
}

