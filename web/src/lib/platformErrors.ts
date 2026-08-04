/**
 * 用户可见平台错误：与 mxmcgi 错误码表对齐。
 * @see docs/adr/user-facing-error-policy.md
 */

export const PLATFORM_ERROR_CODES = [
  'UPSTREAM_OVERLOADED',
  'UPSTREAM_RATE_LIMIT',
  'UPSTREAM_UNAVAILABLE',
  'UPSTREAM_CONTENT_POLICY',
  'NETWORK_ERROR',
  'TASK_VALIDATION_ERROR',
  'TASK_CONFIG_ERROR',
  'INSUFFICIENT_BALANCE',
  'BILLING_MISCONFIGURED',
  'INTERNAL_ERROR',
] as const;

export type PlatformErrorCode = (typeof PLATFORM_ERROR_CODES)[number];

export const PLATFORM_ERROR_USER_MESSAGES: Record<PlatformErrorCode, string> = {
  UPSTREAM_OVERLOADED: '系统繁忙，请稍后重试',
  UPSTREAM_RATE_LIMIT: '请求过于频繁，请稍后再试',
  UPSTREAM_UNAVAILABLE: '上游服务暂不可用，请稍后重试',
  UPSTREAM_CONTENT_POLICY: '内容未通过安全审核，请修改后重试',
  NETWORK_ERROR: '网络异常，请检查后重试',
  TASK_VALIDATION_ERROR: '填写内容有误，请检查后重试',
  TASK_CONFIG_ERROR: '业务暂不可用，请稍后重试或联系管理员',
  INSUFFICIENT_BALANCE: '余额不足，请充值后再试',
  BILLING_MISCONFIGURED: '计费配置异常，请联系管理员',
  INTERNAL_ERROR: '操作失败，请稍后重试',
};

export type UserFacingError = {
  code: PlatformErrorCode;
  message: string;
  /** 仅 admin 展示的技术细节 */
  debugDetail?: string;
  retryable: boolean;
};

const RETRYABLE: ReadonlySet<PlatformErrorCode> = new Set([
  'UPSTREAM_OVERLOADED',
  'UPSTREAM_RATE_LIMIT',
  'UPSTREAM_UNAVAILABLE',
  'NETWORK_ERROR',
]);

export function isPlatformErrorCode(value: unknown): value is PlatformErrorCode {
  return typeof value === 'string' && (PLATFORM_ERROR_CODES as readonly string[]).includes(value);
}

