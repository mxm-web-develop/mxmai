/**
 * 已发布开放 API 仓库
 */

export type PublishedApiKind = 'task_v2' | 'smartflow';

export interface PublishedApiInputDoc {
  examples?: Record<string, unknown>;
  fieldHints?: Record<string, string>;
  referenceImageSlots?: Array<{
    field: string;
    title?: string;
    description?: string;
    maxItems?: number;
  }>;
  notes?: string[];
}

export interface PublishedApiRecord {
  id: string;
  slug: string;
  kind: PublishedApiKind;
  owner_user_id: string;
  title: string;
  description: string | null;
  task_v2_scope: string | null;
  task_v2_task_key: string | null;
  task_v2_subtype: string | null;
  smartflow_id: string | null;
  input_schema_snapshot: Record<string, unknown>;
  input_doc: PublishedApiInputDoc;
  schema_version: number;
  is_enabled: boolean;
  published_at: string;
  created_at: string;
  updated_at: string;
}

export interface CreatePublishedApiDto {
  slug: string;
  kind: PublishedApiKind;
  ownerUserId: string;
  title: string;
  description?: string | null;
  taskV2Scope?: string | null;
  taskV2TaskKey?: string | null;
  taskV2Subtype?: string | null;
  smartflowId?: string | null;
  inputSchemaSnapshot: Record<string, unknown>;
  inputDoc?: PublishedApiInputDoc;
  schemaVersion?: number;
  isEnabled?: boolean;
}

export interface UpdatePublishedApiDto {
  title?: string;
  description?: string | null;
  inputSchemaSnapshot?: Record<string, unknown>;
  inputDoc?: PublishedApiInputDoc;
  schemaVersion?: number;
  isEnabled?: boolean;
  publishedAt?: string;
}

export interface ListPublishedApisQuery {
  ownerUserId?: string;
  kind?: PublishedApiKind;
  isEnabled?: boolean;
  limit?: number;
  offset?: number;
}

export interface IPublishedApiRepository {
  create(data: CreatePublishedApiDto): Promise<PublishedApiRecord>;
  findById(id: string): Promise<PublishedApiRecord | null>;
  findBySlug(slug: string): Promise<PublishedApiRecord | null>;
  list(query: ListPublishedApisQuery): Promise<PublishedApiRecord[]>;
  update(id: string, data: UpdatePublishedApiDto): Promise<PublishedApiRecord>;
  delete(id: string): Promise<boolean>;
}
