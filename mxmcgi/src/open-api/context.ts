/** 开放 API 执行上下文：第三方调用时 MXM-TOKEN 从发布者账户扣减 */

export const OPEN_API_INPUT_KEY = '__mxm_open_api';

export interface OpenApiRunContext {
  billingUserId: string;
  callerUserId: string;
  publishedApiId: string;
  publishedSlug: string;
  partnerAppId?: string;
  endUserId?: string;
}

export function buildOpenApiRunContext(
  record: {
    owner_user_id: string;
    id: string;
    slug: string;
  },
  callerId: string,
  partner?: { partnerAppId?: string; endUserId?: string }
): OpenApiRunContext {
  return {
    billingUserId: record.owner_user_id,
    callerUserId: callerId,
    publishedApiId: record.id,
    publishedSlug: record.slug,
    partnerAppId: partner?.partnerAppId,
    endUserId: partner?.endUserId,
  };
}

export function extractOpenApiContext(
  input: Record<string, unknown> | null | undefined
): OpenApiRunContext | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input[OPEN_API_INPUT_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const billingUserId = String(o.billingUserId ?? '').trim();
  const callerUserId = String(o.callerUserId ?? '').trim();
  const publishedApiId = String(o.publishedApiId ?? '').trim();
  const publishedSlug = String(o.publishedSlug ?? '').trim();
  if (!billingUserId || !publishedApiId || !publishedSlug) return null;
  return {
    billingUserId,
    callerUserId: callerUserId || billingUserId,
    publishedApiId,
    publishedSlug,
    partnerAppId: typeof o.partnerAppId === 'string' ? o.partnerAppId : undefined,
    endUserId: typeof o.endUserId === 'string' ? o.endUserId : undefined,
  };
}

export function stripOpenApiContext(input: Record<string, unknown>): Record<string, unknown> {
  if (!input || typeof input !== 'object') return {};
  const next = { ...input };
  delete next[OPEN_API_INPUT_KEY];
  return next;
}

export function attachOpenApiContext(
  input: Record<string, unknown>,
  ctx: OpenApiRunContext
): Record<string, unknown> {
  return {
    ...stripOpenApiContext(input),
    [OPEN_API_INPUT_KEY]: ctx,
  };
}
