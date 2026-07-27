import type { TaskFormConfigListItem, WritingTaskItem } from '../api/client';
import { type AppLocale, pickDisplayLocalizedString } from '../i18n/appLocale';
import { formatTaskSelectionKey } from './taskSelection';

type TaskV2Meta = { taskKey?: string; subtype?: string | null };

export type TaskSelectionLabels = { taskLabel: string; subtypeLabel: string };

function pickStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** 从任务项解析 taskKey / subtype：优先 Task V2 metadata，再回退各 scope 旧字段 */
export function extractTaskSelectionFromItem(t: WritingTaskItem): {
  taskKey: string;
  subtype: string | null;
} {
  const taskV2 = t.metadata?.taskV2 as TaskV2Meta | undefined;
  if (taskV2?.taskKey) {
    return { taskKey: taskV2.taskKey, subtype: taskV2.subtype ?? null };
  }

  const rp = t.requestParams as Record<string, unknown> | undefined;
  if (pickStr(rp?.taskKey)) {
    return {
      taskKey: pickStr(rp?.taskKey),
      subtype: pickStr(rp?.subtype) || null,
    };
  }

  const params = rp?.params as Record<string, unknown> | undefined;
  const nested = params?.params as Record<string, unknown> | undefined;

  const graphType = pickStr(rp?.graphType) || pickStr(params?.graphType);
  if (graphType) {
    return {
      taskKey: graphType,
      subtype: pickStr(rp?.subtype) || pickStr(params?.subtype) || null,
    };
  }

  const taskKey =
    pickStr(t.metadata?.writing_type) ||
    pickStr(params?.writing_type) ||
    pickStr(nested?.writing_type) ||
    '';
  const subtypeRaw =
    pickStr(params?.outline_type) ||
    pickStr(nested?.outline_type) ||
    pickStr(params?.subtype) ||
    '';
  return { taskKey, subtype: subtypeRaw || null };
}

export function buildTaskSelectionLabelMap(
  options: TaskFormConfigListItem[],
  lang: AppLocale = 'zh'
) {
  const map = new Map<string, TaskSelectionLabels>();
  for (const it of options) {
    map.set(formatTaskSelectionKey(it.taskKey, it.subtype), {
      taskLabel: pickLocalizedLabel(it.taskLabel, it.taskLabelI18n ?? undefined, lang) || it.taskKey,
      subtypeLabel: it.subtype
        ? pickLocalizedLabel(it.subtypeLabel, it.subtypeLabelI18n ?? undefined, lang) || it.subtype
        : '',
    });
  }
  return map;
}

export function resolveTaskSelectionLabels(
  labelMap: Map<string, TaskSelectionLabels>,
  taskKey: string,
  subtype: string | null
): TaskSelectionLabels {
  return (
    labelMap.get(formatTaskSelectionKey(taskKey, subtype)) ?? {
      taskLabel: taskKey,
      subtypeLabel: subtype ?? '',
    }
  );
}

function pickLocalizedLabel(
  primary: string | null | undefined,
  i18nMap: Record<string, string> | null | undefined,
  lang: AppLocale
): string {
  return pickDisplayLocalizedString(primary, i18nMap, lang, '');
}

export function formatTaskSelectionOptionLabel(
  it: TaskFormConfigListItem,
  lang: AppLocale = 'zh'
): string {
  const taskLabel = pickLocalizedLabel(it.taskLabel, it.taskLabelI18n ?? undefined, lang) || it.taskKey;
  if (!it.subtype) return taskLabel;
  const subtypeLabel =
    pickLocalizedLabel(it.subtypeLabel, it.subtypeLabelI18n ?? undefined, lang) || it.subtype;
  return `${taskLabel} / ${subtypeLabel}`;
}

/** 技术路由 / slug：用户可见文案不应暴露 */
export function isTechnicalBusinessSlug(raw: string): boolean {
  const s = raw.trim();
  if (!s) return true;
  if (s.includes('/') || s.includes('::')) return true;
  // 含中文 → 视为可读业务名
  if (/[\u4e00-\u9fff]/.test(s)) return false;
  // 带空格或间隔号的英文短语 → 可读
  if (/[\s·•—–]/.test(s)) return false;
  // kebab / snake / 全小写粘连标识
  if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(s)) return true;
  if (/^[a-z][a-z0-9_]*$/i.test(s) && s === s.toLowerCase()) return true;
  return false;
}

/**
 * 仅返回可读业务名；无配置或仅为 taskKey/subtype 时返回 null（勿回退到路由）。
 */
export function formatHumanBusinessLabel(it: {
  taskKey?: string;
  subtype?: string | null;
  taskLabel?: string | null;
  subtypeLabel?: string | null;
}): string | null {
  const a = (it.taskLabel ?? '').trim();
  const b = (it.subtypeLabel ?? '').trim();
  const parts = [a, b].filter((p) => p && !isTechnicalBusinessSlug(p));
  if (parts.length === 0) return null;
  // 若 label 碰巧等于路由 key，仍丢弃
  const joined = parts.join(' · ');
  const keyHint = [it.taskKey, it.subtype].filter(Boolean).join('/');
  if (keyHint && (joined === keyHint || joined === it.taskKey || joined === it.subtype)) {
    return null;
  }
  return joined;
}

export function buildTaskSelectionSelectOptions(
  options: TaskFormConfigListItem[],
  lang: AppLocale = 'zh'
) {
  return options.map((it) => ({
    label: formatTaskSelectionOptionLabel(it, lang),
    value: formatTaskSelectionKey(it.taskKey, it.subtype),
  }));
}

/** 列表卡片：有 subtype 显示 subtype 名，否则显示业务名 */
export function formatTaskBusinessDisplay(
  labelMap: Map<string, TaskSelectionLabels>,
  t: WritingTaskItem
): string {
  const sel = extractTaskSelectionFromItem(t);
  const labels = resolveTaskSelectionLabels(labelMap, sel.taskKey, sel.subtype);
  return labels.subtypeLabel || labels.taskLabel || sel.taskKey;
}

export function formatTaskBusinessDisplayFull(
  labelMap: Map<string, TaskSelectionLabels>,
  t: WritingTaskItem
): TaskSelectionLabels {
  const sel = extractTaskSelectionFromItem(t);
  return resolveTaskSelectionLabels(labelMap, sel.taskKey, sel.subtype);
}

export function taskMatchesSelectionFilter(
  t: WritingTaskItem,
  filterSelectionKey: string
): boolean {
  if (!filterSelectionKey) return true;
  const sel = extractTaskSelectionFromItem(t);
  return formatTaskSelectionKey(sel.taskKey, sel.subtype) === filterSelectionKey;
}
