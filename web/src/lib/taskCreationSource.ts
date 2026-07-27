/** 与后端 metadata.creationSource / publishedSlug 规则对齐 */
export type TaskCreationSourceTab = 'web' | 'open_api';

export function isOpenApiTaskMetadata(metadata?: Record<string, unknown> | null): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const src = metadata.creationSource;
  if (src === 'open_api') return true;
  if (src === 'web') return false;
  const slug = metadata.publishedSlug;
  return typeof slug === 'string' && slug.trim().length > 0;
}

/** 第三方任务展示用：开放 API slug */
export function getPublishedSlugLabel(metadata?: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const slug = metadata.publishedSlug;
  return typeof slug === 'string' && slug.trim() ? slug.trim() : null;
}
