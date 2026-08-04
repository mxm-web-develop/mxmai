import type { Request } from 'express';
import type { TaskProgress } from '../task/types';
import {
  type PlatformErrorCode,
  PLATFORM_ERROR_USER_MESSAGES,
  looksLikeLeakyErrorText,
} from './error-codes';
import { mapUpstreamError, userMessageFromStoredError } from './map-upstream-error';
import { isPlatformError, type PlatformError } from './platform-error';

export type ShapeErrorOptions = {
  isAdmin?: boolean;
  /** 覆盖 HTTP 状态（部分路由已定 status） */
  httpStatus?: number;
};

export type ShapedErrorBody = {
  success: false;
  code: PlatformErrorCode;
  error: string;
  retryable?: boolean;
  debugDetail?: string;
};

export function isAdminFromRequest(req: Pick<Request, 'headers'>): boolean {
  const role = req.headers['x-user-role'];
  const v = Array.isArray(role) ? role[0] : role;
  return String(v ?? '').toLowerCase() === 'admin';
}

/**
 * 将任意错误整形为出站 JSON（非 admin 不含 debugDetail）。
 */
export function shapeErrorForViewer(err: unknown, opts: ShapeErrorOptions = {}): {
  status: number;
  body: ShapedErrorBody;
} {
  const pe: PlatformError = isPlatformError(err) ? err : mapUpstreamError(err);
  const isAdmin = Boolean(opts.isAdmin);
  const body: ShapedErrorBody = {
    success: false,
    code: pe.code,
    error: pe.userMessage,
    retryable: pe.retryable || undefined,
  };
  if (isAdmin && pe.debugMessage && pe.debugMessage !== pe.userMessage) {
    body.debugDetail = pe.debugMessage;
  } else if (isAdmin && err instanceof Error && err.message && err.message !== pe.userMessage) {
    body.debugDetail = err.message;
  }
  return {
    status: opts.httpStatus ?? pe.httpStatus,
    body,
  };
}

export type SanitizedProgress = TaskProgress & {
  errorCode?: PlatformErrorCode;
  errorDebug?: string;
};

/**
 * 任务 progress 出站脱敏：DB 原文保留在调用方；本函数返回给客户端的副本。
 */
export function sanitizeProgressError(
  progress: TaskProgress | null | undefined,
  isAdmin: boolean
): TaskProgress | null | undefined {
  if (!progress) return progress;
  const rawError = typeof progress.error === 'string' ? progress.error : undefined;
  if (!rawError && !(progress as SanitizedProgress).errorCode) {
    return progress;
  }

  const existingCode = (progress as SanitizedProgress).errorCode;
  const { code, userMessage } = userMessageFromStoredError(rawError, existingCode);

  const next: SanitizedProgress = {
    ...progress,
    error: userMessage,
    errorCode: code,
  };

  if (isAdmin && rawError && (looksLikeLeakyErrorText(rawError) || rawError !== userMessage)) {
    next.errorDebug = rawError;
  } else {
    delete next.errorDebug;
  }

  return next;
}

/**
 * 通知等场景：目标用户非 admin 时，错误字段用人话。
 */
export function sanitizeErrorTextForUser(
  raw: string | null | undefined,
  isAdmin: boolean
): string {
  if (!raw) return '';
  if (isAdmin) return raw;
  const { userMessage } = userMessageFromStoredError(raw);
  return userMessage;
}

export function defaultUserMessage(code: PlatformErrorCode): string {
  return PLATFORM_ERROR_USER_MESSAGES[code];
}
