/**
 * Run add_storage_objects_disable_rls.sql migration
 */
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { loadMonorepoEnv } from '../env';

async function main(): Promise<void> {
  loadMonorepoEnv();
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    throw new Error('SUPABASE_DB_URL is required');
  }
  const sqlPath = path.join(
    __dirname,
    '../database/migrations/add_storage_objects_disable_rls.sql'
  );
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
    console.log('[migrate:storage-objects-disable-rls] OK');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
