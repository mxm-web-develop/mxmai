/** 与 Admin `mxm-business-bundle` JSON 对齐的类型（供 import/export 与脚本复用） */

export type BusinessBundleItemRouting = {
  logical_model: string;
  provider: string;
  model: string;
  enabled: boolean;
  sensitive_word_lists: string[];
  margin?: number;
  charge_metric?: string;
  price_in_tokens?: number;
  min_charge_tokens?: number;
};

export type BusinessBundleItem = {
  scope: string;
  type: string;
  subtype: string | null;
  is_active: boolean;
  rules_i18n: Record<string, string>;
  output_format_i18n: Record<string, string>;
  form_options_i18n: Record<string, unknown> | null;
  extra: Record<string, unknown> | null;
  routing?: BusinessBundleItemRouting | null;
  businessPricing?: Array<{
    business_type: string;
    charge_metric: string;
    price_in_tokens: number;
    min_charge_tokens?: number;
    provider?: string | null;
    model_key?: string | null;
    subtype?: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
  linkedTextFormat?: {
    scope: string;
    type: string;
    subtype: string | null;
    is_active: boolean;
    rules_i18n: Record<string, string>;
    output_format_i18n: Record<string, string>;
    form_options_i18n: Record<string, unknown> | null;
    extra: Record<string, unknown> | null;
  } | null;
};

export type BusinessBundle = {
  schemaVersion: number;
  kind: 'mxm-business-bundle';
  exportedAt: string;
  items: BusinessBundleItem[];
};
