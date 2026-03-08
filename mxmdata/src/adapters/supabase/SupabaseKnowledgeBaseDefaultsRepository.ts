/**
 * Supabase 知识库默认绑定 Repository 实现
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { uid } from 'uid';
import type {
  IKnowledgeBaseDefaultsRepository,
  KnowledgeBaseDefault,
  CreateKnowledgeBaseDefaultDto,
} from '../../interfaces/IKnowledgeBaseDefaultsRepository';
import { DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

export class SupabaseKnowledgeBaseDefaultsRepository implements IKnowledgeBaseDefaultsRepository {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client || getSupabaseClient();
  }

  async getDefault(scope: string, category: string, subType: string): Promise<string | null> {
    try {
      const { data, error } = await this.client
        .from('knowledge_base_defaults')
        .select('knowledge_base_id')
        .eq('scope', scope)
        .eq('category', category)
        .eq('sub_type', subType)
        .maybeSingle();

      if (error) {
        throw new DataAccessError(
          `Failed to get default KB: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }
      return data?.knowledge_base_id ?? null;
    } catch (error) {
      if (error instanceof DataAccessError) throw error;
      throw new DataAccessError(
        `Unexpected error getting default KB: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  async setDefault(dto: CreateKnowledgeBaseDefaultDto): Promise<KnowledgeBaseDefault> {
    try {
      const { data: existing } = await this.client
        .from('knowledge_base_defaults')
        .select('id')
        .eq('scope', dto.scope)
        .eq('category', dto.category)
        .eq('sub_type', dto.sub_type)
        .maybeSingle();

      const row = {
        scope: dto.scope,
        category: dto.category,
        sub_type: dto.sub_type,
        knowledge_base_id: dto.knowledge_base_id,
      };

      if (existing) {
        const { data, error } = await this.client
          .from('knowledge_base_defaults')
          .update(row)
          .eq('id', existing.id)
          .select()
          .single();

        if (error) {
          throw new DataAccessError(
            `Failed to update default KB: ${error.message}`,
            'UPDATE_ERROR',
            error
          );
        }
        return this.mapRow(data);
      }

      const id = `kbd_${uid(21)}`;
      const { data, error } = await this.client
        .from('knowledge_base_defaults')
        .insert({ id, ...row })
        .select()
        .single();

      if (error) {
        throw new DataAccessError(
          `Failed to insert default KB: ${error.message}`,
          'INSERT_ERROR',
          error
        );
      }
      return this.mapRow(data);
    } catch (error) {
      if (error instanceof DataAccessError) throw error;
      throw new DataAccessError(
        `Unexpected error setting default KB: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  async removeDefault(scope: string, category: string, subType: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('knowledge_base_defaults')
        .delete()
        .eq('scope', scope)
        .eq('category', category)
        .eq('sub_type', subType);

      if (error) {
        throw new DataAccessError(
          `Failed to remove default KB: ${error.message}`,
          'DELETE_ERROR',
          error
        );
      }
    } catch (error) {
      if (error instanceof DataAccessError) throw error;
      throw new DataAccessError(
        `Unexpected error removing default KB: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  async listDefaults(scope?: string): Promise<KnowledgeBaseDefault[]> {
    try {
      let query = this.client.from('knowledge_base_defaults').select('*').order('scope').order('category').order('sub_type');
      if (scope) {
        query = query.eq('scope', scope);
      }
      const { data, error } = await query;

      if (error) {
        throw new DataAccessError(
          `Failed to list default KBs: ${error.message}`,
          'QUERY_ERROR',
          error
        );
      }
      return (data ?? []).map((r) => this.mapRow(r));
    } catch (error) {
      if (error instanceof DataAccessError) throw error;
      throw new DataAccessError(
        `Unexpected error listing default KBs: ${error}`,
        'UNEXPECTED_ERROR',
        error as Error
      );
    }
  }

  private mapRow(r: Record<string, unknown>): KnowledgeBaseDefault {
    return {
      id: r.id as string,
      scope: r.scope as string,
      category: r.category as string,
      sub_type: r.sub_type as string,
      knowledge_base_id: r.knowledge_base_id as string,
      created_at: r.created_at as Date,
      updated_at: r.updated_at as Date,
    };
  }
}
