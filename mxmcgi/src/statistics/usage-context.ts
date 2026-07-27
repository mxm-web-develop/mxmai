import {
  isOpenApiTaskMetadata,
  TASK_CREATION_SOURCE_OPEN_API,
  TASK_CREATION_SOURCE_WEB,
} from '../task/creation-source';

export type UsageSource = 'web' | 'open_api';

export interface UsageContext {
  usageSource?: UsageSource;
  callerUserId?: string;
  publishedSlug?: string;
  publishedApiId?: string;
  endUserId?: string;
  parentTaskId?: string;
}

export type DisplayScope = 'text' | 'writing' | 'graph' | 'video' | 'audio' | 'music';

/** 展示用 scope：outline 归并到 writing */
export function normalizeScopeForDisplay(scope: string): DisplayScope {
  const s = String(scope ?? '').toLowerCase();
  if (s === 'outline') return 'writing';
  if (s === 'image') return 'graph';
  if (s === 'text' || s === 'writing' || s === 'graph' || s === 'video' || s === 'audio' || s === 'music') {
    return s as DisplayScope;
  }
  return 'text';
}

export function metricKindForScope(scope: string): 'token' | 'count' {
  const d = normalizeScopeForDisplay(scope);
  return d === 'text' || d === 'writing' ? 'token' : 'count';
}

/** events 筛选：展示 scope 对应的 DB raw scope 列表 */
export function rawScopesForDisplayScope(display: DisplayScope): string[] {
  switch (display) {
    case 'writing':
      return ['writing', 'outline'];
    case 'graph':
      return ['graph', 'image'];
    default:
      return [display];
  }
}

export function resolveUsageContextFromTaskMetadata(
  metadata: Record<string, unknown> | null | undefined
): UsageContext {
  if (!metadata || typeof metadata !== 'object') {
    return { usageSource: TASK_CREATION_SOURCE_WEB };
  }
  const openApi = isOpenApiTaskMetadata(metadata);
  const ctx: UsageContext = {
    usageSource: openApi ? TASK_CREATION_SOURCE_OPEN_API : TASK_CREATION_SOURCE_WEB,
  };
  const slug = metadata.publishedSlug;
  if (typeof slug === 'string' && slug.trim()) ctx.publishedSlug = slug.trim();
  const apiId = metadata.publishedApiId;
  if (typeof apiId === 'string' && apiId.trim()) ctx.publishedApiId = apiId.trim();
  const caller = metadata.openApiCallerId ?? metadata.callerUserId;
  if (typeof caller === 'string' && caller.trim()) ctx.callerUserId = caller.trim();
  const endUser = metadata.endUserId;
  if (typeof endUser === 'string' && endUser.trim()) ctx.endUserId = endUser.trim();
  return ctx;
}

export function mergeUsageContext(
  base: UsageContext | undefined,
  override: UsageContext | undefined
): UsageContext {
  if (!base && !override) return { usageSource: TASK_CREATION_SOURCE_WEB };
  return { ...base, ...override };
}

export function usageContextToRecord(ctx?: UsageContext): Record<string, unknown> {
  if (!ctx) return { usage_source: TASK_CREATION_SOURCE_WEB };
  const out: Record<string, unknown> = {
    usage_source: ctx.usageSource ?? TASK_CREATION_SOURCE_WEB,
  };
  if (ctx.callerUserId) out.caller_user_id = ctx.callerUserId;
  if (ctx.publishedSlug) out.published_slug = ctx.publishedSlug;
  if (ctx.publishedApiId) out.published_api_id = ctx.publishedApiId;
  if (ctx.endUserId) out.end_user_id = ctx.endUserId;
  if (ctx.parentTaskId) out.parent_task_id = ctx.parentTaskId;
  return out;
}
