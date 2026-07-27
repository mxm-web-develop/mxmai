/**
 * published_api_usage_events.title 列
 * pnpm --filter @mxmai/mxmdata run migrate:published-api-usage-title
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
  const sql = readFileSync(
    join(MXMDATA_ROOT, 'src/database/migrations/add_published_api_usage_title.sql'),
    'utf8'
  );
  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query(sql);
    console.log('✅ published_api_usage_events.title 迁移完成');
  } catch (e: unknown) {
    console.error('❌ 迁移失败:', e instanceof Error ? e.message : e);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
