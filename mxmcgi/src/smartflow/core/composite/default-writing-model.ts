import {
  findEnabledModel,
  listEnabledModelKeysByScope,
} from '../../../models/provider-model-catalog';

const LEGACY_FALLBACK = 'gpt-4o-mini';

/** 无 preferred 或 preferred 未在目录中时，按稳定性优先选用 */
const PREFERRED_WRITING_MODELS = [
  'deepseek-v4-flash',
  'deepseek-v3.2',
  'deepseek-r1',
  'claude-4.5-sonnet',
  'gpt-4o-mini',
];

function pickDefaultFromEnabled(enabled: string[]): string | null {
  for (const key of PREFERRED_WRITING_MODELS) {
    if (enabled.includes(key)) return key;
  }
  const deepseek = enabled.find((k) => k.startsWith('deepseek'));
  if (deepseek) return deepseek;
  return enabled[0] ?? null;
}

/** 解析 Smartflow 复合节点可用的写作模型（优先 preferred，否则取目录中稳定可用的 writing 模型） */
export function resolveWritingModel(preferred?: string | null): string {
  const p = preferred?.trim();
  if (p && findEnabledModel({ modelKey: p, scope: 'writing' })) {
    return p;
  }
  const enabled = listEnabledModelKeysByScope('writing');
  const picked = pickDefaultFromEnabled(enabled);
  if (picked) return picked;
  return p || LEGACY_FALLBACK;
}
