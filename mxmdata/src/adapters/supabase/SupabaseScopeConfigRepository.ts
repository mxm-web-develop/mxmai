/**
 * 通用业务模型路由配置 Repository 实现
 * 通过构造函数传入表名，支持所有 scope 的路由表
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type {
  IScopeConfigRepository,
  ScopeConfig,
  UpsertScopeConfigDto,
  ListScopeConfigOptions,
} from '../../interfaces/IScopeConfigRepository';
import { DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

function fromRow(row: any): ScopeConfig {
  return {
    id: row.id,
    scope: row.scope,
    task_key: row.task_key,
    sub_type: row.sub_type,
    model: row.model,
    provider: row.provider,
    enabled: row.enabled,
    margin: row.margin ?? undefined,
    charge_metric: row.charge_metric ?? undefined,
    price_in_tokens: row.price_in_tokens ?? undefined,
    min_charge_tokens: row.min_charge_tokens ?? undefined,
    sensitive_word_list_ids: row.sensitive_word_list_ids ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class SupabaseScopeConfigRepository implements IScopeConfigRepository {
  private client: SupabaseClient;
  protected readonly tableName: string;

  constructor(tableName: string, client?: SupabaseClient) {
    this.tableName = tableName;
    this.client = client || getSupabaseClient();
  }

  /**
   * 查询配置：优先精确匹配 (scope, task_key, sub_type)
   * 精确查不到时，fallback 查询 (scope, task_key, 'default')
   */
  async findConfig(scope: string, taskKey: string, subType: string): Promise<ScopeConfig | null> {
    try {
      // 精确查询
      let { data, error } = await this.client
        .from(this.tableName)
        .select('*')
        .eq('scope', scope)
        .eq('task_key', taskKey)
        .eq('sub_type', subType)
        .maybeSingle();

      if (error) {
        throw new DataAccessError(`findConfig failed: ${error.message}`, 'QUERY_ERROR', error);
      }

      if (data) return fromRow(data);

      // fallback: subType 不是 'default' 时，查 'default' 兜底
      if (subType !== 'default') {
        const { data: fallbackData, error: fallbackError } = await this.client
          .from(this.tableName)
          .select('*')
          .eq('scope', scope)
          .eq('task_key', taskKey)
          .eq('sub_type', 'default')
          .maybeSingle();

        if (fallbackError) {
          throw new DataAccessError(`findConfig fallback failed: ${fallbackError.message}`, 'QUERY_ERROR', fallbackError);
        }

        return fallbackData ? fromRow(fallbackData) : null;
      }

      return null;
    } catch (err) {
      if (err instanceof DataAccessError) throw err;
      throw new DataAccessError(
        `Unexpected error in findConfig: ${err}`,
        'UNEXPECTED_ERROR',
        err as Error
      );
    }
  }

  async upsertConfig(dto: UpsertScopeConfigDto): Promise<ScopeConfig> {
    try {
      const row: Record<string, unknown> = {
        scope: dto.scope,
        task_key: dto.task_key,
        sub_type: dto.sub_type || 'default',
        provider:
          dto.provider ||
          (dto.scope === 'graph' ? 'qhai' : dto.scope === 'text' ? 'openrouter' : 'replicate'),
        enabled: dto.enabled ?? true,
        updated_at: new Date().toISOString(),
      };
      if (dto.model !== undefined) row.model = dto.model;
      // 仅 text_scope_config 表含 logical_model 列；graph/writing 等表勿写入（见 providers.ts POST /routing）
      if (dto.logical_model !== undefined && this.tableName === 'text_scope_config') {
        row.logical_model = dto.logical_model;
      }
      if (dto.margin !== undefined) row.margin = dto.margin;
      if (dto.charge_metric !== undefined) row.charge_metric = dto.charge_metric;
      if (dto.price_in_tokens !== undefined) row.price_in_tokens = dto.price_in_tokens;
      if (dto.min_charge_tokens !== undefined) row.min_charge_tokens = dto.min_charge_tokens;
      if (dto.sensitive_word_list_ids !== undefined) row.sensitive_word_list_ids = dto.sensitive_word_list_ids;

      // 查找是否存在
      const { data: existing } = await this.client
        .from(this.tableName)
        .select('id')
        .eq('scope', row.scope)
        .eq('task_key', row.task_key)
        .eq('sub_type', row.sub_type)
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

  async listConfigs(options?: ListScopeConfigOptions): Promise<{ items: ScopeConfig[]; total: number }> {
    try {
      let query = this.client.from(this.tableName).select('*', { count: 'exact' });

      if (options?.scope) {
        query = query.eq('scope', options.scope);
      }
      if (options?.task_key) {
        query = query.eq('task_key', options.task_key);
      }

      query = query.order('scope').order('task_key').order('sub_type');

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

}
