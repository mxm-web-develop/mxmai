/**
 * taskKey → unit | series 查表（不写入合同 meta）
 */
import type { MxmWarpShape } from './contract-types';

/** 平台钉死的 series taskKey（其余默认为 unit） */
const SERIES_TASK_KEYS: ReadonlySet<string> = new Set([
  'proposal',
  'gallery',
  'dialogue',
  'autocut',
  'fragment', // music 片段向，按 series 辅助；若不对可再改表
]);

export function resolveWarpShape(scope: string, taskKey: string): MxmWarpShape {
  void scope;
  const key = String(taskKey || '')
    .trim()
    .toLowerCase();
  if (SERIES_TASK_KEYS.has(key)) return 'series';
  return 'unit';
}
