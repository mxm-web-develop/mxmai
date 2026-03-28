/**
 * 从 provider_models（catalog 缓存）解析上游物理模型 ID。
 * 须已执行 loadProviderModelCatalog()，且模型在库中已启用。
 */

import type { ProviderType } from '../core/providers/types';
import { getUpstreamModel } from './provider-model-catalog';

export function requireUpstreamPhysicalId(provider: ProviderType, modelKey: string): string {
  const id = getUpstreamModel(provider, modelKey);
  if (id != null && String(id).trim().length > 0) {
    return String(id).trim();
  }
  throw new Error(
    `未在 provider_models 找到已启用模型或缺少 upstream_model/model_key：provider=${provider}, model_key=${modelKey}`
  );
}
