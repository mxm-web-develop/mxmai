/**
 * Run add_storage_objects.sql migration
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
  const migDir = path.join(__dirname, '../database/migrations');
  const files = ['add_storage_objects.sql', 'add_storage_object_asset_fields.sql'];
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl:
      dbUrl.includes('supabase.co') || dbUrl.includes('pooler.supabase.com')
        ? { rejectUnauthorized: false }
        : undefined,
  });
  await client.connect();
  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migDir, file), 'utf8');
      try {
        await client.query(sql);
        console.log(`[migrate:storage-objects] OK ${file}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        const lower = msg.toLowerCase();
        if (
          lower.includes('already exists') ||
          lower.includes('duplicate') ||
          (lower.includes('relation') && lower.includes('already'))
        ) {
          console.log(`[migrate:storage-objects] skip ${file} (already applied)`);
          continue;
        }
        throw e;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
