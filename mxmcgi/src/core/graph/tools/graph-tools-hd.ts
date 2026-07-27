/**
 * Graph 工具 · 高清放大（tools/hd）
 * - 单图或宫格图（最大 4×4）；宫格规格必须由调用方传入 grid_layout（2x2 / 3x3 / 4x4），服务端不偷偷调 LLM 识格
 * - 裁格后使用路由图生模型放大（强约束 prompt，尽量保持原图）
 */

import sharp from 'sharp';
import { runByModelKey } from '../../../models/run';
import { resolveGraphModel } from '../graph-model-routing';
import type { ProviderType } from '../../providers/types';
import { splitGridLayoutImage } from '../../utils/grid-layout-splitter';
import { compressImage, isBase64 } from '../reference-image';
import { loadImageContentForHd } from './graph-tools-hd-image-io';
import { isSanitizedReferencePlaceholder } from '../../../task/reference-image';
import { graphTaskMediaProxyPath } from '../../../task/media-proxy-url';

export const GRAPH_TOOLS_HD_TASK_KEY = 'tools';
export const GRAPH_TOOLS_HD_SUBTYPE = 'hd';

export const HD_DEFAULT_MODEL = 'nano-banana-2';
const GRID_LAYOUTS = new Set(['2x2', '3x3', '4x4']);
const ASPECT_RATIO_OPTIONS = new Set(['1:1', '3:4', '4:3', '16:9', '9:16']);

export const HD_PRESERVE_UPSCALE_PROMPT = `Upscale this image to maximum resolution (4K). STRICT preservation mode:
- Do NOT change background, subject, pose, clothing, facial features, colors, lighting, or composition.
- Do NOT add, remove, or redraw any element. No stylization, no beautification, no reposing.
- Only increase sharpness and pixel resolution; output must look like the same photograph, only higher resolution.`;

/** 宫格单格放大：禁止补全邻格、缝线与裁切边缘外的内容 */
export const HD_GRID_CELL_ISOLATION_PROMPT = `GRID CELL ISOLATION (critical — read first):
- The input is ONE panel only, extracted from a multi-panel contact sheet. The image edges are HARD boundaries, not suggestions to expand.
- ERASE and do NOT output: white/gray grid gutters, divider lines, collage seams, or any partial content from neighboring panels (no extra hats, faces, hands, text blocks, or UI slices at top/bottom/left/right).
- Do NOT complete, extend, or hallucinate objects that are cut off at any edge. If something at the bottom looks like a sliver of another panel, remove it and continue only the local background of THIS panel.
- Do NOT widen the canvas or reveal adjacent cells. Output one seamless single-panel image that fills the frame with no multi-panel layout.
- Keep only what belongs to this panel’s subject and background; match edge background color/texture if edge artifacts remain.`;

/** 裁格后内缩，去掉均匀切分带来的白缝与邻格残影（比例 × 最小像素） */
const GRID_CELL_TRIM_INSET_RATIO = 0.02;
const GRID_CELL_TRIM_INSET_MIN_PX = 4;

export function isGraphToolsHdBusiness(graphTaskKey: string, subtype: string | null | undefined): boolean {
  return (
    String(graphTaskKey).trim() === GRAPH_TOOLS_HD_TASK_KEY &&
    String(subtype ?? '').trim() === GRAPH_TOOLS_HD_SUBTYPE
  );
}

/** 解析宫格规格，如 2x2 → 2 */
export function parseGridLayoutN(layout: string): number {
  const m = String(layout || '')
    .trim()
    .toLowerCase()
    .match(/^(\d)\s*x\s*(\d)$/);
  if (!m) {
    throw new Error(`无效的宫格规格: ${layout}，支持 2x2、3x3、4x4`);
  }
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a < 2 || a > 4 || a !== b) {
    throw new Error(`无效的宫格规格: ${layout}，仅支持 2x2、3x3、4x4`);
  }
  return a;
}

