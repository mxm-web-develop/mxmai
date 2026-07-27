/**
 * 摄影 Graph 类型注册（V2）
 * 业务 briefing 与规则由 Admin「提示词工程」的 **`extra.taskTemplate`**（`unifiedTemplate`、`formSchema`）及可选 **text/format** 提供；
 * 此处不再维护任何 v1 硬编码规则、参数列表或「本地默认知识」文案。
 */

import { PHOTOGRAPH_TYPE_MAP } from '../../type';

export interface PhotographTypeConfig {
  /** V1 遗留字段，恒为空；Graph 规则以 unifiedTemplate / text-format 为准 */
  rules: string;
  typeOptions: Array<{ value: string; label: string }>;
  getRulesForType: (type: string) => string;
  getParamsForType: (type: string) => string[];
  getTypeLabel: (type: string) => string;
}

export const photographConfig: PhotographTypeConfig = {
  rules: '',
  typeOptions: Object.entries(PHOTOGRAPH_TYPE_MAP).map(([value, label]) => ({ value, label })),

  getRulesForType(): string {
    return '';
  },

  getParamsForType(): string[] {
    return [];
  },

  getTypeLabel(type: string): string {
    return PHOTOGRAPH_TYPE_MAP[type as keyof typeof PHOTOGRAPH_TYPE_MAP] || type;
  },
};
