import type { DocumentRenderAsset } from './types';

type ReferenceImageItem = {
  content?: string;
  type?: string;
  purpose?: string;
};

function normalizeImageUrl(content: unknown): string | undefined {
  if (typeof content !== 'string') return undefined;
  const trimmed = content.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

/** 将表单 referenceImages 字段解析为 render assets */
export function resolveRenderAssetsFromFormFields(
  fields: Record<string, unknown>
): DocumentRenderAsset[] {
  const assets: DocumentRenderAsset[] = [];

  const profilePhoto = fields.profile_photo ?? fields.profilePhoto;
  if (Array.isArray(profilePhoto) && profilePhoto.length > 0) {
    const first = profilePhoto[0] as ReferenceImageItem;
    const url = normalizeImageUrl(first?.content);
    if (url) {
      assets.push({ id: 'profile_photo', url, role: 'profile' });
    }
  }

  const genericImages = fields.images;
  if (Array.isArray(genericImages)) {
    genericImages.forEach((item, index) => {
      const ref = item as ReferenceImageItem;
      const url = normalizeImageUrl(ref?.content);
      if (!url) return;
      const roleRaw = typeof ref.type === 'string' ? ref.type : 'other';
      const role =
        roleRaw === 'main-subject' || roleRaw === 'profile'
          ? 'profile'
          : roleRaw === 'background'
            ? 'background'
            : roleRaw === 'style-reference'
              ? 'cover'
              : 'other';
      assets.push({
        id: `image_${index}`,
        url,
        role: role as DocumentRenderAsset['role'],
      });
    });
  }

  return assets;
}

/** 合并 LLM spec assets 与表单解析 assets（表单 URL 优先） */
export function mergeRenderAssets(
  specAssets: DocumentRenderAsset[] | undefined,
  formAssets: DocumentRenderAsset[]
): DocumentRenderAsset[] {
  const byId = new Map<string, DocumentRenderAsset>();
  for (const asset of specAssets ?? []) {
    if (asset?.id) byId.set(asset.id, { ...asset });
  }
  for (const asset of formAssets) {
    byId.set(asset.id, { ...byId.get(asset.id), ...asset });
  }
  return [...byId.values()];
}
