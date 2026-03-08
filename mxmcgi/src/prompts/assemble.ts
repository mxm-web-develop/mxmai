/**
 * 四段式提示词组装：身份 + 任务与参数 + 知识库/参考 + 输出格式
 * 可选从 DB 读取 Part2/Part3 模板；无配置时使用默认顺序与分隔符
 */

import { getPromptFullConfig } from './resolver';

const DEFAULT_SEP = '\n\n---\n\n';
const DEFAULT_PART3_TEMPLATE = '【知识库内容】\n{{content}}';

export interface AssemblePromptOptions {
  scope: string;
  type: string;
  subtype?: string | null;
  lang?: string;
  identity: string;
  taskAndParams: string;
  knowledge?: string;
  outputFormat: string;
}

/**
 * 按四段组装最终 prompt
 * 若未传 identity/taskAndParams/outputFormat 则由调用方保证已填入；本函数仅负责顺序与可选模板
 */
export async function assemblePrompt(options: AssemblePromptOptions): Promise<string> {
  const {
    scope,
    type,
    subtype,
    lang = 'zh',
    identity,
    taskAndParams,
    knowledge,
    outputFormat,
  } = options;

  let part3Template = DEFAULT_PART3_TEMPLATE;
  try {
    const config = await getPromptFullConfig(scope, type, subtype, lang);
    if (config?.knowledge_template_i18n?.[lang]) {
      part3Template = config.knowledge_template_i18n[lang];
    }
  } catch (_) {
    // 使用默认
  }

  const parts: string[] = [];
  if (identity?.trim()) parts.push(identity.trim());
  if (taskAndParams?.trim()) parts.push(taskAndParams.trim());
  if (knowledge?.trim()) {
    parts.push(part3Template.replace(/\{\{content\}\}/g, knowledge.trim()));
  }
  if (outputFormat?.trim()) parts.push(outputFormat.trim());

  return parts.join(DEFAULT_SEP);
}
