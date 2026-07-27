/**
 * 绘画 Graph 类型注册（V2）
 * 业务 briefing 与规则由 Admin「提示词工程」的 **`extra.taskTemplate`**（`unifiedTemplate`、`formSchema`）及可选 **text/format** 提供；
 * 此处不再维护 v1 硬编码 TYPE_RULES / TYPE_PARAMS / 默认 rules 文案。
 */

import { PAINTING_TYPE_MAP } from '../../type';

export interface PaintingTypeConfig {
  /** V1 遗留字段，恒为空；Graph 规则以 unifiedTemplate / text-format 为准 */
  rules: string;
  typeOptions: Array<{ value: string; label: string }>;
  getRulesForType: (type: string) => string;
  getParamsForType: (type: string) => string[];
  getTypeLabel: (type: string) => string;
}

export const paintingConfig: PaintingTypeConfig = {
  rules: '',
  typeOptions: Object.entries(PAINTING_TYPE_MAP).map(([value, label]) => ({ value, label })),

  getRulesForType(): string {
    return '';
  },

  getParamsForType(): string[] {
    return [];
  },

  getTypeLabel(type: string): string {
    return PAINTING_TYPE_MAP[type as keyof typeof PAINTING_TYPE_MAP] || type;
  },
};
