/**
 * 平台 MXM-TOKEN 默认售价：成本 USD × 100 × 2.5（锚定 1 TOKEN ≈ $0.01，2.5× 加价）。
 * 上架时成本价必填；若未显式填 platform_*，按成本自动回填。
 */

export const MXM_TOKEN_MARKUP = 2.5;

/** 成本 USD → 平台 MXM-TOKEN 单价（至少 0.001） */
export function usdToPlatformTokens(usd: number, markup = MXM_TOKEN_MARKUP): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  const raw = usd * 100 * markup;
  return Math.max(0.001, Math.round(raw * 1000) / 1000);
}

function positiveOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type CostAndPlatformPrices = {
  charge_mode: string;
  unit_price: number;
  input_unit_price?: number | null;
  output_unit_price?: number | null;
  platform_unit_price?: number | null;
  platform_input_unit_price?: number | null;
  platform_output_unit_price?: number | null;
};

/**
 * 若 platform_* 未配置（null/≤0），用对应成本自动算出默认售价。
 * 已显式配置的 platform_* 不覆盖。
 */
export function fillDefaultPlatformPricesFromCost<T extends CostAndPlatformPrices>(
  row: T
): T & {
  platform_unit_price: number | null;
  platform_input_unit_price: number | null;
  platform_output_unit_price: number | null;
} {
  const chargeMode = String(row.charge_mode || '').trim();
  const costUnit = Number(row.unit_price || 0);
  const costIn = Number(row.input_unit_price || 0);
  const costOut = Number(row.output_unit_price || 0);

  let platformUnit = positiveOrNull(row.platform_unit_price);
  let platformIn = positiveOrNull(row.platform_input_unit_price);
  let platformOut = positiveOrNull(row.platform_output_unit_price);

  if (chargeMode === 'token_based') {
    if (platformIn == null && costIn > 0) platformIn = usdToPlatformTokens(costIn);
    if (platformOut == null && costOut > 0) platformOut = usdToPlatformTokens(costOut);
    // 仅有通用成本、无 in/out 时，用 unit 填 platform_unit
    if (platformUnit == null && costUnit > 0 && !(costIn > 0 || costOut > 0)) {
      platformUnit = usdToPlatformTokens(costUnit);
    }
    // token 有 in/out 时 platform_unit 可保持 0/null 作兜底
    if (platformUnit == null && costUnit > 0 && platformIn == null && platformOut == null) {
      platformUnit = usdToPlatformTokens(costUnit);
    }
  } else if (platformUnit == null && costUnit > 0) {
    platformUnit = usdToPlatformTokens(costUnit);
  }

  return {
    ...row,
    platform_unit_price: platformUnit,
    platform_input_unit_price: platformIn,
    platform_output_unit_price: platformOut,
  };
}
