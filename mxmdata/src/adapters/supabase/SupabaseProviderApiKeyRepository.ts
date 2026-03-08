/**
 * Provider API Key 仓库：仅服务端使用 key_value 明文，对外仅返回脱敏
 */

import type { IProviderApiKeyRepository } from '../../interfaces/IProviderApiKeyRepository';
import type {
  ProviderApiKey,
  ProviderApiKeyMasked,
  CreateProviderApiKeyDto,
  UpdateProviderApiKeyDto,
} from '../../models/ProviderApiKey';
import { DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

function maskKey(value: string): string {
  if (!value || value.length <= 4) return '***';
  return '***' + value.slice(-4);
}

function fromRow(row: any): ProviderApiKey {
  return {
    id: row.id,
    provider: row.provider,
    service: row.service ?? null,
    key_value: row.key_value,
    priority: row.priority ?? 0,
    is_active: row.is_active ?? true,
    created_at: row.created_at,
    updated_at: row.updated_at,
    updated_by: row.updated_by ?? null,
  };
}

function toMasked(row: ProviderApiKey): ProviderApiKeyMasked {
  return {
    id: row.id,
    provider: row.provider as ProviderApiKey['provider'],
    service: row.service,
    key_masked: maskKey(row.key_value),
    priority: row.priority,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    updated_by: row.updated_by,
  };
}

export class SupabaseProviderApiKeyRepository implements IProviderApiKeyRepository {
  private client = getSupabaseClient();

  async listKeysForProvider(provider: string, service?: string | null): Promise<ProviderApiKey[]> {
    try {
      let query = this.client
        .from('provider_api_keys')
        .select('*')
        .eq('provider', provider)
        .eq('is_active', true);

      if (service != null && service !== '') {
        query = query.eq('service', service);
      } else {
        // 同时匹配 service IS NULL 和 service = ''（表单未填时可能存为空串）
        query = query.or('service.is.null,service.eq.""');
      }

      const { data, error } = await query.order('priority', { ascending: true });

      if (error) throw new DataAccessError(`listKeysForProvider failed: ${error.message}`, 'QUERY_ERROR', error);
      return (data || []).map(fromRow);
    } catch (e) {
      if (e instanceof DataAccessError) throw e;
      throw new DataAccessError(String(e), 'UNKNOWN_ERROR', e instanceof Error ? e : new Error(String(e)));
    }
  }

  async listMasked(options?: { provider?: string; service?: string | null }): Promise<ProviderApiKeyMasked[]> {
    try {
      let query = this.client.from('provider_api_keys').select('*');
      if (options?.provider) query = query.eq('provider', options.provider);
      if (options?.service !== undefined) {
        if (options.service == null || options.service === '')
          query = query.or('service.is.null,service.eq.""');
        else query = query.eq('service', options.service);
      }
      const { data, error } = await query.order('provider').order('service').order('priority', { ascending: true });
      if (error) throw new DataAccessError(`listMasked failed: ${error.message}`, 'QUERY_ERROR', error);
      return (data || []).map(fromRow).map(toMasked);
    } catch (e) {
      if (e instanceof DataAccessError) throw e;
      throw new DataAccessError(String(e), 'UNKNOWN_ERROR', e instanceof Error ? e : new Error(String(e)));
    }
  }

  async findById(id: string): Promise<ProviderApiKey | null> {
    const { data, error } = await this.client
      .from('provider_api_keys')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new DataAccessError(`findById failed: ${error.message}`, 'QUERY_ERROR', error);
    return data ? fromRow(data) : null;
  }

  async create(dto: CreateProviderApiKeyDto): Promise<ProviderApiKey> {
    const now = new Date().toISOString();
    const serviceNorm =
      dto.service != null && String(dto.service).trim() !== '' ? String(dto.service).trim() : null;
    const row = {
      provider: dto.provider,
      service: serviceNorm,
      key_value: dto.key_value,
      priority: dto.priority ?? 0,
      is_active: true,
      updated_by: dto.updated_by ?? null,
      created_at: now,
      updated_at: now,
    };
    const { data, error } = await this.client.from('provider_api_keys').insert(row).select().single();
    if (error) throw new DataAccessError(`create failed: ${error.message}`, 'INSERT_ERROR', error);
    return fromRow(data);
  }

  async update(id: string, dto: UpdateProviderApiKeyDto): Promise<ProviderApiKey> {
    const payload: any = { updated_at: new Date().toISOString() };
    if (dto.priority !== undefined) payload.priority = dto.priority;
    if (dto.is_active !== undefined) payload.is_active = dto.is_active;
    if (dto.updated_by !== undefined) payload.updated_by = dto.updated_by;
    const { data, error } = await this.client
      .from('provider_api_keys')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new DataAccessError(`update failed: ${error.message}`, 'UPDATE_ERROR', error);
    return fromRow(data);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.client.from('provider_api_keys').delete().eq('id', id);
    if (error) throw new DataAccessError(`delete failed: ${error.message}`, 'DELETE_ERROR', error);
  }
}
