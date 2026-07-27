/**
 * Video 宫格分镜图：裁切源图 → systemtemp R2 → reference_images（reference-to-video）
 */

import { parseOutputGrid } from '../graph/grid/grid-contract';
import { splitGridLayoutImage } from '../utils/grid-layout-splitter';
import {
  analyzeGridLayout,
  hasUsableSeamBounds,
  type GridLayoutAnalysis,
} from '../utils/grid-layout-analyzer';
import { uploadGeneratedTemp, deleteGeneratedBlob, getGeneratedBucket } from '../../storage/generated-temp';
import { getR2SystemTempPublicUrl } from '../storage/r2-uploader';
import { isSanitizedReferencePlaceholder, isUsableReferenceImageContent } from '../../task/reference-image';

export const STORYBOARD_GRID_PARAM_KEY = 'storyboard_grid';
export const STORYBOARD_TEMP_KEYS_META = 'storyboardTempR2Keys';

export type StoryboardGridLayout = '2x2' | '3x3' | '4x4';

export interface StoryboardGridCell {
  index: number;
  purpose?: string;
}

export interface StoryboardGridSourceImage {
  content?: string;
  type?: string;
}

export interface StoryboardGridParams {
  enabled: boolean;
  layout?: StoryboardGridLayout;
  /** 为 true 时服务端按白缝/画幅自动推断布局（可覆盖手动 layout） */
  auto_detect_layout?: boolean;
  source_image?: StoryboardGridSourceImage | null;
  cells?: StoryboardGridCell[];
  first_frame_index?: number;
  last_frame_index?: number | null;
}

export interface StoryboardSplitResult {
  cellUrls: string[];
  tempKeys: string[];
  bucket: string;
  gridN: number;
  totalCells: number;
  layout: StoryboardGridLayout;
  /** atlascloud 路径：参考图已直传 Atlas，无需 R2 清理 */
  referenceHost?: 'atlas' | 'r2';
}

export interface StoryboardProcessOptions {
  provider?: string;
}

function dataUriToBuffer(dataUri: string): { buffer: Buffer; mimeType: string } {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid grid cell data URI');
  }
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function mimeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return map[mimeType] || 'jpg';
}

export function sanitizeStoryboardGridPayload(params: Record<string, unknown>): void {
  const raw = params[STORYBOARD_GRID_PARAM_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  const g = raw as Record<string, unknown>;
  if (g.last_frame_index === null) delete g.last_frame_index;
  if (g.source_image === null) delete g.source_image;
}

export function parseStoryboardGridParams(params: Record<string, unknown>): StoryboardGridParams | null {
  const raw = params[STORYBOARD_GRID_PARAM_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const g = raw as Record<string, unknown>;
  return {
    enabled: g.enabled === true,
    layout: typeof g.layout === 'string' ? (g.layout as StoryboardGridLayout) : undefined,
    auto_detect_layout: g.auto_detect_layout !== false,
    source_image:
      g.source_image && typeof g.source_image === 'object' && !Array.isArray(g.source_image)
        ? (g.source_image as StoryboardGridSourceImage)
        : undefined,
    cells: Array.isArray(g.cells) ? (g.cells as StoryboardGridCell[]) : undefined,
    first_frame_index: typeof g.first_frame_index === 'number' ? g.first_frame_index : undefined,
    last_frame_index:
      g.last_frame_index === null
        ? null
        : typeof g.last_frame_index === 'number'
          ? g.last_frame_index
          : undefined,
  };
}

export function isStoryboardGridEnabled(params: Record<string, unknown>): boolean {
  return parseStoryboardGridParams(params)?.enabled === true;
}

export function validateStoryboardGridForPrepare(params: Record<string, unknown>): void {
  const grid = parseStoryboardGridParams(params);
  if (!grid?.enabled) return;

  const sourceUrl = grid.source_image?.content?.trim();
  if (!sourceUrl) {
    throw new Error('宫格分镜已开启，请上传一张源图');
  }

  const parsed = parseOutputGrid(grid.layout);
  if (!parsed || parsed.gridN < 2) {
    if (grid.auto_detect_layout !== false) return;
    throw new Error('宫格分镜已开启，请选择 2x2、3x3 或 4x4 布局');
  }

  const heroSlots = ['hero_still_images', 'hero_frame_images', 'reference_images'] as const;
  for (const key of heroSlots) {
    const urls = extractSlotUrls(params[key]);
    if (urls.length > 0) {
      throw new Error(`宫格分镜模式下请勿同时填写 ${key}，仅使用 storyboard_grid 源图`);
    }
  }

  if (grid.first_frame_index != null) {
    if (grid.first_frame_index < 0 || grid.first_frame_index >= parsed.totalCells) {
      throw new Error(`首帧格位索引无效（0～${parsed.totalCells - 1}）`);
    }
  }
  if (grid.last_frame_index != null && grid.last_frame_index >= 0) {
    if (grid.last_frame_index < 0 || grid.last_frame_index >= parsed.totalCells) {
      throw new Error(`尾帧格位索引无效（0～${parsed.totalCells - 1}）`);
    }
  }
}

function extractSlotUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (item && typeof item === 'object' && 'content' in item) {
      const c = (item as { content?: unknown }).content;
      if (typeof c === 'string' && c.trim()) out.push(c.trim());
    } else if (typeof item === 'string' && item.trim()) {
      out.push(item.trim());
    }
  }
  return out;
}

