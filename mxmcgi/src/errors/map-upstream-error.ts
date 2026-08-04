import { ConfigurationError, ValidationError } from '../tasks/errors';
import { ProviderContentPolicyError } from '../tasks/provider-content-policy';
import {
  type PlatformErrorCode,
  PLATFORM_ERROR_USER_MESSAGES,
  looksLikeLeakyErrorText,
} from './error-codes';
import { PlatformError, isPlatformError } from './platform-error';

/**
 * 将任意抛错映射为 PlatformError（启发式覆盖上游 Provider / 网络串）。
 * 已是 PlatformError 则原样返回。
 */
export function mapUpstreamError(err: unknown): PlatformError {
  if (isPlatformError(err)) return err;

  if (err instanceof ValidationError) {
    const msg = err.message || PLATFORM_ERROR_USER_MESSAGES.TASK_VALIDATION_ERROR;
    return new PlatformError({
      code: 'TASK_VALIDATION_ERROR',
      userMessage: looksLikeLeakyErrorText(msg)
        ? PLATFORM_ERROR_USER_MESSAGES.TASK_VALIDATION_ERROR
        : scrubInternalErrorCopy(msg),
      debugMessage: err.message,
      cause: err,
    });
  }

  if (err instanceof ConfigurationError) {
    const msg = err.message || PLATFORM_ERROR_USER_MESSAGES.TASK_CONFIG_ERROR;
    return new PlatformError({
      code: 'TASK_CONFIG_ERROR',
      userMessage: looksLikeLeakyErrorText(msg)
        ? PLATFORM_ERROR_USER_MESSAGES.TASK_CONFIG_ERROR
        : scrubInternalErrorCopy(msg),
      debugMessage: err.message,
      cause: err,
    });
  }

  if (err instanceof ProviderContentPolicyError) {
    return new PlatformError({
      code: 'UPSTREAM_CONTENT_POLICY',
      userMessage: PLATFORM_ERROR_USER_MESSAGES.UPSTREAM_CONTENT_POLICY,
      debugMessage: err.message,
      cause: err,
    });
  }

  const codeFromObj = extractCodeFromObject(err);
  if (codeFromObj === 'INSUFFICIENT_BALANCE' || codeFromObj === 'BILLING_MISCONFIGURED') {
    const msg = err instanceof Error ? err.message : String(err);
    return new PlatformError({
      code: codeFromObj,
      userMessage:
        codeFromObj === 'INSUFFICIENT_BALANCE'
          ? PLATFORM_ERROR_USER_MESSAGES.INSUFFICIENT_BALANCE
          : PLATFORM_ERROR_USER_MESSAGES.BILLING_MISCONFIGURED,
      debugMessage: msg,
      cause: err,
    });
  }

  const raw = extractRawMessage(err);
  const inferred = inferCodeFromMessage(raw);
  const safeUser =
    raw && !looksLikeLeakyErrorText(raw)
      ? scrubInternalErrorCopy(raw)
      : PLATFORM_ERROR_USER_MESSAGES[inferred];
  return new PlatformError({
    code: inferred,
    userMessage: safeUser,
    debugMessage: raw || PLATFORM_ERROR_USER_MESSAGES[inferred],
    cause: err,
  });
}

function extractRawMessage(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function extractCodeFromObject(err: unknown): PlatformErrorCode | null {
  if (!err || typeof err !== 'object') return null;
  const c = (err as { code?: unknown }).code;
  if (c === 'INSUFFICIENT_BALANCE' || c === 'BILLING_MISCONFIGURED') return c;
  if (c === 'TASK_VALIDATION_ERROR' || c === 'TASK_CONFIG_ERROR') return c;
  if (c === 'CONTENT_POLICY') return 'UPSTREAM_CONTENT_POLICY';
  if (c === 'BILLING_MISCONFIGURED') return 'BILLING_MISCONFIGURED';
  return null;
}

export function inferCodeFromMessage(raw: string): PlatformErrorCode {
  const s = raw || '';

  if (/INSUFFICIENT_BALANCE|余额不足/i.test(s)) return 'INSUFFICIENT_BALANCE';
  if (/BILLING_MISCONFIGURED|计费.*(未配置|异常|错误)/i.test(s)) return 'BILLING_MISCONFIGURED';
  if (/CONTENT_POLICY|内容审核|涉敏|敏感词|未通过安全审核/i.test(s)) {
    return 'UPSTREAM_CONTENT_POLICY';
  }
  if (
    /\b529\b|overloaded_error|负载较高|系统繁忙|服务集群负载|capacity|overloaded/i.test(s)
  ) {
    return 'UPSTREAM_OVERLOADED';
  }
  if (/\b429\b|rate.?limit|too many requests|请求过于频繁/i.test(s)) {
    return 'UPSTREAM_RATE_LIMIT';
  }
  if (/\b502\b|\b503\b|\b504\b|Bad Gateway|Service Unavailable|Gateway Timeout/i.test(s)) {
    return 'UPSTREAM_UNAVAILABLE';
  }
  if (
    /fetch failed|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up|network|proxy=/i.test(
      s
    )
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

/**
 * 仅从已存字符串推断用户文案（任务读出脱敏用）。
 * 非泄漏人话保留原文；泄漏串才换成码表默认文案。
 */
export function userMessageFromStoredError(
  raw: string | null | undefined,
  errorCode?: string | null
): { code: PlatformErrorCode; userMessage: string } {
  const text = String(raw ?? '').trim();
  if (errorCode && isKnownCode(errorCode)) {
    if (text && !looksLikeLeakyErrorText(text)) {
      return { code: errorCode, userMessage: scrubInternalErrorCopy(text) };
    }
    return { code: errorCode, userMessage: PLATFORM_ERROR_USER_MESSAGES[errorCode] };
  }
  if (text && !looksLikeLeakyErrorText(text)) {
    const code = inferCodeFromMessage(text);
    return { code, userMessage: scrubInternalErrorCopy(text) };
  }
  const mapped = mapUpstreamError(new Error(text));
  return { code: mapped.code, userMessage: mapped.userMessage };
}

/** 去掉管线步骤名 / 合同路径等内部口吻，保留可操作人话 */
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

function isKnownCode(code: string): code is PlatformErrorCode {
  return code in PLATFORM_ERROR_USER_MESSAGES;
}
