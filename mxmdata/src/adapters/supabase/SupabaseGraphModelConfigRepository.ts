/**
 * Supabase Graph 模型配置 Repository 实现
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type {
  IGraphModelConfigRepository,
  GraphModelConfig,
  UpsertGraphModelConfigDto,
} from '../../interfaces/IGraphModelConfigRepository';
import { DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

function fromRow(row: any): GraphModelConfig {
  return {
    id: row.id,
    scope: row.scope,
    graph_type: row.graph_type,
    sub_type: row.sub_type,
    logical_model: row.logical_model,
    provider: row.provider,
    enabled: row.enabled,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class SupabaseGraphModelConfigRepository implements IGraphModelConfigRepository {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client || getSupabaseClient();
  }

  async findConfig(scope: string, graphType: string, subType: string): Promise<GraphModelConfig | null> {
    try {
      let query = this.client
        .from('graph_model_config')
        .select('*')
        .eq('scope', scope)
        .eq('graph_type', graphType);

      // subType 为 null 或空字符串时查询 IS NULL
      if (subType === null || subType === '') {
        query = query.is('sub_type', null);
      } else {
        query = query.eq('sub_type', subType);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        throw new DataAccessError(
          `Failed to get graph model config: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return data ? fromRow(data) : null;
    } catch (err) {
      if (err instanceof DataAccessError) throw err;
      throw new DataAccessError(
        `Unexpected error getting graph model config: ${err}`,
        'UNEXPECTED_ERROR',
        err as Error
      );
    }
  }

  async upsertConfig(dto: UpsertGraphModelConfigDto): Promise<GraphModelConfig> {
    try {
      const existing = await this.findConfig(dto.scope, dto.graph_type, dto.sub_type);

      const row = {
        scope: dto.scope,
        graph_type: dto.graph_type,
        sub_type: dto.sub_type,
        logical_model: dto.logical_model,
        provider: dto.provider ?? 'qhai',
        enabled: dto.enabled ?? true,
      };

      if (existing) {
        const { data, error } = await this.client
          .from('graph_model_config')
          .update(row)
          .eq('id', existing.id)
          .select()
          .single();

        if (error) {
          throw new DataAccessError(
            `Failed to update graph model config: ${error.message}`,
            'UPDATE_ERROR',
            error
          );
        }

        return fromRow(data);
      }

      const { data, error } = await this.client
        .from('graph_model_config')
        .insert(row)
        .select()
        .single();

      if (error) {
        throw new DataAccessError(
          `Failed to insert graph model config: ${error.message}`,
          'INSERT_ERROR',
          error
        );
      }

      return fromRow(data);
    } catch (err) {
      if (err instanceof DataAccessError) throw err;
      throw new DataAccessError(
        `Unexpected error upserting graph model config: ${err}`,
        'UNEXPECTED_ERROR',
        err as Error
      );
    }
  }

  async listConfigs(scope?: string): Promise<GraphModelConfig[]> {
    try {
      let query = this.client.from('graph_model_config').select('*').order('scope').order('graph_type').order('sub_type');
      if (scope) {
        query = query.eq('scope', scope);
      }

      const { data, error } = await query;

      if (error) {
        throw new DataAccessError(
          `Failed to list graph model configs: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }

      return (data ?? []).map(fromRow);
    } catch (err) {
      if (err instanceof DataAccessError) throw err;
      throw new DataAccessError(
        `Unexpected error listing graph model configs: ${err}`,
        'UNEXPECTED_ERROR',
        err as Error
      );
    }
  }
}

