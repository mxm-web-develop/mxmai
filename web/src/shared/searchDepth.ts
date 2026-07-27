/** 与 mxmcgi SearchDepth / Admin 搜索测试一致 */
export type SearchDepth = 'quick' | 'standard' | 'deep';

export const SEARCH_DEPTH_LABELS: Record<SearchDepth, string> = {
  quick: '快速',
  standard: '标准',
  deep: '深度',
};
