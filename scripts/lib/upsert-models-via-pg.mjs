/**
 * On HK host: upsert provider_models rows from a JSON file via SUPABASE_DB_URL.
 * Usage: node upsert-models-via-pg.mjs /tmp/rows.json
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

function resolvePg() {
  const candidates = [
    '/opt/supermxmai/node_modules/.pnpm/pg@8.16.3/node_modules/pg/package.json',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return createRequire(c)('pg');
  }
  const found = spawnSync(
    'bash',
    ['-lc', 'ls -d /opt/supermxmai/node_modules/.pnpm/pg@*/node_modules/pg/package.json 2>/dev/null | head -1'],
    { encoding: 'utf8' },
  );
  const p = (found.stdout || '').trim();
  if (!p) throw new Error('找不到 pg 模块，请确认港机已 pnpm install');
  return createRequire(p)('pg');
}

const { Client } = resolvePg();

const env = Object.fromEntries(
  fs
    .readFileSync('/opt/supermxmai/.env', 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')];
    }),
);

const file = process.argv[2];
if (!file) {
  console.error('usage: node upsert-models-via-pg.mjs <rows.json>');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const rows = Array.isArray(data) ? data : [data];

const client = new Client({
  connectionString: env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

for (const row of rows) {
  const r = await client.query(
    `
    INSERT INTO provider_models AS m (
      provider, scope, model_key, upstream_model, protocol, modality,
      display_name, description, capabilities, default_parameters, is_enabled, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9::jsonb, $10::jsonb, COALESCE($11, true), NOW()
    )
    ON CONFLICT (provider, scope, model_key) DO UPDATE SET
      upstream_model = EXCLUDED.upstream_model,
      protocol = EXCLUDED.protocol,
      modality = EXCLUDED.modality,
      display_name = EXCLUDED.display_name,
      description = EXCLUDED.description,
      capabilities = EXCLUDED.capabilities,
      default_parameters = EXCLUDED.default_parameters,
      is_enabled = EXCLUDED.is_enabled,
      updated_at = NOW()
    RETURNING provider, scope, model_key, upstream_model, is_enabled
    `,
    [
      row.provider,
      row.scope,
      row.model_key,
      row.upstream_model ?? row.model_key,
      row.protocol ?? 'openai_chat',
      row.modality ?? 'text',
      row.display_name ?? row.model_key,
      row.description ?? null,
      JSON.stringify(row.capabilities ?? {}),
      JSON.stringify(row.default_parameters ?? {}),
      row.is_enabled !== false,
    ],
  );
  console.log('✅', r.rows[0]);
}

await client.end();
console.log(`done ${rows.length} models`);
