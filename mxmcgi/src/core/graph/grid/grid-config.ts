/** 宫格 QA 环境变量与阈值 */

export function isGridQaEnabled(): boolean {
  const v = process.env.MXMCGI_GRID_QA_ENABLED;
  if (v === 'false' || v === '0') return false;
  return true;
}

export function isGridPlannerEnabled(): boolean {
  return process.env.MXMCGI_GRID_PLANNER_ENABLED === 'true' || process.env.MXMCGI_GRID_PLANNER_ENABLED === '1';
}

export function isGridEmbeddingQaEnabled(): boolean {
  return (
    process.env.MXMCGI_GRID_EMBEDDING_QA_ENABLED === 'true' || process.env.MXMCGI_GRID_EMBEDDING_QA_ENABLED === '1'
  );
}

export function gridTextQaMaxRetries(): number {
  const n = Number(process.env.MXMCGI_GRID_TEXT_QA_MAX_RETRIES);
  return Number.isFinite(n) && n >= 0 ? Math.min(10, Math.floor(n)) : 3;
}

export function isGridPixelQaBlockDelivery(): boolean {
  return (
    process.env.MXMCGI_GRID_PIXEL_QA_BLOCK_DELIVERY === 'true' ||
    process.env.MXMCGI_GRID_PIXEL_QA_BLOCK_DELIVERY === '1'
  );
}

/** n-gram Jaccard：高于此值视为过于相似 */
export const GRID_TEXT_NGRAM_JACCARD_MAX = 0.55;

/** dHash Hamming：低于此值视为像素过于相似 */
export const GRID_PIXEL_DHASH_HAMMING_MIN_DISTINCT = 10;

export const TEXT_FORMAT_STRUCTURE_LOCK = [
  '[TEXT_FORMAT_STRUCTURE_LOCK]',
  'The briefing contains Panel 1, Panel 2, ... lines for a single contact sheet.',
  'Output ONE continuous English image prompt that MUST retain every "Panel N (...)" line with distinct pose/framing per panel.',
  'Do NOT merge panels into one pose. Do NOT change grid size, scene, wardrobe, or aspect ratio semantics from the briefing.',
  'Do NOT delete Panel lines or reduce panel count.',
  '[/TEXT_FORMAT_STRUCTURE_LOCK]',
].join('\n');
