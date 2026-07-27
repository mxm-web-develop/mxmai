/**
 * Supabase storage_objects 仓库实现
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type {
  CreateStorageObjectDto,
  IStorageObjectRepository,
  ListStorageObjectsByPartnerEndUserOptions,
  ListStorageObjectsByUserOptions,
  StorageObjectRecord,
} from '../../interfaces/IStorageObjectRepository';
import type { StorageDomain } from '../../storage/StorageDomain';
import type { StorageProvider } from '../../storage/StorageProvider';
import { DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

function fromRow(row: Record<string, unknown>): StorageObjectRecord {
  return {
    id: String(row.id),
    user_id: row.user_id != null ? String(row.user_id) : null,
    domain: row.domain as StorageDomain,
    provider: row.provider as StorageProvider,
    bucket: String(row.bucket),
    object_key: String(row.object_key),
    purpose: String(row.purpose),
    storage_mode: (row.storage_mode === 'temp' || row.purpose === 'temp' || row.expires_at
      ? 'temp'
      : 'asset') as StorageObjectRecord['storage_mode'],
    folder_id: row.folder_id != null ? String(row.folder_id) : null,
    partner_app_id: row.partner_app_id != null ? String(row.partner_app_id) : null,
    partner_end_user_id: row.partner_end_user_id != null ? String(row.partner_end_user_id) : null,
    content_type: row.content_type != null ? String(row.content_type) : null,
    size_bytes: row.size_bytes != null ? Number(row.size_bytes) : null,
    original_name: row.original_name != null ? String(row.original_name) : null,
    metadata: (row.metadata as Record<string, unknown>) || {},
    expires_at: row.expires_at != null ? String(row.expires_at) : null,
    deleted_at: row.deleted_at != null ? String(row.deleted_at) : null,
    created_at: String(row.created_at),
  };
}

export class SupabaseStorageObjectRepository implements IStorageObjectRepository {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client || getSupabaseClient();
  }

  async findById(id: string): Promise<StorageObjectRecord | null> {
    const { data, error } = await this.client
      .from('storage_objects')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new DataAccessError(`findById failed: ${error.message}`, 'QUERY_ERROR', error);
    return data ? fromRow(data) : null;
  }

  async findByIdForUser(id: string, userId: string): Promise<StorageObjectRecord | null> {
    const { data, error } = await this.client
      .from('storage_objects')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new DataAccessError(`findByIdForUser failed: ${error.message}`, 'QUERY_ERROR', error);
    return data ? fromRow(data) : null;
  }

  async findByIdForPartnerEndUser(
    id: string,
    partnerAppId: string,
    endUserId: string
  ): Promise<StorageObjectRecord | null> {
    const { data, error } = await this.client
      .from('storage_objects')
      .select('*')
      .eq('id', id)
      .eq('partner_app_id', partnerAppId)
      .eq('partner_end_user_id', endUserId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) {
      throw new DataAccessError(
        `findByIdForPartnerEndUser failed: ${error.message}`,
        'QUERY_ERROR',
        error
      );
    }
    return data ? fromRow(data) : null;
  }

  async listByUser(
    userId: string,
    options?: ListStorageObjectsByUserOptions
  ): Promise<{ items: StorageObjectRecord[]; total: number }> {
    const limit = Math.min(options?.limit ?? 50, 200);
    const offset = options?.offset ?? 0;
    let query = this.client
      .from('storage_objects')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    const uploadSource = options?.uploadSource ?? 'self';
    if (uploadSource === 'self') {
      query = query.is('partner_app_id', null);
    } else if (uploadSource === 'partner') {
      query = query.not('partner_app_id', 'is', null);
    }
    if (options?.partnerAppId) query = query.eq('partner_app_id', options.partnerAppId);
    if (options?.partnerEndUserId) {
      query = query.eq('partner_end_user_id', options.partnerEndUserId);
    }
    if (options?.domain) query = query.eq('domain', options.domain);
    if (options?.purpose) query = query.eq('purpose', options.purpose);
    if (options?.storageMode) query = query.eq('storage_mode', options.storageMode);
    if (options?.storageMode === 'temp') {
      query = query.gt('expires_at', new Date().toISOString());
    }
    if (options && 'folderId' in options) {
      if (options.folderId === null) {
        query = query.is('folder_id', null);
      } else if (options.folderId) {
        query = query.eq('folder_id', options.folderId);
      }
    }
    const { data, error, count } = await query;
    if (error) throw new DataAccessError(`listByUser failed: ${error.message}`, 'QUERY_ERROR', error);
    return { items: (data || []).map(fromRow), total: count ?? 0 };
  }

  async listByPartnerEndUser(
    partnerAppId: string,
    endUserId: string,
    options?: ListStorageObjectsByPartnerEndUserOptions
  ): Promise<{ items: StorageObjectRecord[]; total: number }> {
    const limit = Math.min(options?.limit ?? 50, 200);
    const offset = options?.offset ?? 0;
    let query = this.client
      .from('storage_objects')
      .select('*', { count: 'exact' })
      .eq('partner_app_id', partnerAppId)
      .eq('partner_end_user_id', endUserId)
      .eq('domain', 'user_upload')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (options?.storageMode) query = query.eq('storage_mode', options.storageMode);
    const { data, error, count } = await query;
    if (error) {
      throw new DataAccessError(`listByPartnerEndUser failed: ${error.message}`, 'QUERY_ERROR', error);
    }
    return { items: (data || []).map(fromRow), total: count ?? 0 };
  }

  async listByTempForTaskId(userId: string, taskId: string): Promise<StorageObjectRecord[]> {
    const { data, error } = await this.client
      .from('storage_objects')
      .select('*')
      .eq('user_id', userId)
      .eq('storage_mode', 'temp')
      .eq('domain', 'user_upload')
      .is('deleted_at', null)
      .filter('metadata->>tempForTaskId', 'eq', taskId);
    if (error) {
      throw new DataAccessError(`listByTempForTaskId failed: ${error.message}`, 'QUERY_ERROR', error);
    }
    return (data || []).map(fromRow);
  }

  async listExpiredSoftDeletable(limit = 100): Promise<StorageObjectRecord[]> {
    const { data, error } = await this.client
      .from('storage_objects')
      .select('*')
      .eq('domain', 'user_upload')
      .is('deleted_at', null)
      .not('expires_at', 'is', null)
      .lt('expires_at', new Date().toISOString())
      .limit(limit);
    if (error) {
      throw new DataAccessError(`listExpiredSoftDeletable failed: ${error.message}`, 'QUERY_ERROR', error);
    }
    return (data || []).map(fromRow);
  }

  async listPurgedCandidates(limit = 50): Promise<StorageObjectRecord[]> {
    const { data, error } = await this.client
      .from('storage_objects')
      .select('*')
      .eq('domain', 'user_upload')
      .not('deleted_at', 'is', null)
      .filter('metadata->>purged_at', 'is', null)
      .limit(limit);
    if (error) {
      throw new DataAccessError(`listPurgedCandidates failed: ${error.message}`, 'QUERY_ERROR', error);
    }
    return (data || []).map(fromRow);
  }

  async markPurged(id: string): Promise<void> {
    const { data: row, error: fetchErr } = await this.client
      .from('storage_objects')
      .select('metadata')
      .eq('id', id)
      .single();
    if (fetchErr) {
      throw new DataAccessError(`markPurged fetch failed: ${fetchErr.message}`, 'QUERY_ERROR', fetchErr);
    }
    const metadata = { ...((row?.metadata as Record<string, unknown>) || {}), purged_at: new Date().toISOString() };
    const { error } = await this.client.from('storage_objects').update({ metadata }).eq('id', id);
    if (error) throw new DataAccessError(`markPurged failed: ${error.message}`, 'UPDATE_ERROR', error);
  }

  async listSystem(
    options?: { purpose?: string; limit?: number; offset?: number }
  ): Promise<{ items: StorageObjectRecord[]; total: number }> {
    const limit = Math.min(options?.limit ?? 50, 200);
    const offset = options?.offset ?? 0;
    let query = this.client
      .from('storage_objects')
      .select('*', { count: 'exact' })
      .eq('domain', 'system_static')
      .is('user_id', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (options?.purpose) query = query.eq('purpose', options.purpose);
    const { data, error, count } = await query;
    if (error) throw new DataAccessError(`listSystem failed: ${error.message}`, 'QUERY_ERROR', error);
    return { items: (data || []).map(fromRow), total: count ?? 0 };
  }

  async create(dto: CreateStorageObjectDto): Promise<StorageObjectRecord> {
    const row = {
      user_id: dto.user_id ?? null,
      domain: dto.domain,
      provider: dto.provider,
      bucket: dto.bucket,
      object_key: dto.object_key,
      purpose: dto.purpose,
      storage_mode: dto.storage_mode ?? (dto.purpose === 'temp' ? 'temp' : 'asset'),
      folder_id: dto.folder_id ?? null,
      partner_app_id: dto.partner_app_id ?? null,
      partner_end_user_id: dto.partner_end_user_id ?? null,
      content_type: dto.content_type ?? null,
      size_bytes: dto.size_bytes ?? null,
      original_name: dto.original_name ?? null,
      metadata: dto.metadata ?? {},
      expires_at: dto.expires_at ?? null,
    };
    const { data, error } = await this.client.from('storage_objects').insert(row).select().single();
    if (error) throw new DataAccessError(`create failed: ${error.message}`, 'INSERT_ERROR', error);
    return fromRow(data);
  }

  async updateFolderId(id: string, userId: string, folderId: string | null): Promise<void> {
    const { error } = await this.client
      .from('storage_objects')
      .update({ folder_id: folderId })
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .is('partner_app_id', null);
    if (error) {
      throw new DataAccessError(`updateFolderId failed: ${error.message}`, 'UPDATE_ERROR', error);
    }
  }

  async softDelete(id: string, userId?: string | null): Promise<void> {
    let query = this.client
      .from('storage_objects')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (userId) query = query.eq('user_id', userId);
    const { error } = await query;
    if (error) throw new DataAccessError(`softDelete failed: ${error.message}`, 'UPDATE_ERROR', error);
  }
}
