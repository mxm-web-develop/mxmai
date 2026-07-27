/**
 * 将本地 Supabase 中的 provider / 模型 / 业务配置同步到云数据库。
 *
 * 用法（项目根目录）：
 *   SYNC_TARGET_DB_URL='postgresql://...' pnpm tsx scripts/sync-config-to-cloud.ts
 *
 * SOURCE 默认读根目录 .env 的 SUPABASE_DB_URL（本地 Docker）。
 * TARGET 必须通过 SYNC_TARGET_DB_URL 指定（云 Supabase pooler 连接串）。
 */

import dotenv from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const requireFromMxmdata = createRequire(join(ROOT, 'mxmdata/package.json'));
const { Client } = requireFromMxmdata('pg');

dotenv.config({ path: join(ROOT, '.env') });

const SOURCE_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const TARGET_URL = process.env.SYNC_TARGET_DB_URL;

/** 仅同步配置类表，不含用户任务/会话等业务流水 */
const CONFIG_TABLES = [
  'provider_models',
  'provider_pricing',
  'provider_balances',
  'provider_api_keys',
  'business_pricing',
  'model_config',
  'model_routing_overrides',
  'graph_scope_config',
  'writing_scope_config',
  'video_scope_config',
  'audio_scope_config',
  'music_scope_config',
  'text_scope_config',
  'outline_scope_config',
  'search_scope_config',
  'prompt_engineering_config',
  'base_models',
  'lora_models',
  'smartflows',
] as const;

const SCHEMA_FILES = [
  'knowledge_base.sql',
  'mxmprompt.sql',
  'mxmagent.sql',
  'mxmagent_smartflow.sql',
  'mxmagent_final.sql',
  'mxmagent_complete.sql',
  'mxmagent_final_safe.sql',
];

const MIGRATION_FILES = [
  'add_provider_models.sql',
  'add_provider_usage_pricing_and_business_pricing.sql',
  'add_platform_pricing_to_provider_pricing.sql',
  'add_provider_balances.sql',
  'add_provider_api_keys.sql',
  'add_provider_model_test_runs.sql',
  'add_provider_call_stats.sql',
  'add_provider_call_stats_model_scope.sql',
  'add_model_config.sql',
  'add_graph_scope_config.sql',
  'add_writing_scope_config.sql',
  'add_video_scope_config.sql',
  'add_audio_scope_config.sql',
  'add_music_scope_config.sql',
  'add_text_scope_config.sql',
  'add_outline_scope_config.sql',
  'add_search_scope_config.sql',
  'add_model_routing_overrides.sql',
  'add_prompt_engineering_config.sql',
  'add_sensitive_word_tables.sql',
  'add_sensitive_word_disable_rls.sql',
  'extend_scope_config_unified_business.sql',
  'add_graph_model_config.sql',
  'add_storage_objects.sql',
  'add_storage_object_asset_fields.sql',
  'add_storage_objects_disable_rls.sql',
  'add_scope_config_model_column.sql',
];

function pgClient(url: string) {
  return new Client({
    connectionString: url,
    ssl: url.includes('supabase.co') || url.includes('pooler.supabase.com')
      ? { rejectUnauthorized: false }
      : undefined,
    connectionTimeoutMillis: 30000,
  });
}

async function tableExists(client: Client, table: string): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [table],
  );
  return (r.rowCount ?? 0) > 0;
}

async function runSqlFile(client: Client, filePath: string, label: string) {
  const sql = readFileSync(filePath, 'utf8');
  try {
    await client.query(sql);
    console.log(`  ✅ ${label}`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const lower = msg.toLowerCase();
    if (
      lower.includes('already exists') ||
      lower.includes('duplicate') ||
      (lower.includes('relation') && lower.includes('already'))
    ) {
      console.log(`  ⚠️  ${label} (已存在，跳过)`);
      return;
    }
    // mxmprompt RPC 在 PG17 可能因参数名冲突失败；表结构通常已创建
    if (label.includes('mxmprompt') && lower.includes('task_type')) {
      console.log(`  ⚠️  ${label} (函数部分失败，表可能已就绪): ${msg.slice(0, 120)}`);
      return;
    }
    // extend_scope 迁移依赖 business_pricing 数据形态，同步脚本会直接写入 scope 表
    if (label.includes('extend_scope_config') && lower.includes('type')) {
      console.log(`  ⚠️  ${label} (数据迁移跳过，将由行级同步覆盖): ${msg.slice(0, 120)}`);
      return;
    }
    throw e;
  }
}

async function bootstrapTargetSchema(target: Client) {
  console.log('\n📦 补全云库 schema...\n');

  const schemaDir = join(ROOT, 'mxmdata/src/database/schemas');
  for (const file of SCHEMA_FILES) {
    const path = join(schemaDir, file);
    if (!existsSync(path)) continue;
    const need =
      file === 'knowledge_base.sql'
        ? !(await tableExists(target, 'knowledge_bases'))
        : file.startsWith('mxmagent')
          ? !(await tableExists(target, 'smartflows'))
          : file === 'mxmprompt.sql'
            ? !(await tableExists(target, 'base_models'))
            : true;
    if (!need) {
      console.log(`  ⏭️  跳过 ${file}（已存在）`);
      continue;
    }
    await runSqlFile(target, path, file);
  }

  const migDir = join(ROOT, 'mxmdata/src/database/migrations');
  for (const file of MIGRATION_FILES) {
    const path = join(migDir, file);
    if (!existsSync(path)) {
      console.warn(`  ⚠️  迁移文件不存在: ${file}`);
      continue;
    }
    await runSqlFile(target, path, file);
  }

  // supabase-init grants（云库跳过 vector 检测时可能未执行）
  const initPath = join(schemaDir, 'supabase-init.sql');
  if (existsSync(initPath)) {
    await runSqlFile(target, initPath, 'supabase-init.sql (grants)');
  }
}

async function getColumnTypes(client: Client, table: string): Promise<Map<string, string>> {
  const r = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
    [table],
  );
  return new Map(r.rows.map((row: { column_name: string; data_type: string }) => [row.column_name, row.data_type]));
}

