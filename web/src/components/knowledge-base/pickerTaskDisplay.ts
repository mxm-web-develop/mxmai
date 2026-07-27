import type { WritingTaskItem } from '../../api/client';
import {
  formatTaskBusinessDisplay,
  type TaskSelectionLabels,
} from '../../task-v2';

const GRAPH_TYPE_LABELS: Record<string, string> = {
  photograph: '摄影',
  design: '设计',
  painting: '绘画',
  eshop: '电商',
};

function pickStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function getPickerGraphTypeLabel(t: WritingTaskItem): string {
  const rp = t.requestParams as Record<string, unknown> | undefined;
  const graphType = pickStr(rp?.graphType);
  return GRAPH_TYPE_LABELS[graphType] ?? graphType;
}

/** 列表卡上的业务可读名（优先 subtypeLabel / taskLabel） */
export function getPickerTaskBusinessLabel(
  t: WritingTaskItem,
  labelMap: Map<string, TaskSelectionLabels>
): string {
  if (!labelMap.size) return getPickerGraphTypeLabel(t);
  const fromMap = formatTaskBusinessDisplay(labelMap, t).trim();
  if (fromMap) return fromMap;
  return getPickerGraphTypeLabel(t);
}

export function getPickerTaskTitle(t: WritingTaskItem, fallback = '任务'): string {
  const rp = t.requestParams as Record<string, unknown> | undefined;
  const inner = rp?.params as Record<string, unknown> | undefined;
  const labelVal =
    pickStr(t.metadata?.label) ||
    pickStr(t.metadata?.writing_type_label) ||
    pickStr(t.metadata?.title) ||
    pickStr((inner?.metadata as Record<string, unknown> | undefined)?.label) ||
    pickStr((rp?.metadata as Record<string, unknown> | undefined)?.label);
  if (labelVal) return labelVal;

  const promptVal =
    pickStr(inner?.prompt) ||
    pickStr(rp?.params && (rp.params as Record<string, unknown>).prompt);
  if (promptVal) {
    const trimmed = promptVal.slice(0, 48).replace(/\n/g, ' ').trim();
    return `${trimmed}${promptVal.length > 48 ? '…' : ''}`;
  }

  return fallback;
}

export function formatPickerTaskId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 12)}…` : id;
}
