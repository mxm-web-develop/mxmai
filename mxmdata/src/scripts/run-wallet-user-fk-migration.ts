/**
 * 执行钱包用户外键迁移
 * 运行: pnpm --filter @mxmai/mxmdata migrate:wallet-user-fk
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

  const sqlPath = join(MXMDATA_ROOT, 'src/database/migrations/add_wallet_user_fk.sql');
  const sql = readFileSync(sqlPath, 'utf8');

  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query(sql);
    console.log('✅ 钱包用户外键迁移完成');
  } catch (e: any) {
    console.error('❌ 迁移失败:', e.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
