/**
 * 响应格式化中间件
 */

import { Request, Response, NextFunction } from 'express';

/**
 * 统一响应格式中间件
 */
export function responseMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 保存原始的 json 方法
  const originalJson = res.json.bind(res);

  // 重写 json 方法以统一响应格式
  res.json = function (data: any) {
    // 如果响应已经是统一格式，直接返回
    if (data && typeof data === 'object' && 'success' in data) {
      return originalJson(data);
    }

    // 否则包装成统一格式
    return originalJson({
      success: true,
      data,
    });
  };

  next();
}

