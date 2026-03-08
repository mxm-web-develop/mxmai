/**
 * 执行敏感词相关表迁移
 * 创建 sensitive_word_lists、sensitive_words、sensitive_word_list_bindings
 *
 * 运行: pnpm --filter @mxmai/mxmdata run migrate:sensitive-words
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

  const sqlPath = join(MXMDATA_ROOT, 'src/database/migrations/add_sensitive_word_tables.sql');
  const sql = readFileSync(sqlPath, 'utf8');

  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query(sql);
    // 通知 PostgREST 重载 schema cache，否则 REST API 会报 "Could not find the table ... in the schema cache"
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log('✅ 敏感词表迁移完成（已触发 PostgREST schema cache 重载）');
  } catch (e: any) {
    console.error('❌ 迁移失败:', e.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
