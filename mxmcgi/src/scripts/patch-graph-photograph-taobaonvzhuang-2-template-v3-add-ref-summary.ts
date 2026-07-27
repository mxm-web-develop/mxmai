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

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();

  const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
  const row = await repo.findByKey('graph', 'photograph', 'taobaonvzhuang-2');
  if (!row) throw new Error('prompt_engineering_config not found: graph/photograph/taobaonvzhuang-2');

  const extra = (row.extra ?? {}) as any;
  const taskTemplate = extra.taskTemplate ?? {};
  const prompt = taskTemplate.prompt ?? {};

  const unifiedTemplateV3 =
    `拍摄场景：${'${scenes}'}\n` +
    `模特参考图摘要：\n${'${model_images}'}\n` +
    `服饰参考图摘要：\n${'${clothing_images}'}\n` +
    `服装材质补充：${'${clothing_material}'}\n` +
    `补充说明：${'${prompt}'}\n` +
    `画幅：${'${aspect_ratio}'}`;

  taskTemplate.prompt = {
    ...prompt,
    unifiedTemplate: unifiedTemplateV3,
    unifiedTemplateMarkup: `\n${unifiedTemplateV3}`,
  };

  extra.taskTemplate = taskTemplate;
  row.extra = extra;

  await repo.upsert(row as any);
  console.log('patched unifiedTemplate: graph/photograph/taobaonvzhuang-2 (add model_images/clothing_images summaries)');
}

main().catch((e) => {
  console.error('patch failed:', e);
  process.exit(1);
});

