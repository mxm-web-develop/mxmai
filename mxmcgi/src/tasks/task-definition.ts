import { RepositoryFactory, pickLocalizedString } from '@mxmai/mxmdata';
import type { TaskDefinitionRow, TaskScope, TaskTemplate } from './types';
import { ConfigurationError } from './errors';
import { composeLegacyPromptToUnified } from './prompt-template';
import { mergePlatformFieldsIntoTemplateFormSchema } from './platform-fields';
import { normalizeTaskTemplatePipeline } from './business-pipeline-defaults';
import { sanitizeNumericEnumsInJsonSchema } from './form-param-normalize';

/**
 * Graph 子业务由请求体 taskKey + subtype 路由；`subtype` 同时出现在 formSchema 里会与顶部业务选择重复，
 * 且 unifiedTemplate 的 ${subtype} 由 task-engine contextVars 注入，不依赖表单 params。
 * 加载定义时剥离历史配置里误加的 properties.subtype，避免用户端仍出现多余输入框。
 */
function stripGraphSubtypeDupFromFormSchema(scope: TaskScope, template: TaskTemplate): void {
  if (scope !== 'graph') return;
  const fs = template.formSchema as Record<string, unknown> | undefined;
  if (!fs || typeof fs !== 'object') return;
  const props = fs.properties;
  if (!props || typeof props !== 'object' || Array.isArray(props)) return;
  if (!Object.prototype.hasOwnProperty.call(props, 'subtype')) return;
  const nextProps = { ...(props as Record<string, unknown>) };
  delete nextProps.subtype;
  fs.properties = nextProps;
  if (Array.isArray(fs.required)) {
    fs.required = (fs.required as unknown[]).map(String).filter((k) => k !== 'subtype');
  }
}

/**
 * 派生/机器字段不得进入用户表单与引导步：
 * - voice_id：由 minimaxVoice 对象扁平化
 * - speed：由 broadcast_style 推导（TTS）
 * - character_folder_id：由角色卡音色选用回写
 * 历史 Admin/合并可能把 contract 字段写进 formSchema，加载时剥离。
 */
function stripDerivedMachineFieldsFromFormSchema(template: TaskTemplate): void {
  const fs = template.formSchema as Record<string, unknown> | undefined;
  if (!fs || typeof fs !== 'object') return;
  const props = fs.properties;
  if (!props || typeof props !== 'object' || Array.isArray(props)) return;
  const p = props as Record<string, unknown>;
  const next = { ...p };
  let changed = false;

  const voice = p.voice;
  const voiceIsMinimax =
    voice &&
    typeof voice === 'object' &&
    !Array.isArray(voice) &&
    (voice as Record<string, unknown>)['x-ui-type'] === 'minimaxVoice';
  if (voiceIsMinimax && Object.prototype.hasOwnProperty.call(next, 'voice_id')) {
    delete next.voice_id;
    changed = true;
  }
  if (Object.prototype.hasOwnProperty.call(next, 'broadcast_style') && Object.prototype.hasOwnProperty.call(next, 'speed')) {
    delete next.speed;
    changed = true;
  }
  if (Object.prototype.hasOwnProperty.call(next, 'character_folder_id')) {
    delete next.character_folder_id;
    changed = true;
  }
  if (!changed) return;

  fs.properties = next;
  if (Array.isArray(fs.required)) {
    const drop = new Set(['voice_id', 'speed', 'character_folder_id']);
    fs.required = (fs.required as unknown[]).map(String).filter((k) => !drop.has(k));
  }
}

function langFallback(i18n: Record<string, string> | undefined, lang: string): string {
  return pickLocalizedString(i18n, lang) ?? '';
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
  stripGraphSubtypeDupFromFormSchema(scope, template);
  stripDerivedMachineFieldsFromFormSchema(template);
  if (!template.prompt || typeof template.prompt !== 'object') {
    throw new ConfigurationError(`TaskTemplate.prompt 缺失或无效：scope=${scope} taskKey=${taskKey}`);
  }

  const outFmt = langFallback(row.output_format_i18n, lang);

  const unifiedTrim = (template.prompt.unifiedTemplate || '').trim();
  if (unifiedTrim) {
    template.prompt.unifiedTemplate = unifiedTrim;
  } else {
    template.prompt.unifiedTemplate = composeLegacyPromptToUnified({
      systemTemplate: template.prompt.systemTemplate,
      userTemplate: template.prompt.userTemplate,
      outputFormatTemplate: template.prompt.outputFormatTemplate,
      outputFormatFallback: outFmt,
    });
  }

  if (!template.prompt.unifiedTemplate?.trim()) {
    throw new ConfigurationError(`unifiedTemplate 为空（且无法从旧三段模板或 output_format 生成）：scope=${scope} taskKey=${taskKey}`);
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

  mergePlatformFieldsIntoTemplateFormSchema(template, scope);

  normalizeTaskTemplatePipeline(template, scope, extra);

  sanitizeNumericEnumsInJsonSchema(template.formSchema);
  sanitizeNumericEnumsInJsonSchema(
    (template as { contractSchema?: import('./types').JsonSchemaV2 }).contractSchema
  );

  return { row, template };
}

