import { RepositoryFactory } from '@mxmai/mxmdata';
import type { TaskDefinitionRow, TaskScope, TaskTemplate } from './types';
import { ConfigurationError } from './errors';

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

  // 允许 Admin 只配置 rules/output_format：若 prompt 里缺字段，用表字段补齐（但仍要求最终必须存在）
  const rules = langFallback(row.rules_i18n, lang);
  const outFmt = langFallback(row.output_format_i18n, lang);

  template.prompt.systemTemplate = (template.prompt.systemTemplate || rules || '').trim();
  template.prompt.outputFormatTemplate = (template.prompt.outputFormatTemplate || outFmt || '').trim();

  if (!template.prompt.systemTemplate) {
    throw new ConfigurationError(`systemTemplate 为空：scope=${scope} taskKey=${taskKey}`);
  }
  if (!template.prompt.outputFormatTemplate) {
    throw new ConfigurationError(`outputFormatTemplate 为空：scope=${scope} taskKey=${taskKey}`);
  }

  // storage.scope 必须与任务 scope 一致（若配置了）
  if (template.storage) {
    if ((template.storage as any).scope !== scope) {
      throw new ConfigurationError(`storage.scope 必须与 task scope 一致：scope=${scope} taskKey=${taskKey}`);
    }
  }

  return { row, template };
}

