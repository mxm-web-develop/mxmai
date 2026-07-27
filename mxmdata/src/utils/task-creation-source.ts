/**
 * 任务创作来源：Web 自用 vs 开放 API（含 H5 等第三方应用）
 */
export type TaskCreationSource = 'web' | 'open_api';

export const TASK_CREATION_SOURCE_WEB: TaskCreationSource = 'web';
export const TASK_CREATION_SOURCE_OPEN_API: TaskCreationSource = 'open_api';

export function isOpenApiTaskMetadata(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const src = metadata.creationSource;
  if (src === TASK_CREATION_SOURCE_OPEN_API) return true;
  if (src === TASK_CREATION_SOURCE_WEB) return false;
  const slug = metadata.publishedSlug;
  return typeof slug === 'string' && slug.trim().length > 0;
}

export function inferTaskCreationSource(
  metadata: Record<string, unknown> | null | undefined
): TaskCreationSource {
  return isOpenApiTaskMetadata(metadata) ? TASK_CREATION_SOURCE_OPEN_API : TASK_CREATION_SOURCE_WEB;
}
