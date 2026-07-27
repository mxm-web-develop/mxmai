/**
 * AtlasCloud Seedance 2.0 系列：同一物理模型族，按入参切换三种 upstream endpoint。
 *
 * 标准版：
 * - bytedance/seedance-2.0/text-to-video
 * - bytedance/seedance-2.0/image-to-video
 * - bytedance/seedance-2.0/reference-to-video
 *
 * Mini 经济版（约半价）：
 * - bytedance/seedance-2.0-mini/text-to-video
 * - bytedance/seedance-2.0-mini/image-to-video
 * - bytedance/seedance-2.0-mini/reference-to-video
 *
 * Admin 建议 upstream_model 填基座（如 `bytedance/seedance-2.0` 或 `bytedance/seedance-2.0-mini`），
 * 或任意一种带后缀的完整路径；运行时由本模块根据表单/参考素材自动选择具体接口。
 *
 * @see https://www.atlascloud.ai/models/bytedance/seedance-2.0/image-to-video?tab=api
 * @see https://www.atlascloud.ai/models/bytedance/seedance-2.0-mini/image-to-video?tab=api
 */

export type SeedanceVideoMode = 'text-to-video' | 'image-to-video' | 'reference-to-video';

/** 匹配 seedance-2.0 / seedance-2.0-mini / seedance-2.0-fast 等变体 */
const SEEDANCE_UPSTREAM_RE = /seedance-2\.0(?:-(?:mini|fast))?/i;
const SEEDANCE_SUFFIX_RE = /\/(text-to-video|image-to-video|reference-to-video)$/i;

export function isSeedance20Upstream(upstreamModel: string): boolean {
  return SEEDANCE_UPSTREAM_RE.test(String(upstreamModel || ''));
}

export function normalizeSeedanceBaseUpstream(upstreamModel: string): string {
  const s = String(upstreamModel || '').trim();
  if (!s) return s;
  return s.replace(SEEDANCE_SUFFIX_RE, '');
}

export function buildSeedanceUpstreamModel(
  upstreamModel: string,
  mode: SeedanceVideoMode,
): string {
  const base = normalizeSeedanceBaseUpstream(upstreamModel);
  if (!base) return upstreamModel;
  return `${base}/${mode}`;
}

export type SeedanceModeInput = {
  prompt?: string;
  videoSubtype?: string;
  video_mode?: string;
  atlas_video_mode?: string;
  seedance_mode?: string;
  input_reference?: string;
  reference_image_url?: string;
  last_frame?: string;
  last_frame_image?: string;
  reference_images?: string[];
  input_references?: unknown[];
  reference_videos?: unknown[];
  reference_audios?: unknown[];
  image?: string;
  images?: string[];
  [key: string]: unknown;
};

/** 从 subtype / 显式 mode 推断（业务可配置 shot-i2v / shot-r2v） */
export function inferSeedanceModeFromSubtype(subtype?: string): SeedanceVideoMode | undefined {
  const s = String(subtype ?? '')
    .trim()
    .toLowerCase();
  if (!s) return undefined;
  if (s.includes('r2v') || s.includes('ref') || s.includes('reference')) {
    return 'reference-to-video';
  }
  if (s.includes('i2v') || s.includes('img') || s.includes('image')) {
    return 'image-to-video';
  }
  if (s.includes('t2v') || s === 'default' || s.includes('text')) {
    return 'text-to-video';
  }
  return undefined;
}

function parseExplicitMode(raw: unknown): SeedanceVideoMode | undefined {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!s) return undefined;
  if (s === 'text-to-video' || s === 't2v' || s === 'text') return 'text-to-video';
  if (s === 'image-to-video' || s === 'i2v' || s === 'image') return 'image-to-video';
  if (s === 'reference-to-video' || s === 'r2v' || s === 'reference') {
    return 'reference-to-video';
  }
  return undefined;
}

function collectReferenceImageUrls(input: SeedanceModeInput): string[] {
  const urls: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) urls.push(v.trim());
  };
  push(input.input_reference);
  push(input.reference_image_url);
  push(input.image);
  if (Array.isArray(input.reference_images)) {
    for (const u of input.reference_images) push(u);
  }
  if (Array.isArray(input.images)) {
    for (const u of input.images) push(u);
  }
  return [...new Set(urls)];
}

function hasMultimodalReferences(input: SeedanceModeInput): boolean {
  const refs = input.input_references;
  if (Array.isArray(refs) && refs.length > 0) return true;
  if (Array.isArray(input.reference_videos) && input.reference_videos.length > 0) return true;
  if (Array.isArray(input.reference_audios) && input.reference_audios.length > 0) return true;
  return collectReferenceImageUrls(input).length > 1;
}

/**
 * 根据表单入参决定 Seedance 2.0 子接口（单物理模型 → 多 endpoint）。
 */
export function resolveSeedanceVideoMode(input: SeedanceModeInput): SeedanceVideoMode {
  const explicit =
    parseExplicitMode(input.video_mode) ??
    parseExplicitMode(input.atlas_video_mode) ??
    parseExplicitMode(input.seedance_mode);
  if (explicit) return explicit;

  const fromSubtype = inferSeedanceModeFromSubtype(input.videoSubtype);
  if (fromSubtype) return fromSubtype;

  if (hasMultimodalReferences(input)) return 'reference-to-video';

  const refUrls = collectReferenceImageUrls(input);
  if (refUrls.length >= 1) return 'image-to-video';

  return 'text-to-video';
}

/**
 * 将通用表单字段映射为 Atlas generateVideo 请求体（Seedance 专用字段名）。
 */
export function buildSeedanceVideoRequestBody(
  upstreamModel: string,
  mode: SeedanceVideoMode,
  flat: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: buildSeedanceUpstreamModel(upstreamModel, mode),
    ...flat,
  };

  const refUrls = collectReferenceImageUrls(flat as SeedanceModeInput);
  const lastFrame =
    (typeof flat.last_frame === 'string' && flat.last_frame) ||
    (typeof flat.last_frame_image === 'string' && flat.last_frame_image) ||
    (refUrls.length > 1 ? refUrls[1] : undefined);

  if (mode === 'text-to-video') {
    delete body.image;
    delete body.images;
    delete body.input_reference;
    delete body.reference_images;
    delete body.input_references;
    delete body.reference_videos;
    delete body.reference_audios;
    delete body.last_frame;
    delete body.last_frame_image;
    return body;
  }

  if (mode === 'image-to-video') {
    const first = refUrls[0];
    if (first) {
      body.image = first;
      body.input_reference = first;
    }
    if (lastFrame) {
      body.last_frame = lastFrame;
      body.last_frame_image = lastFrame;
    }
    delete body.reference_images;
    delete body.input_references;
    delete body.reference_videos;
    delete body.reference_audios;
    return body;
  }

  // reference-to-video：保留多模态参考；Atlas 文档支持多图/视频/音频
  if (refUrls.length > 0 && !Array.isArray(body.reference_images)) {
    body.reference_images = refUrls;
  }
  if (refUrls[0] && body.input_reference == null) {
    body.input_reference = refUrls[0];
  }
  if (lastFrame) {
    body.last_frame = lastFrame;
    body.last_frame_image = lastFrame;
  }
  return body;
}
