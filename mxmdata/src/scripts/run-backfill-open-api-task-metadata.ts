/**
 * 历史 Open API 任务 metadata 回填（publishedSlug / creationSource）
 * 运行: pnpm --filter @mxmai/mxmdata run migrate:backfill-open-api-metadata
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

  const sqlPath = join(MXMDATA_ROOT, '../mxmcgi/scripts/backfill-open-api-task-metadata.sql');
  const sql = readFileSync(sqlPath, 'utf8');

  const client = new Client({ connectionString });
  try {
    await client.connect();
    const res = await client.query(sql);
    console.log('✅ Open API 任务 metadata 回填完成，影响行数:', res.rowCount ?? '—');
  } catch (e: unknown) {
    console.error('❌ 回填失败:', e instanceof Error ? e.message : e);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
