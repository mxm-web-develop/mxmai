import { PUBLISHED_OPEN_API_SLUGS as S } from './published-slugs';
import {
  GRID_SHOOT_LINES,
  type GridShootLine,
  type GridShootLineId,
} from './grid-shoot-lines';

export type CreativeGroupId = 'shoot' | 'design' | 'video';

export interface CreativeGroup {
  id: CreativeGroupId;
  title: string;
  subtitle: string;
}

export const CREATIVE_GROUPS: CreativeGroup[] = [
  { id: 'shoot', title: '摄影', subtitle: '3×3 商拍宫格 · 多角度上架图' },
  { id: 'design', title: '设计', subtitle: '电商海报与主视觉' },
  { id: 'video', title: '视频', subtitle: '模特展示 · 动效成片' },
];

/** 顶部 Smartflow 一键入口（eshop-solution） */
export const SMARTFLOW_SUITE_OFFERING = {
  slug: S.smartflowSuite,
  title: '电商服装批量上架',
  tagline: 'Smartflow · 模特参考 + 多款服装并行商拍',
  href: `/create/${S.smartflowSuite}`,
} as const;

export type ShootOffering = GridShootLine & {
  group: 'shoot';
  href: string;
};

export interface TaskOffering {
  group: 'design' | 'video';
  id: string;
  slug: string;
  title: string;
  tagline: string;
  cardClass: string;
  href: string;
}

export const DESIGN_OFFERINGS: TaskOffering[] = [
  {
    group: 'design',
    id: 'poster',
    slug: S.poster,
    title: '产品宣传海报',
    tagline: '主视觉 · 促销上屏 · 品牌调性',
    cardClass: 'line-card-poster',
    href: `/create/${S.poster}`,
  },
];

/** 视频 · eshop-vedio（上架图动效短片） */
export const VIDEO_OFFERINGS: TaskOffering[] = [
  {
    group: 'video',
    id: 'model-show',
    slug: S.clothesVideo,
    title: '上架图动效短片',
    tagline: '首帧商拍 · 运镜预设 · 9:16 成片',
    cardClass: 'line-card-video',
    href: `/create/${S.clothesVideo}`,
  },
];

export const SHOOT_OFFERINGS: ShootOffering[] = GRID_SHOOT_LINES.map((line) => ({
  ...line,
  group: 'shoot' as const,
  href: `/start/shoot/${line.id}`,
}));

export function getShootOfferingByLineId(id: string): ShootOffering | undefined {
  return SHOOT_OFFERINGS.find((l) => l.id === id);
}

export function isGridShootLineId(id: string): id is GridShootLineId {
  return SHOOT_OFFERINGS.some((l) => l.id === id);
}

export function getCreativeGroupsWithOfferings(): CreativeGroup[] {
  return CREATIVE_GROUPS.filter((g) => {
    if (g.id === 'shoot') return SHOOT_OFFERINGS.length > 0;
    if (g.id === 'design') return DESIGN_OFFERINGS.length > 0;
    if (g.id === 'video') return VIDEO_OFFERINGS.length > 0;
    return false;
  });
}
