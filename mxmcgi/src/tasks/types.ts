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

export type ContextResolvePhase = 'pre' | 'post';

export type AutoFromSource = 'prompt' | 'coreText' | `field:${string}`;

export interface PipelineStep {
  step: string;
  when?: Record<string, unknown>;
  params?: Record<string, unknown>;
  /** nestedText 专用：text/format/xxx */
  nestedTextTaskKey?: string;
  /** @deprecated 兼容旧配置；新管线用 step=videoTimelineRender */
  nestedVideoTaskKey?: string;
  /** markdownToPdf 可选：layout LLM 子业务 key */
  layoutTaskKey?: string;
  /** 输入映射：如 { prompt: '${state.coreArtifact.text}' } */
  inputMapping?: Record<string, string>;
  /** buildVideoEditTimeline 等步骤：业务字段 → 模板路径 */
  fieldMapping?: Record<string, string>;
  /** 输出写回 finalArtifact 的字段 */
  outputMapping?: { artifactField: 'text' | 'metadata' };
}

export interface BusinessPipelineConfig {
  /** 核心生成前（mxm-warp：pre 段） */
  pre?: PipelineStep[];
  /** mxm-warp：enrich 段（可配深检索 / 专家 text 等） */
  enrich?: PipelineStep[];
  /** 核心生成后、MinIO 前（mxm-warp：post 段） */
  post?: PipelineStep[];
}

export interface CoreArtifact {
  kind: 'text' | 'image' | 'video' | 'audio' | 'music';
  text?: string;
  mediaUrls?: string[];
  metadata?: Record<string, unknown>;
}

export type PipelineTraceEntry = {
  step: string;
  durationMs: number;
  nestedTaskId?: string;
  costUsd?: number;
  phase?: 'pre' | 'post' | 'enrich' | 'input' | 'output';
  /** when 条件未满足而跳过 */
  skipped?: boolean;
  /** 该步执行失败（抛错被捕获后写入） */
  ok?: boolean;
  /** 失败原因（与 ok===false 同时出现） */
  error?: string;
  /** Admin 流程测试：可读标签（如 nestedTextTaskKey / webSearch target） */
  label?: string;
  /** Admin 流程测试：该步投喂摘要（已截断） */
  inputSnapshot?: unknown;
  /** Admin 流程测试：该步产出摘要（已截断） */
  outputSnapshot?: unknown;
  /** 产出预算观测：completion_tokens / reasoning / length / continue */
  budget?: {
    completion_tokens?: number;
    prompt_tokens?: number;
    total_tokens?: number;
    finish_reason?: string | null;
    had_reasoning?: boolean;
    truncated?: boolean;
    continued?: boolean;
    thinking_disabled_retry?: boolean;
  };
};


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
  extension: 'txt' | 'markdown' | 'md' | 'html' | 'json' | 'pdf' | 'csv';
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
  /**
   * mxm-warp：合同字段设计（扁平 + x-zone: basic|business）。
   * 首要服务模型理解字段用途（description = 解读规则）。
   * 当 extra.executionMode === 'mxm-warp' 时必填；本路径不回退 formSchema。
   */
  contractSchema?: JsonSchemaV2;
  uiSchema?: Record<string, unknown>;

  prompt: PromptTemplateConfig;

  knowledge?: KnowledgeConfig;

  /** 业务执行管线：pre → core / mxm-warp → post；mxm-warp 另含 enrich */
  pipeline?: BusinessPipelineConfig;

  /**
   * @deprecated 迁移到 pipeline.pre
   */
  inputPipeline?: PipelineStep[];
  /**
   * @deprecated 迁移到 pipeline.post
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
      /**
       * 透传至 provider API。
       * MiniMax-M3 思考开关须显性写 parameters.thinking = { type: 'disabled' | 'adaptive' }，
       * 勿依赖 provider / catalog 隐式默认。
       */
      parameters?: Record<string, unknown>;
    };
    /** mxm-warp：启用五段合同执行（pre→input→enrich→output→post） */
    executionMode?: 'mxm-warp' | string;
  };
}

export interface TaskDefinitionRow {
  scope: string;
  type: string;
  subtype: string | null;
  is_active?: boolean;
  rules_i18n?: Record<string, string>;
  output_format_i18n?: Record<string, string>;
  form_options_i18n?: Record<string, Record<string, string>> | null;
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
  /** 写入 cgi_tasks.metadata（如 label、parentAutocutTaskId、autocutClipAsset） */
  metadata?: Record<string, unknown>;
  options?: {
    stream?: boolean;
    /**
     * 同步跑完任务并返回 syncResult（与 scope=text 类似），前端无需再轮询。
     * 默认跑完后软删除 cgi_tasks；配合 keepTask=true 可保留为用户可见的独立生成任务。
     */
    ephemeral?: boolean;
    /**
     * 与 ephemeral 联用：同步等待完成后**不**软删除，任务出现在视频/图文列表中可预览。
     * 用于自动剪辑管线内的 AI 视频 / AI 配图子任务。
     */
    keepTask?: boolean;
    /**
     * Admin 业务管理「流程测试」：与用户同链路执行，但 pipelineTrace 保存每步 input/output 快照。
     */
    adminPipelineDebug?: boolean;
  };
}

export interface TaskRunV2ParallelChild {
  taskId: string;
  parallelIndex: number;
  status: string;
}

export interface TaskRunV2Response {
  success: boolean;
  taskId: string;
  scope: TaskScope;
  taskKey: TaskKey;
  subtype?: string | null;
  /** 与 cgi_tasks.status 对齐：pending/queued/processing/completed/failed/cancelled */
  status: string;
  /** parallel_count > 1 时：父任务 id 在 taskId，子任务列表在此 */
  parallel?: {
    parentTaskId: string;
    total: number;
    tasks: TaskRunV2ParallelChild[];
    /** 创建阶段失败的份数（无 taskId） */
    failedCount?: number;
  };
  /**
   * scope=text 时为同步执行，不落 cgi_tasks；此处返回模型输出，供调用方直接展示
   * options.ephemeral 时异步 scope 也会在软删除前把结果填入此处，便于前端直接展示
   */
  syncResult?: {
    text?: string;
    metadata?: Record<string, unknown>;
    mediaUrls?: string[];
  };
}

