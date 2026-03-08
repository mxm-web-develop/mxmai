/**
 * 将 provider_pricing 中的 nano-banana 重命名为 nano-banana-pro
 * 运行: pnpm --filter @mxmai/mxmdata run migrate:nano-banana-pro-rename
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
    'src/database/migrations/rename_nano_banana_to_nano_banana_pro_in_pricing.sql'
  );
  const sql = readFileSync(sqlPath, 'utf8');

  const client = new Client({ connectionString });
  try {
    await client.connect();
    const result = await client.query(sql);
    console.log('✅ provider_pricing 中 nano-banana 已重命名为 nano-banana-pro，影响行数:', result.rowCount ?? 0);
  } catch (e: any) {
    console.error('❌ 迁移失败:', e.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
