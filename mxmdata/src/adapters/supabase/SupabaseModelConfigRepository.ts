/**
 * Supabase Admin 模型配置 Repository 实现
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type {
  IModelConfigRepository,
  ModelConfig,
  UpsertModelConfigDto,
} from '../../interfaces/IModelConfigRepository';
import { DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

function normalizeAllowedBusinesses(raw: unknown): import('../../interfaces/IModelConfigRepository').AgentAllowedBusiness[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  return raw
    .filter((x) => x && typeof x === 'object' && typeof (x as any).scope === 'string' && typeof (x as any).taskKey === 'string')
    .map((x: any) => ({
      scope: String(x.scope),
      taskKey: String(x.taskKey),
      subtype: x.subtype == null || x.subtype === '' ? null : String(x.subtype),
    }));
}

function fromRow(row: any): ModelConfig {
  return {
    id: row.id,
    model_key: row.model_key,
    provider: row.provider ?? null,
    temperature: row.temperature ?? 0.7,
    max_tokens: row.max_tokens ?? null,
    top_p: row.top_p ?? null,
    frequency_penalty: row.frequency_penalty ?? null,
    presence_penalty: row.presence_penalty ?? null,
    max_loop_rounds: row.max_loop_rounds ?? 12,
    run_timeout_ms: row.run_timeout_ms ?? 600_000,
    system_prompt_extra: row.system_prompt_extra ?? null,
    welcome_message: row.welcome_message ?? null,
    tools_enabled: row.tools_enabled !== false,
    allowed_businesses: normalizeAllowedBusinesses(row.allowed_businesses),
    smartflow_enabled: row.smartflow_enabled !== false,
    updated_at: row.updated_at,
  };
}

export class SupabaseModelConfigRepository implements IModelConfigRepository {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client || getSupabaseClient();
  }

  async getConfig(): Promise<ModelConfig> {
    try {
      const { data, error } = await this.client
        .from('model_config')
        .select('*')
        .eq('id', 'default')
        .maybeSingle();

      if (error) {
        throw new DataAccessError(
          `Failed to get model config: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      if (!data) {
        // 如果没有配置，创建一个默认的
        return this.upsertConfig({ id: 'default', model_key: 'deer/glm-5-turbo', temperature: 0.7 });
      }

      return fromRow(data);
    } catch (err) {
      if (err instanceof DataAccessError) throw err;
      throw new DataAccessError(
        `Unexpected error getting model config: ${err}`,
        'UNEXPECTED_ERROR',
        err as Error
      );
    }
  }

  async upsertConfig(dto: UpsertModelConfigDto): Promise<ModelConfig> {
    try {
      const row = {
        id: dto.id || 'default',
        model_key: dto.model_key,
        provider: dto.provider ?? null,
        temperature: dto.temperature ?? 0.7,
        max_tokens: dto.max_tokens ?? null,
        top_p: dto.top_p ?? null,
        frequency_penalty: dto.frequency_penalty ?? null,
        presence_penalty: dto.presence_penalty ?? null,
        max_loop_rounds: dto.max_loop_rounds ?? 12,
        run_timeout_ms: dto.run_timeout_ms ?? 600_000,
        system_prompt_extra: dto.system_prompt_extra ?? null,
        welcome_message: dto.welcome_message ?? null,
        tools_enabled: dto.tools_enabled !== false,
        allowed_businesses:
          dto.allowed_businesses === undefined ? null : normalizeAllowedBusinesses(dto.allowed_businesses),
        smartflow_enabled: dto.smartflow_enabled !== false,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await this.client
        .from('model_config')
        .upsert(row, { onConflict: 'id' })
        .select()
        .single();

      if (error) {
        throw new DataAccessError(
          `Failed to upsert model config: ${error.message}`,
          'UPSERT_ERROR',
          error
        );
      }

      return fromRow(data);
    } catch (err) {
      if (err instanceof DataAccessError) throw err;
      throw new DataAccessError(
        `Unexpected error upserting model config: ${err}`,
        'UNEXPECTED_ERROR',
        err as Error
      );
    }
  }
}
