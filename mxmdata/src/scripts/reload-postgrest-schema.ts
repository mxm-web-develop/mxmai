/**
 * 通知 PostgREST 重载 schema cache（解决「Could not find the table in the schema cache」）
 * 执行敏感词等迁移后若接口仍报 schema cache，可运行本脚本。
 *
 * 运行: pnpm --filter @mxmai/mxmdata run reload-schema
 */

import dotenv from 'dotenv';
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

  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log('✅ 已发送 NOTIFY pgrst，PostgREST 将重载 schema cache');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('❌ 执行失败:', msg);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
