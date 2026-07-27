/**
 * Task V2 业务显示名（面向用户文案，非 scope/taskKey/subtype 路由）
 */

import {
  type AppLocale,
  localeOutputInstruction,
  normalizeAppLocale,
  pickDisplayLocalizedString,
} from '@mxmai/mxmdata';

export type AgentReplyLocale = AppLocale;

function isTechnicalBusinessSlug(raw: string): boolean {
  const s = raw.trim();
  if (!s) return true;
  if (s.includes('/') || s.includes('::')) return true;
  if (/[\u4e00-\u9fff]/.test(s)) return false;
  if (/[\s·•—–]/.test(s)) return false;
  if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(s)) return true;
  if (/^[a-z][a-z0-9_]*$/i.test(s) && s === s.toLowerCase()) return true;
  return false;
}

export function normalizeAgentLocale(raw: string | null | undefined): AgentReplyLocale {
  return normalizeAppLocale(raw);
}

function untitledBusiness(locale: AppLocale): string {
  switch (locale) {
    case 'en':
      return 'Untitled business';
    case 'zh-TW':
      return '未命名業務';
    case 'ja':
      return '名称未設定の業務';
    case 'zh':
    default:
      return '未命名业务';
  }
}

export function formatBusinessDisplayName(args: {
  taskLabel?: string | null;
  subtypeLabel?: string | null;
  taskKey?: string;
  subtype?: string | null;
  locale?: AgentReplyLocale;
}): string {
  const taskLabel = (args.taskLabel || '').trim();
  const subtypeLabel = (args.subtypeLabel || '').trim();
  const parts = [taskLabel, subtypeLabel].filter((p) => p && !isTechnicalBusinessSlug(p));
  if (parts.length > 0) return parts.join(' · ');
  return untitledBusiness(args.locale || 'zh');
}

/** system prompt 摘要行：显示名 + 内部标识（内部仅供工具调用） */
export function formatBusinessCatalogSummaryLine(item: {
  taskLabel?: string | null;
  subtypeLabel?: string | null;
  taskKey: string;
  subtype?: string | null;
  locale?: AgentReplyLocale;
}): string {
  const locale = item.locale || 'zh';
  const display = formatBusinessDisplayName(item);
  const internal = item.subtype ? `${item.taskKey}/${item.subtype}` : item.taskKey;
  const untitled = untitledBusiness(locale);
  if (display === untitled) {
    if (locale === 'en') {
      return `- (no user-facing name) internal id ${internal} — describe capabilities in natural language; never speak the internal id to the user`;
    }
    if (locale === 'ja') {
      return `- （ユーザー向け名称なし）内部 ID ${internal} — 能力は自然言語で説明し、内部 ID をユーザーに見せない`;
    }
    if (locale === 'zh-TW') {
      return `- （暫無使用者可見名）內部標識 ${internal} — 向使用者只用自然語言描述能力，禁止念出內部標識`;
    }
    return `- （暂无用户可见名）内部标识 ${internal} — 向用户只用自然语言描述能力，禁止念出内部标识`;
  }
  if (locale === 'en') {
    return `- Display name "${display}" (internal ${internal}; do not show internal id to user)`;
  }
  if (locale === 'ja') {
    return `- 表示名「${display}」（内部 ${internal}、ユーザーに内部 ID を見せない）`;
  }
  if (locale === 'zh-TW') {
    return `- 顯示名「${display}」（內部 ${internal}，勿向使用者展示）`;
  }
  return `- 显示名「${display}」（内部 ${internal}，勿向用户展示）`;
}

export function displayLabelsFromRowExtra(
  extra: Record<string, unknown> | null | undefined,
  locale: AppLocale = 'zh'
): {
  taskLabel: string | null;
  subtypeLabel: string | null;
} {
  const display =
    extra?.display && typeof extra.display === 'object'
      ? (extra.display as Record<string, unknown>)
      : null;
  const taskPrimary = typeof display?.taskLabel === 'string' ? display.taskLabel : null;
  const subtypePrimary = typeof display?.subtypeLabel === 'string' ? display.subtypeLabel : null;
  const taskI18n =
    display?.taskLabelI18n && typeof display.taskLabelI18n === 'object'
      ? (display.taskLabelI18n as Record<string, string>)
      : undefined;
  const subtypeI18n =
    display?.subtypeLabelI18n && typeof display.subtypeLabelI18n === 'object'
      ? (display.subtypeLabelI18n as Record<string, string>)
      : undefined;
  return {
    taskLabel: pickDisplayLocalizedString(taskPrimary, taskI18n, locale) || null,
    subtypeLabel: pickDisplayLocalizedString(subtypePrimary, subtypeI18n, locale) || null,
  };
}

/** 从 DB 配置解析显示名（工具回传 / 错误文案） */
export async function resolveBusinessDisplayName(
  scope: string,
  taskKey: string,
  subtype?: string | null,
  locale: AppLocale = 'zh'
): Promise<string> {
  try {
    const { RepositoryFactory } = await import('@mxmai/mxmdata');
    const row = await RepositoryFactory.createPromptEngineeringConfigRepository().findByKey(
      scope,
      taskKey,
      subtype ?? null
    );
    const extra =
      row?.extra && typeof row.extra === 'object' ? (row.extra as Record<string, unknown>) : null;
    const { taskLabel, subtypeLabel } = displayLabelsFromRowExtra(extra, locale);
    return formatBusinessDisplayName({ taskLabel, subtypeLabel, taskKey, subtype, locale });
  } catch {
    return formatBusinessDisplayName({ taskKey, subtype, locale });
  }
}

export { localeOutputInstruction };
