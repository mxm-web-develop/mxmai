/**
 * 按 MiniMax 官方 PAYG 价为 maxplan（Token Plan）模型写入 provider_pricing。
 * 参考：https://platform.minimax.io/docs/guides/pricing-paygo
 *
 * 平台售价约定（与 seed-platform-pricing-mxm-token 一致）：
 *   1 MXM-TOKEN ≈ $0.01，售价 = 成本 USD × 100 × 2.5
 *
 * 计费方式：
 * - MiniMax-M3：token_based（USD / 千 token）
 * - TTS：token_based，把 usage_characters 记入 prompt_tokens（USD / 千字）
 * - 生图：per_image
 * - 音乐：per_request（每轨，最长约 5 分钟）
 *
 * 用法：
 *   bash scripts/seed-maxplan-pricing-production.sh
 *   # 或本地指向生产 Supabase：
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     pnpm --filter @mxmai/mxmcgi run seed:provider-maxplan-pricing
 */

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { getSupabaseClient, RepositoryFactory } from '@mxmai/mxmdata';

const MARKUP = 2.5;

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

/** 成本 USD → 平台 MXM-TOKEN 单价 */
function usdToPlatformTokens(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  const raw = usd * 100 * MARKUP;
  return Math.max(0.001, Math.round(raw * 1000) / 1000);
}

type PricingSeed = {
  scope: string;
  model_key: string;
  charge_mode: 'token_based' | 'per_image' | 'per_request';
  unit_price?: number;
  input_unit_price?: number;
  output_unit_price?: number;
  note: string;
};

/**
 * MiniMax 官方价（PAYG / Credits 同源）：
 * - M3 ≤512k：永久五折后 $0.30 / $1.20 per M tokens → $0.0003 / $0.0012 per 1K
 * - speech-2.8-hd：$100 / M chars → $0.1 / 1K chars
 * - speech-2.8-turbo：$60 / M chars → $0.06 / 1K chars
 * - image-01：$0.0035 / image（image-01-live 官方未单列，同价）
 * - music-2.5 / 2.6：$0.15 / track（≤5 min）
 */
const MAXPLAN_PRICING: PricingSeed[] = [
  {
    scope: 'text',
    model_key: 'MiniMax-M3',
    charge_mode: 'token_based',
    unit_price: 0,
    input_unit_price: 0.0003,
    output_unit_price: 0.0012,
    note: 'M3 PAYG ≤512k 五折后 $0.30/$1.20 per M tokens',
  },
  {
    scope: 'writing',
    model_key: 'MiniMax-M3',
    charge_mode: 'token_based',
    unit_price: 0,
    input_unit_price: 0.0003,
    output_unit_price: 0.0012,
    note: '写作 scope 同 text/MiniMax-M3 官方价（billing writing↔text 亦可回落）',
  },
  {
    scope: 'audio',
    model_key: 'speech-2.8-hd',
    charge_mode: 'token_based',
    unit_price: 0,
    input_unit_price: 0.1,
    output_unit_price: 0,
    note: 'TTS HD $100/M chars → $0.1/千字；字数写入 prompt_tokens',
  },
  {
    scope: 'audio',
    model_key: 'speech-2.8-turbo',
    charge_mode: 'token_based',
    unit_price: 0,
    input_unit_price: 0.06,
    output_unit_price: 0,
    note: 'TTS Turbo $60/M chars → $0.06/千字',
  },
  {
    scope: 'audio',
    model_key: 'speech-2.6-hd',
    charge_mode: 'token_based',
    unit_price: 0,
    input_unit_price: 0.1,
    output_unit_price: 0,
    note: 'Legacy TTS HD 同 2.8-hd',
  },
  {
    scope: 'audio',
    model_key: 'speech-2.6-turbo',
    charge_mode: 'token_based',
    unit_price: 0,
    input_unit_price: 0.06,
    output_unit_price: 0,
    note: 'Legacy TTS Turbo 同 2.8-turbo',
  },
  {
    scope: 'graph',
    model_key: 'image-01',
    charge_mode: 'per_image',
    unit_price: 0.0035,
    note: '生图 $0.0035/张',
  },
  {
    scope: 'graph',
    model_key: 'image-01-live',
    charge_mode: 'per_image',
    unit_price: 0.0035,
    note: 'image-01-live 按同 image-01 挂价',
  },
  {
    scope: 'music',
    model_key: 'music-2.5',
    charge_mode: 'per_request',
    unit_price: 0.15,
    note: 'Music 2.5 $0.15/轨（≤5min）',
  },
  {
    scope: 'music',
    model_key: 'music-2.6',
    charge_mode: 'per_request',
    unit_price: 0.15,
    note: 'Music 2.6 $0.15/轨（≤5min）',
  },
];

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();
  const sb = getSupabaseClient();
  const url = process.env.SUPABASE_URL ?? '';
  console.log('目标 Supabase:', url.includes('supabase.co') ? url : url || '(未设置)');

  let n = 0;
  for (const row of MAXPLAN_PRICING) {
    const patch: Record<string, unknown> = {
      provider: 'maxplan',
      scope: row.scope,
      model_key: row.model_key,
      charge_mode: row.charge_mode,
      currency: 'USD',
      unit_price: row.unit_price ?? 0,
      input_unit_price: row.input_unit_price ?? null,
      output_unit_price: row.output_unit_price ?? null,
      updated_at: new Date().toISOString(),
      metadata: {
        source: 'minimax_paygo',
        markup: MARKUP,
        note: row.note,
        priced_at: new Date().toISOString().slice(0, 10),
      },
    };

    if (row.charge_mode === 'token_based') {
      const pin = usdToPlatformTokens(Number(row.input_unit_price || 0));
      const pout = usdToPlatformTokens(Number(row.output_unit_price || 0));
      patch.platform_input_unit_price = pin;
      patch.platform_output_unit_price = pout;
      patch.platform_unit_price = 0;
      // LLM 设最低 1 TOKEN；TTS 按字数计，最低 0.1 避免短句过狠
      const isTts = row.scope === 'audio';
      patch.platform_min_charge = isTts ? Math.max(0.1, Math.min(pin || 0.1, 1)) : 1;
    } else {
      const plat = usdToPlatformTokens(Number(row.unit_price || 0));
      patch.platform_unit_price = plat;
      patch.platform_input_unit_price = null;
      patch.platform_output_unit_price = null;
      patch.platform_min_charge = plat;
    }

    const { error } = await sb.from('provider_pricing').upsert(patch, {
      onConflict: 'provider,scope,model_key',
    });
    if (error) {
      throw new Error(`maxplan/${row.scope}/${row.model_key}: ${error.message}`);
    }
    n += 1;
    console.log(
      `✅ maxplan/${row.scope}/${row.model_key}`,
      `cost=${row.charge_mode}`,
      `platform_unit=${patch.platform_unit_price ?? '-'}`,
      `platform_in/out=${patch.platform_input_unit_price ?? '-'}/${patch.platform_output_unit_price ?? '-'}`,
      `| ${row.note}`,
    );
  }

  console.log(`\n完成：写入 ${n} 条 maxplan 定价。刷新 Admin → Provider 管理查看。`);
}

main().catch((e) => {
  console.error('seed-provider-pricing-maxplan failed:', e);
  process.exit(1);
});
