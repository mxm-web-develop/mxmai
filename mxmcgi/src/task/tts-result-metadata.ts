/**
 * TTS 任务 result.metadata 瘦身：MiniMax raw 响应含 hex 音频，落 MinIO 后必须剔除，避免 output_data 数 MB 导致查询超时。
 */

export function stripTtsProviderRawMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return metadata;
  if (!('raw' in metadata)) return metadata;
  const next = { ...metadata };
  delete next.raw;
  return next;
}

export function slimTtsTaskResultMetadata(
  taskType: string,
  metadata: Record<string, unknown> | undefined,
  hasPersistedMedia: boolean
): Record<string, unknown> | undefined {
  if (!metadata) return metadata;
  if (taskType !== 'audio' && taskType !== 'music') return metadata;
  if (!hasPersistedMedia && !metadata.raw) return metadata;
  return stripTtsProviderRawMetadata(metadata);
}
