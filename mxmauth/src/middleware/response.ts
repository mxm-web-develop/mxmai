/**
 * 统一响应中间件
 */

import { Request, Response, NextFunction } from 'express';

export interface ApiResponse<T = any> {
  code: number;
  message?: string;
  data?: T;
}

export interface ApiErrorResponse {
  code: number;
  message: string;
  error?: string;
  details?: any;
}

/**
 * 成功响应包装器
 */
export function successResponse<T>(data: T, message?: string): ApiResponse<T> {
  return {
    code: 200,
    message,
    data,
  };
}

/**
 * 分页响应包装器
 */
export function paginatedResponse<T>(
  list: T[],
  total: number,
  page: number,
  pageSize: number
): ApiResponse<{
  list: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}> {
  return {
    code: 200,
    data: {
      list,
      total,
      page,
      page_size: pageSize,
      total_pages: Math.ceil(total / pageSize),
    },
  };
}

/**
 * 响应中间件
 * 自动包装响应数据
 */
export function responseMiddleware(_req: Request, res: Response, next: NextFunction): void {
  // 如果响应已经发送，跳过
  if (res.headersSent) {
    return next();
  }

  // 保存原始的 json 方法
  const originalJson = res.json.bind(res);

  // 重写 json 方法
  res.json = function (body?: any): Response {
    // 如果 body 已经是 ApiResponse 格式，直接返回
    if (body && typeof body === 'object' && 'code' in body) {
      return originalJson(body);
    }

    // 否则包装为成功响应
    return originalJson(successResponse(body));
  };

  next();
}

