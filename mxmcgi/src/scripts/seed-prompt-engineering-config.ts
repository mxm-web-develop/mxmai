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
import { RepositoryFactory } from '@mxmai/mxmdata';
import { getWritingTypeConfig, getWritingTypeOutputFormat } from '../core/writing/wtconfigs';
import { SUBTYPE_RULES_MAP } from '../core/writing/wtconfigs/subtype-rules';
import { rules as storyboardRules, outputformat as storyboardOutputformat, storyboard_output_format_template_zh } from './initial-prompt-data/storyboard-scripts';
import { getGraphTypeConfig, getGraphTypeOptions } from '../core/graph/graphconfigs';

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
    const extra = type === 'storyboard-scripts'
      ? { storyboard_output_format_template_zh }
      : undefined;
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
