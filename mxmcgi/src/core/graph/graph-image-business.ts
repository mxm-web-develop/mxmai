/**
 * 自动剪辑 AI 块可选 graph 配图业务（mxmAiOutputKind=image）
 */
import { RepositoryFactory } from '@mxmai/mxmdata';

export type GraphImageGeneratorOption = {
  taskKey: string;
  subtype: string | null;
  label: string;
  businessType: string;
};

export const DEFAULT_AI_IMAGE_GENERATOR = {
  taskKey: 'design',
  subtype: 'content-illustration',
} as const;

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
  videoEditAiImage?: boolean;
  resultKind?: string;
} {
  const d = extra?.display;
  return d && typeof d === 'object' ? (d as Record<string, unknown>) : {};
}

export function formatGraphImageGeneratorLabel(row: Pick<PromptRow, 'type' | 'subtype' | 'extra'>): string {
  const display = readDisplay(row.extra ?? undefined);
  const taskLabel = display.taskLabel?.trim();
  const subtypeLabel = display.subtypeLabel?.trim();
  if (taskLabel && subtypeLabel) return `${taskLabel} · ${subtypeLabel}`;
  if (taskLabel) return taskLabel;
  const sub = row.subtype?.trim();
  return sub ? `${row.type}/${sub}` : row.type;
}

export function rowToGraphImageGeneratorOption(row: PromptRow): GraphImageGeneratorOption {
  return {
    taskKey: row.type,
    subtype: row.subtype,
    label: formatGraphImageGeneratorLabel(row),
    businessType: `graph-${row.type}${row.subtype && row.subtype !== 'default' ? `-${row.subtype}` : ''}`,
  };
}

/** 是否适合自动剪辑 AI 配图（内容配图 / 图集 / 显式标记） */
export function isVideoEditAiImageGenerator(row: PromptRow): boolean {
  if (row.scope !== 'graph' || !row.is_active) return false;
  const display = readDisplay(row.extra ?? undefined);
  if (display.videoEditAiImage === true) return true;
  if (row.type === 'design' && row.subtype === 'content-illustration') return true;
  // 图集：批量选中镜头时可选用；实际生图叶子仍为 content-illustration
  if (row.type === 'group' && (row.subtype ?? '').includes('album')) return true;
  if (display.resultKind === 'image-album') return true;
  return false;
}

export function normalizeGraphImageRoute(
  taskKey?: string,
  subtype?: string | null
): { taskKey: string; subtype: string | null } {
  const rawKey = taskKey?.trim() || DEFAULT_AI_IMAGE_GENERATOR.taskKey;
  const rawSub = subtype?.trim() || DEFAULT_AI_IMAGE_GENERATOR.subtype;
  return { taskKey: rawKey, subtype: rawSub || null };
}

/**
 * 分发给叶子配图业务：图集编排（group/*album）不能作为单 clip 子任务直调，
 * 映射到 content-illustration（与 albumImageBatch 一致）。
 */
export function resolveAiImageLeafRoute(
  taskKey?: string,
  subtype?: string | null
): { taskKey: string; subtype: string | null } {
  const route = normalizeGraphImageRoute(taskKey, subtype);
  if (route.taskKey === 'group' || (route.subtype ?? '').includes('album')) {
    return { ...DEFAULT_AI_IMAGE_GENERATOR };
  }
  return route;
}

/** 加载可用于 AI 镜头配图的 graph 业务 */
export async function listGraphImageGeneratorBusinesses(): Promise<GraphImageGeneratorOption[]> {
  const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
  const { items } = await repo.list({ scope: 'graph', limit: 500 });

  const options: GraphImageGeneratorOption[] = [];
  const seen = new Set<string>();

  for (const row of items) {
    if (!isVideoEditAiImageGenerator(row as PromptRow)) continue;
    const opt = rowToGraphImageGeneratorOption(row as PromptRow);
    const dedupeKey = `${opt.taskKey}/${opt.subtype ?? ''}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    options.push(opt);
  }

  options.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
  return options;
}
