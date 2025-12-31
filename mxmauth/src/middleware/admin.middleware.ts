/**
 * 管理员权限中间件
 */

import { Request, Response, NextFunction } from 'express';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { authMiddleware } from './auth';
import { extractTokenFromHeader } from '../auth/jwt';

const userRepo = RepositoryFactory.createUserRepository();

/**
 * 管理员权限中间件
 * 支持两种方式验证管理员权限：
 * 1. 使用环境变量 ADMIN_TOKEN（用于测试，生产环境应移除）
 * 2. 检查用户角色是否为 admin
 * 
 * 使用方式：
 * router.get('/admin/users', adminMiddleware, handler);
 * 
 * 注意：adminMiddleware 内部会调用 authMiddleware，所以不需要单独添加 authMiddleware
 */
export function adminMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 先检查是否是测试用的 ADMIN_TOKEN
  const authHeader = req.headers.authorization;
  const token = extractTokenFromHeader(authHeader);
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

  // 否则，执行正常的认证和角色检查
  authMiddleware(req, res, () => {
    // 在认证成功后检查管理员权限
    (async () => {
      try {
        if (!req.user?.userId) {
          return res.status(401).json({
            code: 401,
            message: 'Authentication required',
            error: 'UNAUTHORIZED',
          });
        }

        // 查询用户信息
        const user = await userRepo.findById(req.user.userId);
        if (!user) {
          return res.status(404).json({
            code: 404,
            message: 'User not found',
            error: 'NOT_FOUND',
          });
        }

        // 检查用户角色
        if (user.role !== 'admin') {
          return res.status(403).json({
            code: 403,
            message: 'Admin access required',
            error: 'FORBIDDEN',
          });
        }

        // 继续处理请求
        next();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Admin check failed';
        res.status(500).json({
          code: 500,
          message,
          error: 'INTERNAL_ERROR',
        });
      }
    })();
  });
}

