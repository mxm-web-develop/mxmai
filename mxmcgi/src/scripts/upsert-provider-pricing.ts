/**
 * 写入 / 更新单条或多条 provider_pricing（成本 + platform MXM-TOKEN 售价）。
 *
 * 公式：platform = usd × 100 × 2.5（至少 0.001）
 *
 * 用法：
 *   pnpm --filter @mxmai/mxmcgi run upsert:provider-pricing -- \
 *     --provider maxplan --scope audio --model speech-2.8-hd \
 *     --mode token_based --input-usd 0.1 --output-usd 0
 *
 *   pnpm --filter @mxmai/mxmcgi run upsert:provider-pricing -- \
 *     --file ./pricing-rows.json
 *
 * JSON 条目字段：
 *   provider, scope, model_key, charge_mode,
 *   unit_price?, input_unit_price?, output_unit_price?, note?
 */

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { getSupabaseClient, RepositoryFactory } from '@mxmai/mxmdata';

const MARKUP = 2.5;

type PricingSeed = {
  provider: string;
  scope: string;
  model_key: string;
  charge_mode: 'token_based' | 'per_image' | 'per_request' | 'per_second_video' | 'per_second_audio' | string;
  unit_price?: number;
  input_unit_price?: number;
  output_unit_price?: number;
  note?: string;
};

function loadEnvOnce() {
  process.env.DOTENV_CONFIG_DEBUG = 'false';
  const projectRoot = path.resolve(__dirname, '../../..');
  for (const p of [
    path.resolve(projectRoot, '.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(projectRoot, 'mxmcgi', '.env'),
  ]) {
    if (!fs.existsSync(p)) continue;
    dotenv.config({ path: p, override: false });
  }
}

function usdToPlatformTokens(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  const raw = usd * 100 * MARKUP;
  return Math.max(0.001, Math.round(raw * 1000) / 1000);
}

function parseCli(argv: string[]): PricingSeed[] {
  const args = argv.filter((a) => a !== '--');
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      '用法: --file rows.json  或  --provider --scope --model --mode [--unit-usd|--input-usd|--output-usd] [--note]',
    );
    process.exit(0);
  }
  const fileIdx = args.indexOf('--file');
  if (fileIdx >= 0 && args[fileIdx + 1]) {
    const raw = fs.readFileSync(args[fileIdx + 1], 'utf8');
    const data = JSON.parse(raw) as PricingSeed | PricingSeed[];
    return Array.isArray(data) ? data : [data];
  }

  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const provider = get('--provider');
  const scope = get('--scope');
  const model = get('--model');
  const mode = get('--mode');
  if (!provider || !scope || !model || !mode) {
    throw new Error(
      '用法: --file rows.json  或  --provider --scope --model --mode [--unit-usd|--input-usd|--output-usd] [--note]',
    );
  }
  return [
    {
      provider,
      scope,
      model_key: model,
      charge_mode: mode,
      unit_price: get('--unit-usd') != null ? Number(get('--unit-usd')) : undefined,
      input_unit_price: get('--input-usd') != null ? Number(get('--input-usd')) : undefined,
      output_unit_price: get('--output-usd') != null ? Number(get('--output-usd')) : undefined,
      note: get('--note'),
    },
  ];
}

function buildPatch(row: PricingSeed): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    provider: row.provider,
    scope: row.scope,
    model_key: row.model_key,
    charge_mode: row.charge_mode,
    currency: 'USD',
    unit_price: row.unit_price ?? 0,
    input_unit_price: row.input_unit_price ?? null,
    output_unit_price: row.output_unit_price ?? null,
    updated_at: new Date().toISOString(),
    metadata: {
      source: row.provider === 'maxplan' ? 'minimax_paygo' : 'atlascloud_list',
      markup: MARKUP,
      note: row.note ?? null,
      priced_at: new Date().toISOString().slice(0, 10),
    },
  };

  if (row.charge_mode === 'token_based') {
    const pin = usdToPlatformTokens(Number(row.input_unit_price || 0));
    const pout = usdToPlatformTokens(Number(row.output_unit_price || 0));
    patch.platform_input_unit_price = pin;
    patch.platform_output_unit_price = pout;
    patch.platform_unit_price = 0;
    const isTts = row.scope === 'audio';
    patch.platform_min_charge = isTts ? Math.max(0.1, Math.min(pin || 0.1, 1)) : 1;
  } else {
    const plat = usdToPlatformTokens(Number(row.unit_price || 0));
    patch.platform_unit_price = plat;
    patch.platform_input_unit_price = null;
    patch.platform_output_unit_price = null;
    patch.platform_min_charge = plat;
  }
  return patch;
}

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();
  const sb = getSupabaseClient();
  const rows = parseCli(process.argv.slice(2));
  const url = process.env.SUPABASE_URL ?? '';
  console.log('目标 Supabase:', url.includes('supabase.co') ? url : url || '(未设置)');

  let n = 0;
  for (const row of rows) {
    const unit = Number(row.unit_price ?? 0);
    const inp = Number(row.input_unit_price ?? 0);
    const out = Number(row.output_unit_price ?? 0);
    if (!(unit > 0 || inp > 0 || out > 0)) {
      throw new Error(
        `${row.provider}/${row.scope}/${row.model_key}: 成本价必填（unit / input / output 至少一项 > 0）`,
      );
    }
    const patch = buildPatch(row);
    const { error } = await sb.from('provider_pricing').upsert(patch, {
      onConflict: 'provider,scope,model_key',
    });
    if (error) {
      throw new Error(`${row.provider}/${row.scope}/${row.model_key}: ${error.message}`);
    }
    n += 1;
    console.log(
      `✅ ${row.provider}/${row.scope}/${row.model_key}`,
      `mode=${row.charge_mode}`,
      `platform_unit=${patch.platform_unit_price ?? '-'}`,
      `in/out=${patch.platform_input_unit_price ?? '-'}/${patch.platform_output_unit_price ?? '-'}`,
    );
  }
  console.log(`\n完成：${n} 条。生产同步: bash scripts/sync-provider-db-production.sh --pricing`);
}

main().catch((e) => {
  console.error('upsert-provider-pricing failed:', e);
  process.exit(1);
});
