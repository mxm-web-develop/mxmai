/**
 * 将当前代码内写死的提示词配置写入 prompt_engineering_config 表（wtconfigs、graphconfigs、格式要求）
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
import { getGraphTypeConfig, getGraphTypeOptions } from '../clientServer/graph';

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

/** 图文业务统一输出格式说明（与 graph-service 中拼装一致） */
const GRAPH_OUTPUT_FORMAT_ZH = `图文：规则与风格说明，输出为生成参数。只输出最终图片生成提示词本身，不要包含其他说明文字。输出语言根据用户需求为中文或英文。`;
const GRAPH_OUTPUT_FORMAT_EN = `Image/Text: rules and style; output as generation params. Output only the final image prompt, no extra text. Output language: Chinese or English per user.`;

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
    const rules = type === 'storyboard-scripts'
      ? storyboardRules
      : (getWritingTypeConfig(type as any)?.rules ?? '');
    const outputFormat = type === 'storyboard-scripts'
      ? storyboardOutputformat
      : (getWritingTypeConfig(type as any)?.outputformat ?? '');
    if (!rules && !outputFormat) continue;
    let extra: Record<string, unknown> | undefined;
    if (type === 'storyboard-scripts') {
      extra = { storyboard_output_format_template_zh };
    }
    // 为 v2 Task 预填 outlines 的 TaskTemplate（仅当示例存在时）
    if (type === 'outlines' && OUTLINES_TASK_TEMPLATE) {
      extra = {
        ...(extra ?? {}),
        taskTemplate: OUTLINES_TASK_TEMPLATE,
      };
    }
    await repo.upsert({
      scope: 'writing',
      type,
      subtype: null,
      rules_i18n: { zh: rules, en: rules },
      output_format_i18n: { zh: outputFormat, en: outputFormat },
      extra: extra ?? undefined,
      is_active: true,
    });
    count++;
    console.log(`  [writing] ${type} (subtype=null)`);
  }

  // ---------- Outline（独立 scope）：最小可用默认配置 ----------
  // 目标：让 Admin/前端可以先跑通 scope=outline 的链路
  // 迁移策略：复用 writing/outlines 的规则/输出格式 + v2 的 extra.taskTemplate（若存在）
  {
    const outlineRules = getWritingTypeConfig('outlines' as any)?.rules ?? '';
    const outlineOutputFormat = getWritingTypeOutputFormat('outlines' as any);
    const hasAny = !!(outlineRules || outlineOutputFormat || OUTLINES_TASK_TEMPLATE);
    if (hasAny) {
      const extra: Record<string, unknown> | undefined = OUTLINES_TASK_TEMPLATE
        ? { taskTemplate: OUTLINES_TASK_TEMPLATE }
        : undefined;
      await repo.upsert({
        scope: 'outline',
        type: 'default',
        subtype: null,
        rules_i18n: { zh: outlineRules, en: outlineRules },
        output_format_i18n: { zh: outlineOutputFormat, en: outlineOutputFormat },
        extra,
        is_active: true,
      });
      count++;
      console.log('  [outline] default (subtype=null)');
    }
  }

  // ---------- Writing 细分类型（subtype）：规则 = type 级 rules + subtype 规则，output_format 继承 type 级 --------
  for (const [writingType, subtypeMap] of Object.entries(SUBTYPE_RULES_MAP)) {
    const typeRules = writingType === 'storyboard-scripts'
      ? storyboardRules
      : (getWritingTypeConfig(writingType as any)?.rules ?? '');
    const typeOutputFormat = writingType === 'storyboard-scripts'
      ? storyboardOutputformat
      : getWritingTypeOutputFormat(writingType as any);
    for (const [subtype, subtypeRules] of Object.entries(subtypeMap)) {
      if (!subtypeRules?.trim()) continue;
      const fullRules = typeRules ? `${typeRules}\n\n---\n\n${subtypeRules}` : subtypeRules;
      await repo.upsert({
        scope: 'writing',
        type: writingType,
        subtype,
        rules_i18n: { zh: fullRules, en: fullRules },
        output_format_i18n: { zh: typeOutputFormat, en: typeOutputFormat },
        is_active: true,
      });
      count++;
      console.log(`  [writing] ${writingType} / ${subtype}`);
    }
  }

  // ---------- Graph：规则来自 graphconfigs，输出格式统一写入，避免前端/接口不一致 --------
  const GRAPH_TYPES = ['photograph', 'painting', 'design'];
  for (const graphType of GRAPH_TYPES) {
    const config = getGraphTypeConfig(graphType);
    if (!config) continue;
    const options = getGraphTypeOptions(graphType);
    for (const opt of options) {
      const rules = config.getRulesForType(opt.value);
      if (!rules) continue;
      await repo.upsert({
        scope: 'graph',
        type: graphType,
        subtype: opt.value,
        rules_i18n: { zh: rules, en: rules },
        output_format_i18n: { zh: GRAPH_OUTPUT_FORMAT_ZH, en: GRAPH_OUTPUT_FORMAT_EN },
        is_active: true,
      });
      count++;
      console.log(`  [graph] ${graphType} / ${opt.value}`);
    }
  }

  console.log('');
  console.log(`✅ 已写入 ${count} 条提示词配置到 prompt_engineering_config`);

  // 校验分镜脚本 type 级配置是否含完整 rules / output_format / extra 模板
  const storyboardRow = await repo.findByKey('writing', 'storyboard-scripts', null);
  if (storyboardRow) {
    const rZh = (storyboardRow.rules_i18n as Record<string, string>)?.zh ?? '';
    const ofZh = (storyboardRow.output_format_i18n as Record<string, string>)?.zh ?? '';
    const tpl = (storyboardRow.extra as Record<string, string> | null)?.storyboard_output_format_template_zh ?? '';
    console.log('');
    console.log('分镜脚本 (writing/storyboard-scripts) 校验:');
    console.log(`  rules_i18n.zh 长度: ${rZh.length}`);
    console.log(`  output_format_i18n.zh 长度: ${ofZh.length}`);
    console.log(`  extra.storyboard_output_format_template_zh 长度: ${tpl.length}`);
    if (rZh.length < 100 || ofZh.length < 20 || tpl.length < 100) {
      console.warn('  ⚠ 若长度过短，请检查 initial-prompt-data/storyboard-scripts.ts 与 seed 逻辑');
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
