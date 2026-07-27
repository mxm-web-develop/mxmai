/**
 * H5 catalog slug 与主力机 Admin「开放 API 发布」一致。
 * @see http://121.43.32.168 账号中心 → API 发布
 */
export const PUBLISHED_OPEN_API_SLUGS = {
  womenOutfits: 'eshop-womenoutfits',
  menOutfits: 'eshop-manoutfits',
  kidsOutfits: 'eshop-childoutfits',
  poster: 'eshop-post',
  toolsHd: 'tools-hd',
  /** video/commercial/eshop-i2v · 上架图动效短片 */
  clothesVideo: 'eshop-vedio',
  /** Smartflow · eshop-clothes-batch-v1 */
  smartflowSuite: 'eshop-solution',
} as const;

export type PublishedOpenApiSlug =
  (typeof PUBLISHED_OPEN_API_SLUGS)[keyof typeof PUBLISHED_OPEN_API_SLUGS];

export const PUBLISHED_SLUG_SET = new Set<string>(Object.values(PUBLISHED_OPEN_API_SLUGS));

export function isPublishedSlug(slug: string): slug is PublishedOpenApiSlug {
  return PUBLISHED_SLUG_SET.has(slug);
}