/** 解析格位「行-列」（1 起算），返回 0-based 下标（行优先） */
export function parseGridCellIndex(gridN: number, gridCell: string): number {
  const m = String(gridCell || '')
    .trim()
    .match(/^(\d+)\s*-\s*(\d+)$/);
  if (!m) {
    throw new Error(`无效的格位: ${gridCell}，请使用「行-列」格式，如 1-1、2-3`);
  }
  const row = Number(m[1]);
  const col = Number(m[2]);
  if (!Number.isFinite(row) || !Number.isFinite(col) || row < 1 || col < 1) {
    throw new Error(`无效的格位: ${gridCell}`);
  }
  if (row > gridN || col > gridN) {
    throw new Error(`格位 ${gridCell} 超出 ${gridN}×${gridN} 宫格范围`);
  }
  return (row - 1) * gridN + (col - 1);
}

function pickFirstImageContentFromSlot(params: Record<string, unknown>): string | null {
  const slot = params.source_images;
  if (Array.isArray(slot) && slot.length > 0) {
    const first = slot[0];
    if (first && typeof first === 'object' && typeof (first as { content?: unknown }).content === 'string') {
      const c = String((first as { content: string }).content).trim();
      if (c) return c;
    }
  }
  const ref = params.referenceImage;
  if (Array.isArray(ref) && ref.length > 0) {
    const first = ref[0];
    if (first && typeof first === 'object' && typeof (first as { content?: unknown }).content === 'string') {
      const c = String((first as { content: string }).content).trim();
      if (c) return c;
    }
  }
  if (typeof ref === 'string' && ref.trim()) return ref.trim();
  return null;
}

/** Worker 从 DB 读到的 params 可能已被 sanitize；可回退 source_graph_task_id 拉原任务成片 */
function resolveHdSourceImageContent(params: Record<string, unknown>): string {
  const inner =
    params.params && typeof params.params === 'object' && !Array.isArray(params.params)
      ? (params.params as Record<string, unknown>)
      : null;
  const flat = inner ? { ...inner, ...params } : params;

  const raw = pickFirstImageContentFromSlot(flat);
  if (raw && !isSanitizedReferencePlaceholder(raw)) return raw;

  const parentTaskId = String(
    params.source_graph_task_id ?? flat.source_graph_task_id ?? ''
  ).trim();
  if (parentTaskId) {
    return graphTaskMediaProxyPath(parentTaskId);
  }

  if (raw && isSanitizedReferencePlaceholder(raw)) {
    throw new Error(
      '宫格源图不可用（任务参数中的图片数据已被过滤）。请重新提交 HD，或确保请求携带 source_graph_task_id 指向原 Graph 任务。'
    );
  }
  throw new Error('请上传待放大的图片（source_images）');
}

async function readImageBuffer(imageContent: string): Promise<Buffer> {
  return loadImageContentForHd(imageContent);
}

/** 从像素尺寸推断最接近的标准画幅 */
export function inferAspectRatioLabel(width: number, height: number): string {
  if (!width || !height) return '1:1';
  const r = width / height;
  const candidates: Array<{ label: string; ratio: number }> = [
    { label: '1:1', ratio: 1 },
    { label: '3:4', ratio: 3 / 4 },
    { label: '4:3', ratio: 4 / 3 },
    { label: '16:9', ratio: 16 / 9 },
    { label: '9:16', ratio: 9 / 16 },
  ];
  let best = candidates[0];
  let bestDiff = Math.abs(r - best.ratio);
  for (const c of candidates.slice(1)) {
    const d = Math.abs(r - c.ratio);
    if (d < bestDiff) {
      best = c;
      bestDiff = d;
    }
  }
  return best.label;
}

export function buildHdUpscalePrompt(aspectRatioRequested?: string, isGrid = false): string {
  const lines = isGrid
    ? [HD_GRID_CELL_ISOLATION_PROMPT, HD_PRESERVE_UPSCALE_PROMPT]
    : [HD_PRESERVE_UPSCALE_PROMPT];
  if (aspectRatioRequested) {
    lines.push(`Output aspect ratio: ${aspectRatioRequested}.`);
  }
  return lines.join('\n\n');
}

