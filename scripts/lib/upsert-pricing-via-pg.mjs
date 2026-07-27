/**
 * On HK host: upsert provider_pricing rows from a JSON file via SUPABASE_DB_URL.
 * Usage: node upsert-pricing-via-pg.mjs /tmp/rows.json
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

const MARKUP = 2.5;
function usdToPlatformTokens(usd) {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.max(0.001, Math.round(usd * 100 * MARKUP * 1000) / 1000);
}

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
  console.error('usage: node upsert-pricing-via-pg.mjs <rows.json>');
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
  let platform_unit_price = 0;
  let platform_input_unit_price = null;
  let platform_output_unit_price = null;
  let platform_min_charge = 1;

  if (row.charge_mode === 'token_based') {
    platform_input_unit_price = usdToPlatformTokens(Number(row.input_unit_price || 0));
    platform_output_unit_price = usdToPlatformTokens(Number(row.output_unit_price || 0));
    const isTts = row.scope === 'audio';
    platform_min_charge = isTts
      ? Math.max(0.1, Math.min(platform_input_unit_price || 0.1, 1))
      : 1;
  } else {
    platform_unit_price = usdToPlatformTokens(Number(row.unit_price || 0));
    platform_min_charge = platform_unit_price;
  }

  const meta = JSON.stringify({
    source: row.provider === 'maxplan' ? 'minimax_paygo' : 'atlascloud_list',
    markup: MARKUP,
    note: row.note ?? null,
    priced_at: new Date().toISOString().slice(0, 10),
  });

  const r = await client.query(
    `
    INSERT INTO provider_pricing AS p (
      provider, scope, model_key, charge_mode, currency,
      unit_price, input_unit_price, output_unit_price,
      platform_unit_price, platform_input_unit_price, platform_output_unit_price, platform_min_charge,
      metadata, updated_at
    ) VALUES (
      $1, $2, $3, $4, 'USD',
      $5, $6, $7,
      $8, $9, $10, $11,
      $12::jsonb, NOW()
    )
    ON CONFLICT (provider, scope, model_key) DO UPDATE SET
      charge_mode = EXCLUDED.charge_mode,
      currency = EXCLUDED.currency,
      unit_price = EXCLUDED.unit_price,
      input_unit_price = EXCLUDED.input_unit_price,
      output_unit_price = EXCLUDED.output_unit_price,
      platform_unit_price = EXCLUDED.platform_unit_price,
      platform_input_unit_price = EXCLUDED.platform_input_unit_price,
      platform_output_unit_price = EXCLUDED.platform_output_unit_price,
      platform_min_charge = EXCLUDED.platform_min_charge,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING provider, scope, model_key, platform_unit_price, platform_input_unit_price, platform_output_unit_price
    `,
    [
      row.provider,
      row.scope,
      row.model_key,
      row.charge_mode,
      row.unit_price ?? 0,
      row.input_unit_price ?? null,
      row.output_unit_price ?? null,
      platform_unit_price,
      platform_input_unit_price,
      platform_output_unit_price,
      platform_min_charge,
      meta,
    ],
  );
  console.log('✅', r.rows[0]);
}

await client.end();
console.log('done');
