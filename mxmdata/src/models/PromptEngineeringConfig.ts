/**
 * 提示词工程配置数据模型
 * 按 scope/type/subtype 唯一；正文契约以 extra.taskTemplate.unifiedTemplate 为准。
 * rules_i18n 列仅存空对象（兼容历史 NOT NULL）；output_format_i18n、form_options_i18n 仍可用。
 */

export interface PromptEngineeringConfig {
  id: string;
  scope: string;
  type: string;
  subtype: string | null;
  rules_i18n: Record<string, string>;
  output_format_i18n: Record<string, string>;
  form_options_i18n: Record<string, unknown> | null;
  extra: Record<string, unknown> | null;
  is_active: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePromptEngineeringConfigDto {
  id?: string;
  scope: string;
  type: string;
  subtype?: string | null;
  /** @deprecated 写入时忽略，仓库层恒存 {} */
  rules_i18n?: Record<string, string>;
  output_format_i18n?: Record<string, string>;
  form_options_i18n?: Record<string, unknown> | null;
  extra?: Record<string, unknown> | null;
  is_active?: boolean;
  updated_by?: string | null;
}

export interface UpdatePromptEngineeringConfigDto {
  /** @deprecated 写入时忽略，仓库层恒存 {} */
  rules_i18n?: Record<string, string>;
  output_format_i18n?: Record<string, string>;
  form_options_i18n?: Record<string, unknown> | null;
  extra?: Record<string, unknown> | null;
  is_active?: boolean;
  updated_by?: string | null;
}
