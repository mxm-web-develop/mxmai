export const STOCK_IMAGE_SOURCE_LABEL: Record<string, string> = {
  pexels: 'Pexels',
  unsplash: 'Unsplash',
  pixabay: 'Pixabay',
  openverse: 'Openverse',
  mixed: '混合图库',
};

export const DEFAULT_STOCK_IMAGE_ATTRIBUTION =
  '聚合 Pexels、Unsplash、Pixabay、Openverse 等免费图库，按关键词混合展示高质量结果。';

export function stockImageSourceLabel(provider?: string): string {
  if (!provider) return '图库';
  return STOCK_IMAGE_SOURCE_LABEL[provider] ?? provider;
}

export function stockImageLicenseUrl(provider?: string): string {
  switch (provider) {
    case 'unsplash':
      return 'https://unsplash.com/license';
    case 'pixabay':
      return 'https://pixabay.com/service/license/';
    case 'openverse':
      return 'https://openverse.org';
    case 'pexels':
      return 'https://www.pexels.com/license/';
    default:
      return 'https://www.pexels.com/license/';
  }
}
