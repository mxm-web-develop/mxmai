/**
 * Provider API Key 模型
 * 仅 Admin 可管理；key_value 在 API 中脱敏返回
 */

export type ProviderApiKeyProvider = 'deer' | 'replicate' | 'ppio' | 'openai' | 'google' | 'anthropic' | 'qwen' | 'volc' | 'minimax';
export type ProviderApiKeyService = string | null; // openai | google | anthropic | minimax | qwen | volc | null

export interface ProviderApiKey {
  id: string;
  provider: ProviderApiKeyProvider;
  service: ProviderApiKeyService;
  key_value: string;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/** 列表/详情返回用：key 脱敏，不包含 key_value 明文 */
export interface ProviderApiKeyMasked {
  id: string;
  provider: ProviderApiKeyProvider;
  service: ProviderApiKeyService;
  key_masked: string; // e.g. ***ab12
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface CreateProviderApiKeyDto {
  provider: ProviderApiKeyProvider;
  service?: ProviderApiKeyService;
  key_value: string;
  priority?: number;
  updated_by?: string | null;
}

export interface UpdateProviderApiKeyDto {
  priority?: number;
  is_active?: boolean;
  updated_by?: string | null;
}
