/**
 * 执行 published_api_usage_events 表迁移（开放 API 调用统计）
 * 须先执行 migrate:published-apis
 * 运行: pnpm --filter @mxmai/mxmdata run migrate:published-api-usage
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
    console.error('❌ 缺少 SUPABASE_DB_URL 或 DATABASE_URL（见项目根 .env / mxmdata/.env）');
    process.exit(1);
  }

  const sqlPath = join(MXMDATA_ROOT, 'src/database/migrations/add_published_api_usage.sql');
  const sql = readFileSync(sqlPath, 'utf8');

  const client = new Client({ connectionString });
  try {
    await client.connect();

    const check = await client.query(
      `SELECT to_regclass('public.published_apis') AS reg`
    );
    if (!check.rows[0]?.reg) {
      console.error('❌ 未找到表 published_apis，请先执行:');
      console.error('   pnpm --filter @mxmai/mxmdata run migrate:published-apis');
      process.exit(1);
    }

    await client.query(sql);
    console.log('✅ published_api_usage_events 迁移完成');
    console.log('   若 PostgREST 报 schema cache: pnpm --filter @mxmai/mxmdata run reload-schema');
  } catch (e: any) {
    console.error('❌ 迁移失败:', e.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
