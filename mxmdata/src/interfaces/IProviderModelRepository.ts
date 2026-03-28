import type { ProviderModel } from '../models/ProviderModel';

export interface IProviderModelRepository {
  list(options?: { provider?: string; scope?: string; onlyEnabled?: boolean }): Promise<ProviderModel[]>;

  findById(id: string): Promise<ProviderModel | null>;

  findByKey(params: {
    provider: string;
    scope: string;
    model_key: string;
  }): Promise<ProviderModel | null>;

  upsert(model: Omit<ProviderModel, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<ProviderModel>;

  update(
    id: string,
    patch: Partial<Omit<ProviderModel, 'id' | 'created_at' | 'updated_at'>>
  ): Promise<ProviderModel>;

  setEnabled(id: string, isEnabled: boolean): Promise<ProviderModel>;

  /** 从数据库永久删除该行（与「停用」区分） */
  deleteById(id: string): Promise<void>;
}

