import { getGridShootLineBySlug } from '@/catalog/grid-shoot-lines';

/** 历史列表 / 详情页展示名（用户自定义优先） */
export function resolveJobListTitle(job: {
  displayName?: string;
  title: string;
  slug: string;
}): string {
  const custom = job.displayName?.trim();
  if (custom) return custom;
  const line = getGridShootLineBySlug(job.slug);
  return line?.shortTitle ?? job.title;
}

/** 提交前默认任务名：品类 + 时间，避免全部显示为「女装」 */
export function defaultGridShootJobName(lineShortTitle: string): string {
  const stamp = new Date().toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${lineShortTitle} · ${stamp}`;
}

const DRAFT_PREFIX = 'eshop-job-name-';

export function loadJobNameDraft(lineId: string, fallback: string): string {
  if (typeof sessionStorage === 'undefined') return fallback;
  return sessionStorage.getItem(`${DRAFT_PREFIX}${lineId}`)?.trim() || fallback;
}

export function saveJobNameDraft(lineId: string, name: string): void {
  if (typeof sessionStorage === 'undefined') return;
  const v = name.trim();
  if (v) sessionStorage.setItem(`${DRAFT_PREFIX}${lineId}`, v);
  else sessionStorage.removeItem(`${DRAFT_PREFIX}${lineId}`);
}
