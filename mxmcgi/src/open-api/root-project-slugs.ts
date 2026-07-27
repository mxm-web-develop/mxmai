/**
 * Partner H5「项目根」slug 白名单（与 eshop-agentic-h5 catalog 一致）
 * 列表 sync 时 rootOnly=true 仅返回这些 slug，排除 tools-hd 等附属任务。
 */
export const OPEN_API_ROOT_PROJECT_SLUGS = [
  'eshop-womenoutfits',
  'eshop-manoutfits',
  'eshop-childoutfits',
  'eshop-post',
  'eshop-vedio',
  'eshop-solution',
] as const;

export function isOpenApiRootProjectSlug(slug: string): boolean {
  return (OPEN_API_ROOT_PROJECT_SLUGS as readonly string[]).includes(slug);
}
