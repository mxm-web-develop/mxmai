import {
  type PlatformErrorCode,
  PLATFORM_ERROR_USER_MESSAGES,
  RETRYABLE_ERROR_CODES,
  userMessageForCode,
} from './error-codes';

export type PlatformErrorOptions = {
  code: PlatformErrorCode;
  /** 用户安全文案；缺省用码表默认 */
  userMessage?: string;
  /** 运维/admin 可见的完整细节 */
  debugMessage?: string;
  httpStatus?: number;
  retryable?: boolean;
  cause?: unknown;
};

/**
 * 平台结构化错误：对外用 userMessage，对内用 debugMessage。
 */
export class PlatformError extends Error {
  readonly code: PlatformErrorCode;
  readonly userMessage: string;
  readonly debugMessage: string;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(opts: PlatformErrorOptions) {
    const userMessage = userMessageForCode(opts.code, opts.userMessage);
    const debugMessage =
      (typeof opts.debugMessage === 'string' && opts.debugMessage.trim()) ||
      (opts.cause instanceof Error ? opts.cause.message : '') ||
      userMessage;
    super(debugMessage);
    this.name = 'PlatformError';
    this.code = opts.code;
    this.userMessage = userMessage;
    this.debugMessage = debugMessage;
    this.httpStatus = opts.httpStatus ?? defaultHttpStatus(opts.code);
    this.retryable = opts.retryable ?? RETRYABLE_ERROR_CODES.has(opts.code);
    this.cause = opts.cause;
  }

  static fromCode(
    code: PlatformErrorCode,
    debugMessage?: string,
    extras?: Partial<Omit<PlatformErrorOptions, 'code' | 'debugMessage'>>
  ): PlatformError {
    return new PlatformError({
      code,
      debugMessage,
      userMessage: PLATFORM_ERROR_USER_MESSAGES[code],
      ...extras,
    });
  }
}

function defaultHttpStatus(code: PlatformErrorCode): number {
  switch (code) {
    case 'TASK_VALIDATION_ERROR':
      return 400;
    case 'INSUFFICIENT_BALANCE':
      return 402;
    case 'UPSTREAM_CONTENT_POLICY':
      return 422;
    case 'UPSTREAM_RATE_LIMIT':
      return 429;
    case 'TASK_CONFIG_ERROR':
      return 404;
    case 'BILLING_MISCONFIGURED':
    case 'UPSTREAM_UNAVAILABLE':
    case 'UPSTREAM_OVERLOADED':
      return 503;
    case 'NETWORK_ERROR':
      return 502;
    default:
      return 500;
  }
}

export function isPlatformError(err: unknown): err is PlatformError {
  return err instanceof PlatformError;
}
