/**
 * Run add_storage_object_asset_fields.sql migration
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
    '../database/migrations/add_storage_object_asset_fields.sql'
  );
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query(sql);
    console.log('[migrate:storage-object-asset-fields] OK');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
