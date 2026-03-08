/**
 * 关闭敏感词三张表的 RLS，便于后端用 anon key 访问（权限由 API 校验）
 * 若已使用 SUPABASE_SERVICE_KEY 可跳过本迁移。
 *
 * 运行: pnpm --filter @mxmai/mxmdata run migrate:sensitive-words-rls
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
    'src/database/migrations/add_sensitive_word_disable_rls.sql'
  );
  const sql = readFileSync(sqlPath, 'utf8');

  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query(sql);
    console.log('✅ 敏感词表 RLS 已关闭');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('❌ 迁移失败:', msg);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
