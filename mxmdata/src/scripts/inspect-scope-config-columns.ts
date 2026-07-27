import pg from 'pg';
import { loadMonorepoEnv } from '../env';

async function main(): Promise<void> {
  loadMonorepoEnv();
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error('SUPABASE_DB_URL is required');

  const tables = [
    'graph_scope_config',
    'writing_scope_config',
    'video_scope_config',
    'audio_scope_config',
    'music_scope_config',
    'outline_scope_config',
    'text_scope_config',
  ];

  const c = new pg.Client({
    connectionString: dbUrl,
    ssl:
      dbUrl.includes('supabase.co') || dbUrl.includes('pooler.supabase.com')
        ? { rejectUnauthorized: false }
        : undefined,
  });
  await c.connect();
  try {
    for (const t of tables) {
      const r = await c.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY 1`,
        [t],
      );
      console.log(`${t}: ${r.rows.map((x) => x.column_name).join(', ') || 'MISSING'}`);
    }
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
