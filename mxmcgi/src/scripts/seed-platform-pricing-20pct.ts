/**
 * 回填 provider_pricing.platform_*（MXM-TOKEN 用户售价），供应商成本 + 20% 利润。
 *
 * 锚定 1 TOKEN ≈ $0.01，故 token 数 = ceil(usd / 0.01) × MARKUP。
 *   MARKUP = 1.20 表示用户售价 = 供应商报价 × 1.2（在成本上加 20%）
 *
 * 与原 seed-platform-pricing-mxm-token.ts 的差异：
 *   - 此脚本仅对「无有效 platform_*」的行回填；已有售价不动
 *   - 缺失 provider_* 成本的行按内置表查找；找不到则跳过（warn 提示人工补）
 *
 * 用法（仓库根）：
 *   pnpm --filter @mxmai/mxmcgi run seed:platform-pricing:20pct
 *
 * 环境变量：
 *   DRY_RUN=1   仅预览，不写库
 *   MARKUP=1.2  覆盖默认乘数（用户确认：markup=1.2 = 20% 加价）
 */

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { getSupabaseClient, RepositoryFactory } from '@mxmai/mxmdata';

const MARKUP = Number(process.env.MARKUP ?? '1.2');

function loadEnvOnce() {
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
  // 1 TOKEN ≈ $0.01 → tokens per 1k = usd × 100 × MARKUP
  const raw = usd * 100 * MARKUP;
  // 保留 6 位有效小数，避免小数被 round 丢精度
  return Math.max(0.0001, Math.round(raw * 1_000_000) / 1_000_000);
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
  const pin =
    row.platform_input_unit_price != null ? Number(row.platform_input_unit_price) : null;
  const pout =
    row.platform_output_unit_price != null ? Number(row.platform_output_unit_price) : null;
  if (mode === 'token_based') {
    if (pin != null && pout != null && (pin > 0 || pout > 0)) return true;
    return unit > 0;
  }
  return unit > 0;
}

function hasEffectiveCost(row: PricingRow): boolean {
  const unit = Number(row.unit_price || 0);
  const pin = Number(row.input_unit_price || 0);
  const pout = Number(row.output_unit_price || 0);
  return unit > 0 || pin > 0 || pout > 0;
}

/**
 * 手工覆盖：缺失成本价的模型，从外部查到的官方价补齐。
 * 注意：以 USD per 1 token 计价（与 provider_pricing 一致）。
 */
const COST_OVERRIDES: Record<string, Partial<PricingRow>> = {
  // MiniMax MiniMax-M3-highspeed（M2.7-highspeed 同价 / M3 高优同价）
  // 官方 USD per 1M token: input 0.60, output 2.40 → per token 0.00000060 / 0.00000240
  'maxplan|writing|MiniMax-M3-highspeed': {
    input_unit_price: 0.00000060,
    output_unit_price: 0.00000240,
    unit_price: null,
  },
  // openai/gpt-5-image（OpenRouter 列价 = $10/M input, $10/M output）
  // 注意：原始 DB charge_mode=token_based
  'openrouter|graph|openai/gpt-5-image': {
    input_unit_price: 0.00001000,
    output_unit_price: 0.00001000,
    unit_price: null,
  },
};

async function main() {
  loadEnvOnce();
  RepositoryFactory.init();
  const sb = getSupabaseClient();
  const dryRun = process.env.DRY_RUN === '1';

  const { data, error } = await sb.from('provider_pricing').select('*');
  if (error) throw new Error(error.message);
  const rows = (data || []) as PricingRow[];

  let updated = 0;
  let skipped = 0;
  let warned = 0;
  let costFilled = 0;
  const preview: Array<{ key: string; patch: Record<string, unknown> }> = [];

  for (const row of rows) {
    const key = `${row.provider}|${row.scope}|${row.model_key}`;
    if (row.provider === 'internal') continue;

    if (hasEffectivePlatformPrice(row)) {
      skipped++;
      continue;
    }

    const patch: Record<string, number> = {};

    const override = COST_OVERRIDES[key];
    let costRow = row;
    if (!hasEffectiveCost(row)) {
      if (!override) {
        console.warn(`⚠ 无成本价且无 override，跳过: ${key}`);
        warned++;
        continue;
      }
      // DRY_RUN 下也假定补上成本用于推导 platform_*
      costRow = { ...row, ...override } as PricingRow;
      if (!dryRun) {
        const { error: costErr } = await sb
          .from('provider_pricing')
          .update({
            input_unit_price: override.input_unit_price ?? null,
            output_unit_price: override.output_unit_price ?? null,
            unit_price: override.unit_price ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        if (costErr) throw new Error(`${key}: ${costErr.message}`);
        console.log(`💵 补成本 ${key}`, override);
        costFilled++;
      } else {
        console.log(`💵 [DRY] 补成本 ${key}`, override);
      }
    }

    if (costRow.charge_mode === 'token_based') {
      const inUsd = costRow.input_unit_price != null ? Number(costRow.input_unit_price) : null;
      const outUsd =
        costRow.output_unit_price != null ? Number(costRow.output_unit_price) : null;
      const unitUsd = Number(costRow.unit_price || 0);
      if (inUsd != null && outUsd != null && (inUsd > 0 || outUsd > 0)) {
        patch.platform_input_unit_price = usdToPlatformTokens(inUsd);
        patch.platform_output_unit_price = usdToPlatformTokens(outUsd);
      } else if (unitUsd > 0) {
        patch.platform_unit_price = usdToPlatformTokens(unitUsd);
      } else {
        console.warn(`⚠ token_based 但无成本可推导: ${key}`);
        warned++;
        continue;
      }
    } else {
      const unitUsd = Number(costRow.unit_price || 0);
      if (unitUsd <= 0) {
        console.warn(`⚠ ${costRow.charge_mode} 但无 unit_price: ${key}`);
        warned++;
        continue;
      }
      const plat = usdToPlatformTokens(unitUsd);
      patch.platform_unit_price = plat;
      patch.platform_min_charge = plat;
    }

    const minCand = Math.max(
      Number(patch.platform_input_unit_price || 0),
      Number(patch.platform_output_unit_price || 0),
      Number(patch.platform_unit_price || 0),
    );
    if (minCand > 0 && patch.platform_min_charge == null) {
      patch.platform_min_charge = Math.min(minCand, 1);
    }

    if (dryRun) {
      preview.push({ key, patch });
    } else {
      const { error: upErr } = await sb
        .from('provider_pricing')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (upErr) throw new Error(`${key}: ${upErr.message}`);
      updated++;
      console.log(`✅ ${key}`, patch);
    }
  }

  if (dryRun) {
    console.log('\n===== DRY RUN PREVIEW =====');
    console.log(`skipped=${skipped} warned=${warned} patch_planned=${preview.length}`);
    for (const p of preview) {
      console.log(`  ${p.key} → ${JSON.stringify(p.patch)}`);
    }
    if (costFilled > 0) {
      console.log(`(上方 WARN 的 ${costFilled} 行若未被 DRY 阻塞，会改成本字段)`);
    } else {
      console.log('(DRY 未写库，cost OVERRIDE 行仅打印，不会真生效)');
    }
    console.log('===============================');
    console.log('设 DRY_RUN=0 实际执行');
    process.exit(0);
  }

  console.log(
    `\n完成：更新 ${updated} 行（platform_*），补成本 ${costFilled} 行；跳过 ${skipped}；警告 ${warned}`
  );
}

main().catch((e) => {
  console.error('seed-platform-pricing-20pct failed:', e);
  process.exit(1);
});
