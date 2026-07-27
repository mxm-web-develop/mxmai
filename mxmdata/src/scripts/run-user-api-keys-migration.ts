/**
 * 执行 user_api_keys 表迁移（账户 API Token）
 * 运行: pnpm --filter @mxmai/mxmdata run migrate:user-api-keys
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
    console.error('❌ 缺少 SUPABASE_DB_URL 或 DATABASE_URL（见项目根 .env）');
    process.exit(1);
  }

  const sqlPath = join(MXMDATA_ROOT, 'src/database/migrations/add_user_api_keys.sql');
  const sql = readFileSync(sqlPath, 'utf8');

  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query(sql);
    console.log('✅ user_api_keys 迁移完成');
    console.log('   若仍报 schema cache: pnpm --filter @mxmai/mxmdata run reload-schema');
    console.log('   然后在 Web「我的账号 → API Token」重新创建密钥');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('❌ 迁移失败:', msg);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
