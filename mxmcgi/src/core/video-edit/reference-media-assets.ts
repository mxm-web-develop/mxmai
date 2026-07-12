import type { MxmClipMetadata } from './types';

/** Seedance reference-to-video 单条参考素材（与动态表单 reference_images items 对齐） */
export type MxmReferenceAsset = {
  content: string;
  purpose?: string;
  type?: string;
  mediaKind?: 'image' | 'video';
};

export const SEEDANCE_MAX_REFERENCE_IMAGES = 9;
export const SEEDANCE_MAX_REFERENCE_VIDEOS = 3;

export function isVideoReferenceAsset(asset: MxmReferenceAsset): boolean {
  return asset.mediaKind === 'video';
}

/** 从 clip metadata 归一化参考素材列表（兼容旧 mxmReferenceImages / mxmSourceImageUrl） */
export function normalizeReferenceAssets(meta: MxmClipMetadata): MxmReferenceAsset[] {
  if (Array.isArray(meta.mxmReferenceAssets) && meta.mxmReferenceAssets.length > 0) {
    return meta.mxmReferenceAssets
      .map((row) => ({
        content: String(row.content ?? '').trim(),
        purpose: typeof row.purpose === 'string' ? row.purpose : undefined,
        type: typeof row.type === 'string' ? row.type : undefined,
        mediaKind: row.mediaKind === 'video' ? 'video' : 'image',
      }))
      .filter((row) => row.content.length > 0);
  }

  const legacyImages = (meta.mxmReferenceImages ?? [])
    .map((u) => String(u).trim())
    .filter(Boolean)
    .map((content) => ({ content, mediaKind: 'image' as const }));

  if (legacyImages.length > 0) return legacyImages;

  const single = meta.mxmSourceImageUrl?.trim();
  if (single) return [{ content: single, mediaKind: 'image' }];
  return [];
}

export function resolveVideoModeFromReferenceAssets(
  assets: MxmReferenceAsset[],
  explicit?: MxmClipMetadata['mxmVideoMode']
): NonNullable<MxmClipMetadata['mxmVideoMode']> {
  if (explicit && explicit !== 'text-to-video') return explicit;
  const videos = assets.filter(isVideoReferenceAsset);
  const images = assets.filter((a) => !isVideoReferenceAsset(a));
  if (videos.length > 0 || images.length > 1) return 'reference-to-video';
  if (images.length === 1) return 'image-to-video';
  return 'text-to-video';
}

export function buildReferencePurposeSuffix(assets: MxmReferenceAsset[]): string {
  const lines = assets
    .map((a, i) => {
      const note = a.purpose?.trim();
      if (!note) return '';
      const kind = isVideoReferenceAsset(a) ? 'video' : 'image';
      return `Ref${i + 1} (${kind}): ${note}`;
    })
    .filter(Boolean);
  return lines.join('; ');
}

/** 映射为 Task V2 / Seedance 表单 params */
export function mapReferenceAssetsToVideoParams(
  assets: MxmReferenceAsset[]
): {
  reference_images: Array<string | MxmReferenceAsset>;
  reference_videos: string[];
} {
  const images = assets.filter((a) => !isVideoReferenceAsset(a)).slice(0, SEEDANCE_MAX_REFERENCE_IMAGES);
  const videos = assets.filter(isVideoReferenceAsset).slice(0, SEEDANCE_MAX_REFERENCE_VIDEOS).map((a) => a.content);

  const reference_images = images.map((a) =>
    a.purpose?.trim() || a.type?.trim()
      ? {
          content: a.content,
          type: a.type ?? 'main-subject',
          purpose: a.purpose,
        }
      : a.content
  );

  return { reference_images, reference_videos: videos };
}