export function buildStoryboardPromptText(
  cells: StoryboardGridCell[] | undefined,
  gridN: number,
): string {
  const total = gridN * gridN;
  const lines: string[] = [];
  for (let index = 0; index < total; index++) {
    const row = Math.floor(index / gridN);
    const col = index % gridN;
    const cell = cells?.find((c) => c.index === index);
    const purpose = cell?.purpose?.trim() || '';
    lines.push(`Panel ${index + 1} (row${row} col${col}): ${purpose || '(no description)'}`);
  }
  return lines.join('\n');
}

export function prepareStoryboardGridParams(params: Record<string, unknown>): void {
  const grid = parseStoryboardGridParams(params);
  if (!grid?.enabled) return;

  validateStoryboardGridForPrepare(params);

  const parsed = parseOutputGrid(grid.layout);
  if (parsed && parsed.gridN >= 2) {
    params.storyboard_prompt = buildStoryboardPromptText(grid.cells, parsed.gridN);
  }
  params.atlas_video_mode = 'reference-to-video';
  params.video_mode = 'reference-to-video';
}

export async function resolveStoryboardLayout(
  sourceUrl: string,
  grid: StoryboardGridParams,
): Promise<{ layout: StoryboardGridLayout; analysis: GridLayoutAnalysis }> {
  const manual = parseOutputGrid(grid.layout);

  if (grid.auto_detect_layout !== false) {
    const analysis = await analyzeGridLayout(sourceUrl);
    if (analysis.layout && analysis.gridN >= 2) {
      return { layout: analysis.layout as StoryboardGridLayout, analysis };
    }
  }

  if (manual && manual.gridN >= 2) {
    const analysis = await analyzeGridLayout(sourceUrl, { gridNHint: manual.gridN });
    return { layout: grid.layout!, analysis };
  }

  const analysis = await analyzeGridLayout(sourceUrl);
  if (analysis.layout && analysis.gridN >= 2) {
    return { layout: analysis.layout as StoryboardGridLayout, analysis };
  }

  throw new Error('无法识别宫格布局，请手动选择 2x2、3x3 或 4x4');
}

export async function splitAndUploadStoryboardCells(
  taskId: string,
  sourceUrl: string,
  layout: StoryboardGridLayout,
  analysis?: GridLayoutAnalysis | null,
  options?: StoryboardProcessOptions,
): Promise<StoryboardSplitResult> {
  const parsed = parseOutputGrid(layout);
  if (!parsed || parsed.gridN < 2) {
    throw new Error(`Invalid storyboard layout: ${layout}`);
  }

  const useSeams = hasUsableSeamBounds(analysis, parsed.gridN);

  const split = await splitGridLayoutImage(sourceUrl, parsed.gridN, {
    seamBounds: useSeams ? analysis!.seamBounds : null,
  });

  const provider = String(options?.provider ?? '').toLowerCase();
  const useAtlas = provider === 'atlascloud';
  const bucket = getGeneratedBucket();
  const cellUrls: string[] = [];
  const tempKeys: string[] = [];

  let atlasApiKey: string | undefined;
  if (useAtlas) {
    const { getFirstProviderKey } = await import('../providers/provider-keys');
    atlasApiKey =
      (await getFirstProviderKey('atlascloud')) ?? process.env.ATLASCLOUD_API_KEY ?? undefined;
    if (!atlasApiKey) {
      throw new Error('AtlasCloud API Key 未配置，无法上传宫格参考图');
    }
  }

  const atlasUpload = useAtlas
    ? await import('../../models/atlascloud/upload-media')
    : { uploadBufferToAtlasMedia: null, upscaleBufferForAtlasVideoMinEdge: null };
  const { uploadBufferToAtlasMedia, upscaleBufferForAtlasVideoMinEdge } = atlasUpload;

  for (let index = 0; index < split.images.length; index++) {
    const { buffer, mimeType } = dataUriToBuffer(split.images[index]);
    const ext = mimeToExt(mimeType);
    const key = `video-grid/${taskId}/${index}.${ext}`;

    if (useAtlas && uploadBufferToAtlasMedia && atlasApiKey) {
      const uploadBuf =
        upscaleBufferForAtlasVideoMinEdge != null
          ? await upscaleBufferForAtlasVideoMinEdge(buffer, mimeType)
          : buffer;
      const atlasUrl = await uploadBufferToAtlasMedia(uploadBuf, `grid_${index}.${ext}`, mimeType, {
        apiKey: atlasApiKey,
      });
      cellUrls.push(atlasUrl);
      continue;
    }

    const uploaded = await uploadGeneratedTemp({
      scope: 'video-grid',
      taskId,
      name: String(index),
      buffer,
      contentType: mimeType,
      ext,
    });
    cellUrls.push(uploaded.url);
    tempKeys.push(uploaded.key);
  }

  return {
    cellUrls,
    tempKeys,
    bucket,
    gridN: parsed.gridN,
    totalCells: parsed.totalCells,
    layout,
    referenceHost: useAtlas ? 'atlas' : 'r2',
  };
}

