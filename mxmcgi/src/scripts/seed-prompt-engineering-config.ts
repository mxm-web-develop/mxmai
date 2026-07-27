/**
 * 将当前代码内写死的提示词配置写入 prompt_engineering_config 表（wtconfigs、格式要求）
 *
 * 契约：规则与系统说明统一落在 `extra.taskTemplate.prompt.unifiedTemplate`；
 * `rules_i18n` 列由仓库层恒写 `{}`，本脚本不再写入该列正文。
 *
 * 用法：在 mxmcgi 目录下执行
 *   pnpm run seed:prompt-config
 * 或
 *   tsx src/scripts/seed-prompt-engineering-config.ts
 */

import dotenv from 'dotenv';
import { join } from 'path';
import * as fs from 'fs';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { getWritingTypeConfig, getWritingTypeOutputFormat } from '../clientServer/writing';
import { SUBTYPE_RULES_MAP } from '../clientServer/writing/subtype-rules';
import {
  rules as storyboardRules,
  outputformat as storyboardOutputformat,
  storyboard_output_format_template_zh,
} from './initial-prompt-data/storyboard-scripts';
import { buildWritingUnifiedTemplateFromLegacyParts } from '../prompts/split-unified-template-legacy';

const MXMCGI_ROOT = process.cwd();
const PROJECT_ROOT = join(MXMCGI_ROOT, '..');

dotenv.config({ path: join(MXMCGI_ROOT, '.env') });
dotenv.config({ path: join(PROJECT_ROOT, '.env') });

const WRITING_TYPES = [
  'outlines',
  'articles',
  'storyboard-scripts',
  'voice-scripts',
  'lyrics',
  'reviews',
  'resumes',
  'media-post',
];

/** 与 Task v2 / loadTaskDefinition 对齐的最小写作模板骨架 */
function minimalWritingTaskTemplate(rules: string, outputFormat: string): Record<string, unknown> {
  return {
    formSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        prompt: { type: 'string', title: '写作需求', minLength: 1 },
      },
      required: ['prompt'],
    },
    prompt: {
      unifiedTemplate: buildWritingUnifiedTemplateFromLegacyParts(rules, outputFormat),
    },
    uiSchema: {
      prompt: { 'ui:widget': 'textarea', 'ui:options': { rows: 8 } },
    },
  };
}

