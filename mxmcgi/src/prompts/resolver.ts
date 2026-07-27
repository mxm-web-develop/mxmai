/**
 * 提示词配置解析：优先从 DB（prompt_engineering_config）读取，若无则回退到代码内写死配置
 * 与 BUSINESS_INTERFACE_SPEC 提示词工程衔接
 */

import { RepositoryFactory, pickLocalizedString } from '@mxmai/mxmdata';
import { getWritingTypeRules, getWritingTypeOutputFormat } from '../clientServer/writing';
import { splitUnifiedTemplateForLegacyParts } from './split-unified-template-legacy';

const langFallback = (i18n: Record<string, string> | undefined, lang: string): string => {
  return pickLocalizedString(i18n, lang) ?? '';
};

/** 从 taskTemplate.pipeline.pre 或 legacy extra.promptTextTaskKey 解析 graph 前置 text 格式化 */
export function resolvePromptTextTaskKeyFromExtra(extra: Record<string, unknown>): string | undefined {
  const tpl = extra.taskTemplate as Record<string, unknown> | undefined;
  const pipe = tpl?.pipeline as { pre?: Array<{ step?: string; nestedTextTaskKey?: string; params?: Record<string, unknown> }> } | undefined;
  const nested = pipe?.pre?.find(
    (s) =>
      s.step === 'nestedText' &&
      (s.params?.graphPreFormat === true || s.params?.afterPromptRender === true) &&
      typeof s.nestedTextTaskKey === 'string' &&
      s.nestedTextTaskKey.trim()
  );
  if (nested?.nestedTextTaskKey) return nested.nestedTextTaskKey.trim();
  const legacy = extra.promptTextTaskKey;
  return typeof legacy === 'string' && legacy.trim() ? legacy.trim() : undefined;
}

/**
 * 解析写作类型的 rules 与 output_format。
 * 不再读取 DB `rules_i18n`；若存在 `extra.taskTemplate.prompt.unifiedTemplate`，按其标准段落拆出规则/输出段；
 * 否则回退到代码内 wtconfigs。
 */
export async function getWritingRulesAndFormatResolved(
  writingType: string,
  outlineType?: string | null,
  lang: string = 'zh'
): Promise<{ rules: string; outputFormat: string }> {
  const typeRules = getWritingTypeRules(writingType as any);
  const typeOutputFormat = getWritingTypeOutputFormat(writingType as any);
  try {
    const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
    const row = await repo.findByKey('writing', writingType, outlineType ?? null);
    if (row?.is_active) {
      const outputFromDb = langFallback(row.output_format_i18n as Record<string, string>, lang);
      const extra = (row.extra ?? {}) as Record<string, unknown>;
      const taskTemplate = extra.taskTemplate as { prompt?: { unifiedTemplate?: string } } | undefined;
      const uni =
        typeof taskTemplate?.prompt?.unifiedTemplate === 'string' ? taskTemplate.prompt.unifiedTemplate.trim() : '';
      if (uni) {
        const { preamble, outputFormatTail } = splitUnifiedTemplateForLegacyParts(uni);
        return {
          rules: (preamble || typeRules).trim(),
          outputFormat: (outputFormatTail || outputFromDb || typeOutputFormat).trim(),
        };
      }
      return {
        rules: typeRules,
        outputFormat: (outputFromDb || typeOutputFormat).trim(),
      };
    }
  } catch (_) {
    // 忽略 DB 错误，使用回退
  }
  return { rules: typeRules, outputFormat: typeOutputFormat };
}

/**
 * Graph 旧式「rules 正文」拼接入口：产品侧已弃用 DB rules 列，恒返回空字符串（契约以 unifiedTemplate / text-format 为准）。
 */
export async function getGraphRulesResolved(
  _graphType: string,
  _type: string,
  _lang: string = 'zh'
): Promise<string> {
  return '';
}

/** 写作/图文的完整配置（含 extra 中的 use_knowledge、default_knowledge_base_ids、模板等） */
export interface PromptFullConfig {
  /** 已弃用列，恒为空；规则见 extra.taskTemplate.unifiedTemplate */
  rules: string;
  outputFormat: string;
  use_knowledge?: boolean;
  default_knowledge_base_ids?: string[];
  task_template_i18n?: Record<string, string>;
  knowledge_template_i18n?: Record<string, string>;
  /** 分镜脚本：JSON 输出格式模板（含占位符），运行时替换后使用 */
  storyboard_output_format_template_zh?: string;
  /**
   * 生图前「text 阶段」模式：目前仅实现 basic；其它值预留，将由 Smartflow 等承接
   */
  prompt_text_mode?: string;
  /**
   * graph 业务关联的 text 业务 taskKey（extra.promptTextTaskKey）
   * 若配置，则 generateGraphPrompt 将调用 runTaskV2(scope=text, taskKey) 生成 prompt
   */
  promptTextTaskKey?: string;
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
    const effectiveSubtype = subtype ?? null;

    // v2 动态逻辑：优先精确匹配 subtype，若无匹配则回落查询 subtype=NULL（通用配置）
    let row = await repo.findByKey(scope, type, effectiveSubtype);
    if (!row && effectiveSubtype !== null) {
      // 精确匹配无结果，且 subtype 非空，尝试回落 subtype=NULL 的通用配置
      row = await repo.findByKey(scope, type, null);
      if (scope === 'graph') {
        console.log(`[getPromptFullConfig] graph fallback: subtype=${JSON.stringify(effectiveSubtype)} 无匹配，尝试 subtype=NULL -> rowFound=${!!row}`);
      }
    }
    // [DEBUG] trace graph promptTextTaskKey lookup
    if (scope === 'graph') {
      console.log(`[getPromptFullConfig] graph lookup: scope=${scope}, type=${type}, subtype=${JSON.stringify(effectiveSubtype)} -> rowFound=${!!row}, extra=${JSON.stringify(row?.extra ?? null)}, promptTextTaskKey=${(row?.extra as any)?.promptTextTaskKey ?? 'NOT_IN_EXTRA'}`);
    }
    if (!row?.is_active) return null;
    const outputFormat = langFallback(row.output_format_i18n as Record<string, string>, lang);
    const extra = (row.extra ?? {}) as Record<string, unknown>;
    return {
      rules: '',
      outputFormat: outputFormat || '',
      use_knowledge: extra.use_knowledge as boolean | undefined,
      default_knowledge_base_ids: extra.default_knowledge_base_ids as string[] | undefined,
      task_template_i18n: extra.task_template_i18n as Record<string, string> | undefined,
      knowledge_template_i18n: extra.knowledge_template_i18n as Record<string, string> | undefined,
      storyboard_output_format_template_zh: extra.storyboard_output_format_template_zh as string | undefined,
      prompt_text_mode:
        typeof extra.prompt_text_mode === 'string' ? extra.prompt_text_mode : undefined,
      promptTextTaskKey: resolvePromptTextTaskKeyFromExtra(extra),
    };
  } catch (_) {
    return null;
  }
}
