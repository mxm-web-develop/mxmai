/**
 * Video Task V2：referenceImages 槽位合并 + 扁平化为 Provider 可用的 reference_images / input_reference
 */

import {
  applyFormSchemaDefaults,
  cloneFormSchemaWithReferenceImageEnrichment,
  hydrateGraphImageSlotParamsFromReferenceImage,
  mergeGraphReferenceImageFromFormSlots,
  repairSanitizedReferenceSlots,
} from '../../tasks/graph-reference-slots';
import { ensureTaskUidFromSchema } from '../../tasks/form-param-normalize';
import { extractParallelCount, PARALLEL_COUNT_KEY } from '../../tasks/platform-fields';
import {
  isStoryboardGridEnabled,
  prepareStoryboardGridParams,
  sanitizeStoryboardGridPayload,
  validateStoryboardGridForPrepare,
} from './video-grid-storyboard';

const HERO_FRAME_SLOTS = ['hero_still_images', 'hero_frame_images'] as const;
const REFERENCE_SLOTS = [
  'garment_images',
  'model_images',
  'clothing_images',
  'style_images',
  'environment_images',
] as const;

function extractUrlsFromSlot(value: unknown): string[] {
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

/**
 * 将 hero / 服装 / 模特槽位转为 Seedance image-to-video 可用的首帧与参考图列表。
 * 优先级：hero 上架图首帧 > 其它参考槽（garment/model 等，可选）> 已有 reference_images。
 */
export function flattenVideoReferenceUrlsForProvider(params: Record<string, unknown>): void {
  const p = params as Record<string, unknown>;
  const merged = collectReferenceImageUrlsFromParams(p);
  if (merged.length === 0) return;

  const firstFrame = merged[0];
  p.input_reference = firstFrame;
  p.reference_image_url = firstFrame;
  p.reference_images = merged;
}

function isVideoReferenceOptional(
  formSchema?: { properties?: Record<string, unknown>; [key: string]: unknown },
): boolean {
  return formSchema?.['x-video-reference-optional'] === true;
}

function collectReferenceImageUrlsFromParams(params: Record<string, unknown>): string[] {
  const heroUrls: string[] = [];
  for (const key of HERO_FRAME_SLOTS) {
    heroUrls.push(...extractUrlsFromSlot(params[key]));
  }
  const refUrls: string[] = [];
  for (const key of REFERENCE_SLOTS) {
    refUrls.push(...extractUrlsFromSlot(params[key]));
  }
  refUrls.push(...extractUrlsFromSlot(params.reference_images));
  refUrls.push(...extractUrlsFromSlot(params.referenceImage));
  const existing = Array.isArray(params.reference_images)
    ? (params.reference_images as unknown[]).filter(
        (u): u is string => typeof u === 'string' && u.trim().length > 0,
      )
    : [];
  return [...new Set([...heroUrls, ...refUrls, ...existing])];
}

/** platform_preset → ratio，供 Provider 与模板插值 */
function syncVideoPlatformPresetRatio(params: Record<string, unknown>): void {
  const preset = String(params.platform_preset ?? '').trim();
  if (!preset) return;
  const ratioByPreset: Record<string, string> = {
    douyin_9_16: '9:16',
    bilibili_16_9: '16:9',
    youtube_shorts_9_16: '9:16',
    wechat_channels_9_16: '9:16',
    square_1_1: '1:1',
  };
  const ratio = ratioByPreset[preset];
  if (ratio) params.ratio = ratio;
}

/** 自动剪辑管线注入的 fragment 字段补默认 */
function syncVideoEditPipelineFragmentDefaults(params: Record<string, unknown>): void {
  if (params.source !== 'video-edit-pipeline') return;
  if (!params.fragment_role) params.fragment_role = 'broll';
  if (!params.platform_preset && typeof params.ratio === 'string') {
    const ratio = String(params.ratio);
    params.platform_preset =
      ratio === '9:16' ? 'douyin_9_16' : ratio === '1:1' ? 'square_1_1' : 'bilibili_16_9';
  }
}

/** 非宫格模式：至少需一张首帧/参考图（除非 formSchema 声明 x-video-reference-optional） */
export function validateVideoHeroOrStoryboard(
  params: Record<string, unknown>,
  formSchema?: { properties?: Record<string, unknown>; [key: string]: unknown },
): void {
  if (isStoryboardGridEnabled(params)) {
    validateStoryboardGridForPrepare(params);
    return;
  }

  if (collectReferenceImageUrlsFromParams(params).length === 0) {
    if (isVideoReferenceOptional(formSchema)) return;
    throw new Error('请上传首帧上架图，或开启宫格分镜并上传源图');
  }
}

export function prepareVideoTaskParams(
  params: Record<string, unknown>,
  formSchema: { properties?: Record<string, unknown> } | undefined,
  opts?: { taskKey?: string; subtype?: string | null },
): Record<string, unknown> {
  const p = (
    typeof globalThis.structuredClone === 'function'
      ? globalThis.structuredClone(params)
      : (JSON.parse(JSON.stringify(params)) as Record<string, unknown>)
  ) as Record<string, unknown>;

  // video/edit/render（OpenReel 脚本逐 clip 渲染）：不走首帧/宫格校验
  if (p.videoEditScriptJson != null && typeof p.videoEditScriptJson === 'object') {
    if (Object.prototype.hasOwnProperty.call(p, PARALLEL_COUNT_KEY)) {
      p[PARALLEL_COUNT_KEY] = extractParallelCount(p);
    }
    if (formSchema) {
      applyFormSchemaDefaults(p as Record<string, any>, formSchema);
      ensureTaskUidFromSchema(p, formSchema);
    }
    return p;
  }

  if (Object.prototype.hasOwnProperty.call(p, PARALLEL_COUNT_KEY)) {
    p[PARALLEL_COUNT_KEY] = extractParallelCount(p);
  }

  sanitizeStoryboardGridPayload(p);

  syncVideoPlatformPresetRatio(p);
  syncVideoEditPipelineFragmentDefaults(p);

  if (!formSchema) {
    if (isStoryboardGridEnabled(p)) {
      prepareStoryboardGridParams(p);
    } else {
      validateVideoHeroOrStoryboard(p, formSchema);
      flattenVideoReferenceUrlsForProvider(p);
    }
    return p;
  }

  applyFormSchemaDefaults(p as Record<string, any>, formSchema);
  repairSanitizedReferenceSlots(p as Record<string, any>, formSchema);
  mergeGraphReferenceImageFromFormSlots(p as Record<string, any>, formSchema);
  hydrateGraphImageSlotParamsFromReferenceImage(p as Record<string, any>, formSchema);
  mergeGraphReferenceImageFromFormSlots(p as Record<string, any>, formSchema);
  applyFormSchemaDefaults(p as Record<string, any>, formSchema);

  if (isStoryboardGridEnabled(p)) {
    prepareStoryboardGridParams(p);
  } else {
    validateVideoHeroOrStoryboard(p, formSchema);
    flattenVideoReferenceUrlsForProvider(p);
  }
  return p;
}

export function cloneVideoFormSchemaWithReferenceEnrichment(
  formSchema: { properties?: Record<string, unknown> } | undefined,
) {
  return cloneFormSchemaWithReferenceImageEnrichment(formSchema as any);
}
