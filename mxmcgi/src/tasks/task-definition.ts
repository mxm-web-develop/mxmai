import { RepositoryFactory } from '@mxmai/mxmdata';
import type { TaskDefinitionRow, TaskScope, TaskTemplate } from './types';
import { ConfigurationError } from './errors';
import { composeLegacyPromptToUnified } from './prompt-template';

function langFallback(i18n: Record<string, string> | undefined, lang: string): string {
  if (!i18n || typeof i18n !== 'object') return '';
  return i18n[lang] ?? i18n['zh'] ?? i18n['en'] ?? '';
}

export async function loadTaskDefinition(params: {
  scope: TaskScope;
  taskKey: string;
  subtype?: string | null;
  lang?: string;
}): Promise<{ row: TaskDefinitionRow; template: TaskTemplate }> {
  const { scope, taskKey, subtype, lang = 'zh' } = params;
  const repo = RepositoryFactory.createPromptEngineeringConfigRepository();

  const row = (await repo.findByKey(scope, taskKey, subtype ?? null)) as unknown as TaskDefinitionRow | null;
  if (!row) {
    throw new ConfigurationError(`未找到 Task 配置：scope=${scope} taskKey=${taskKey} subtype=${subtype ?? 'null'}`);
  }
  if (row.is_active === false) {
    throw new ConfigurationError(`Task 配置已禁用：scope=${scope} taskKey=${taskKey} subtype=${subtype ?? 'null'}`);
  }

  const extra = (row.extra ?? {}) as Record<string, unknown>;
  const tpl = extra.taskTemplate as unknown;
  if (!tpl || typeof tpl !== 'object') {
    throw new ConfigurationError(`Task 配置缺少 extra.taskTemplate：scope=${scope} taskKey=${taskKey}`);
  }

  const template = tpl as TaskTemplate;
  if (!template.formSchema || typeof template.formSchema !== 'object') {
    throw new ConfigurationError(`TaskTemplate.formSchema 缺失或无效：scope=${scope} taskKey=${taskKey}`);
  }
  if (!template.prompt || typeof template.prompt !== 'object') {
    throw new ConfigurationError(`TaskTemplate.prompt 缺失或无效：scope=${scope} taskKey=${taskKey}`);
  }

  const rules = langFallback(row.rules_i18n, lang);
  const outFmt = langFallback(row.output_format_i18n, lang);

  const unifiedTrim = (template.prompt.unifiedTemplate || '').trim();
  if (unifiedTrim) {
    template.prompt.unifiedTemplate = unifiedTrim;
  } else {
    template.prompt.unifiedTemplate = composeLegacyPromptToUnified({
      systemTemplate: template.prompt.systemTemplate,
      userTemplate: template.prompt.userTemplate,
      outputFormatTemplate: template.prompt.outputFormatTemplate,
      rulesFallback: rules,
      outputFormatFallback: outFmt,
    });
  }

  if (!template.prompt.unifiedTemplate?.trim()) {
    throw new ConfigurationError(`unifiedTemplate 为空（且无法从 rules/旧三段生成）：scope=${scope} taskKey=${taskKey}`);
  }

  const pr = template.prompt as Record<string, unknown>;
  delete pr.systemTemplate;
  delete pr.userTemplate;
  delete pr.outputFormatTemplate;
  delete pr.systemTemplateMarkup;
  delete pr.userTemplateMarkup;
  delete pr.outputFormatTemplateMarkup;

  // storage.scope 必须与任务 scope 一致（若配置了）
  if (template.storage) {
    const storageScope = (template.storage as any).scope;
    // 兼容：历史 outlines TaskTemplate 常将 storage.scope 写为 writing，但在 Task v2 中 scope=outline
    // 此处按请求 scope 纠正，避免因配置迁移遗漏导致任务无法运行。
    if (typeof storageScope === 'string' && storageScope !== scope) {
      (template.storage as any).scope = scope;
    }
  }

  return { row, template };
}

