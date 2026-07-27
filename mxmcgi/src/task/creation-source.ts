export type TaskCreationSource = 'web' | 'open_api';

export const TASK_CREATION_SOURCE_WEB: TaskCreationSource = 'web';
export const TASK_CREATION_SOURCE_OPEN_API: TaskCreationSource = 'open_api';

/** 是否属于「开放 API / 第三方」调用（非平台内自用、非 personal Key 自动化） */
export function isOpenApiTaskMetadata(
  metadata: Record<string, unknown> | null | undefined
): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  if (metadata.creationSource === TASK_CREATION_SOURCE_WEB) return false;

  const slug = metadata.publishedSlug;
  const apiId = metadata.publishedApiId;
  const partnerAppId = metadata.partnerAppId;
  const endUserId = metadata.endUserId;

  if (typeof apiId === 'string' && apiId.trim()) return true;
  if (typeof partnerAppId === 'string' && partnerAppId.trim()) return true;
  if (typeof endUserId === 'string' && endUserId.trim()) return true;
  if (typeof slug === 'string' && slug.trim()) return true;

  return false;
}

function readTrimmedString(params: Record<string, unknown>, key: string): string | undefined {
  const v = params[key];
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

/** 从 createTask params 提取开放 API 标记（publishedSlug 等） */
export function pickOpenApiMetadataFromParams(
  params: Record<string, unknown> | undefined
): Record<string, string> {
  if (!params || typeof params !== 'object') return {};

  const slug = readTrimmedString(params, 'publishedSlug');
  const apiId = readTrimmedString(params, 'publishedApiId');
  const openApiCallerId = readTrimmedString(params, 'openApiCallerId');
  const partnerAppId = readTrimmedString(params, 'partnerAppId');
  const endUserId = readTrimmedString(params, 'endUserId');

  const isThirdParty =
    !!slug ||
    !!apiId ||
    !!partnerAppId ||
    !!endUserId ||
    (params.creationSource === TASK_CREATION_SOURCE_OPEN_API &&
      (!!slug || !!apiId || !!openApiCallerId));

  if (!isThirdParty) return {};

  const out: Record<string, string> = { creationSource: TASK_CREATION_SOURCE_OPEN_API };
  if (slug) out.publishedSlug = slug;
  if (apiId) out.publishedApiId = apiId;
  if (openApiCallerId) out.openApiCallerId = openApiCallerId;
  if (partnerAppId) out.partnerAppId = partnerAppId;
  if (endUserId) out.endUserId = endUserId;
  return out;
}

/** 合并任务 metadata（DB 与内存存储共用） */
export function buildTaskCreationMetadata(
  base: Record<string, unknown>,
  params?: Record<string, unknown>,
  userId?: string
): Record<string, unknown> {
  const openApi = pickOpenApiMetadataFromParams(params);
  return {
    ...base,
    ...openApi,
    ...(userId ? { userId } : {}),
    creationSource: openApi.creationSource ?? TASK_CREATION_SOURCE_WEB,
  };
}
