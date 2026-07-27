/**
 * taskKey → generator | group | series 查表（不写入合同 meta）
 *
 * 合同形状约定：
 * - generator：单次专注生成，合同 business 为主对象
 * - group：多子任务并发生成，合同 business 为对象数组（或可遍历主列）
 * - series：联合历史上下文连续生成（实现演进中）
 *
 * 旧 scope 专属 taskKey（editorial / gallery / autocut …）仅作兼容别名，新上架只用三态。
 */
import type { MxmWarpShape } from './contract-types';

const GENERATOR_ALIASES: ReadonlySet<string> = new Set([
  'generator',
  'editorial',
  'generated',
  'voiceover',
  'synthesis',
  'speak', // audio 历史
]);

const GROUP_ALIASES: ReadonlySet<string> = new Set([
  'group',
  'proposal',
  'gallery',
  'dialogue',
  'autocut',
  'fragment',
  'multiple',
  'longwrite',
]);

const SERIES_ALIASES: ReadonlySet<string> = new Set(['series']);

/**
 * 将任意（含历史）taskKey 归一为平台三态。
 * 未知 key 默认 generator，避免误走 group/series 编排。
 */
export function resolveWarpShape(scope: string, taskKey: string): MxmWarpShape {
  void scope;
  const key = String(taskKey || '')
    .trim()
    .toLowerCase();
  if (SERIES_ALIASES.has(key)) return 'series';
  if (GROUP_ALIASES.has(key)) return 'group';
  if (GENERATOR_ALIASES.has(key)) return 'generator';
  return 'generator';
}

/** @deprecated 使用 resolveWarpShape；保留别名避免外部 import 断裂 */
export const resolveUnitSeriesShape = resolveWarpShape;
