/**
 * 从 metadata 回填 storage_objects.partner_app_id / partner_end_user_id
 * Partner 行统一 storage_mode=temp, folder_id=NULL
 */
import pg from 'pg';
import { loadMonorepoEnv } from '../env';

async function main(): Promise<void> {
  const presetDbUrl = process.env.SUPABASE_DB_URL;
  loadMonorepoEnv();
  const dbUrl = presetDbUrl || process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error('SUPABASE_DB_URL is required');

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const { rowCount } = await client.query(`
      UPDATE storage_objects so
      SET
        partner_app_id = (so.metadata->>'partner_app_id')::uuid,
        partner_end_user_id = (so.metadata->>'end_user_id')::uuid,
        storage_mode = 'temp',
        folder_id = NULL
      WHERE so.deleted_at IS NULL
        AND so.metadata->>'partner_app_id' IS NOT NULL
        AND so.metadata->>'partner_app_id' ~ '^[0-9a-f-]{36}$'
        AND (
          so.partner_app_id IS NULL
          OR so.partner_app_id::text <> so.metadata->>'partner_app_id'
        )
    `);
    console.log(`[backfill:storage-objects-partner-source] updated ${rowCount ?? 0} rows`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
