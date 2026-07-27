/**
 * Search 搜索引擎配置 Repository 实现
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type {
  ISearchScopeConfigRepository,
  SearchScopeConfig,
  UpsertSearchScopeConfigDto,
  ListSearchScopeConfigOptions,
} from '../../interfaces/ISearchScopeConfigRepository';
import { DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

function fromRow(row: any): SearchScopeConfig {
  return {
    id: row.id,
    scope: row.scope,
    task_key: row.task_key,
    sub_type: row.sub_type,
    provider: row.provider,
    enabled: row.enabled,
    extra: row.extra ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class SupabaseSearchScopeConfigRepository implements ISearchScopeConfigRepository {
  private client: SupabaseClient;
  private readonly tableName = 'search_scope_config';

  constructor(client?: SupabaseClient) {
    this.client = client || getSupabaseClient();
  }

  async findConfig(
    scope: string,
    taskKey: string,
    subType: string
  ): Promise<SearchScopeConfig | null> {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select('*')
        .eq('scope', scope)
        .eq('task_key', taskKey)
        .eq('sub_type', subType)
        .maybeSingle();

      if (error) {
        throw new DataAccessError(`findConfig failed: ${error.message}`, 'QUERY_ERROR', error);
      }

      return data ? fromRow(data) : null;
    } catch (err) {
      if (err instanceof DataAccessError) throw err;
      throw new DataAccessError(
        `Unexpected error in findConfig: ${err}`,
        'UNEXPECTED_ERROR',
        err as Error
      );
    }
  }

  async findByProvider(provider: string): Promise<SearchScopeConfig | null> {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select('*')
        .eq('task_key', provider)
        .eq('sub_type', 'default')
        .maybeSingle();

      if (error) {
        throw new DataAccessError(`findByProvider failed: ${error.message}`, 'QUERY_ERROR', error);
      }

      return data ? fromRow(data) : null;
    } catch (err) {
      if (err instanceof DataAccessError) throw err;
      throw new DataAccessError(
        `Unexpected error in findByProvider: ${err}`,
        'UNEXPECTED_ERROR',
        err as Error
      );
    }
  }

  async upsertConfig(dto: UpsertSearchScopeConfigDto): Promise<SearchScopeConfig> {
    try {
      const row: Record<string, unknown> = {
        scope: dto.scope || 'search',
        task_key: dto.task_key,
        sub_type: dto.sub_type || 'default',
        provider: dto.provider || dto.task_key,
        enabled: dto.enabled ?? true,
        extra: dto.extra || {},
        updated_at: new Date().toISOString(),
      };

      // 查找是否存在
      const { data: existing } = await this.client
        .from(this.tableName)
        .select('id')
        .eq('scope', row.scope as string)
        .eq('task_key', row.task_key as string)
        .eq('sub_type', row.sub_type as string)
        .maybeSingle();

      let result;
      if (existing) {
        const { data, error } = await this.client
          .from(this.tableName)
          .update(row)
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw new DataAccessError(`update failed: ${error.message}`, 'UPDATE_ERROR', error);
        result = data;
      } else {
        const { data, error } = await this.client
          .from(this.tableName)
          .insert(row)
          .select()
          .single();

        if (error) throw new DataAccessError(`insert failed: ${error.message}`, 'INSERT_ERROR', error);
        result = data;
      }

      return fromRow(result);
    } catch (err) {
      if (err instanceof DataAccessError) throw err;
      throw new DataAccessError(
        `Unexpected error in upsertConfig: ${err}`,
        'UNEXPECTED_ERROR',
        err as Error
      );
    }
  }

  async listConfigs(
    options?: ListSearchScopeConfigOptions
  ): Promise<{ items: SearchScopeConfig[]; total: number }> {
    try {
      let query = this.client.from(this.tableName).select('*', { count: 'exact' });

      if (options?.scope) {
        query = query.eq('scope', options.scope);
      }
      if (options?.task_key) {
        query = query.eq('task_key', options.task_key);
      }

      query = query.order('task_key').order('sub_type');

      if (options?.limit) {
        query = query.limit(options.limit);
      }
      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit ?? 100) - 1);
      }

      const { data, error, count } = await query;

      if (error) throw new DataAccessError(`listConfigs failed: ${error.message}`, 'QUERY_ERROR', error);

      return {
        items: (data ?? []).map(fromRow),
        total: count ?? 0,
      };
    } catch (err) {
      if (err instanceof DataAccessError) throw err;
      throw new DataAccessError(
        `Unexpected error in listConfigs: ${err}`,
        'UNEXPECTED_ERROR',
        err as Error
      );
    }
  }

  async deleteConfig(id: string): Promise<void> {
    try {
      const { error } = await this.client.from(this.tableName).delete().eq('id', id);

      if (error) {
        throw new DataAccessError(`deleteConfig failed: ${error.message}`, 'DELETE_ERROR', error);
      }
    } catch (err) {
      if (err instanceof DataAccessError) throw err;
      throw new DataAccessError(
        `Unexpected error in deleteConfig: ${err}`,
        'UNEXPECTED_ERROR',
        err as Error
      );
    }
  }
}
