/**
 * 强制写入 text/plan/eshop-garment-batch 的 formSchema（bundle 导入可能被 Admin 旧 schema 浅合并覆盖）
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { RepositoryFactory } from '@mxmai/mxmdata';

function loadEnvOnce() {
  const projectRoot = path.resolve(__dirname, '../../..');
  for (const p of [path.join(projectRoot, '.env'), path.join(process.cwd(), '.env')]) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p, override: false });
      return;
    }
  }
  dotenv.config({ override: false });
}

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();
  const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
  const bundlePath = path.join(
    process.cwd(),
    'src/tasks/examples/text-plan-eshop-garment-batch.business.json'
  );
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  const item = bundle.items[0];
  const existing = await repo.findByKey('text', 'plan', 'eshop-garment-batch');
  if (!existing) throw new Error('text/plan/eshop-garment-batch not found');

  const incomingTemplate = item.extra?.taskTemplate;
  if (!incomingTemplate?.formSchema) throw new Error('bundle missing taskTemplate.formSchema');

  const nextExtra = {
    ...(existing.extra ?? {}),
    display: item.extra.display ?? (existing.extra as any)?.display,
    taskTemplate: incomingTemplate,
  };

  await repo.upsert({
    scope: 'text',
    type: 'plan',
    subtype: 'eshop-garment-batch',
    rules_i18n: {},
    output_format_i18n: {},
    form_options_i18n: null,
    extra: nextExtra,
    is_active: true,
  });

  const after = await repo.findByKey('text', 'plan', 'eshop-garment-batch');
  const garmentsType = (after?.extra as any)?.taskTemplate?.formSchema?.properties?.garments?.type;
  console.log('patched garments.type =', garmentsType);
  if (garmentsType !== 'array') {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
