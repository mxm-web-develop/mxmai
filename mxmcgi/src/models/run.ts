/**
 * 按模型名执行的统一入口（单轨：仅通过 registry + ModelDefinition.generate）
 * 供 routes 与 task-executor 使用，不再从 core/graph、core/audio、core/video、core/text 加载模型文件。
 */

import type { GenerateParams, GenerateResult, ProviderType } from './providers';
import { getModelsByKey } from './registry';
import type { ModelScope, ModelContext, ModelDefinition } from './types';

const SCOPE_ORDER: ModelScope[] = ['video', 'graph', 'audio', 'writing'];

/**
 * 从候选 ModelDefinition[] 中按 context?.providerOverride 或默认顺序选一个。
 * 指定了 providerOverride 时仅返回该 provider 的模型，无则报错（不兜底到其他 provider）。
 */
function pickDefinition(
  defs: ModelDefinition[],
  providerOverride?: ProviderType
): ModelDefinition | null {
  if (!defs.length) return null;
  if (providerOverride) {
    const match = defs.find(d => (d.provider as ProviderType) === providerOverride);
    if (match) return match;
    return null;
  }
  return defs[0];
}

/**
 * 按 scope + modelKey 执行生成：从 registry 取候选定义，选一个后调用 def.generate。
 * @param context.providerOverride 指定时优先使用该 provider 的模型定义
 */
export async function runByModelKey<P extends GenerateParams = GenerateParams, R extends GenerateResult = GenerateResult>(
  scope: ModelScope,
  modelKey: string,
  params: P,
  context?: ModelContext
): Promise<R> {
  const defs = getModelsByKey(scope, modelKey);
  const providerOverride = context?.providerOverride as ProviderType | undefined;
  const def = pickDefinition(defs, providerOverride);
  if (!def) {
    throw new Error(`未找到模型: scope=${scope}, modelKey=${modelKey}${providerOverride ? `, provider=${providerOverride}` : ''}`);
  }
  return def.generate(params, context) as Promise<R>;
}

/**
 * 按 modelKey 在多个 scope 中依次查找并执行（用于 task-executor 等只有 modelName 的场景）。
 * 顺序：video → graph → audio → writing；找到第一个有注册的 scope 即执行。
 */
export async function runByModelKeyAnyScope(
  modelKey: string,
  params: GenerateParams,
  context?: ModelContext
): Promise<GenerateResult> {
  const providerOverride = context?.providerOverride as ProviderType | undefined;
  for (const scope of SCOPE_ORDER) {
    const defs = getModelsByKey(scope, modelKey);
    const def = pickDefinition(defs, providerOverride);
    if (def) {
      return def.generate(params, context);
    }
  }
  throw new Error(`未找到模型: modelKey=${modelKey}（已尝试 scope: ${SCOPE_ORDER.join(', ')}）`);
}
