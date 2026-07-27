/**
 * 用户 API Key 仓库：仅存 key_hash，列表不返回明文
 */

import type {
  IUserApiKeyRepository,
  CreateUserApiKeyDto,
  UserApiKeyRecord,
  UserApiKeyByHash,
  UserApiKeyListItem,
  UserApiKeyType,
  CountUserApiKeysByTypeResult,
} from '../../interfaces/IUserApiKeyRepository';
import { DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

const TABLE = 'user_api_keys';

function normalizeKeyType(v: unknown): UserApiKeyType {
  return v === 'integration' ? 'integration' : 'personal';
}

function toRecord(row: any): UserApiKeyRecord {
  return {
    id: row.id,
    user_id: row.user_id,
    key_hash: row.key_hash,
    key_prefix: row.key_prefix,
    key_type: normalizeKeyType(row.key_type),
    name: row.name ?? null,
    created_at: row.created_at,
    last_used_at: row.last_used_at ?? null,
    expires_at: row.expires_at ?? null,
  };
}

function toByHash(row: any): UserApiKeyByHash {
  return {
    id: row.id,
    user_id: row.user_id,
    key_prefix: row.key_prefix,
    key_type: normalizeKeyType(row.key_type),
    name: row.name ?? null,
    created_at: row.created_at,
    last_used_at: row.last_used_at ?? null,
    expires_at: row.expires_at ?? null,
  };
}

function toListItem(row: any): UserApiKeyListItem {
  return {
    id: row.id,
    key_prefix: row.key_prefix,
    key_type: normalizeKeyType(row.key_type),
    name: row.name ?? null,
    created_at: row.created_at,
    last_used_at: row.last_used_at ?? null,
    expires_at: row.expires_at ?? null,
  };
}

export class SupabaseUserApiKeyRepository implements IUserApiKeyRepository {
  private client = getSupabaseClient();

  async create(data: CreateUserApiKeyDto): Promise<UserApiKeyRecord> {
    const row = {
      user_id: data.userId,
      key_hash: data.keyHash,
      key_prefix: data.keyPrefix,
      key_type: data.keyType,
      name: data.name ?? null,
      expires_at: data.expiresAt ?? null,
    };
    const { data: inserted, error } = await this.client.from(TABLE).insert(row).select().single();
    if (error) throw new DataAccessError(`user_api_keys create failed: ${error.message}`, 'INSERT_ERROR', error);
    return toRecord(inserted);
  }

  async findByKeyHash(keyHash: string): Promise<UserApiKeyByHash | null> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('id, user_id, key_prefix, key_type, name, created_at, last_used_at, expires_at')
      .eq('key_hash', keyHash)
      .maybeSingle();
    if (error) throw new DataAccessError(`user_api_keys findByKeyHash failed: ${error.message}`, 'QUERY_ERROR', error);
    return data ? toByHash(data) : null;
  }

  async listByUserId(userId: string): Promise<UserApiKeyListItem[]> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('id, key_prefix, key_type, name, created_at, last_used_at, expires_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new DataAccessError(`user_api_keys listByUserId failed: ${error.message}`, 'QUERY_ERROR', error);
    return (data || []).map(toListItem);
  }

  async countByUserIdAndType(userId: string): Promise<CountUserApiKeysByTypeResult> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('key_type')
      .eq('user_id', userId);
    if (error) {
      throw new DataAccessError(`user_api_keys countByUserIdAndType failed: ${error.message}`, 'QUERY_ERROR', error);
    }
    let personal = 0;
    let integration = 0;
    for (const row of data ?? []) {
      if (normalizeKeyType(row.key_type) === 'integration') integration += 1;
      else personal += 1;
    }
    return { personal, integration };
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from(TABLE)
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id');
    if (error) throw new DataAccessError(`user_api_keys delete failed: ${error.message}`, 'DELETE_ERROR', error);
    return (data?.length ?? 0) > 0;
  }

  async updateLastUsedAt(id: string): Promise<void> {
    const { error } = await this.client
      .from(TABLE)
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new DataAccessError(`user_api_keys updateLastUsedAt failed: ${error.message}`, 'UPDATE_ERROR', error);
  }
}
