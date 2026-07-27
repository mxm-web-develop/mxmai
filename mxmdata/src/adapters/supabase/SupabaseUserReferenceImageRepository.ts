/**
 * Supabase 用户参考图记录仓库实现
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { IUserReferenceImageRepository, UserReferenceImage, CreateUserReferenceImageDto } from '../../interfaces/IUserReferenceImageRepository';
import { DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

function fromRow(row: any): UserReferenceImage {
  return {
    id: row.id,
    user_id: row.user_id,
    r2_bucket: row.r2_bucket,
    r2_key: row.r2_key,
    r2_url: row.r2_url,
    original_name: row.original_name ?? null,
    content_type: row.content_type ?? null,
    file_size_bytes: row.file_size_bytes ?? null,
    tag: row.tag ?? null,
    deleted_at: row.deleted_at ?? null,
    created_at: row.created_at,
  };
}

export class SupabaseUserReferenceImageRepository implements IUserReferenceImageRepository {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client || getSupabaseClient();
  }

  async findById(id: string): Promise<UserReferenceImage | null> {
    try {
      const { data, error } = await this.client
        .from('user_reference_images')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle();

      if (error) {
        throw new DataAccessError(`findById failed: ${error.message}`, 'QUERY_ERROR', error);
      }
      return data ? fromRow(data) : null;
    } catch (e) {
      if (e instanceof DataAccessError) throw e;
      throw new DataAccessError(`findById unexpected: ${e}`, 'UNKNOWN_ERROR', e instanceof Error ? e : new Error(String(e)));
    }
  }

  async findByIdForUser(id: string, userId: string): Promise<UserReferenceImage | null> {
    try {
      const { data, error } = await this.client
        .from('user_reference_images')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .maybeSingle();

      if (error) {
        throw new DataAccessError(`findByIdForUser failed: ${error.message}`, 'QUERY_ERROR', error);
      }
      return data ? fromRow(data) : null;
    } catch (e) {
      if (e instanceof DataAccessError) throw e;
      throw new DataAccessError(
        `findByIdForUser unexpected: ${e}`,
        'UNKNOWN_ERROR',
        e instanceof Error ? e : new Error(String(e))
      );
    }
  }

  async listByUser(userId: string, options?: { limit?: number; offset?: number }): Promise<{ items: UserReferenceImage[]; total: number }> {
    try {
      const limit = Math.min(options?.limit ?? 50, 200);
      const offset = options?.offset ?? 0;

      const query = this.client
        .from('user_reference_images')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        throw new DataAccessError(`listByUser failed: ${error.message}`, 'QUERY_ERROR', error);
      }
      return {
        items: (data || []).map(fromRow),
        total: count ?? 0,
      };
    } catch (e) {
      if (e instanceof DataAccessError) throw e;
      throw new DataAccessError(`listByUser unexpected: ${e}`, 'UNKNOWN_ERROR', e instanceof Error ? e : new Error(String(e)));
    }
  }

  async create(dto: CreateUserReferenceImageDto): Promise<UserReferenceImage> {
    try {
      const row = {
        user_id: dto.user_id,
        r2_bucket: dto.r2_bucket,
        r2_key: dto.r2_key,
        r2_url: dto.r2_url,
        original_name: dto.original_name ?? null,
        content_type: dto.content_type ?? null,
        file_size_bytes: dto.file_size_bytes ?? null,
        tag: dto.tag ?? null,
      };

      const { data, error } = await this.client
        .from('user_reference_images')
        .insert(row)
        .select()
        .single();

      if (error) {
        throw new DataAccessError(`create failed: ${error.message}`, 'INSERT_ERROR', error);
      }
      return fromRow(data);
    } catch (e) {
      if (e instanceof DataAccessError) throw e;
      throw new DataAccessError(`create unexpected: ${e}`, 'UNKNOWN_ERROR', e instanceof Error ? e : new Error(String(e)));
    }
  }

  async softDelete(id: string, userId: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('user_reference_images')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        throw new DataAccessError(`softDelete failed: ${error.message}`, 'UPDATE_ERROR', error);
      }
    } catch (e) {
      if (e instanceof DataAccessError) throw e;
      throw new DataAccessError(`softDelete unexpected: ${e}`, 'UNKNOWN_ERROR', e instanceof Error ? e : new Error(String(e)));
    }
  }

  async cleanup(daysOld: number): Promise<number> {
    try {
      const { data, error } = await this.client.rpc('cleanup_old_reference_images', { days_to_keep: daysOld });
      if (error) {
        throw new DataAccessError(`cleanup failed: ${error.message}`, 'RPC_ERROR', error);
      }
      return data as number;
    } catch (e) {
      if (e instanceof DataAccessError) throw e;
      throw new DataAccessError(`cleanup unexpected: ${e}`, 'UNKNOWN_ERROR', e instanceof Error ? e : new Error(String(e)));
    }
  }
}
