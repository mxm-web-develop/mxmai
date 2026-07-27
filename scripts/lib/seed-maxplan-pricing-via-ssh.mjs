/**
 * Fallback: ship built-in maxplan pricing JSON to HK and upsert via pg.
 * Invoked by sync-provider-db-production.sh when Rest seed fails.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const HOST = process.env.DEPLOY_HOST || 'mxm-hk';

const rows = [
  {
    provider: 'maxplan',
    scope: 'text',
    model_key: 'MiniMax-M3',
    charge_mode: 'token_based',
    unit_price: 0,
    input_unit_price: 0.0003,
    output_unit_price: 0.0012,
    note: 'M3 PAYG ≤512k 五折后 $0.30/$1.20 per M tokens',
  },
  {
    provider: 'maxplan',
    scope: 'audio',
    model_key: 'speech-2.8-hd',
    charge_mode: 'token_based',
    unit_price: 0,
    input_unit_price: 0.1,
    output_unit_price: 0,
    note: 'TTS HD $100/M chars',
  },
  {
    provider: 'maxplan',
    scope: 'audio',
    model_key: 'speech-2.8-turbo',
    charge_mode: 'token_based',
    unit_price: 0,
    input_unit_price: 0.06,
    output_unit_price: 0,
    note: 'TTS Turbo $60/M chars',
  },
  {
    provider: 'maxplan',
    scope: 'audio',
    model_key: 'speech-2.6-hd',
    charge_mode: 'token_based',
    unit_price: 0,
    input_unit_price: 0.1,
    output_unit_price: 0,
    note: 'Legacy TTS HD',
  },
  {
    provider: 'maxplan',
    scope: 'audio',
    model_key: 'speech-2.6-turbo',
    charge_mode: 'token_based',
    unit_price: 0,
    input_unit_price: 0.06,
    output_unit_price: 0,
    note: 'Legacy TTS Turbo',
  },
  {
    provider: 'maxplan',
    scope: 'graph',
    model_key: 'image-01',
    charge_mode: 'per_image',
    unit_price: 0.0035,
    note: '生图 $0.0035/张',
  },
  {
    provider: 'maxplan',
    scope: 'graph',
    model_key: 'image-01-live',
    charge_mode: 'per_image',
    unit_price: 0.0035,
    note: 'image-01-live 同价',
  },
  {
    provider: 'maxplan',
    scope: 'music',
    model_key: 'music-2.5',
    charge_mode: 'per_request',
    unit_price: 0.15,
    note: 'Music $0.15/轨',
  },
  {
    provider: 'maxplan',
    scope: 'music',
    model_key: 'music-2.6',
    charge_mode: 'per_request',
    unit_price: 0.15,
    note: 'Music $0.15/轨',
  },
];

const tmp = path.join(os.tmpdir(), `maxplan-pricing-${Date.now()}.json`);
fs.writeFileSync(tmp, JSON.stringify(rows, null, 2));
const remoteJson = `/tmp/mxm-maxplan-pricing-${Date.now()}.json`;
const remoteScript = '/tmp/upsert-pricing-via-pg.mjs';

const scpJson = spawnSync('scp', ['-O', tmp, `${HOST}:${remoteJson}`], { stdio: 'inherit' });
if (scpJson.status !== 0) process.exit(scpJson.status ?? 1);
const scpScript = spawnSync(
  'scp',
  ['-O', path.join(ROOT, 'scripts/lib/upsert-pricing-via-pg.mjs'), `${HOST}:${remoteScript}`],
  { stdio: 'inherit' },
);
if (scpScript.status !== 0) process.exit(scpScript.status ?? 1);
const ssh = spawnSync('ssh', [HOST, `node ${remoteScript} ${remoteJson}`], { stdio: 'inherit' });
fs.unlinkSync(tmp);
process.exit(ssh.status ?? 1);
