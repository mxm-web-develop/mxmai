/**
 * 视频业务大分类：由 taskKey 表达
 * - video/autocut/*   自动剪辑管线
 * - video/generator/* 独立视频生成（人工审核 AI 块可选）
 */
import { RepositoryFactory } from '@mxmai/mxmdata';

export type VideoBusinessCategory = 'autocut' | 'generator';

export const VIDEO_TASKKEY_AUTOCUT = 'autocut';
export const VIDEO_TASKKEY_GENERATOR = 'generator';

export const VIDEO_CATEGORY_LABELS: Record<VideoBusinessCategory, string> = {
  autocut: '自动剪辑',
  generator: '生成',
};

/** 自动剪辑 AI 块默认 generator/fragment */
export const DEFAULT_AI_VIDEO_GENERATOR = {
  taskKey: VIDEO_TASKKEY_GENERATOR,
  subtype: 'fragment',
} as const;

/** 旧 taskKey → 新 taskKey（兼容 DB / 历史任务 metadata） */
const LEGACY_TO_CATEGORY: Record<string, VideoBusinessCategory> = {
  edit: 'autocut',
  resource: 'generator',
  storyboard: 'generator',
  short: 'generator',
  commercial: 'generator',
};

const LEGACY_GENERATOR_TASK_KEYS = new Set(['resource', 'storyboard', 'short', 'commercial']);

export type VideoGeneratorOption = {
  taskKey: string;
  subtype: string | null;
  label: string;
  businessType: string;
};

type PromptRow = {
  scope: string;
  type: string;
  subtype: string | null;
  extra?: Record<string, unknown> | null;
  is_active: boolean;
};

function readDisplay(extra: Record<string, unknown> | null | undefined): {
  taskLabel?: string;
  subtypeLabel?: string;
} {
  const d = extra?.display;
  return d && typeof d === 'object' ? (d as Record<string, unknown>) : {};
}

/** 从 taskKey 推断大分类（autocut / generator） */
export function inferVideoCategoryFromTaskKey(taskKey: string): VideoBusinessCategory | null {
  if (taskKey === VIDEO_TASKKEY_AUTOCUT) return 'autocut';
  if (taskKey === VIDEO_TASKKEY_GENERATOR) return 'generator';
  return LEGACY_TO_CATEGORY[taskKey] ?? null;
}

/** 是否 generator 类 taskKey（含旧 resource/storyboard 等） */
export function isGeneratorTaskKey(taskKey: string): boolean {
  return taskKey === VIDEO_TASKKEY_GENERATOR || LEGACY_GENERATOR_TASK_KEYS.has(taskKey);
}

/** 是否 autocut 类 taskKey（含旧 edit） */
export function isAutocutTaskKey(taskKey: string): boolean {
  return taskKey === VIDEO_TASKKEY_AUTOCUT || taskKey === 'edit';
}

/** 规范化 clip / 子任务上的 video 路由（resource → generator 等） */
export function normalizeVideoGeneratorRoute(
  taskKey?: string,
  subtype?: string | null
): { taskKey: string; subtype: string | null } {
  const rawKey = taskKey?.trim() || DEFAULT_AI_VIDEO_GENERATOR.taskKey;
  const rawSub = subtype?.trim() || DEFAULT_AI_VIDEO_GENERATOR.subtype;

  if (rawKey === VIDEO_TASKKEY_GENERATOR || rawKey === VIDEO_TASKKEY_AUTOCUT) {
    return { taskKey: rawKey, subtype: rawSub || null };
  }

  if (rawKey === 'resource') return { taskKey: VIDEO_TASKKEY_GENERATOR, subtype: rawSub || 'fragment' };
  if (rawKey === 'storyboard' || rawKey === 'short' || rawKey === 'commercial') {
    return { taskKey: VIDEO_TASKKEY_GENERATOR, subtype: rawSub || null };
  }
  if (rawKey === 'edit') {
    return { taskKey: VIDEO_TASKKEY_AUTOCUT, subtype: rawSub || null };
  }

  return { taskKey: rawKey, subtype: rawSub || null };
}

export function resolveGeneratorRoute(
  taskKey?: string,
  subtype?: string | null
): { taskKey: string; subtype: string | null } {
  return normalizeVideoGeneratorRoute(taskKey, subtype);
}

export function buildVideoBusinessType(scope: string, taskKey: string, subtype: string | null): string {
  const base = `${scope}-${taskKey}`;
  if (subtype && subtype !== 'default') return `${base}-${subtype}`;
  return base;
}

export function formatVideoGeneratorLabel(row: Pick<PromptRow, 'type' | 'subtype' | 'extra'>): string {
  const display = readDisplay(row.extra ?? undefined);
  const taskLabel = display.taskLabel?.trim();
  const subtypeLabel = display.subtypeLabel?.trim();
  if (taskLabel && subtypeLabel) return `${taskLabel} · ${subtypeLabel}`;
  if (taskLabel) return taskLabel;
  const sub = row.subtype?.trim();
  return sub ? `${row.type}/${sub}` : row.type;
}

export function rowToVideoGeneratorOption(row: PromptRow): VideoGeneratorOption {
  const normalized = normalizeVideoGeneratorRoute(row.type, row.subtype);
  return {
    taskKey: normalized.taskKey,
    subtype: normalized.subtype,
    label: formatVideoGeneratorLabel(row),
    businessType: buildVideoBusinessType(row.scope, normalized.taskKey, normalized.subtype),
  };
}

/** 是否可作为 C 端 / 嵌套选用的 generator 视频业务（仅看 scope/type/启用） */
export function isUserFacingGenerator(row: PromptRow): boolean {
  return row.scope === 'video' && row.is_active && row.type === VIDEO_TASKKEY_GENERATOR;
}

/** 加载 generator 类视频业务（taskKey=generator；兼容旧 resource/storyboard 等） */
export async function listVideoGeneratorBusinesses(): Promise<VideoGeneratorOption[]> {
  const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
  const { items } = await repo.list({ scope: 'video', limit: 500 });

  const options: VideoGeneratorOption[] = [];
  const seen = new Set<string>();

  for (const row of items) {
    if (!isUserFacingGenerator(row as PromptRow)) continue;
    const opt = rowToVideoGeneratorOption(row as PromptRow);
    const dedupeKey = `${opt.taskKey}/${opt.subtype ?? ''}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    options.push(opt);
  }

  options.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
  return options;
}

/** @deprecated 旧 nestedVideoTaskKey；新管线用 pipelineNode，见 pipeline-timeline-render.ts */
export const DEFAULT_NESTED_VIDEO_RENDER_KEY = 'video/autocut/render';

/** 兼容旧 metadata / 配置里的 nestedVideoTaskKey */
export function parseNestedVideoRouteKey(nestedVideoTaskKey: string): string {
  const trimmed = nestedVideoTaskKey.trim();
  if (!trimmed) return DEFAULT_NESTED_VIDEO_RENDER_KEY;
  if (trimmed === 'video/edit/render') return DEFAULT_NESTED_VIDEO_RENDER_KEY;
  return trimmed;
}
