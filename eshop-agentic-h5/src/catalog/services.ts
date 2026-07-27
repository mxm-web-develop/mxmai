import type { ServiceSummary } from '@/adapters/types';
import { GRID_SHOOT_LINES } from './grid-shoot-lines';
import { PUBLISHED_OPEN_API_SLUGS as S } from './published-slugs';

/** H5 主流程：四条 3×3 宫格商拍线 */
export const ESHOP_SERVICES: ServiceSummary[] = [
  ...GRID_SHOOT_LINES.map((line): ServiceSummary => ({
    slug: line.slug,
    title: line.title,
    description: line.tagline,
    kind: 'task_v2',
    category: 'shoot',
    coverImage: '/demo-results/sample-1.png',
    tags: [line.shortTitle, '3×3宫格'],
    roleHints: ['photographer', 'operator'],
    clothesLine:
      line.id === 'women'
        ? 'women'
        : line.id === 'men'
          ? 'men'
          : line.id === 'kids'
            ? 'kids'
            : undefined,
  })),
  {
    slug: S.toolsHd,
    title: '高清放大',
    description: 'graph/tools/hd',
    kind: 'task_v2',
    category: 'tools',
    coverImage: '/demo-results/sample-2.png',
    tags: ['高清', '宫格'],
    roleHints: ['operator'],
    hiddenFromList: true,
  },
];

export const CLOTHES_LINE_SLUGS = new Set(
  ESHOP_SERVICES.filter((s) => s.clothesLine).map((s) => s.slug)
);

export function getServiceBySlug(slug: string): ServiceSummary | undefined {
  return ESHOP_SERVICES.find((s) => s.slug === slug);
}

export function listPublicServices(): ServiceSummary[] {
  return ESHOP_SERVICES.filter((s) => !s.hiddenFromList && !s.comingSoon);
}
