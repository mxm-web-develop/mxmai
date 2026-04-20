/**
 * 按模型名执行的统一入口（纯动态：仅通过 DB 的 provider_models 驱动）
 *
 * 规则：
 * - 只要 Admin 在 provider_models 启用了某个 {provider, scope, model_key}，即可被调用
 * - 具体调用由 ProviderFactory 选择 provider，并交给对应 Provider 的 generate() 处理
 */

import type { GenerateParams, GenerateResult, ProviderType } from './providers';
import type { ModelScope, ModelContext } from './types';
import { providerFactory } from './providers';
import { findEnabledModel } from './provider-model-catalog';
import {
  FALLBACK_RULES,
  findFallbackRule,
} from '../core/providers/fallback';

const SCOPE_ORDER: ModelScope[] = ['text', 'video', 'graph', 'audio', 'writing'];

/**
 * 按 scope + modelKey 执行生成：从 DB 的 provider_models 查找启用条目并执行。
 * @param context.providerOverride 指定时仅允许使用该 provider（若 DB 未启用则报错）
 */
export async function runByModelKey<P extends GenerateParams = GenerateParams, R extends GenerateResult = GenerateResult>(
  scope: ModelScope,
  modelKey: string,
  params: P,
  context?: ModelContext
): Promise<R> {
  const providerOverride = context?.providerOverride as ProviderType | undefined;

  const row = findEnabledModel({
    modelKey,
    scope,
    provider: providerOverride,
  });
  if (!row) {
    throw new Error(
      `未在 provider_models 找到已启用模型: scope=${scope}, modelKey=${modelKey}${providerOverride ? `, provider=${providerOverride}` : ''}`
    );
  }

  const provider = providerFactory.getProviderForModel(row.model_key, providerOverride);

  // 第一次尝试：使用原始模型
  try {
    return (await provider.generate(row.model_key, params)) as R;
  } catch (originalError) {
    // 检查是否存在 fallback 规则
    const fallbackRule = findFallbackRule(row.provider, row.model_key);
    if (!fallbackRule) {
      // 没有 fallback 规则，原样抛出错误
      throw originalError;
    }

    // 检查是否满足 fallback 触发条件
    const err = originalError instanceof Error ? originalError : new Error(String(originalError));
    const statusMatch = err.message.match(/\b(\d{3})\b/);
    const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : undefined;
    const triggerKeywords = ['quota', 'exhausted', 'insufficient', 'balance', '余额', '限额', '额度'];
    const hasTriggerKeyword = triggerKeywords.some((kw) =>
      err.message.toLowerCase().includes(kw.toLowerCase())
    );
    const isTriggered =
      (statusCode && [401, 403, 429, 500, 502, 503, 504].includes(statusCode)) ||
      hasTriggerKeyword ||
      err.message.toLowerCase().includes('timeout') ||
      err.message.toLowerCase().includes('network') ||
      err.message.toLowerCase().includes('connrefused');

    if (!isTriggered) {
      // 不满足触发条件，原样抛出错误
      throw originalError;
    }

    console.log(`[runByModelKey] 触发 fallback: ${row.provider}/${row.model_key} -> ${fallbackRule.fallbackProvider}/${fallbackRule.fallbackModel}`);

    // 第二次尝试：使用 fallback 模型
    const fallbackProvider = providerFactory.get(fallbackRule.fallbackProvider as ProviderType);
    const fallbackResult = await fallbackProvider.generate(fallbackRule.fallbackModel, params) as R;

    // 在 metadata 中记录 fallback 信息
    if (fallbackResult.metadata) {
      fallbackResult.metadata.fallbackFrom = {
        provider: row.provider,
        model: row.model_key,
      };
    } else {
      fallbackResult.metadata = {
        fallbackFrom: {
          provider: row.provider,
          model: row.model_key,
        },
      };
    }

    return fallbackResult;
  }
}

/**
 * 按 modelKey 在多个 scope 中依次查找并执行（用于 task-executor 等只有 modelName 的场景）。
 * 顺序：video → graph → audio → writing；找到第一个在 DB 启用的 scope 即执行。
 */
export async function runByModelKeyAnyScope(
  modelKey: string,
  params: GenerateParams,
  context?: ModelContext
): Promise<GenerateResult> {
  const providerOverride = context?.providerOverride as ProviderType | undefined;

  for (const scope of SCOPE_ORDER) {
    const row = findEnabledModel({
      modelKey,
      scope,
      provider: providerOverride,
    });
    if (!row) continue;

    const provider = providerFactory.getProviderForModel(row.model_key, providerOverride);

    // 第一次尝试：使用原始模型
    try {
      return await provider.generate(row.model_key, params);
    } catch (originalError) {
      // 检查是否存在 fallback 规则
      const fallbackRule = findFallbackRule(row.provider, row.model_key);
      if (!fallbackRule) {
        throw originalError;
      }

      // 检查是否满足 fallback 触发条件
      const err = originalError instanceof Error ? originalError : new Error(String(originalError));
      const statusMatch = err.message.match(/\b(\d{3})\b/);
      const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : undefined;
      const triggerKeywords = ['quota', 'exhausted', 'insufficient', 'balance', '余额', '限额', '额度'];
      const hasTriggerKeyword = triggerKeywords.some((kw) =>
        err.message.toLowerCase().includes(kw.toLowerCase())
      );
      const isTriggered =
        (statusCode && [401, 403, 429, 500, 502, 503, 504].includes(statusCode)) ||
        hasTriggerKeyword ||
        err.message.toLowerCase().includes('timeout') ||
        err.message.toLowerCase().includes('network') ||
        err.message.toLowerCase().includes('connrefused');

      if (!isTriggered) {
        throw originalError;
      }

      console.log(`[runByModelKeyAnyScope] 触发 fallback: ${row.provider}/${row.model_key} -> ${fallbackRule.fallbackProvider}/${fallbackRule.fallbackModel}`);

      // 第二次尝试：使用 fallback 模型
      const fallbackProvider = providerFactory.get(fallbackRule.fallbackProvider as ProviderType);
      const fallbackResult = await fallbackProvider.generate(fallbackRule.fallbackModel, params);

      // 在 metadata 中记录 fallback 信息
      if (fallbackResult.metadata) {
        fallbackResult.metadata.fallbackFrom = {
          provider: row.provider,
          model: row.model_key,
        };
      } else {
        fallbackResult.metadata = {
          fallbackFrom: {
            provider: row.provider,
            model: row.model_key,
          },
        };
      }

      return fallbackResult;
    }
  }
  throw new Error(`未找到模型: modelKey=${modelKey}（已尝试 scope: ${SCOPE_ORDER.join(', ')}）`);
}
