/**
 * Supabase 提示词工程配置数据仓库实现
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { IPromptEngineeringConfigRepository, ListPromptConfigOptions } from '../../interfaces/IPromptEngineeringConfigRepository';
import type {
  PromptEngineeringConfig,
  CreatePromptEngineeringConfigDto,
} from '../../models/PromptEngineeringConfig';
import { DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

function fromRow(row: any): PromptEngineeringConfig {
  return {
    id: row.id,
    scope: row.scope,
    type: row.type,
    subtype: row.subtype ?? null,
    rules_i18n: row.rules_i18n ?? {},
    output_format_i18n: row.output_format_i18n ?? {},
    form_options_i18n: row.form_options_i18n ?? null,
    extra: row.extra ?? null,
    is_active: row.is_active ?? true,
    updated_by: row.updated_by ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class SupabasePromptEngineeringConfigRepository implements IPromptEngineeringConfigRepository {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client || getSupabaseClient();
  }

  async findByKey(scope: string, type: string, subtype?: string | null): Promise<PromptEngineeringConfig | null> {
    try {
      let query = this.client
        .from('prompt_engineering_config')
        .select('*')
        .eq('scope', scope)
        .eq('type', type);

      if (subtype != null && subtype !== '') {
        query = query.eq('subtype', subtype);
      } else {
        query = query.is('subtype', null);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        throw new DataAccessError(`findByKey failed: ${error.message}`, 'QUERY_ERROR', error);
      }
      return data ? fromRow(data) : null;
    } catch (e) {
      if (e instanceof DataAccessError) throw e;
      throw new DataAccessError(`findByKey unexpected: ${e}`, 'UNKNOWN_ERROR', e instanceof Error ? e : new Error(String(e)));
    }
  }

  async findById(id: string): Promise<PromptEngineeringConfig | null> {
    try {
      const { data, error } = await this.client
        .from('prompt_engineering_config')
        .select('*')
        .eq('id', id)
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

  async list(options?: ListPromptConfigOptions): Promise<{ items: PromptEngineeringConfig[]; total: number }> {
    try {
      const limit = Math.min(options?.limit ?? 100, 500);
      const offset = options?.offset ?? 0;

      let query = this.client
        .from('prompt_engineering_config')
        .select('*', { count: 'exact' });

      if (options?.scope) query = query.eq('scope', options.scope);
      if (options?.type) query = query.eq('type', options.type);
      if (options?.subtype != null && options.subtype !== '') {
        query = query.eq('subtype', options.subtype);
      } else if (options?.subtype === null) {
        query = query.is('subtype', null);
      }

      const { data, error, count } = await query.order('updated_at', { ascending: false }).range(offset, offset + limit - 1);

      if (error) {
        throw new DataAccessError(`list failed: ${error.message}`, 'QUERY_ERROR', error);
      }
      return {
        items: (data || []).map(fromRow),
        total: count ?? 0,
      };
    } catch (e) {
      if (e instanceof DataAccessError) throw e;
      throw new DataAccessError(`list unexpected: ${e}`, 'UNKNOWN_ERROR', e instanceof Error ? e : new Error(String(e)));
    }
  }

  async upsert(dto: CreatePromptEngineeringConfigDto): Promise<PromptEngineeringConfig> {
    try {
      const existing = await this.findByKey(dto.scope, dto.type, dto.subtype ?? null);
      const now = new Date().toISOString();
      // rules_i18n 列保留为 NOT NULL JSONB，产品侧已弃用；固定写入 {}，不再接受正文（统一走 extra.taskTemplate.unifiedTemplate）
      const payload = {
        rules_i18n: {} as Record<string, string>,
        output_format_i18n: dto.output_format_i18n ?? {},
        form_options_i18n: dto.form_options_i18n ?? null,
        extra: dto.extra ?? null,
        is_active: dto.is_active ?? true,
        updated_by: dto.updated_by ?? null,
        updated_at: now,
      };

      if (existing) {
        // 更新时合并 extra，避免前端只提交部分字段时覆盖 DB 中已有的其他 extra 字段（如 promptTextTaskKey）
        // dto.extra = null/undefined → 保留 DB 原有的 extra（不做覆盖）
        // dto.extra = {} → 保留 DB 原有的 extra（空对象不覆盖）
        // dto.extra = {k: v} → 合并到 DB 原有的 extra
        let mergedExtra: Record<string, unknown> | null;
        if (dto.extra != null && typeof dto.extra === 'object') {
          const incoming = dto.extra as Record<string, unknown>;
          if (Object.keys(incoming).length === 0) {
            mergedExtra = existing.extra ?? null;
          } else {
            const existingExtra = (existing.extra ?? {}) as Record<string, unknown>;
            const incomingTpl = incoming.taskTemplate as Record<string, unknown> | undefined;
            if (incomingTpl && typeof incomingTpl === 'object') {
              mergedExtra = {
                ...existingExtra,
                ...incoming,
                taskTemplate: {
                  ...(typeof existingExtra.taskTemplate === 'object' && existingExtra.taskTemplate
                    ? (existingExtra.taskTemplate as Record<string, unknown>)
                    : {}),
                  ...incomingTpl,
                  ...(incomingTpl.formSchema ? { formSchema: incomingTpl.formSchema } : {}),
                },
              };
            } else {
              mergedExtra = { ...existingExtra, ...incoming };
            }
          }
        } else {
          // null/undefined：保留 DB 原有 extra
          mergedExtra = existing.extra ?? null;
        }
        const updatePayload = {
          ...payload,
          extra: mergedExtra,
        };
        const { data, error } = await this.client
          .from('prompt_engineering_config')
          .update(updatePayload)
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw new DataAccessError(`upsert update failed: ${error.message}`, 'UPDATE_ERROR', error);
        return fromRow(data);
      }

      const id = dto.id ?? crypto.randomUUID();
      const insertRow = {
        id,
        scope: dto.scope,
        type: dto.type,
        subtype: dto.subtype ?? null,
        ...payload,
        created_at: now,
      };
      const { data, error } = await this.client
        .from('prompt_engineering_config')
        .insert(insertRow)
        .select()
        .single();
      if (error) throw new DataAccessError(`upsert insert failed: ${error.message}`, 'INSERT_ERROR', error);
      return fromRow(data);
    } catch (e) {
      if (e instanceof DataAccessError) throw e;
      throw new DataAccessError(`upsert unexpected: ${e}`, 'UNKNOWN_ERROR', e instanceof Error ? e : new Error(String(e)));
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('prompt_engineering_config')
        .delete()
        .eq('id', id);

      if (error) {
        throw new DataAccessError(`delete failed: ${error.message}`, 'DELETE_ERROR', error);
      }
    } catch (e) {
      if (e instanceof DataAccessError) throw e;
      throw new DataAccessError(`delete unexpected: ${e}`, 'UNKNOWN_ERROR', e instanceof Error ? e : new Error(String(e)));
    }
  }
}
