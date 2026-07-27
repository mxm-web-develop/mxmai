/**
 * 回填 provider_usage_records 用量分析字段
 * 运行: pnpm --filter @mxmai/mxmdata run backfill:usage-analytics
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

  const sqlPath = join(MXMDATA_ROOT, '../mxmcgi/scripts/backfill-usage-source.sql');
  const sql = readFileSync(sqlPath, 'utf8');

  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query(sql);
    const { rows } = await client.query(`
      SELECT usage_source, COUNT(*)::int AS cnt
      FROM provider_usage_records
      GROUP BY usage_source
      ORDER BY usage_source
    `);
    console.log('✅ usage analytics 回填完成');
    for (const r of rows) {
      console.log(`   ${r.usage_source}: ${r.cnt} 行`);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('❌ 回填失败:', msg);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
