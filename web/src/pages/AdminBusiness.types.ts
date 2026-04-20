// AdminBusiness shared types
// Extracted from AdminBusiness.tsx to avoid duplication across refactored components

export type Scope = 'writing' | 'outline' | 'graph' | 'audio' | 'music' | 'video' | 'text';

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

export type SchemaFieldRow = {
  key: string;
  name: string;
  type: string;
  title?: string;
  description?: string;
  required: boolean;
  /** 是否对用户输入表单暴露，对应 schema 的 x-user-visible（默认 true） */
  userVisible: boolean;
  enumText: string;
  /** 枚举展示名（与 enum 一一对应），对应 schema 的 x-enum-labels，每行一个 */
  enumLabelsText: string;
  defaultText: string;
};

export type BusinessDisplayConfig = {
  taskLabel?: string;
  subtypeLabel?: string;
};

export type TaskTemplateDraft = {
  formSchema: JsonSchema;
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
  uiSchema?: Record<string, unknown>;
  extra?: Record<string, unknown>;
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
