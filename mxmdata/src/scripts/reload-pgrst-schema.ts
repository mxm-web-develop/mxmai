/**
 * 验证 storage_objects 表并刷新 Supabase PostgREST schema cache
 */
import pg from 'pg';
import { loadMonorepoEnv } from '../env';

async function main(): Promise<void> {
  const presetDbUrl = process.env.SUPABASE_DB_URL;
  loadMonorepoEnv();
  if (presetDbUrl) process.env.SUPABASE_DB_URL = presetDbUrl;
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error('SUPABASE_DB_URL is required');

  const c = new pg.Client({
    connectionString: dbUrl,
    ssl:
      dbUrl.includes('supabase.co') || dbUrl.includes('pooler.supabase.com')
        ? { rejectUnauthorized: false }
        : undefined,
  });
  await c.connect();
  try {
    const t = await c.query("SELECT to_regclass('public.storage_objects') AS reg");
    console.log('[reload-pgrst] table regclass:', t.rows[0].reg);

    const cols = await c.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='storage_objects' ORDER BY 1",
    );
    console.log('[reload-pgrst] columns:', cols.rows.map((r) => r.column_name).join(', '));

    await c.query("NOTIFY pgrst, 'reload schema'");
    console.log('[reload-pgrst] NOTIFY pgrst reload schema sent');
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
