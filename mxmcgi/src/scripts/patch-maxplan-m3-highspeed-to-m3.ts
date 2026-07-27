/**
 * 将仍指向 MiniMax-M3-highspeed 的 scope 路由改为 MiniMax-M3。
 *
 * 背景：MiniMax 官方无 M3-highspeed SKU；seed 已停用该 model_key。
 *
 * 用法：
 *   pnpm --filter @mxmai/mxmcgi run patch:maxplan-m3-highspeed
 *
 * 生产：
 *   bash scripts/seed-maxplan-production.sh  # 已含 seed + reload；本脚本可单独跑修补路由
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { refreshProviderModelCatalog } from '../models/provider-model-catalog';

const FROM = 'MiniMax-M3-highspeed';
const TO = 'MiniMax-M3';
const PROVIDER = 'maxplan';

function loadEnvOnce() {
  const projectRoot = path.resolve(__dirname, '../../..');
  for (const p of [
    path.join(projectRoot, '.env'),
    path.join(projectRoot, '.local.env'),
    path.join(projectRoot, 'mxmcgi/.env'),
    path.join(process.cwd(), '.env'),
  ]) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p, override: false });
      return;
    }
  }
  dotenv.config({ override: false });
}

async function patchScopeTable(
  label: string,
  listFn: () => ReturnType<
    ReturnType<typeof RepositoryFactory.createTextScopeConfigRepository>['listConfigs']
  >,
  upsertFn: (row: {
    scope: string;
    task_key: string;
    sub_type: string;
    model: string;
    provider: string;
    enabled: boolean;
    logical_model?: string;
  }) => Promise<unknown>,
) {
  const { items } = await listFn();
  let n = 0;
  for (const row of items) {
    if (row.provider !== PROVIDER) continue;
    if (row.model !== FROM) continue;
    await upsertFn({
      scope: row.scope,
      task_key: row.task_key,
      sub_type: row.sub_type,
      model: TO,
      provider: PROVIDER,
      enabled: row.enabled ?? true,
      logical_model: row.logical_model ?? undefined,
    });
    n += 1;
    console.log(`✅ ${label}`, `${row.task_key}/${row.sub_type}`, `${FROM} → ${TO}`);
  }
  return n;
}

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();

  const textRepo = RepositoryFactory.createTextScopeConfigRepository();
  const writingRepo = RepositoryFactory.createWritingScopeConfigRepository();

  let patched = 0;
  patched += await patchScopeTable(
    'text_scope_config',
    () => textRepo.listConfigs({ limit: 500 }),
    (dto) => textRepo.upsertConfig(dto),
  );
  patched += await patchScopeTable(
    'writing_scope_config',
    () => writingRepo.listConfigs({ limit: 500 }),
    (dto) => writingRepo.upsertConfig(dto),
  );

  const modelRepo = RepositoryFactory.createProviderModelRepository();
  const m3 = await modelRepo.findByKey({ provider: PROVIDER, scope: 'text', model_key: TO });
  if (!m3?.is_enabled) {
    console.warn(`⚠️  provider_models 中 ${PROVIDER}/${TO} (scope=text) 未启用，请先运行 seed:provider-maxplan-models`);
  }

  await refreshProviderModelCatalog();

  console.log('');
  console.log(`完成：修补 ${patched} 条 scope 路由。`);
  if (patched === 0) {
    console.log('未发现引用 MiniMax-M3-highspeed 的路由；若仍报错，请检查业务 bundle / Smartflow 节点 model 字段。');
  }
  console.log('请 reload mxmcgi-api / mxmcgi-worker 使 worker 进程加载最新目录。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
