/**
 * Run add_storage_objects_partner_source.sql migration
 */
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { loadMonorepoEnv } from '../env';

async function main(): Promise<void> {
  const presetDbUrl = process.env.SUPABASE_DB_URL;
  loadMonorepoEnv();
  const dbUrl = presetDbUrl || process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    throw new Error('SUPABASE_DB_URL is required');
  }
  const sqlPath = path.join(
    __dirname,
    '../database/migrations/add_storage_objects_partner_source.sql'
  );
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query(sql);
    console.log('[migrate:storage-objects-partner-source] OK');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
