/**
 * 提示词配置解析：优先从 DB（prompt_engineering_config）读取，若无则回退到代码内写死配置
 * 与 BUSINESS_INTERFACE_SPEC 提示词工程衔接
 */

import { RepositoryFactory } from '@mxmai/mxmdata';
import { getWritingTypeRules, getWritingTypeOutputFormat } from '../core/writing/wtconfigs';
import { getGraphRulesForType } from '../core/graph/graphconfigs';

const langFallback = (i18n: Record<string, string> | undefined, lang: string): string => {
  if (!i18n || typeof i18n !== 'object') return '';
  return i18n[lang] ?? i18n['zh'] ?? i18n['en'] ?? '';
};

/**
 * 解析写作类型的 rules 与 output_format（先查 DB，再回退代码配置）
 */
export async function getWritingRulesAndFormatResolved(
  writingType: string,
  outlineType?: string | null,
  lang: string = 'zh'
): Promise<{ rules: string; outputFormat: string }> {
  try {
    const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
    const row = await repo.findByKey('writing', writingType, outlineType ?? null);
    if (row?.is_active) {
      const rules = langFallback(row.rules_i18n as Record<string, string>, lang);
      const outputFormat = langFallback(row.output_format_i18n as Record<string, string>, lang);
      if (rules || outputFormat) {
        return { rules: rules || '', outputFormat: outputFormat || '' };
      }
    }
  } catch (_) {
    // 忽略 DB 错误，使用回退
  }
  const rules = getWritingTypeRules(writingType as any);
  const outputFormat = getWritingTypeOutputFormat(writingType as any);
  return { rules, outputFormat };
}

/**
 * 解析图文类型的 rules（先查 DB，再回退代码配置）
 */
export async function getGraphRulesResolved(
  graphType: string,
  type: string,
  lang: string = 'zh'
): Promise<string> {
  try {
    const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
    const row = await repo.findByKey('graph', graphType, type || null);
    if (row?.is_active) {
      const rules = langFallback(row.rules_i18n as Record<string, string>, lang);
      if (rules) return rules;
    }
  } catch (_) {
    // 忽略 DB 错误，使用回退
  }
  return getGraphRulesForType(graphType, type);
}

/** 写作/图文的完整配置（含 extra 中的 use_knowledge、default_knowledge_base_ids、模板等） */
export interface PromptFullConfig {
  rules: string;
  outputFormat: string;
  use_knowledge?: boolean;
  default_knowledge_base_ids?: string[];
  task_template_i18n?: Record<string, string>;
  knowledge_template_i18n?: Record<string, string>;
  /** 分镜脚本：JSON 输出格式模板（含占位符），运行时替换后使用 */
  storyboard_output_format_template_zh?: string;
}

/**
 * 按 (scope, type, subtype) 拉取完整提示词配置（含 extra）
 * 供 assemblePrompt 与业务层决定知识库开关、默认知识库、Part2/Part3 模板
 */
export async function getPromptFullConfig(
  scope: string,
  type: string,
  subtype?: string | null,
  lang: string = 'zh'
): Promise<PromptFullConfig | null> {
  try {
    const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
    const row = await repo.findByKey(scope, type, subtype ?? null);
    if (!row?.is_active) return null;
    const rules = langFallback(row.rules_i18n as Record<string, string>, lang);
    const outputFormat = langFallback(row.output_format_i18n as Record<string, string>, lang);
    const extra = (row.extra ?? {}) as Record<string, unknown>;
    return {
      rules: rules || '',
      outputFormat: outputFormat || '',
      use_knowledge: extra.use_knowledge as boolean | undefined,
      default_knowledge_base_ids: extra.default_knowledge_base_ids as string[] | undefined,
      task_template_i18n: extra.task_template_i18n as Record<string, string> | undefined,
      knowledge_template_i18n: extra.knowledge_template_i18n as Record<string, string> | undefined,
      storyboard_output_format_template_zh: extra.storyboard_output_format_template_zh as string | undefined,
    };
  } catch (_) {
    return null;
  }
}
