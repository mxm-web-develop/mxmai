/**
 * 平台稳定错误码 + 默认用户文案。
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

export const RETRYABLE_ERROR_CODES: ReadonlySet<PlatformErrorCode> = new Set([
  'UPSTREAM_OVERLOADED',
  'UPSTREAM_RATE_LIMIT',
  'UPSTREAM_UNAVAILABLE',
  'NETWORK_ERROR',
]);

export function isPlatformErrorCode(value: unknown): value is PlatformErrorCode {
  return typeof value === 'string' && (PLATFORM_ERROR_CODES as readonly string[]).includes(value);
}

export function userMessageForCode(code: PlatformErrorCode, override?: string): string {
  const o = typeof override === 'string' ? override.trim() : '';
  if (o && !looksLikeLeakyErrorText(o)) return o;
  return PLATFORM_ERROR_USER_MESSAGES[code];
}

/** 含内网/上游细节，不宜作为非 admin 主文案 */
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
