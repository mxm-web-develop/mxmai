export const RESERVED_PUBLISHED_API_SLUGS = new Set([
  'admin',
  'system',
  'health',
  'api',
  'account',
  'open',
  'v1',
  'v2',
  'tasks',
  'smartflows',
  'smartflow',
  'smartflow-tasks',
  'cgi',
  'media',
  'upload',
  'search',
  'agents',
  'characters',
  'writing',
  'auth',
  'login',
  'register',
]);

const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;

export function normalizePublishedApiSlug(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

export function validatePublishedApiSlug(slug: string): string | null {
  const s = normalizePublishedApiSlug(slug);
  if (!SLUG_RE.test(s)) {
    return 'slug 须为小写字母/数字/连字符，3–64 字符，且以字母或数字开头';
  }
  if (RESERVED_PUBLISHED_API_SLUGS.has(s)) {
    return `slug 与系统保留字冲突：${s}`;
  }
  return null;
}
