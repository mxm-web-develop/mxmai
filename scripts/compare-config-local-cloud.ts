/**
 * 对比本地与云 Supabase 配置表行数 / provider 分布（只读）
 * 用法: pnpm tsx scripts/compare-config-local-cloud.ts
 */
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const { Client } = createRequire(join(ROOT, 'mxmdata/package.json'))('pg');

dotenv.config({ path: join(ROOT, '.env') });

const SOURCE_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const TARGET_URL = process.env.SYNC_TARGET_DB_URL;

function pgClient(url: string) {
  return new Client({
    connectionString: url,
    ssl:
      url.includes('supabase.co') || url.includes('pooler.supabase.com')
        ? { rejectUnauthorized: false }
        : undefined,
    connectionTimeoutMillis: 20000,
  });
}

async function snapshot(client: Client, label: string) {
  const out: Record<string, unknown> = { label };
  for (const t of ['provider_models', 'provider_pricing', 'provider_api_keys', 'business_pricing']) {
    try {
      const r = await client.query(`SELECT count(*)::int AS n FROM ${t}`);
      out[t] = r.rows[0].n;
    } catch {
      out[t] = 'missing';
    }
  }
  try {
    const r = await client.query(`
      SELECT provider, scope, model_key, is_enabled
      FROM provider_models ORDER BY provider, scope, model_key
    `);
    out.models = r.rows;
  } catch {
    out.models = [];
  }
  try {
    const r = await client.query(`
      SELECT provider, scope, model_key,
             platform_unit_price, platform_input_unit_price, platform_output_unit_price
      FROM provider_pricing ORDER BY provider, scope, model_key
    `);
    out.pricing = r.rows;
  } catch {
    out.pricing = [];
  }
  try {
    const r = await client.query(`
      SELECT provider, count(*)::int AS n, bool_or(is_active) AS has_active
      FROM provider_api_keys GROUP BY provider ORDER BY provider
    `);
    out.keys = r.rows;
  } catch {
    out.keys = [];
  }
  try {
    const r = await client.query(`
      SELECT provider, model_key, scope, success, error, created_at
      FROM provider_model_test_runs
      ORDER BY created_at DESC LIMIT 15
    `);
    out.recentTests = r.rows;
  } catch {
    out.recentTests = 'no table';
  }
  return out;
}

function diffModels(
  local: Array<{ provider: string; scope: string; model_key: string; is_enabled: boolean }>,
  cloud: typeof local,
) {
  const key = (m: { provider: string; scope: string; model_key: string }) =>
    `${m.provider}|${m.scope}|${m.model_key}`;
  const localMap = new Map(local.map((m) => [key(m), m]));
  const cloudMap = new Map(cloud.map((m) => [key(m), m]));
  const onlyLocal = [...localMap.keys()].filter((k) => !cloudMap.has(k));
  const onlyCloud = [...cloudMap.keys()].filter((k) => !localMap.has(k));
  const enabledDiff = [...localMap.keys()]
    .filter((k) => cloudMap.has(k))
    .filter((k) => localMap.get(k)!.is_enabled !== cloudMap.get(k)!.is_enabled);
  return { onlyLocal, onlyCloud, enabledDiff };
}

async function main() {
  if (!SOURCE_URL) {
    console.error('缺少 SUPABASE_DB_URL');
    process.exit(1);
  }
  if (!TARGET_URL) {
    console.error('缺少 SYNC_TARGET_DB_URL');
    process.exit(1);
  }

  const source = pgClient(SOURCE_URL);
  const target = pgClient(TARGET_URL);
  await source.connect();
  await target.connect();

  const local = await snapshot(source, 'local');
  const cloud = await snapshot(target, 'cloud');

  console.log('\n=== 行数对比 ===');
  for (const t of ['provider_models', 'provider_pricing', 'provider_api_keys', 'business_pricing']) {
    console.log(`${t}: local=${local[t]} cloud=${cloud[t]}`);
  }

  console.log('\n=== API Keys（云）===');
  console.log(JSON.stringify(cloud.keys, null, 2));

  const md = diffModels(
    local.models as Array<{ provider: string; scope: string; model_key: string; is_enabled: boolean }>,
    cloud.models as Array<{ provider: string; scope: string; model_key: string; is_enabled: boolean }>,
  );
  console.log('\n=== 模型差异 ===');
  console.log('仅本地:', md.onlyLocal.length ? md.onlyLocal.slice(0, 20) : '无');
  console.log('仅云端:', md.onlyCloud.length ? md.onlyCloud.slice(0, 20) : '无');
  console.log('启用状态不一致:', md.enabledDiff.length ? md.enabledDiff.slice(0, 20) : '无');

  console.log('\n=== 云最近连通性测试 ===');
  console.log(JSON.stringify(cloud.recentTests, null, 2));

  await source.end();
  await target.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
