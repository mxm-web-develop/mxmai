/**
 * Seed text/think/search_query_gen + text/transform/business_builder
 *
 * 用法（在 mxmcgi 目录）：
 *   npx tsx src/scripts/seed-text-transform-business-builder.ts
 *
 * 说明：
 * - 写入 prompt_engineering_config（Task V2 模板：extra.taskTemplate）
 * - 可选写入 text_scope_config（provider/model 路由）— 若你的环境未配置模型，可先只 seed prompt 配置
 */

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { RepositoryFactory } from '@mxmai/mxmdata';

function loadEnvOnce() {
  process.env.DOTENV_CONFIG_DEBUG = 'false';
  const projectRoot = path.resolve(__dirname, '../../..');
  const mxmcgiDir = path.resolve(projectRoot, 'mxmcgi');
  const envPaths = [
    path.resolve(projectRoot, '.env'),
    path.resolve(mxmcgiDir, '.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'mxmcgi', '.env'),
  ];
  for (const p of envPaths) {
    if (!fs.existsSync(p)) continue;
    const r = dotenv.config({ path: p, override: false });
    if (!r.error) return;
  }
  dotenv.config({ override: false });
}

type PromptEngineeringConfig = {
  scope: string;
  type: string;
  subtype: string | null;
  rules_i18n: Record<string, string>;
  output_format_i18n: Record<string, string>;
  extra?: Record<string, unknown>;
  is_active?: boolean;
};

async function upsertPrompt(config: PromptEngineeringConfig) {
  const repo = RepositoryFactory.createPromptEngineeringConfigRepository() as any;
  await repo.upsert({ ...config, is_active: config.is_active ?? true });
  console.log(`[seed] prompt_engineering_config: ${config.scope}/${config.type}/${config.subtype}`);
}

async function maybeUpsertTextScopeConfig(task_key: string, sub_type: string, provider: string, model: string) {
  if (!provider || !model) return;
  const repo = RepositoryFactory.createTextScopeConfigRepository() as any;
  await repo.upsertConfig({
    scope: 'text',
    task_key,
    sub_type,
    provider,
    model,
    enabled: true,
  });
  console.log(`[seed] text_scope_config: text/${task_key}/${sub_type} -> ${provider}/${model}`);
}

function searchQueryGenTemplate(): Record<string, unknown> {
  return {
    formSchema: {
      type: 'object',
      required: ['topic'],
      properties: {
        topic: { type: 'string', title: '业务描述', description: '用户想要创建的 graph 生图业务描述' },
        context: { type: 'string', title: '上下文', description: '可选：平台约束/目标用户/已有能力' },
      },
    },
    prompt: {
      unifiedTemplate: [
        '你是 MXM AI 平台的业务调研助手。',
        '目标：根据用户的业务描述生成 3-6 条「可直接用于 deep_search 的查询词」。',
        '',
        '用户业务描述：${topic}',
        '补充上下文：${context}',
        '',
        '输出要求：',
        '- 只输出一个 JSON 数组（string[]），不要输出解释，不要输出 markdown。',
        '- 查询词需覆盖：拍摄/设计风格、表单字段、行业术语、竞品关键词。',
      ].join('\n'),
    },
  };
}

function businessBuilderTemplate(): Record<string, unknown> {
  return {
    formSchema: {
      type: 'object',
      required: ['prompt', 'graph_type', 'target_model', 'target_provider'],
      properties: {
        prompt: { type: 'string', title: '业务需求', description: '用户对新生图业务的自然语言描述' },
        search_data: { type: 'string', title: '搜索资料', description: 'deep_search 的结果（可为 JSON 字符串）' },
        graph_type: { type: 'string', title: 'graph_type', enum: ['photograph', 'design', 'painting'], default: 'photograph' },
        target_model: { type: 'string', title: '目标模型', default: 'gpt-image-2-all' },
        target_provider: { type: 'string', title: '目标 provider', default: 'openrouter' },
      },
    },
    prompt: {
      unifiedTemplate: [
        '【角色】你是 MXM AI 平台的“Graph 业务配置架构师”。',
        '【目标】把用户业务需求转为可落库的业务配置草案（draft），用于后续“一键创建业务”。',
        '',
        '【输入】',
        '- 用户需求：${prompt}',
        '- 搜索资料（可能为 JSON）：${search_data}',
        '- graph 类型：${graph_type}',
        '- 目标模型：${target_model}',
        '- 目标 provider：${target_provider}',
        '',
        '【输出】只输出一个**合法 JSON 对象**，不得包含 markdown / 解释文字。结构必须包含：',
        '{',
        '  \"subtype\": \"kebab-case\" ,',
        '  \"display\": { \"taskLabel\": \"中文标签\", \"subtypeLabel\": \"说明\" },',
        '  \"promptTextTaskKey\": \"text/format/gpt-image-2\",',
        '  \"graphRouting\": { \"model\": \"${target_model}\", \"provider\": \"${target_provider}\", \"margin\": 0.2, \"charge_metric\": \"per_image\" },',
        '  \"output_format_i18n\": { \"zh\": \"\", \"en\": \"\" },',
        '  \"rules_i18n\": { \"zh\": \"\", \"en\": \"\" },',
        '  \"taskTemplate\": {',
        '    \"formSchema\": { \"type\": \"object\", \"properties\": { ... }, \"required\": [\"prompt\",\"aspect_ratio\"] },',
        '    \"prompt\": { \"unifiedTemplate\": \"...使用 ${fieldName} 占位符...\" }',
        '  }',
        '}',
        '',
        '【硬性约束】',
        '- taskTemplate.formSchema.properties 必须包含：prompt、aspect_ratio；如是电商海报建议包含 output_grid / on_screen_text_language。',
        '- 参考图字段必须用 x-ui-type=referenceImages（数组 items 为 object）。',
        '- unifiedTemplate 里只能用 ${var}，且出现的变量必须都在 formSchema.properties 声明。',
        '- 不要生成 rules 正文（rules_i18n 为空字符串）。',
      ].join('\n'),
    },
  };
}

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();

  await upsertPrompt({
    scope: 'text',
    type: 'think',
    subtype: 'search_query_gen',
    rules_i18n: { zh: '', en: '' },
    output_format_i18n: { zh: '', en: '' },
    extra: { taskTemplate: searchQueryGenTemplate() },
    is_active: true,
  });

  await upsertPrompt({
    scope: 'text',
    type: 'transform',
    subtype: 'business_builder',
    rules_i18n: { zh: '', en: '' },
    output_format_i18n: { zh: '', en: '' },
    extra: { taskTemplate: businessBuilderTemplate() },
    is_active: true,
  });

  // 可选：写入 text_scope_config（如果你想让这两个任务开箱即用）
  // 你可以按环境替换为已启用的 provider/model，例如 deer/deepseek-v3.2
  const DEFAULT_PROVIDER = process.env.SEED_TEXT_PROVIDER || '';
  const DEFAULT_MODEL = process.env.SEED_TEXT_MODEL || '';
  if (DEFAULT_PROVIDER && DEFAULT_MODEL) {
    await maybeUpsertTextScopeConfig('think', 'search_query_gen', DEFAULT_PROVIDER, DEFAULT_MODEL);
    await maybeUpsertTextScopeConfig('transform', 'business_builder', DEFAULT_PROVIDER, DEFAULT_MODEL);
  } else {
    console.log('[seed] skip text_scope_config (set SEED_TEXT_PROVIDER/SEED_TEXT_MODEL to enable)');
  }

  console.log('[seed] done');
}

main().catch((e) => {
  console.error('seed failed:', e);
  process.exit(1);
});

