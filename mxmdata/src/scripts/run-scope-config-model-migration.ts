/**
 * Run add_scope_config_model_column.sql on target DB
 */
import fs from 'fs';
import path from 'path';
import pg from 'pg';

async function main(): Promise<void> {
  const presetDbUrl = process.env.SUPABASE_DB_URL;
  if (!presetDbUrl) {
    const { loadMonorepoEnv } = await import('../env');
    loadMonorepoEnv();
  }
  const dbUrl = presetDbUrl || process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error('SUPABASE_DB_URL is required');

  const sqlPath = path.join(__dirname, '../database/migrations/add_scope_config_model_column.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl:
      dbUrl.includes('supabase.co') || dbUrl.includes('pooler.supabase.com')
        ? { rejectUnauthorized: false }
        : undefined,
  });
  await client.connect();
  try {
    await client.query(sql);
    console.log('[migrate:scope-config-model] OK');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
