/**
 * ProviderFactory 已注册的 provider 类型（单一来源，避免 catalog / Admin / 计费多处硬编码遗漏）。
 */

import type { ProviderType } from './types';

/** 可写入 provider_models 且会进入内存 catalog 的 provider */
export const REGISTERED_PROVIDER_TYPES: readonly ProviderType[] = [
  'replicate',
  'ppio',
  'deer',
  'openai',
  'openrouter',
  'qhai',
  'jiekou',
  'google',
  'anthropic',
  'qwen',
  'volc',
  'minimax',
  'atlascloud',
  'maxplan',
  'mcp',
] as const;

export function isRegisteredProviderType(s: string): s is ProviderType {
  return (REGISTERED_PROVIDER_TYPES as readonly string[]).includes(s);
}

/** Admin「余额/用量」会尝试拉取 getBillingInfo 的 provider */
/** 已下架：保留类型以兼容历史任务/DB，新配置勿选用 */
export const SUNSET_PROVIDER_TYPES: readonly ProviderType[] = ['deer'] as const;

export const BILLING_CAPABLE_PROVIDER_TYPES: readonly ProviderType[] = [
  'openrouter',
  'qhai',
  'jiekou',
  'atlascloud',
  'deer',
  'replicate',
  'ppio',
  'openai',
  'google',
  'anthropic',
  'qwen',
  'volc',
  'minimax',
  'maxplan',
] as const;
