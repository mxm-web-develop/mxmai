/**
 * 从 createTask 的 params 中提取列表展示用任务名称（与前端 mergeTaskLabelIntoParams 一致）。
 * Task V2 graph 等路径会把表单包在 `params.params` 内，label 可能在嵌套 `metadata` 中。
 */
export function extractRequestLabelFromParams(params: Record<string, unknown> | undefined | null): string | undefined {
  if (!params || typeof params !== 'object') return undefined;

  const topMeta = params.metadata;
  if (topMeta && typeof topMeta === 'object' && !Array.isArray(topMeta)) {
    const lab = (topMeta as Record<string, unknown>).label;
    if (typeof lab === 'string' && lab.trim()) return lab.trim();
  }
  const topLab = params.label;
  if (typeof topLab === 'string' && topLab.trim()) return topLab.trim();

  const inner = params.params;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    const im = (inner as Record<string, unknown>).metadata;
    if (im && typeof im === 'object' && !Array.isArray(im)) {
      const lab = (im as Record<string, unknown>).label;
      if (typeof lab === 'string' && lab.trim()) return lab.trim();
    }
    const il = (inner as Record<string, unknown>).label;
    if (typeof il === 'string' && il.trim()) return il.trim();
  }
  return undefined;
}
