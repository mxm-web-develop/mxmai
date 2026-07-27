// AdminBusiness shared types
// Extracted from AdminBusiness.tsx to avoid duplication across refactored components

export type Scope = 'writing' | 'graph' | 'audio' | 'music' | 'video' | 'text';

/** 非 text scope 钉死的 taskKey 三态（与 mxmai_business_naming 对齐） */
export const PLATFORM_TASK_KEYS = ['generator', 'group', 'series'] as const;
export type PlatformTaskKey = (typeof PLATFORM_TASK_KEYS)[number];

export const PLATFORM_TASK_KEY_OPTIONS = [
  { value: 'generator', label: 'generator · 单次生成' },
  { value: 'group', label: 'group · 并发表组' },
  { value: 'series', label: 'series · 历史连续' },
] as const;

export function isPlatformTaskKey(value: string | null | undefined): value is PlatformTaskKey {
  return !!value && (PLATFORM_TASK_KEYS as readonly string[]).includes(value);
}

/** 写作落盘格式：统一 Markdown（历史 txt/pdf/csv/json 仅兼容旧配置解析） */
export type WritingStorageFormat = 'markdown' | 'txt' | 'pdf' | 'csv' | 'json';

export type GenerateParamsConfig = Partial<{
  temperature: number;
  maxTokens: number;
  topP: number;
}>;

export type PromptConfigRow = {
  id: string;
  scope: string;
  type: string;
  subtype: string | null;
  extra?: Record<string, unknown> | null;
  is_active: boolean;
  rules_i18n?: Record<string, string>;
  output_format_i18n?: Record<string, string>;
  updated_at?: string;
};

export type BusinessPricingView = {
  businessType: string;
  subtype: string | null;
  chargeMetric: string;
  resolved?: { provider: string; model_key: string; overridden?: boolean };
  providerCost?: import('../api/client').ProviderPricingRow;
  costTokens?: { unit?: number; input?: number; output?: number };
  recommendedTokens?: { unit?: number; input?: number; output?: number };
  configured?: import('../api/client').BusinessPricingRow | null;
};

export type JsonSchema = {
  $schema?: string;
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [k: string]: unknown;
};

/** 合同字段分区：basic=用户可答；business=enrich 专家回填 */
export type ContractFieldZone = 'basic' | 'business';

export type SchemaFieldRow = {
  key: string;
  name: string;
  type: string;
  title?: string;
  description?: string;
  required: boolean;
  /** 是否对用户输入表单暴露，对应 schema 的 x-user-visible（默认 true） */
  userVisible: boolean;
  /** 对应 schema 的 x-zone；缺省按 business */
  zone: ContractFieldZone;
  enumText: string;
  /** 枚举展示名（与 enum 一一对应），对应 schema 的 x-enum-labels，每行一个 */
  enumLabelsText: string;
  defaultText: string;
};

export type BusinessDisplayConfig = {
  taskLabel?: string;
  subtypeLabel?: string;
  /** 业务简介（简体默认）；创建任务交互卡副文案等 */
  description?: string;
  /** 显示名多语言；缺省时回退 taskLabel / subtypeLabel（见 docs/shared/I18N.md） */
  taskLabelI18n?: { zh?: string; 'zh-TW'?: string; en?: string; ja?: string };
  subtypeLabelI18n?: { zh?: string; 'zh-TW'?: string; en?: string; ja?: string };
  /** 业务简介多语言；缺省时回退 description */
  descriptionI18n?: { zh?: string; 'zh-TW'?: string; en?: string; ja?: string };
};

export type VideoBusinessCategory = 'autocut' | 'generator';

export const VIDEO_CATEGORY_LABELS: Record<VideoBusinessCategory, string> = {
  autocut: '自动剪辑',
  generator: '生成',
};

export type TaskTemplateDraft = {
  /** 与 contractSchema 镜像；兼容旧读取路径 */
  formSchema: JsonSchema;
  /** mxm-warp 合同字段源（扁平 + x-zone） */
  contractSchema?: JsonSchema;
  prompt: {
    unifiedTemplate: string;
    unifiedTemplateMarkup?: string;
  };
  knowledge?: {
    useKnowledge: boolean;
    defaultKnowledgeBaseIds?: string[];
    strategy?: 'global' | 'per_section' | 'none';
  };
  storage?: {
    scope: Scope;
    extension: string;
    mime?: string;
    bucket?: string;
    pathTemplate?: string;
    filenameTemplate?: string;
  };
  pipeline?: {
    pre?: PipelineStepDraft[];
    enrich?: PipelineStepDraft[];
    post?: PipelineStepDraft[];
  };
  uiSchema?: Record<string, unknown>;
  extra?: Record<string, unknown>;
};

/** Admin 管线可配段（input/output 为平台固定段） */
export type PipelineAdminPhase = 'pre' | 'enrich' | 'post';

export type PipelineStepDraft = {
  step: string;
  when?: Record<string, unknown>;
  params?: Record<string, unknown>;
  nestedTextTaskKey?: string;
  nestedVideoTaskKey?: string;
  layoutTaskKey?: string;
  inputMapping?: Record<string, string>;
  fieldMapping?: Record<string, string>;
  outputMapping?: { artifactField: 'text' | 'metadata' };
};

export type TemplateVarMeta = {
  name: string;
  type?: string;
  label?: string;
  defaultValue?: string;
  required?: boolean;
};

export type ParsedTemplateMarkup = {
  text: string;
  vars: TemplateVarMeta[];
};
