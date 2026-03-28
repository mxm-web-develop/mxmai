/**
 * 扩展 provider_call_stats：增加 model_key、scope、task_id
 *
 * 运行: pnpm --filter @mxmai/mxmdata run migrate:provider-call-stats-model-scope
 */

import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';

const MXMDATA_ROOT = process.cwd();
dotenv.config({ path: join(MXMDATA_ROOT, '.env') });
dotenv.config({ path: join(MXMDATA_ROOT, '../.env') });

async function main() {
  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ 缺少 SUPABASE_DB_URL 或 DATABASE_URL');
    process.exit(1);
  }

  const sqlPath = join(
    MXMDATA_ROOT,
    'src/database/migrations/add_provider_call_stats_model_scope.sql',
  );
  const sql = readFileSync(sqlPath, 'utf8');

  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query(sql);
    console.log('✅ provider_call_stats model_key/scope/task_id 扩展完成');
  } catch (e: unknown) {
    console.error('❌ 迁移失败:', e instanceof Error ? e.message : String(e));
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