export function applyStoryboardToVideoParams(
  params: Record<string, unknown>,
  splitResult: StoryboardSplitResult,
  grid: StoryboardGridParams,
): { tempR2Keys: string[]; bucket: string } {
  const { cellUrls } = splitResult;
  const totalCells = cellUrls.length;

  const firstIdx =
    typeof grid.first_frame_index === 'number' && grid.first_frame_index >= 0
      ? grid.first_frame_index
      : 0;
  const lastIdx =
    typeof grid.last_frame_index === 'number' && grid.last_frame_index >= 0
      ? grid.last_frame_index
      : undefined;

  if (firstIdx >= totalCells) {
    throw new Error(`首帧格位索引超出范围（0～${totalCells - 1}）`);
  }
  if (lastIdx != null && lastIdx >= totalCells) {
    throw new Error(`尾帧格位索引超出范围（0～${totalCells - 1}）`);
  }

  params.reference_images = [...cellUrls];
  params.input_reference = cellUrls[firstIdx];
  params.reference_image_url = cellUrls[firstIdx];

  if (lastIdx != null && lastIdx !== firstIdx) {
    params.last_frame = cellUrls[lastIdx];
    params.last_frame_image = cellUrls[lastIdx];
  } else {
    delete params.last_frame;
    delete params.last_frame_image;
  }

  params.atlas_video_mode = 'reference-to-video';
  params.video_mode = 'reference-to-video';

  params._storyboardGridMeta = {
    layout: splitResult.layout,
    gridN: splitResult.gridN,
    totalCells: splitResult.totalCells,
    first_frame_index: firstIdx,
    last_frame_index: lastIdx ?? null,
    source_image: grid.source_image?.content,
  };

  return { tempR2Keys: splitResult.tempKeys, bucket: splitResult.bucket };
}

export function extractStoryboardTempR2Keys(metadata: Record<string, unknown> | undefined): string[] {
  if (!metadata) return [];
  const keys = metadata[STORYBOARD_TEMP_KEYS_META];
  if (!Array.isArray(keys)) return [];
  return keys.filter((k): k is string => typeof k === 'string' && k.length > 0);
}

export async function cleanupStoryboardTempFiles(
  keys: string[],
  bucket?: string,
): Promise<void> {
  if (keys.length === 0) return;
  const b = bucket || getGeneratedBucket();
  await Promise.all(
    keys.map(async (key) => {
      try {
        await deleteGeneratedBlob({ bucket: b, key });
      } catch (err) {
        console.warn('[StoryboardGrid] cleanup failed:', key, err instanceof Error ? err.message : String(err));
      }
    }),
  );
}

export async function cleanupStoryboardTempForTaskMetadata(
  metadata: Record<string, unknown> | undefined,
): Promise<void> {
  const keys = extractStoryboardTempR2Keys(metadata);
  if (keys.length === 0) return;
  const bucket =
    typeof metadata?.storyboardTempR2Bucket === 'string'
      ? metadata.storyboardTempR2Bucket
      : getGeneratedBucket();
  await cleanupStoryboardTempFiles(keys, bucket);
  console.info('[StoryboardGrid] cleaned temp R2 keys:', keys.length);
}

