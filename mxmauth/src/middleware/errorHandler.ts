/**
 * 错误处理中间件
 */

import { Request, Response, NextFunction } from 'express';
import {
  DataAccessError,
  NotFoundError,
  DuplicateError,
  ValidationError,
  ConnectionError,
  TransactionError,
} from '@mxmai/mxmdata';
import { ApiErrorResponse } from './response';

/**
 * 错误处理中间件
 */
export function errorHandler(
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  let statusCode = 500;
  let errorResponse: ApiErrorResponse;

  // 处理已知错误类型
  if (error instanceof NotFoundError) {
    statusCode = 404;
    errorResponse = {
      code: 404,
      message: error.message,
      error: 'NOT_FOUND',
    };
  } else if (error instanceof DuplicateError) {
    statusCode = 409;
    errorResponse = {
      code: 409,
      message: error.message,
      error: 'DUPLICATE',
    };
  } else if (error instanceof ValidationError) {
    statusCode = 400;
    errorResponse = {
      code: 400,
      message: error.message,
      error: 'VALIDATION_ERROR',
      details: error.field ? { field: error.field } : undefined,
    };
  } else if (error instanceof ConnectionError) {
    statusCode = 503;
    errorResponse = {
      code: 503,
      message: 'Database connection error',
      error: 'CONNECTION_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    };
  } else if (error instanceof TransactionError) {
    statusCode = 500;
    errorResponse = {
      code: 500,
      message: 'Transaction error',
      error: 'TRANSACTION_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    };
  } else if (error instanceof DataAccessError) {
    statusCode = 500;
    errorResponse = {
      code: 500,
      message: error.message,
      error: error.code,
      details: process.env.NODE_ENV === 'development' ? error.originalError?.message : undefined,
    };
  } else {
    // 未知错误
    statusCode = 500;
    errorResponse = {
      code: 500,
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
      error: 'INTERNAL_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    };
  }

  // 记录错误日志
  console.error('[Error]', {
    statusCode,
    error: errorResponse.error,
    message: errorResponse.message,
    stack: error instanceof Error ? error.stack : undefined,
  });

  res.status(statusCode).json(errorResponse);
}

/**
 * 404 处理中间件
 */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    code: 404,
    message: 'Route not found',
    error: 'NOT_FOUND',
  });
}

