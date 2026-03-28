/**
 * 计费展示相关类型（ChargeMode、ModelConfig 等），与 `provider_pricing` / Admin 展示配套。
 */

export enum ChargeMode {
  token_based = 'token_based',
  token_based_per_thousand = 'token_based_per_thousand',
  per_change_mode = 'per_change_mode',
}

export interface ModelConfig {
  modelname: string;
  price: number;
  provider_price?: number;
  charge_mode: ChargeMode;
  currency: string;
  service?: string;
}

/** 兼容旧代码：字符串或完整配置 */
export type ModelMapping = string | ModelConfig;

export function getModelName(mapping: ModelMapping): string {
  if (typeof mapping === 'string') return mapping;
  return mapping.modelname;
}