export function looksLikeLeakyErrorText(text: string): boolean {
  const s = text.trim();
  if (!s) return false;
  if (/proxy\s*=/i.test(s)) return true;
  if (/request_id/i.test(s)) return true;
  if (/https?:\/\/\S+/i.test(s)) return true;
  if (/@\s*https?:\/\//i.test(s)) return true;
  if (/overloaded_error|base_resp|statusText|Maxplan API|DeerAPI|AtlasCloud API/i.test(s)) return true;
  if (/^\s*\{[\s\S]*"type"\s*:\s*"error"/i.test(s)) return true;
  if (/nestedText[「\s]|promptTextTaskKey\s*=/i.test(s)) return true;
  if (/JSON Schema|instancePath|additional properties/i.test(s)) return true;
  if (s.length > 280 && /error|failed|status/i.test(s)) return true;
  return false;
}

export function inferCodeFromMessage(raw: string): PlatformErrorCode {
  const s = raw || '';
  if (/INSUFFICIENT_BALANCE|余额不足/i.test(s)) return 'INSUFFICIENT_BALANCE';
  if (/BILLING_MISCONFIGURED|计费.*(未配置|异常|错误)/i.test(s)) return 'BILLING_MISCONFIGURED';
  if (/CONTENT_POLICY|内容审核|涉敏|敏感词|未通过安全审核/i.test(s)) {
    return 'UPSTREAM_CONTENT_POLICY';
  }
  if (/\b529\b|overloaded_error|负载较高|系统繁忙|服务集群负载|capacity|overloaded/i.test(s)) {
    return 'UPSTREAM_OVERLOADED';
  }
  if (/\b429\b|rate.?limit|too many requests|请求过于频繁/i.test(s)) {
    return 'UPSTREAM_RATE_LIMIT';
  }
  if (/\b502\b|\b503\b|\b504\b|Bad Gateway|Service Unavailable|Gateway Timeout/i.test(s)) {
    return 'UPSTREAM_UNAVAILABLE';
  }
  if (
    /fetch failed|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up|network|proxy=/i.test(s)
  ) {
    return 'NETWORK_ERROR';
  }
  if (/参数校验|ValidationError|JSON Schema|additional properties|required property/i.test(s)) {
    return 'TASK_VALIDATION_ERROR';
  }
  if (/TASK_CONFIG|业务.*(不存在|未配置|暂不可用)|ConfigurationError/i.test(s)) {
    return 'TASK_CONFIG_ERROR';
  }
  if (/Maxplan API|DeerAPI|AtlasCloud API|请求失败/i.test(s) && /5\d\d/.test(s)) {
    return 'UPSTREAM_UNAVAILABLE';
  }
  return 'INTERNAL_ERROR';
}

/** 去掉管线步骤名 / 合同路径等内部口吻 */
export function scrubInternalErrorCopy(text: string): string {
  let s = text.trim();
  if (/无检索条目|请先跑联网检索|缺少合同.*联网检索/i.test(s)) {
    return '创作素材尚未就绪或与选题未匹配上，请返回上一步重新检索后再试';
  }
  s = s.replace(/^[a-zA-Z][a-zA-Z0-9_-]*[：:]\s*/u, '');
  s = s.replace(/sources\.websource|证据缓存\s*\/\s*/gi, '');
  s = s.replace(/nestedText[「\s][^」\s]+」?/gi, '子步骤');
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s || text.trim();
}

export type ToUserFacingErrorInput =
  | string
  | null
  | undefined
  | Error
  | {
      code?: string;
      error?: string;
      message?: string;
      debugDetail?: string;
      errorCode?: string;
      errorDebug?: string;
    };

export type ToUserFacingErrorOptions = {
  isAdmin?: boolean;
  fallback?: string;
};

/**
 * 将 API / 任务错误转为产品文案；admin 可附带 debugDetail。
 */
export function toUserFacingError(
  input: ToUserFacingErrorInput,
  opts: ToUserFacingErrorOptions = {}
): UserFacingError {
  const isAdmin = Boolean(opts.isAdmin);
  const fallback = opts.fallback ?? PLATFORM_ERROR_USER_MESSAGES.INTERNAL_ERROR;

  let codeHint: string | undefined;
  let rawMessage = '';
  let debugFromApi: string | undefined;

  if (input == null) {
    rawMessage = '';
  } else if (typeof input === 'string') {
    rawMessage = input;
  } else if (input instanceof Error) {
    rawMessage = input.message;
  } else if (typeof input === 'object') {
    codeHint = input.code || input.errorCode;
    rawMessage =
      (typeof input.error === 'string' && input.error) ||
      (typeof input.message === 'string' && input.message) ||
      '';
    debugFromApi =
      (typeof input.debugDetail === 'string' && input.debugDetail) ||
      (typeof input.errorDebug === 'string' && input.errorDebug) ||
      undefined;
  }

  const code: PlatformErrorCode = isPlatformErrorCode(codeHint)
    ? codeHint
    : inferCodeFromMessage(rawMessage);

  let message = PLATFORM_ERROR_USER_MESSAGES[code];
  if (rawMessage.trim() && !looksLikeLeakyErrorText(rawMessage)) {
    message = scrubInternalErrorCopy(rawMessage.trim()) || message;
  } else if (!rawMessage.trim() && !codeHint) {
    message = fallback;
  }

  const result: UserFacingError = {
    code,
    message,
    retryable: RETRYABLE.has(code),
  };

  if (isAdmin) {
    const detail =
      debugFromApi ||
      (looksLikeLeakyErrorText(rawMessage) || (rawMessage && rawMessage !== message)
        ? rawMessage
        : undefined);
    if (detail && detail !== message) result.debugDetail = detail;
  }

  return result;
}

/** toast / 简短文案：仅 message（不含 debug） */
export function toUserFacingErrorMessage(
  input: ToUserFacingErrorInput,
  opts: ToUserFacingErrorOptions = {}
): string {
  return toUserFacingError(input, opts).message;
}
