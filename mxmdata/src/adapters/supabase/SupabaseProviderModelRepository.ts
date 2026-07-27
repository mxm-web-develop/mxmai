import type { IProviderModelRepository } from '../../interfaces/IProviderModelRepository';
import type { ProviderModel } from '../../models/ProviderModel';
import { DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

function fromRow(row: any): ProviderModel {
  return {
    id: row.id,
    provider: row.provider,
    scope: row.scope,
    model_key: row.model_key,
    upstream_model: row.upstream_model ?? null,
    protocol: row.protocol ?? null,
    modality: row.modality ?? null,
    io_schema: row.io_schema ?? null,
    display_name: row.display_name ?? null,
    description: row.description ?? null,
    capabilities: row.capabilities ?? null,
    default_parameters: row.default_parameters ?? null,
    is_enabled: row.is_enabled ?? true,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class SupabaseProviderModelRepository implements IProviderModelRepository {
  private client = getSupabaseClient();

  async list(options?: {
    provider?: string;
    scope?: string;
    onlyEnabled?: boolean;
  }): Promise<ProviderModel[]> {
    try {
      let query = this.client.from('provider_models').select('*');
      if (options?.provider) query = query.eq('provider', options.provider);
      if (options?.scope) query = query.eq('scope', options.scope);
      if (options?.onlyEnabled) query = query.eq('is_enabled', true);

      const { data, error } = await query.order('provider').order('scope').order('model_key');
      if (error) {
        throw new DataAccessError(`ProviderModelRepository.list failed: ${error.message}`, 'QUERY_ERROR', error);
      }
      return (data || []).map(fromRow);
    } catch (e) {
      if (e instanceof DataAccessError) throw e;
      throw new DataAccessError(String(e), 'UNKNOWN_ERROR', e instanceof Error ? e : new Error(String(e)));
    }
  }

  async findById(id: string): Promise<ProviderModel | null> {
    const { data, error } = await this.client
      .from('provider_models')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      throw new DataAccessError(`ProviderModelRepository.findById failed: ${error.message}`, 'QUERY_ERROR', error);
    }
    return data ? fromRow(data) : null;
  }

  async findByKey(params: {
    provider: string;
    scope: string;
    model_key: string;
  }): Promise<ProviderModel | null> {
    const { provider, scope, model_key } = params;
    const { data, error } = await this.client
      .from('provider_models')
      .select('*')
      .eq('provider', provider)
      .eq('scope', scope)
      .eq('model_key', model_key)
      .maybeSingle();
    if (error) {
      throw new DataAccessError(`ProviderModelRepository.findByKey failed: ${error.message}`, 'QUERY_ERROR', error);
    }
    return data ? fromRow(data) : null;
  }

  async upsert(model: Omit<ProviderModel, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<ProviderModel> {
    const payload: any = {
      provider: model.provider,
      scope: model.scope,
      model_key: model.model_key,
      upstream_model: model.upstream_model,
      protocol: model.protocol,
      modality: model.modality,
      io_schema: model.io_schema,
      display_name: model.display_name,
      description: model.description,
      capabilities: model.capabilities,
      default_parameters: model.default_parameters,
      is_enabled: model.is_enabled,
    };
    if (model.id) {
      payload.id = model.id;
    }
    const { error } = await this.client
      .from('provider_models')
      .upsert(payload, { onConflict: 'provider,scope,model_key' });
    if (error) {
      throw new DataAccessError(`ProviderModelRepository.upsert failed: ${error.message}`, 'UPSERT_ERROR', error);
    }
    const saved = await this.findByKey({
      provider: model.provider,
      scope: model.scope,
      model_key: model.model_key,
    });
    if (!saved) {
      throw new DataAccessError(
        'ProviderModelRepository.upsert succeeded but row not found after write',
        'UPSERT_ERROR',
      );
    }
    return saved;
  }

  async update(
    id: string,
    patch: Partial<Omit<ProviderModel, 'id' | 'created_at' | 'updated_at'>>
  ): Promise<ProviderModel> {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const allowed = [
      'provider', 'scope', 'model_key', 'upstream_model', 'protocol', 'modality', 'io_schema',
      'display_name', 'description', 'capabilities', 'default_parameters', 'is_enabled',
    ];
    for (const k of allowed) {
      if ((patch as Record<string, unknown>)[k] !== undefined) {
        payload[k] = (patch as Record<string, unknown>)[k];
      }
    }
    const { data, error } = await this.client
      .from('provider_models')
      .update(payload)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) {
      throw new DataAccessError(`ProviderModelRepository.update failed: ${error.message}`, 'UPDATE_ERROR', error);
    }
    return fromRow(data);
  }

  async setEnabled(id: string, isEnabled: boolean): Promise<ProviderModel> {
    const { data, error } = await this.client
      .from('provider_models')
      .update({ is_enabled: isEnabled, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) {
      throw new DataAccessError(`ProviderModelRepository.setEnabled failed: ${error.message}`, 'UPDATE_ERROR', error);
    }
    return fromRow(data);
  }

  async deleteById(id: string): Promise<void> {
    const { error } = await this.client.from('provider_models').delete().eq('id', id);
    if (error) {
      throw new DataAccessError(`ProviderModelRepository.deleteById failed: ${error.message}`, 'UPDATE_ERROR', error);
    }
  }
}

