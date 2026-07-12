/** 与 mxmcgi reference-media-assets 对齐 */
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

export function normalizeClipReferenceAssets(meta: {
  mxmReferenceAssets?: MxmReferenceAsset[];
  mxmReferenceImages?: string[];
  mxmSourceImageUrl?: string;
}): MxmReferenceAsset[] {
  if (meta.mxmReferenceAssets?.length) {
    return meta.mxmReferenceAssets.filter((a) => a.content?.trim());
  }
  const legacy = (meta.mxmReferenceImages ?? [])
    .map((u) => u.trim())
    .filter(Boolean)
    .map((content) => ({ content, mediaKind: 'image' as const }));
  if (legacy.length) return legacy;
  const single = meta.mxmSourceImageUrl?.trim();
  if (single) return [{ content: single, mediaKind: 'image' }];
  return [];
}

export function resolveVideoModeFromAssets(
  assets: MxmReferenceAsset[],
  explicit?: 'text-to-video' | 'image-to-video' | 'reference-to-video'
): 'text-to-video' | 'image-to-video' | 'reference-to-video' {
  if (explicit && explicit !== 'text-to-video') return explicit;
  const videos = assets.filter(isVideoReferenceAsset);
  const images = assets.filter((a) => !isVideoReferenceAsset(a));
  if (videos.length > 0 || images.length > 1) return 'reference-to-video';
  if (images.length === 1) return 'image-to-video';
  return 'text-to-video';
}

export function canAddReferenceAsset(
  assets: MxmReferenceAsset[],
  mediaKind: 'image' | 'video'
): boolean {
  if (mediaKind === 'video') {
    return assets.filter(isVideoReferenceAsset).length < SEEDANCE_MAX_REFERENCE_VIDEOS;
  }
  return assets.filter((a) => !isVideoReferenceAsset(a)).length < SEEDANCE_MAX_REFERENCE_IMAGES;
}

export function syncLegacyReferenceFields(assets: MxmReferenceAsset[]): {
  mxmReferenceAssets: MxmReferenceAsset[];
  mxmReferenceImages: string[];
  mxmSourceImageUrl?: string;
  mxmVideoMode: ReturnType<typeof resolveVideoModeFromAssets>;
} {
  const imageUrls = assets.filter((a) => !isVideoReferenceAsset(a)).map((a) => a.content);
  const mode = resolveVideoModeFromAssets(assets);
  return {
    mxmReferenceAssets: assets,
    mxmReferenceImages: imageUrls,
    mxmSourceImageUrl: mode === 'image-to-video' && imageUrls.length === 1 ? imageUrls[0] : undefined,
    mxmVideoMode: mode,
  };
}
