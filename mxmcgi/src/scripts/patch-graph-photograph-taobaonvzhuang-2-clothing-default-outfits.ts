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

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();

  const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
  const existing = await repo.findByKey('graph', 'photograph', 'taobaonvzhuang-2');
  if (!existing) throw new Error('prompt_engineering_config missing for graph/photograph/taobaonvzhuang-2');

  const extra = (existing.extra ?? {}) as any;
  const formSchema = extra?.taskTemplate?.formSchema;
  if (!formSchema) throw new Error('missing extra.taskTemplate.formSchema');

  const def =
    formSchema?.properties?.clothing_images?.items?.properties?.type ??
    null;
  const current = def?.default;
  if (current === 'outfits') {
    console.log('clothing_images.type.default already outfits, skip');
    return;
  }

  setDeep(extra, ['taskTemplate', 'formSchema', 'properties', 'clothing_images', 'items', 'properties', 'type', 'default'], 'outfits');

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

  console.log('patched clothing_images.items.properties.type.default -> outfits');
}

main().catch((e) => {
  console.error('patch failed:', e);
  process.exit(1);
});

