import type { JSONSchema7 } from 'json-schema';

export type TaskScope = 'writing' | 'outline' | 'graph' | 'audio' | 'music' | 'video' | 'text';

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
  /**
   * 唯一执行模板：整段作为 `finalPrompt`（仅 `${var}` 插值）。
   * 旧库可能仅存 system/user/output，由 `loadTaskDefinition` / `composeLegacyPromptToUnified` 合并后写入。
   */
  unifiedTemplate?: string;
  /** Admin 可视化 Markup；可选，缺失时用纯文本 unifiedTemplate */
  unifiedTemplateMarkup?: string;

  /**
   * @deprecated 已合并为 unifiedTemplate，仅存于未迁移的旧 extra JSON
   */
  systemTemplate?: string;
  /** @deprecated */
  userTemplate?: string;
  /** @deprecated */
  outputFormatTemplate?: string;
  /** @deprecated */
  systemTemplateMarkup?: string;
  /** @deprecated */
  userTemplateMarkup?: string;
  /** @deprecated */
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
  | ({ scope: 'text' } & WritingStorageConfig)
  | ({ scope: 'graph' } & GraphStorageConfig)
  | ({ scope: 'audio' } & AudioStorageConfig)
  | ({ scope: 'music' } & AudioStorageConfig)
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

  /**
   * @deprecated Task v2 已改为固定前置链（见 task-v2-prelude），配置项不再生效。保留字段仅为兼容旧 JSON。
   */
  inputPipeline?: PipelineStep[];
  /**
   * @deprecated 未接入执行路径；保留仅为兼容旧 JSON。
   */
  outputPipeline?: PipelineStep[];

  storage?: TaskStorageConfig;

  /** 预留：各模态特有配置 */
  extra?: Record<string, unknown> & {
    /**
     * 业务默认生成参数（若请求未显式传入，则自动补齐）。
     * 常用于在 Admin 按业务控制 temperature/maxTokens/topP。
     */
    generateParams?: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
    };
  };
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
  /**
   * scope=text 时为同步执行，不落 cgi_tasks；此处返回模型输出，供调用方直接展示
   */
  syncResult?: {
    text?: string;
    metadata?: Record<string, unknown>;
  };
}

