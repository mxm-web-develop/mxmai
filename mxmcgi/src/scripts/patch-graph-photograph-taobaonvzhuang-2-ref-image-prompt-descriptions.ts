/**
 * 将 taobaonvzhuang-2 各 referenceImages 槽位的 description 更新为「写给 LLM 的用途指令」
 *（与 mxmcgi/src/tasks/examples/graph-photograph-taobaonvzhuang-2.config.json 对齐）。
 *
 * 用法：在仓库根目录 `pnpm exec tsx mxmcgi/src/scripts/patch-graph-photograph-taobaonvzhuang-2-ref-image-prompt-descriptions.ts`
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
    path.resolve(process.cwd(), '.env'),
    path.resolve(mxmcgiDir, '.env'),
    path.resolve(process.cwd(), 'mxmcgi', '.env'),
    path.resolve(projectRoot, 'mxmdata', '.env'),
  ];
  for (const p of envPaths) {
    if (!fs.existsSync(p)) continue;
    const r = dotenv.config({ path: p, override: false });
    if (!r.error) return;
  }
  dotenv.config({ override: false });
}

function setDeep(obj: any, pathKeys: string[], value: any) {
  let cur = obj;
  for (let i = 0; i < pathKeys.length - 1; i++) {
    const k = pathKeys[i];
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[pathKeys[pathKeys.length - 1]] = value;
}

const DESCRIPTIONS: Record<string, string> = {
  model_images:
    '这些参考图展示了模特的脸部、身形、发型与姿态，生成时必须保持模特外观与参考完全一致，不得换脸、换年龄段或换种族特征。',
  clothing_images:
    '这些参考图展示了需要穿着的服装款式、面料质感与细节，生成时模特必须穿着与参考图一致的服装，颜色、版型、面料纹理不得偏离。',
  environment_images:
    '这些参考图展示了拍摄环境的空间布局、光影与构图风格，生成时以参考图的环境为准还原场景氛围与光线方向，「拍摄场景」选项仅作补充。',
};

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();

  const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
  const existing = await repo.findByKey('graph', 'photograph', 'taobaonvzhuang-2');
  if (!existing) throw new Error('prompt_engineering_config missing for graph/photograph/taobaonvzhuang-2');

  const extra = (existing.extra ?? {}) as any;
  const formSchema = extra?.taskTemplate?.formSchema;
  if (!formSchema) throw new Error('missing extra.taskTemplate.formSchema');

  let changed = false;
  for (const [key, text] of Object.entries(DESCRIPTIONS)) {
    const cur = formSchema?.properties?.[key]?.description;
    if (cur === text) continue;
    setDeep(extra, ['taskTemplate', 'formSchema', 'properties', key, 'description'], text);
    changed = true;
    console.log(`update ${key}.description`);
  }

  if (!changed) {
    console.log('all referenceImages descriptions already match, skip');
    return;
  }

  await repo.upsert({
    id: existing.id,
    scope: 'graph',
    type: 'photograph',
    subtype: 'taobaonvzhuang-2',
    rules_i18n: existing.rules_i18n ?? {},
    output_format_i18n: existing.output_format_i18n ?? {},
    form_options_i18n: existing.form_options_i18n ?? null,
    extra,
    is_active: true,
    updated_by: existing.updated_by ?? null,
  });

  console.log('patched taobaonvzhuang-2 referenceImages field descriptions (LLM prompt instructions)');
}

main().catch((e) => {
  console.error('patch failed:', e);
  process.exit(1);
});
