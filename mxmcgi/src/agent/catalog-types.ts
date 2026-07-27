import type { JsonSchemaV2 } from '../tasks/types';

/** personal Key 专用 Catalog；不含第三方 Open API slug */
export const AGENT_CATALOG_SCHEMA_VERSION = 3;

export const AGENT_TASK_SCOPES = [
  'writing',
  'graph',
  'outline',
  'text',
  'audio',
  'music',
  'video',
] as const;

export type AgentTaskScope = (typeof AGENT_TASK_SCOPES)[number];

export interface AgentCatalogReferenceImageSlot {
  /** formSchema 字段名，与 params / input_data 键一致 */
  field: string;
  title: string;
  required: boolean;
  minItems?: number;
  maxItems?: number;
  /** items.properties.type.default，如 main-subject / outfits */
  itemTypeDefault?: string;
  /** 面向 Agent 的短提示：该槽位放什么图 */
  agentHint?: string;
}

export interface AgentCatalogFieldSummary {
  name: string;
  type?: string;
  title?: string;
  description?: string;
  enum?: unknown[];
  required: boolean;
  /** 对应 formSchema x-ui-type，如 referenceImages / selection */
  uiType?: string;
  minItems?: number;
  maxItems?: number;
  /** referenceImages 槽位默认 type */
  itemTypeDefault?: string;
}

export interface AgentCatalogTaskV2Item {
  scope: string;
  taskKey: string;
  subtype: string | null;
  taskLabel: string | null;
  subtypeLabel: string | null;
  required: string[];
  fields: AgentCatalogFieldSummary[];
  /** 非空时表示该业务含参考图槽位，须按 field 分槽传 { content, type } 对象数组 */
  referenceImageSlots?: AgentCatalogReferenceImageSlot[];
  /** 可直接填入 run.body.params 的示例（含参考图占位结构） */
  paramsExample?: Record<string, unknown>;
  formConfigUrl: string;
  run: {
    method: 'POST';
    path: '/api/v2/tasks/run';
    bodyShape: { scope: string; taskKey: string; subtype?: string | null; params: Record<string, unknown> };
  };
  poll: { method: 'GET'; pathTemplate: '/api/v2/tasks/{taskId}' };
}

export interface AgentCatalogSmartflowItem {
  id: string;
  name: string;
  description: string | null;
  status: string;
  category: string | null;
  isPublic: boolean;
  isOwner: boolean;
  required: string[];
  fields: AgentCatalogFieldSummary[];
  referenceImageSlots?: AgentCatalogReferenceImageSlot[];
  /** 可直接填入 execute.body.input_data 的示例 */
  paramsExample?: Record<string, unknown>;
  execute: {
    method: 'POST';
    pathTemplate: '/api/v1/smartflows/{id}/execute';
    bodyShape: { input_data: Record<string, unknown> };
  };
  poll: { method: 'GET'; pathTemplate: '/api/v1/smartflow-tasks/{executionId}' };
}

export interface AgentCatalog {
  schemaVersion: number;
  generatedAt: string;
  baseUrl: string;
  audience: 'personal';
  authentication: {
    type: 'bearer';
    header: 'Authorization';
    prefix: 'mxm_';
  };
  discovery: {
    catalog: string;
    refreshHint: string;
  };
  endpoints: {
    taskRun: string;
    taskFormConfigList: string;
    taskFormConfig: string;
    smartflowList: string;
    smartflowExecute: string;
    /** 参考图上传：multipart file，响应 data.url 填入 params 槽位 content */
    upload: string;
  };
  taskV2: AgentCatalogTaskV2Item[];
  smartflows: AgentCatalogSmartflowItem[];
}

export type { JsonSchemaV2 };
