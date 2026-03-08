/**
 * 修复 provider_usage_records.task_id 类型（UUID -> VARCHAR(64)）
 * 与 cgi_tasks.id 格式一致，避免插入失败导致"服务价格报错"
 * 运行: pnpm --filter @mxmai/mxmdata run migrate:provider-usage-task-id
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
    'src/database/migrations/alter_provider_usage_task_id_type.sql'
  );
  const sql = readFileSync(sqlPath, 'utf8');

  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query(sql);
    console.log('✅ provider_usage_records.task_id 已改为 VARCHAR(64)');
  } catch (e: any) {
    console.error('❌ 迁移失败:', e.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
