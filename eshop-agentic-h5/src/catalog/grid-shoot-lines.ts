import { PUBLISHED_OPEN_API_SLUGS as S } from './published-slugs';

/** 固定 3×3 宫格 */
export const GRID_OUTPUT_LAYOUT = '3x3' as const;

export const PARALLEL_COUNT_OPTIONS = [1, 2, 3] as const;
export type ParallelCountOption = (typeof PARALLEL_COUNT_OPTIONS)[number];

export type GridShootLineId = 'women' | 'men' | 'kids';

export interface GridShootLine {
  id: GridShootLineId;
  slug: string;
  title: string;
  shortTitle: string;
  tagline: string;
  /** CSS class for card gradient */
  cardClass: string;
  /** Open API params 中商品参考图字段 */
  productField: 'garment_images' | 'product_images';
}

/** 主力机已发布：女装 / 男装 / 童装 */
export const GRID_SHOOT_LINES: GridShootLine[] = [
  {
    id: 'women',
    slug: S.womenOutfits,
    title: '女装上架图',
    shortTitle: '女装',
    tagline: '轮廓垂坠 · 腰线裙长',
    cardClass: 'line-card-women',
    productField: 'garment_images',
  },
  {
    id: 'men',
    slug: S.menOutfits,
    title: '男装上架图',
    shortTitle: '男装',
    tagline: '版型肩线 · 商务休闲',
    cardClass: 'line-card-men',
    productField: 'garment_images',
  },
  {
    id: 'kids',
    slug: S.kidsOutfits,
    title: '童装上架图',
    shortTitle: '童装',
    tagline: '活泼安全 · 亲子场景',
    cardClass: 'line-card-kids',
    productField: 'garment_images',
  },
];

export const GRID_SHOOT_SLUGS = new Set(GRID_SHOOT_LINES.map((l) => l.slug));

export function getGridShootLineBySlug(slug: string): GridShootLine | undefined {
  return GRID_SHOOT_LINES.find((l) => l.slug === slug);
}

export function getGridShootLineById(id: GridShootLineId): GridShootLine | undefined {
  return GRID_SHOOT_LINES.find((l) => l.id === id);
}

export function isGridShootSlug(slug: string): boolean {
  return GRID_SHOOT_SLUGS.has(slug);
}
