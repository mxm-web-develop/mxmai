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

  const repo = RepositoryFactory.createGraphScopeConfigRepository();
  const cfg = await repo.findConfig('graph', 'photograph', 'taobaonvzhuang-2');
  if (!cfg) throw new Error('graph_scope_config missing: graph/photograph/taobaonvzhuang-2');

  await repo.upsertConfig({
    scope: 'graph',
    task_key: 'photograph',
    sub_type: 'taobaonvzhuang-2',
    // 使用 deer provider 的 OpenAI 兼容图像通道（支持 gpt-image-2 + 参考图 edits）
    provider: 'qhai',
    model: 'gpt-image-2-all',
    enabled: true,
    margin: (cfg as any).margin ?? undefined,
    charge_metric: (cfg as any).charge_metric ?? undefined,
  } as any);

  console.log('patched graph_scope_config: graph/photograph/taobaonvzhuang-2 -> deer / gpt-image-2-all');
}

main().catch((e) => {
  console.error('patch failed:', e);
  process.exit(1);
});

