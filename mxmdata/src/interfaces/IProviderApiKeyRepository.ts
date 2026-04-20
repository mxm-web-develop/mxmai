import type {
  ProviderApiKey,
  ProviderApiKeyMasked,
  CreateProviderApiKeyDto,
  UpdateProviderApiKeyDto,
} from '../models/ProviderApiKey';

export interface IProviderApiKeyRepository {
  /** 按 (provider, service) 查所有启用的 key，按 priority 升序，返回明文（仅服务端内部用） */
  listKeysForProvider(provider: string, service?: string | null): Promise<ProviderApiKey[]>;

  /** 仅按 provider 查全部启用 key（不按 service 过滤），用于 replicate/ppio 等无子 service 的兜底 */
  listAllActiveKeysForProvider(provider: string): Promise<ProviderApiKey[]>;

  /** 列表（脱敏），供 Admin API 展示 */
  listMasked(options?: { provider?: string; service?: string | null }): Promise<ProviderApiKeyMasked[]>;

  findById(id: string): Promise<ProviderApiKey | null>;

  create(dto: CreateProviderApiKeyDto): Promise<ProviderApiKey>;

  update(id: string, dto: UpdateProviderApiKeyDto): Promise<ProviderApiKey>;

  delete(id: string): Promise<void>;
}