function normalizeValue(val: unknown, dataType: string | undefined): unknown {
  if (val == null) return null;
  if (dataType === 'jsonb' || dataType === 'json') {
    if (typeof val === 'object') return JSON.stringify(val);
  }
  return val;
}

async function getColumns(client: Client, table: string): Promise<string[]> {
  const r = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
    [table],
  );
  return r.rows.map((row: { column_name: string }) => row.column_name);
}

function mapRowForTarget(
  row: Record<string, unknown>,
  sourceCols: string[],
  targetCols: Set<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of sourceCols) {
    if (targetCols.has(col)) {
      out[col] = row[col];
    }
  }
  // 本地旧 schema: model → 云库 logical_model
  if (
    !targetCols.has('model') &&
    targetCols.has('logical_model') &&
    row.model != null &&
    out.logical_model == null
  ) {
    out.logical_model = row.model;
  }
  return out;
}

async function syncTable(source: Client, target: Client, table: string) {
  if (!(await tableExists(source, table))) {
    console.log(`  ⏭️  ${table}: 本地不存在`);
    return { table, action: 'skip', rows: 0 };
  }
  if (!(await tableExists(target, table))) {
    console.log(`  ❌ ${table}: 云库表不存在，请先 bootstrap schema`);
    return { table, action: 'missing', rows: 0 };
  }

  const { rows } = await source.query(`SELECT * FROM ${table}`);
  if (rows.length === 0) {
    console.log(`  ⏭️  ${table}: 本地无数据`);
    return { table, action: 'empty', rows: 0 };
  }

  const sourceCols = Object.keys(rows[0]);
  const targetColList = await getColumns(target, table);
  const targetCols = new Set(targetColList);
  const targetTypes = await getColumnTypes(target, table);
  const insertCols = targetColList.filter((c) =>
    sourceCols.includes(c) || (c === 'logical_model' && sourceCols.includes('model')),
  );
  if (insertCols.length === 0) {
    console.log(`  ❌ ${table}: 无匹配列`);
    return { table, action: 'missing', rows: 0 };
  }

  const colList = insertCols.map((c) => `"${c}"`).join(', ');
  await target.query(`DELETE FROM ${table}`);

  const batchSize = 50;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values: unknown[] = [];
    const tuples = batch
      .map((row, ri) => {
        const mapped = mapRowForTarget(row, sourceCols, targetCols);
        const placeholders = insertCols.map((_, ci) => `$${ri * insertCols.length + ci + 1}`);
        insertCols.forEach((c) => values.push(normalizeValue(mapped[c] ?? null, targetTypes.get(c))));
        return `(${placeholders.join(', ')})`;
      })
      .join(', ');
    await target.query(
      `INSERT INTO ${table} (${colList}) VALUES ${tuples}`,
      values,
    );
  }

  console.log(`  ✅ ${table}: ${rows.length} 行`);
  return { table, action: 'synced', rows: rows.length };
}

async function main() {
  if (!SOURCE_URL) {
    console.error('❌ 缺少 SOURCE：请在 .env 配置 SUPABASE_DB_URL（本地库）');
    process.exit(1);
  }
  if (!TARGET_URL) {
    console.error('❌ 缺少 TARGET：请设置 SYNC_TARGET_DB_URL（云 Supabase 连接串）');
    process.exit(1);
  }

  const source = pgClient(SOURCE_URL);
  const target = pgClient(TARGET_URL);

  try {
    await source.connect();
    await target.connect();
    console.log('🔗 已连接本地 SOURCE 与云 TARGET');

    await bootstrapTargetSchema(target);

    console.log('\n📤 同步配置数据...\n');
    const results = [];
    for (const table of CONFIG_TABLES) {
      results.push(await syncTable(source, target, table));
    }

    console.log('\n📊 汇总:');
    const synced = results.filter((r) => r.action === 'synced');
    console.log(`  共同步 ${synced.length} 张表，${synced.reduce((n, r) => n + r.rows, 0)} 行`);

    const missing = results.filter((r) => r.action === 'missing');
    if (missing.length) {
      console.warn(`  ⚠️  ${missing.length} 张表在云库不存在: ${missing.map((m) => m.table).join(', ')}`);
    }

    console.log('\n🎉 配置同步完成。请在云服务器执行: pm2 reload scripts/ecosystem.config.cjs');
  } finally {
    await source.end().catch(() => {});
    await target.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error('\n❌ 同步失败:', e instanceof Error ? e.message : e);
  process.exit(1);
});