export function isStoryboardGridAlreadyApplied(params: Record<string, unknown>): boolean {
  const refs = params.reference_images;
  if (!Array.isArray(refs) || refs.length === 0) return false;
  return refs.every((u) => {
    if (typeof u !== 'string' || !u.trim() || isSanitizedReferencePlaceholder(u)) return false;
    // 旧任务可能留下不可用的 R2 公网 URL，需重新处理
    if (isBrokenStoryboardR2PublicUrl(u)) return false;
    return true;
  });
}

/** systemtemp 对象若用了主桶 pub 域名，公网 GET 会 404 */
function isBrokenStoryboardR2PublicUrl(url: string): boolean {
  if (!url.includes('/video-grid/')) return false;
  try {
    const systemBase = getR2SystemTempPublicUrl().replace(/\/+$/, '');
    const mainBase = process.env.R2_PUBLIC_URL?.replace(/\/+$/, '') || '';
    const u = url.replace(/\/+$/, '');
    if (systemBase && u.startsWith(`${systemBase}/`)) return false;
    if (mainBase && u.startsWith(`${mainBase}/video-grid/`)) return true;
    if (u.includes('.r2.dev/video-grid/')) return true;
  } catch {
    // ignore
  }
  return false;
}

function flattenVideoRequestParams(requestParams: Record<string, unknown>): Record<string, unknown> {
  const inner = (requestParams.params as Record<string, unknown>) || {};
  return { ...inner, ...requestParams };
}

function syncStoryboardProcessToRequest(
  requestParams: Record<string, unknown>,
  merged: Record<string, unknown>,
): void {
  const inner: Record<string, unknown> =
    requestParams.params && typeof requestParams.params === 'object' && !Array.isArray(requestParams.params)
      ? { ...(requestParams.params as Record<string, unknown>) }
      : {};

  for (const key of [
    'reference_images',
    'input_reference',
    'reference_image_url',
    'last_frame',
    'last_frame_image',
    'atlas_video_mode',
    'video_mode',
    'storyboard_prompt',
  ] as const) {
    if (key in merged) inner[key] = merged[key];
  }

  const rawGrid = inner[STORYBOARD_GRID_PARAM_KEY];
  if (rawGrid && typeof rawGrid === 'object' && !Array.isArray(rawGrid)) {
    const g = { ...(rawGrid as Record<string, unknown>) };
    delete g.source_image;
    inner[STORYBOARD_GRID_PARAM_KEY] = g;
  }

  requestParams.params = inner;
}

/**
 * 任务落库前：用 base64 源图裁切并上传 systemtemp，写入 reference_images，避免 base64 被 sanitize 后 Worker 无法读取
 */
export async function prepareStoryboardGridForTaskPersist(
  taskId: string,
  requestParams: Record<string, unknown>,
  options?: StoryboardProcessOptions,
): Promise<{ tempR2Keys: string[]; bucket: string } | null> {
  const merged = flattenVideoRequestParams(requestParams);
  const grid = parseStoryboardGridParams(merged);
  if (!grid?.enabled) return null;
  if (isStoryboardGridAlreadyApplied(merged)) return null;

  const sourceUrl = grid.source_image?.content?.trim();
  if (!sourceUrl || !isUsableReferenceImageContent(sourceUrl)) {
    return null;
  }

  const provider =
    options?.provider ??
    (typeof requestParams.provider === 'string' ? requestParams.provider : undefined);
  const cleanup = await processStoryboardGridForVideoTask(taskId, merged, { provider });
  syncStoryboardProcessToRequest(requestParams, merged);
  return cleanup;
}

export async function processStoryboardGridForVideoTask(
  taskId: string,
  params: Record<string, unknown>,
  options?: StoryboardProcessOptions,
): Promise<{ tempR2Keys: string[]; bucket: string } | null> {
  const grid = parseStoryboardGridParams(params);
  if (!grid?.enabled) return null;

  if (isStoryboardGridAlreadyApplied(params)) {
    return null;
  }

  const sourceUrl = grid.source_image?.content?.trim();
  if (!sourceUrl) {
    throw new Error('宫格分镜缺少源图');
  }
  if (!isUsableReferenceImageContent(sourceUrl)) {
    throw new Error('宫格分镜源图不可用，请重新上传后提交');
  }

  const { layout, analysis } = await resolveStoryboardLayout(sourceUrl, grid);
  const provider =
    options?.provider ?? (typeof params.provider === 'string' ? params.provider : undefined);
  const splitResult = await splitAndUploadStoryboardCells(taskId, sourceUrl, layout, analysis, {
    provider,
  });
  params.storyboard_prompt = buildStoryboardPromptText(grid.cells, splitResult.gridN);
  return applyStoryboardToVideoParams(params, splitResult, { ...grid, layout });
}