/** 宫格裁切后内缩，减少分割线/邻格条带进入生图 */
export async function trimGridCellGutters(
  imageContent: string,
  opts?: { insetRatio?: number; insetMinPx?: number }
): Promise<string> {
  const ratio = opts?.insetRatio ?? GRID_CELL_TRIM_INSET_RATIO;
  const minPx = opts?.insetMinPx ?? GRID_CELL_TRIM_INSET_MIN_PX;
  const buf = await readImageBuffer(imageContent);
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w < 8 || h < 8) return imageContent;

  const insetX = Math.max(minPx, Math.floor(w * ratio));
  const insetY = Math.max(minPx, Math.floor(h * ratio));
  const left = insetX;
  const top = insetY;
  const width = w - 2 * insetX;
  const height = h - 2 * insetY;
  if (width < 4 || height < 4) return imageContent;

  const format = meta.format === 'png' ? 'png' : 'jpeg';
  const out = await sharp(buf)
    .extract({ left, top, width, height })
    .toFormat(format, { quality: format === 'png' ? undefined : 92 })
    .toBuffer();
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${out.toString('base64')}`;
}

export interface GraphToolsHdPrepareResult {
  inputImage: string;
  metadata: {
    isGrid: boolean;
    gridLayout?: string;
    gridCell?: string;
    gridN?: number;
    cellIndex?: number;
    aspectRatioRequested?: string;
    aspectRatioDetected?: string;
    originalSize?: { width: number; height: number };
  };
}

/** 裁格（若需要；宫格须带 grid_layout）并得到待放大的一张图 */
export async function prepareGraphToolsHdInput(
  params: Record<string, unknown>
): Promise<GraphToolsHdPrepareResult> {
  const rawContent = resolveHdSourceImageContent(params);
  let workingContent = rawContent;

  const isGrid = params.is_grid === true || params.is_grid === 'true';
  let gridLayout: string | undefined;
  let gridCell: string | undefined;
  let gridN: number | undefined;
  let cellIndex: number | undefined;

  if (isGrid) {
    gridCell = String(params.grid_cell ?? '').trim();
    if (!gridCell) {
      throw new Error('宫格图须填写要放大的格位（行-列，如 1-1）');
    }

    const inner =
      params.params && typeof params.params === 'object' && !Array.isArray(params.params)
        ? (params.params as Record<string, unknown>)
        : null;
    let layout = String(
      params.grid_layout ?? inner?.grid_layout ?? params.output_grid ?? inner?.output_grid ?? ''
    )
      .trim()
      .toLowerCase();
    if (!layout || !GRID_LAYOUTS.has(layout)) {
      layout = '3x3';
      console.warn(
        '[GraphToolsHd] 宫格模式未传有效 grid_layout，已回退默认 3x3。请在业务表单填写「宫格规格」或传入与生图一致的 output_grid。'
      );
    }
    gridLayout = layout;

    gridN = parseGridLayoutN(gridLayout);
    cellIndex = parseGridCellIndex(gridN, gridCell);
    const split = await splitGridLayoutImage(rawContent, gridN);
    if (cellIndex >= split.images.length) {
      throw new Error(`格位 ${gridCell} 超出裁切结果数量 ${split.images.length}`);
    }
    workingContent = split.images[cellIndex];
    workingContent = await trimGridCellGutters(workingContent);
  } else if (params.grid_cell && String(params.grid_cell).trim()) {
    // 调用方已传格位但未开 is_grid：视为单格成片直放，避免误把单格图再当联系表切分
    console.warn(
      `[GraphToolsHd] 收到 grid_cell=${String(params.grid_cell).trim()} 但 is_grid=false，按单张放大处理`
    );
  }

  const buf = await readImageBuffer(workingContent);
  const meta = await sharp(buf).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const detected = inferAspectRatioLabel(width, height);

  const aspectRaw = params.aspect_ratio;
  const aspectRequested =
    typeof aspectRaw === 'string' && aspectRaw.trim() && ASPECT_RATIO_OPTIONS.has(aspectRaw.trim())
      ? aspectRaw.trim()
      : undefined;

  return {
    inputImage: workingContent,
    metadata: {
      isGrid,
      gridLayout,
      gridCell,
      gridN,
      cellIndex,
      aspectRatioRequested: aspectRequested,
      aspectRatioDetected: detected,
      originalSize: width && height ? { width, height } : undefined,
    },
  };
}

export interface GraphToolsHdResult {
  image_urls: string[];
  modelName: string;
  deerapiImagePrompt: string;
  hdMetadata: GraphToolsHdPrepareResult['metadata'] & {
    imageSize?: string;
  };
}

function resolveHdImageSize(): '1K' | '2K' | '4K' {
  const raw = String(process.env.MXMCGI_HD_IMAGE_SIZE ?? '4K')
    .trim()
    .toUpperCase();
  if (raw === '1K' || raw === '2K' || raw === '4K') return raw;
  return '4K';
}

/** 缩小参考图体积，降低 Deer 网关 502 / 超时（输出仍可按 image_size 拉高） */
async function prepareImageForHdUpscale(imageContent: string): Promise<string> {
  if (!isBase64(imageContent)) return imageContent;
  const compressed = await compressImage(imageContent, 2, 2048, 2048, 88);
  if (compressed.wasCompressed) {
    console.log(
      `[GraphToolsHd] 参考图已压缩: ${compressed.originalSizeKB.toFixed(0)}KB → ${compressed.compressedSizeKB.toFixed(0)}KB`
    );
  }
  return compressed.compressed;
}

function isNanoBananaHdModel(modelName: string): boolean {
  return (
    modelName === 'nano-banana-2' ||
    modelName === 'nano-banana-2-pro' ||
    modelName === 'nano-banana' ||
    modelName === 'nano-banana-pro'
  );
}

/**
 * 高清放大：nano-banana-2 + 参考图 + 强约束 prompt
 */
export async function executeGraphToolsHd(
  params: Record<string, unknown>,
  provider?: ProviderType
): Promise<GraphToolsHdResult> {
  const { modelName, provider: resolvedProvider } = await resolveGraphModel(
    GRAPH_TOOLS_HD_TASK_KEY,
    GRAPH_TOOLS_HD_SUBTYPE,
    provider
  );

  if (!isNanoBananaHdModel(modelName)) {
    console.warn(`[GraphToolsHd] 路由模型为 ${modelName}，建议使用 ${HD_DEFAULT_MODEL}`);
  }

  const prepared = await prepareGraphToolsHdInput(params);

  const aspectForPrompt =
    prepared.metadata.aspectRatioRequested ?? prepared.metadata.aspectRatioDetected;
  const prompt = buildHdUpscalePrompt(
    prepared.metadata.aspectRatioRequested ?? undefined,
    prepared.metadata.isGrid
  );

  const imageSize = resolveHdImageSize();
  const imageForModel = await prepareImageForHdUpscale(prepared.inputImage);
  if (!String(imageForModel ?? '').trim()) {
    throw new Error('高清放大缺少裁切后的参考图，请检查宫格源图与 grid_layout / grid_cell');
  }

  const parameters: Record<string, unknown> = {
    image: imageForModel,
    images: [imageForModel],
    image_size: imageSize,
    num_images: 1,
  };

  if (prepared.metadata.aspectRatioRequested) {
    parameters.aspect_ratio = prepared.metadata.aspectRatioRequested;
  } else if (aspectForPrompt && ASPECT_RATIO_OPTIONS.has(aspectForPrompt)) {
    parameters.aspect_ratio = aspectForPrompt;
  }

  const result = (await runByModelKey('graph', modelName, {
    prompt,
    parameters,
  } as { prompt: string; parameters: Record<string, unknown> }, {
    providerOverride: resolvedProvider,
  })) as { image_urls?: string[]; mediaUrls?: string[] };

  const urls = result.image_urls ?? result.mediaUrls ?? [];
  if (!urls.length) {
    throw new Error('高清放大未返回图片 URL');
  }

  return {
    image_urls: urls,
    modelName,
    deerapiImagePrompt: prompt,
    hdMetadata: {
      ...prepared.metadata,
      imageSize,
    },
  };
}