// 可选：从 Task v2 示例中加载 outlines 的 TaskTemplate（若存在）
let OUTLINES_TASK_TEMPLATE: any | null = null;
try {
  const outlinesTplPath = join(MXMCGI_ROOT, 'src', 'tasks', 'examples', 'writing-outlines-tech-article.taskTemplate.json');
  if (fs.existsSync(outlinesTplPath)) {
    const raw = fs.readFileSync(outlinesTplPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.taskTemplate) {
      OUTLINES_TASK_TEMPLATE = parsed.taskTemplate;
      // eslint-disable-next-line no-console
      console.log('  [seed] 已从 tasks/examples 载入 outlines TaskTemplate 示例');
    }
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.warn('[seed] 读取 outlines TaskTemplate 示例失败，将跳过 TaskTemplate seeding:', e);
}

async function main() {
  RepositoryFactory.init();
  const repo = RepositoryFactory.createPromptEngineeringConfigRepository();

  let count = 0;

  // ---------- Writing（每种 type 一条，subtype=null）----------
  for (const type of WRITING_TYPES) {
    const rules =
      type === 'storyboard-scripts'
        ? storyboardRules
        : (getWritingTypeConfig(type as any)?.rules ?? '');
    const outputFormat =
      type === 'storyboard-scripts'
        ? storyboardOutputformat
        : (getWritingTypeConfig(type as any)?.outputformat ?? '');
    if (!rules && !outputFormat && !(type === 'outlines' && OUTLINES_TASK_TEMPLATE)) continue;

    let extra: Record<string, unknown> | undefined;
    if (type === 'storyboard-scripts') {
      extra = {
        taskTemplate: minimalWritingTaskTemplate(rules, outputFormat),
        storyboard_output_format_template_zh,
      };
    } else if (type === 'outlines' && OUTLINES_TASK_TEMPLATE) {
      extra = { taskTemplate: OUTLINES_TASK_TEMPLATE };
    } else {
      extra = { taskTemplate: minimalWritingTaskTemplate(rules, outputFormat) };
    }

    await repo.upsert({
      scope: 'writing',
      type,
      subtype: null,
      output_format_i18n: { zh: outputFormat, en: outputFormat },
      extra: extra ?? undefined,
      is_active: true,
    });
    count++;
    console.log(`  [writing] ${type} (subtype=null)`);
  }

  // ---------- Outline（独立 scope）：最小可用默认配置 ----------
  {
    const outlineRules = getWritingTypeConfig('outlines' as any)?.rules ?? '';
    const outlineOutputFormat = getWritingTypeOutputFormat('outlines' as any);
    const hasAny = !!(outlineRules || outlineOutputFormat || OUTLINES_TASK_TEMPLATE);
    if (hasAny) {
      const extra: Record<string, unknown> | undefined = OUTLINES_TASK_TEMPLATE
        ? { taskTemplate: OUTLINES_TASK_TEMPLATE }
        : { taskTemplate: minimalWritingTaskTemplate(outlineRules, outlineOutputFormat) };
      await repo.upsert({
        scope: 'outline',
        type: 'default',
        subtype: null,
        output_format_i18n: { zh: outlineOutputFormat, en: outlineOutputFormat },
        extra,
        is_active: true,
      });
      count++;
      console.log('  [outline] default (subtype=null)');
    }
  }

  // ---------- Writing 细分类型（subtype）----------
  for (const [writingType, subtypeMap] of Object.entries(SUBTYPE_RULES_MAP)) {
    const typeRules =
      writingType === 'storyboard-scripts'
        ? storyboardRules
        : (getWritingTypeConfig(writingType as any)?.rules ?? '');
    const typeOutputFormat =
      writingType === 'storyboard-scripts'
        ? storyboardOutputformat
        : getWritingTypeOutputFormat(writingType as any);
    for (const [subtype, subtypeRules] of Object.entries(subtypeMap)) {
      if (!subtypeRules?.trim()) continue;
      const fullRules = typeRules ? `${typeRules}\n\n---\n\n${subtypeRules}` : subtypeRules;
      await repo.upsert({
        scope: 'writing',
        type: writingType,
        subtype,
        output_format_i18n: { zh: typeOutputFormat, en: typeOutputFormat },
        extra: { taskTemplate: minimalWritingTaskTemplate(fullRules, typeOutputFormat) },
        is_active: true,
      });
      count++;
      console.log(`  [writing] ${writingType} / ${subtype}`);
    }
  }

  console.log('');
  console.log(`✅ 已写入 ${count} 条提示词配置到 prompt_engineering_config`);

  const storyboardRow = await repo.findByKey('writing', 'storyboard-scripts', null);
  if (storyboardRow) {
    const ofZh = (storyboardRow.output_format_i18n as Record<string, string>)?.zh ?? '';
    const tpl = (storyboardRow.extra as Record<string, unknown> | null)?.storyboard_output_format_template_zh ?? '';
    const uni =
      ((storyboardRow.extra as Record<string, unknown> | null)?.taskTemplate as { prompt?: { unifiedTemplate?: string } })
        ?.prompt?.unifiedTemplate ?? '';
    console.log('');
    console.log('分镜脚本 (writing/storyboard-scripts) 校验:');
    console.log(`  unifiedTemplate 长度: ${String(uni).length}`);
    console.log(`  output_format_i18n.zh 长度: ${ofZh.length}`);
    console.log(`  extra.storyboard_output_format_template_zh 长度: ${String(tpl).length}`);
    if (String(uni).length < 100 || ofZh.length < 20 || String(tpl).length < 100) {
      console.warn('  ⚠ 若长度过短，请检查 initial-prompt-data/storyboard-scripts.ts 与 seed 逻辑');
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
