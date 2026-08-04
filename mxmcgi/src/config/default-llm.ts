/**
 * 平台默认 LLM 路由（文本 / 写作 / 管线 nestedText 等）
 * 可通过根目录 .env 覆盖：DEFAULT_PROVIDER=maxplan、DEFAULT_MODEL=MiniMax-M3
 * deer / deerapi 已下架：即便 env 仍写旧值，也回退 maxplan。
 */
import type { ProviderType } from '../core/providers/types';

export const DEFAULT_LLM_MODEL = 'MiniMax-M3';

const ALLOWED_PROVIDERS = new Set<ProviderType>([
  'maxplan',
  'replicate',
  'ppio',
  'openai',
  'google',
  'anthropic',
  'qwen',
  'volc',
  'minimax',
  'atlascloud',
  'openrouter',
  'qhai',
  'jiekou',
  'mcp',
]);

/** 解析 DEFAULT_PROVIDER；未设置、非法值、或已下架的 deer → maxplan */
export function resolveDefaultLlmProvider(): ProviderType {
  const raw = process.env.DEFAULT_PROVIDER?.toLowerCase();
  if (!raw || raw === 'deer' || raw === 'deerapi') return 'maxplan';
  if (ALLOWED_PROVIDERS.has(raw as ProviderType)) {
    return raw as ProviderType;
  }
  return 'maxplan';
}

export function resolveDefaultLlmModel(): string {
  const m = process.env.DEFAULT_MODEL?.trim();
  return m || DEFAULT_LLM_MODEL;
}
