import type {
  IPublishedApiRepository,
  CreatePublishedApiDto,
  UpdatePublishedApiDto,
  ListPublishedApisQuery,
  PublishedApiRecord,
  PublishedApiInputDoc,
} from '../../interfaces/IPublishedApiRepository';
import { DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

const TABLE = 'published_apis';

function toInputDoc(raw: unknown): PublishedApiInputDoc {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as PublishedApiInputDoc;
}

function toRecord(row: any): PublishedApiRecord {
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    owner_user_id: row.owner_user_id,
    title: row.title,
    description: row.description ?? null,
    task_v2_scope: row.task_v2_scope ?? null,
    task_v2_task_key: row.task_v2_task_key ?? null,
    task_v2_subtype: row.task_v2_subtype ?? null,
    smartflow_id: row.smartflow_id ?? null,
    input_schema_snapshot:
      row.input_schema_snapshot && typeof row.input_schema_snapshot === 'object'
        ? (row.input_schema_snapshot as Record<string, unknown>)
        : {},
    input_doc: toInputDoc(row.input_doc),
    schema_version: Number(row.schema_version ?? 1),
    is_enabled: row.is_enabled !== false,
    published_at: row.published_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class SupabasePublishedApiRepository implements IPublishedApiRepository {
  private client = getSupabaseClient();

  async create(data: CreatePublishedApiDto): Promise<PublishedApiRecord> {
    const now = new Date().toISOString();
    const row = {
      slug: data.slug,
      kind: data.kind,
      owner_user_id: data.ownerUserId,
      title: data.title,
      description: data.description ?? null,
      task_v2_scope: data.taskV2Scope ?? null,
      task_v2_task_key: data.taskV2TaskKey ?? null,
      task_v2_subtype: data.taskV2Subtype ?? null,
      smartflow_id: data.smartflowId ?? null,
      input_schema_snapshot: data.inputSchemaSnapshot,
      input_doc: data.inputDoc ?? {},
      schema_version: data.schemaVersion ?? 1,
      is_enabled: data.isEnabled !== false,
      published_at: now,
      updated_at: now,
    };
    const { data: inserted, error } = await this.client.from(TABLE).insert(row).select().single();
    if (error) {
      throw new DataAccessError(`published_apis create failed: ${error.message}`, 'INSERT_ERROR', error);
    }
    return toRecord(inserted);
  }

  async findById(id: string): Promise<PublishedApiRecord | null> {
    const { data, error } = await this.client.from(TABLE).select('*').eq('id', id).maybeSingle();
    if (error) throw new DataAccessError(`published_apis findById failed: ${error.message}`, 'QUERY_ERROR', error);
    return data ? toRecord(data) : null;
  }

  async findBySlug(slug: string): Promise<PublishedApiRecord | null> {
    const { data, error } = await this.client.from(TABLE).select('*').eq('slug', slug).maybeSingle();
    if (error) throw new DataAccessError(`published_apis findBySlug failed: ${error.message}`, 'QUERY_ERROR', error);
    return data ? toRecord(data) : null;
  }

  async list(query: ListPublishedApisQuery): Promise<PublishedApiRecord[]> {
    let q = this.client.from(TABLE).select('*').order('updated_at', { ascending: false });
    if (query.ownerUserId) q = q.eq('owner_user_id', query.ownerUserId);
    if (query.kind) q = q.eq('kind', query.kind);
    if (query.isEnabled === true) q = q.eq('is_enabled', true);
    if (query.isEnabled === false) q = q.eq('is_enabled', false);
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const offset = Math.max(query.offset ?? 0, 0);
    q = q.range(offset, offset + limit - 1);
    const { data, error } = await q;
    if (error) throw new DataAccessError(`published_apis list failed: ${error.message}`, 'QUERY_ERROR', error);
    return (data || []).map(toRecord);
  }

  async update(id: string, data: UpdatePublishedApiDto): Promise<PublishedApiRecord> {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.inputSchemaSnapshot !== undefined) patch.input_schema_snapshot = data.inputSchemaSnapshot;
    if (data.inputDoc !== undefined) patch.input_doc = data.inputDoc;
    if (data.schemaVersion !== undefined) patch.schema_version = data.schemaVersion;
    if (data.isEnabled !== undefined) patch.is_enabled = data.isEnabled;
    if (data.publishedAt !== undefined) patch.published_at = data.publishedAt;

    const { data: updated, error } = await this.client.from(TABLE).update(patch).eq('id', id).select().single();
    if (error) throw new DataAccessError(`published_apis update failed: ${error.message}`, 'UPDATE_ERROR', error);
    return toRecord(updated);
  }

  async delete(id: string): Promise<boolean> {
    const { data, error } = await this.client.from(TABLE).delete().eq('id', id).select('id');
    if (error) throw new DataAccessError(`published_apis delete failed: ${error.message}`, 'DELETE_ERROR', error);
    return (data?.length ?? 0) > 0;
  }
}
