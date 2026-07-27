import { GRID_SHOOT_LINES } from './grid-shoot-lines';
import { PUBLISHED_OPEN_API_SLUGS as S } from './published-slugs';

/** 与 mxmcgi open-api/root-project-slugs 一致 */
export const PROJECT_ROOT_SLUGS = [
  ...GRID_SHOOT_LINES.map((l) => l.slug),
  S.poster,
  S.clothesVideo,
  S.smartflowSuite,
] as const;

export function isProjectRootSlug(slug: string): boolean {
  return (PROJECT_ROOT_SLUGS as readonly string[]).includes(slug);
}

export function fallbackTitleForSlug(slug: string): string {
  const line = GRID_SHOOT_LINES.find((l) => l.slug === slug);
  if (line) return line.title;
  if (slug === S.poster) return '产品海报';
  if (slug === S.clothesVideo) return '上架图动效';
  if (slug === S.smartflowSuite) return 'Smartflow 全套';
  return slug;
}
