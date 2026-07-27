/**
 * 执行 provider_usage_records 用量分析扩展列迁移
 * 运行: pnpm --filter @mxmai/mxmdata run migrate:usage-analytics
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

  const sqlPath = join(MXMDATA_ROOT, 'src/database/migrations/add_usage_analytics_columns.sql');
  const sql = readFileSync(sqlPath, 'utf8');

  const client = new Client({ connectionString });
  try {
    await client.connect();
    const check = await client.query(`SELECT to_regclass('public.provider_usage_records') AS reg`);
    if (!check.rows[0]?.reg) {
      console.error('❌ 未找到 provider_usage_records，请先执行 provider usage 迁移');
      process.exit(1);
    }
    await client.query(sql);
    console.log('✅ usage analytics 列迁移完成');
    console.log('   回填: pnpm --filter @mxmai/mxmdata run backfill:usage-analytics');
    console.log('   若 PostgREST 报 schema cache: pnpm --filter @mxmai/mxmdata run reload-schema');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('❌ 迁移失败:', msg);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
