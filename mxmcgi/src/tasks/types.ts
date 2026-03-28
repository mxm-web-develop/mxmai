import type { JSONSchema7 } from 'json-schema';

export type TaskScope = 'writing' | 'outline' | 'graph' | 'audio' | 'video' | 'text';

export interface TaskContext {
  scope: string;
  taskKey: string;
  subtype?: string | null;
  userId?: string;
  taskId: string;
  params: Record<string, unknown>;
  /** 在 pipeline 中挂载运行中间态，前序 step 的产出按 outputVar 键名挂在这里 */
  state: Record<string, unknown>;
}

export type PipelineRunner = (ctx: TaskContext, step: PipelineStep) => Promise<TaskContext>;
export type TaskKey = string;

export type JsonSchemaV2 = JSONSchema7;

export interface PipelineStep {
  step: string;
  when?: Record<string, unknown>;
  params?: Record<string, unknown>;
}

export interface PromptTemplateConfig {
  /** 系统提示词模版，可包含 ${var} 占位符 */
  systemTemplate: string;
  /** 对用户输入的包装，可选（默认使用 params.prompt） */
  userTemplate?: string;
  /** 输出结构/格式要求模版，可包含 ${var} 占位符 */
  outputFormatTemplate: string;

  /**
   * 仅供「业务管理」/可视化编辑器使用的 rtext Markup 源码：
   * - 执行端不会直接使用这些字段；
   * - Admin 端通过解析 <template ...> 节点生成上面的 ${var} 模板文本。
   */
  systemTemplateMarkup?: string;
  userTemplateMarkup?: string;
  outputFormatTemplateMarkup?: string;
}

export interface BaseStorageConfig {
  /**
   * 最终文件格式（真实扩展名），例如 txt/markdown/html/json/jpg/png/mp4/wav
   * 注意：这里代表“落盘最终格式”，不是抽象媒体类型。
   */
  extension: string;
  mime?: string;
  bucket?: string;
  filenameTemplate?: string; // 例如 outline_${date}_${uuid}.json
  pathTemplate?: string; // 例如 outlines/${userId}/${date}/
}

export interface WritingStorageConfig extends BaseStorageConfig {
  extension: 'txt' | 'markdown' | 'html' | 'json' | 'docx';
}
export interface GraphStorageConfig extends BaseStorageConfig {
  extension: 'jpg' | 'jpeg' | 'png' | 'webp';
}
export interface AudioStorageConfig extends BaseStorageConfig {
  extension: 'mp3' | 'wav' | 'flac';
}
export interface VideoStorageConfig extends BaseStorageConfig {
  extension: 'mp4' | 'webm' | 'mov';
}

export type TaskStorageConfig =
  | ({ scope: 'writing' } & WritingStorageConfig)
  | ({ scope: 'outline' } & WritingStorageConfig)
  | ({ scope: 'graph' } & GraphStorageConfig)
  | ({ scope: 'audio' } & AudioStorageConfig)
  | ({ scope: 'video' } & VideoStorageConfig);

export interface KnowledgeConfig {
  useKnowledge: boolean;
  defaultKnowledgeBaseIds?: string[];
  strategy?: 'global' | 'per_section' | 'none';
}

/**
 * TaskTemplate：单一 task 的动态工程定义（由 Admin 配置）
 * - scope 固定枚举
 * - taskKey（type）/subtype 可由 Admin 动态创建
 */
export interface TaskTemplate {
  formSchema: JsonSchemaV2;
  uiSchema?: Record<string, unknown>;

  prompt: PromptTemplateConfig;

  knowledge?: KnowledgeConfig;
  inputPipeline?: PipelineStep[];
  outputPipeline?: PipelineStep[];

  storage?: TaskStorageConfig;

  /** 预留：各模态特有配置 */
  extra?: Record<string, unknown>;
}

export interface TaskDefinitionRow {
  scope: string;
  type: string;
  subtype: string | null;
  is_active?: boolean;
  rules_i18n?: Record<string, string>;
  output_format_i18n?: Record<string, string>;
  extra?: Record<string, unknown> | null;
}

export interface FormConfigV2Response {
  scope: TaskScope;
  taskKey: TaskKey;
  subtype?: string | null;
  schema: JsonSchemaV2;
  uiSchema?: Record<string, unknown>;
}

export interface TaskRunV2Request {
  scope: TaskScope;
  taskKey: TaskKey;
  subtype?: string | null;
  params: Record<string, unknown>;
  options?: {
    stream?: boolean;
  };
}

export interface TaskRunV2Response {
  success: boolean;
  taskId: string;
  scope: TaskScope;
  taskKey: TaskKey;
  subtype?: string | null;
  /** 与 cgi_tasks.status 对齐：pending/queued/processing/completed/failed/cancelled */
  status: string;
}

