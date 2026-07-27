export type ServiceCategory = 'shoot' | 'batch' | 'video' | 'poster' | 'design' | 'tools';

export type ClothesLine = 'women' | 'men' | 'kids';

export type ServiceKind = 'task_v2' | 'smartflow';

export interface ServiceSummary {
  slug: string;
  title: string;
  description: string;
  kind: ServiceKind;
  category: ServiceCategory;
  coverImage: string;
  tags: string[];
  comingSoon?: boolean;
  roleHints?: Array<'operator' | 'photographer' | 'model'>;
  /** 男装/女装/童装专线，用于成片后「生成视频」 */
  clothesLine?: ClothesLine;
  /** 不在服务列表展示（如 HD 仅由结果页触发） */
  hiddenFromList?: boolean;
}

export interface PlatformRef {
  scope?: string;
  type?: string;
  subtype?: string;
  routeHint?: string;
  smartflowId?: string;
}

export interface ReferenceImageSlot {
  key: string;
  label: string;
  type?: string;
}

export interface PublishedApiInputDoc {
  fieldHints?: Record<string, string>;
  referenceImageSlots?: ReferenceImageSlot[];
}

export interface JsonSchemaProperty {
  type?: string | string[];
  title?: string;
  description?: string;
  default?: unknown;
  enum?: string[];
  enumNames?: string[];
  'x-enum-labels'?: string[] | Record<string, string>;
  'x-enum-descriptions'?: Record<string, string>;
  'x-user-visible'?: boolean;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  'x-ui-type'?: string;
}

export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export interface PublishedApiManifest {
  slug: string;
  title: string;
  description: string | null;
  kind: ServiceKind;
  schemaVersion: number;
  inputSchema: JsonSchema;
  inputDoc: PublishedApiInputDoc;
  platformRef?: PlatformRef;
}

export type RunBody =
  | { params: Record<string, unknown>; displayName?: string }
  | { input_data: Record<string, unknown>; displayName?: string };

export interface RunResponse {
  jobId: string;
  kind: ServiceKind;
  status: string;
  pollUrl: string;
}

export type JobStatusType = 'pending' | 'processing' | 'completed' | 'failed';

export interface JobChildTask {
  id: string;
  label: string;
  status: JobStatusType;
  progress: number;
}

export interface JobResultItem {
  url: string;
  type: 'image' | 'video';
  label?: string;
  /** 宫格单元格坐标，如 1-1、2-3（用于 HD 放大） */
  gridCell?: string;
  /** 是否为宫格拼图中的单格 */
  isGridCell?: boolean;
  /** 宫格源图 URL（整图） */
  gridSourceUrl?: string;
  assetId?: string;
  remoteUrl?: string;
  /** 本地任务目录中的 blob URL */
  localUrl?: string;
}

export interface JobStatus {
  jobId: string;
  slug: string;
  title: string;
  /** 用户为本机历史起的任务名（优先于 title / 品类短名） */
  displayName?: string;
  status: JobStatusType;
  progress: number;
  createdAt: string;
  updatedAt: string;
  children?: JobChildTask[];
  results?: JobResultItem[];
  error?: string;
  /** 提交时的 output_grid，用于结果页宫格 HD */
  outputGrid?: string;
  /** 并发生成份数（1～3） */
  parallelCount?: number;
  /** 本地目录 tasks/{jobId} */
  taskFolderPath?: string;
  assetCount?: number;
  /** H5 项目 ID（本地） */
  projectId?: string;
}

import type { ProjectListItem } from '@/lib/project/types';

export interface OpenApiPort {
  listServices(): Promise<ServiceSummary[]>;
  getManifest(slug: string): Promise<PublishedApiManifest>;
  run(slug: string, body: RunBody): Promise<RunResponse>;
  getJob(slug: string, jobId: string): Promise<JobStatus>;
  getJobRaw?(slug: string, jobId: string): Promise<Record<string, unknown>>;
  listJobs(): Promise<JobStatus[]>;
  listProjects?(): Promise<ProjectListItem[]>;
  syncProjects?(opts?: { force?: boolean }): Promise<{
    synced: number;
    deleted: number;
    skipped: boolean;
    error?: string;
  }>;
}
