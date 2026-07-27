/**
 * 为已有 provider_pricing 行补齐 platform_*（MXM-TOKEN 用户售价）。
 * 公式（锚定 1 TOKEN ≈ $0.01，约 2.5× 成本）：
 *   platform_* = ceil(usdCost * 100 * MARKUP * 1000) / 1000  （保留三位小数）
 *
 * 用法（仓库根或 mxmcgi，需 .env）：
 *   pnpm --filter @mxmai/mxmcgi run seed:platform-pricing
 */

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { getSupabaseClient, RepositoryFactory } from '@mxmai/mxmdata';

const MARKUP = 2.5;

function loadEnvOnce() {
  process.env.DOTENV_CONFIG_DEBUG = 'false';
  const projectRoot = path.resolve(__dirname, '../../..');
  const envPaths = [
    path.resolve(projectRoot, '.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(projectRoot, 'mxmcgi', '.env'),
  ];
  for (const p of envPaths) {
    if (!fs.existsSync(p)) continue;
    const r = dotenv.config({ path: p, override: false });
    if (!r.error) return;
  }
  dotenv.config({ override: false });
}

function usdToPlatformTokens(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  // 1 TOKEN ≈ $0.01 → tokens = usd / 0.01 * MARKUP = usd * 100 * MARKUP
  const raw = usd * 100 * MARKUP;
  // 过小的 token 单价至少 0.001，避免 token_based 算出 0
  return Math.max(0.001, Math.round(raw * 1000) / 1000);
}

type PricingRow = {
  id: string;
  provider: string;
  scope: string;
  model_key: string;
  charge_mode: string;
  unit_price: number | string | null;
  input_unit_price: number | string | null;
  output_unit_price: number | string | null;
  platform_unit_price: number | string | null;
  platform_input_unit_price: number | string | null;
  platform_output_unit_price: number | string | null;
  platform_min_charge: number | string | null;
};

function hasEffectivePlatformPrice(row: PricingRow): boolean {
  const mode = row.charge_mode;
  const unit = Number(row.platform_unit_price || 0);
  const pin = row.platform_input_unit_price != null ? Number(row.platform_input_unit_price) : null;
  const pout = row.platform_output_unit_price != null ? Number(row.platform_output_unit_price) : null;
  if (mode === 'token_based') {
    if (pin != null && pout != null && (pin > 0 || pout > 0)) return true;
    return unit > 0;
  }
  return unit > 0;
}

/** 手工覆盖：个别模型成本表不准或希望固定售价 */
const OVERRIDES: Record<
  string,
  Partial<{
    platform_unit_price: number;
    platform_input_unit_price: number;
    platform_output_unit_price: number;
    platform_min_charge: number;
  }>
> = {
  // atlascloud graph（usd×100×2.5）
  'atlascloud|graph|gpt-image-2': { platform_unit_price: 2.25, platform_min_charge: 2.25 },
  'atlascloud|default|gpt-image-2': { platform_unit_price: 2.25, platform_min_charge: 2.25 },
  'atlascloud|graph|nano-banana-2': { platform_unit_price: 20, platform_min_charge: 20 },
  'atlascloud|default|nano-banana-2': { platform_unit_price: 20, platform_min_charge: 20 },
  'openrouter|graph|openai/gpt-5-image': { platform_unit_price: 3, platform_min_charge: 3 },
  // atlascloud video
  'atlascloud|video|bytedance/seedance-2.0': { platform_unit_price: 22.5, platform_min_charge: 22.5 },
  'atlascloud|default|bytedance/seedance-2.0-mini': {
    platform_unit_price: 11.25,
    platform_min_charge: 11.25,
  },
  'atlascloud|video|bytedance/seedance-2.0-mini': {
    platform_unit_price: 11.25,
    platform_min_charge: 11.25,
  },
  'atlascloud|video|bytedance/seedance-2.0-fast/text-to-video': {
    platform_unit_price: 18,
    platform_min_charge: 18,
  },
  'atlascloud|video|bytedance/seedance-v1.5-pro/text-to-video-fast': {
    platform_unit_price: 4.5,
    platform_min_charge: 4.5,
  },
  // atlascloud music
  'atlascloud|music|suno/chirp-v4': { platform_unit_price: 33, platform_min_charge: 33 },
  'atlascloud|music|suno/chirp-v5': { platform_unit_price: 33, platform_min_charge: 33 },
  'atlascloud|default|suno/chirp-v4': { platform_unit_price: 33, platform_min_charge: 33 },
};

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();
  const sb = getSupabaseClient();

  const { data, error } = await sb.from('provider_pricing').select('*');
  if (error) throw new Error(error.message);
  const rows = (data || []) as PricingRow[];
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const key = `${row.provider}|${row.scope}|${row.model_key}`;
    const override = OVERRIDES[key];

    if (hasEffectivePlatformPrice(row) && !override) {
      skipped++;
      console.log(`⏭  已有售价，跳过 ${key}`);
      continue;
    }

    const patch: Record<string, number> = {};

    if (override) {
      if (override.platform_unit_price != null) patch.platform_unit_price = override.platform_unit_price;
      if (override.platform_input_unit_price != null) {
        patch.platform_input_unit_price = override.platform_input_unit_price;
      }
      if (override.platform_output_unit_price != null) {
        patch.platform_output_unit_price = override.platform_output_unit_price;
      }
      if (override.platform_min_charge != null) patch.platform_min_charge = override.platform_min_charge;
    } else if (row.charge_mode === 'token_based') {
      const inUsd = row.input_unit_price != null ? Number(row.input_unit_price) : null;
      const outUsd = row.output_unit_price != null ? Number(row.output_unit_price) : null;
      const unitUsd = Number(row.unit_price || 0);
      if (inUsd != null && outUsd != null && (inUsd > 0 || outUsd > 0)) {
        patch.platform_input_unit_price = usdToPlatformTokens(inUsd);
        patch.platform_output_unit_price = usdToPlatformTokens(outUsd);
        // gpt-oss 等 output 异常偏高时仍按公式；运营可在 Admin 改
      } else if (unitUsd > 0) {
        patch.platform_unit_price = usdToPlatformTokens(unitUsd);
      } else {
        console.warn(`⚠ 无法从成本推导售价，请手填: ${key}`);
        continue;
      }
      const minCand = Math.max(
        Number(patch.platform_input_unit_price || 0),
        Number(patch.platform_output_unit_price || 0),
        Number(patch.platform_unit_price || 0),
      );
      if (minCand > 0) patch.platform_min_charge = Math.min(minCand, 1);
    } else {
      const unitUsd = Number(row.unit_price || 0);
      if (unitUsd <= 0) {
        console.warn(`⚠ 无 unit_price，请手填: ${key}`);
        continue;
      }
      const plat = usdToPlatformTokens(unitUsd);
      patch.platform_unit_price = plat;
      patch.platform_min_charge = plat;
    }

    const { error: upErr } = await sb
      .from('provider_pricing')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (upErr) throw new Error(`${key}: ${upErr.message}`);
    updated++;
    console.log(`✅ ${key}`, patch);
  }

  // 确保 video + default 双 scope 对 atlas 主力有售价（若仅一侧有行则 upsert 另一侧）
  const dualModels = [
    {
      provider: 'atlascloud',
      model_key: 'bytedance/seedance-2.0-mini',
      charge_mode: 'per_second_video',
      unit_price: 0.045,
      platform_unit_price: 11.25,
      platform_min_charge: 11.25,
    },
    {
      provider: 'atlascloud',
      model_key: 'gpt-image-2',
      charge_mode: 'per_image',
      unit_price: 0.009,
      platform_unit_price: 2.25,
      platform_min_charge: 2.25,
      scopes: ['graph', 'default'] as const,
    },
    {
      provider: 'atlascloud',
      model_key: 'nano-banana-2',
      charge_mode: 'per_image',
      unit_price: 0.08,
      platform_unit_price: 20,
      platform_min_charge: 20,
      scopes: ['graph', 'default'] as const,
    },
  ];

  for (const m of dualModels) {
    const scopes = (m as { scopes?: readonly string[] }).scopes ?? (['video', 'default'] as const);
    for (const scope of scopes) {
      const { error: upsertErr } = await sb.from('provider_pricing').upsert(
        {
          provider: m.provider,
          scope,
          model_key: m.model_key,
          charge_mode: m.charge_mode,
          unit_price: m.unit_price,
          currency: 'USD',
          platform_unit_price: m.platform_unit_price,
          platform_min_charge: m.platform_min_charge,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'provider,scope,model_key' },
      );
      if (upsertErr) throw new Error(`dual ${m.model_key}/${scope}: ${upsertErr.message}`);
      console.log(`✅ dual-scope ${m.provider}/${scope}/${m.model_key}`);
    }
  }

  console.log(`\n完成：更新 ${updated} 行，跳过 ${skipped} 行（已有售价）`);
}

main().catch((e) => {
  console.error('seed-platform-pricing failed:', e);
  process.exit(1);
});
