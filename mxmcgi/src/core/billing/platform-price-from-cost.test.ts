import { describe, expect, it } from 'vitest';
import {
  fillDefaultPlatformPricesFromCost,
  usdToPlatformTokens,
} from './platform-price-from-cost';

describe('platform-price-from-cost', () => {
  it('usd → MXM-TOKEN = ×100×2.5', () => {
    expect(usdToPlatformTokens(0.0003)).toBe(0.075);
    expect(usdToPlatformTokens(0.0012)).toBe(0.3);
  });

  it('token_based：缺 platform_* 时按成本回填', () => {
    const out = fillDefaultPlatformPricesFromCost({
      charge_mode: 'token_based',
      unit_price: 0,
      input_unit_price: 0.0003,
      output_unit_price: 0.0012,
      platform_unit_price: null,
      platform_input_unit_price: null,
      platform_output_unit_price: null,
    });
    expect(out.platform_input_unit_price).toBe(0.075);
    expect(out.platform_output_unit_price).toBe(0.3);
  });

  it('已填 platform_* 不覆盖', () => {
    const out = fillDefaultPlatformPricesFromCost({
      charge_mode: 'token_based',
      unit_price: 0,
      input_unit_price: 0.0003,
      output_unit_price: 0.0012,
      platform_input_unit_price: 0.1,
      platform_output_unit_price: 0.5,
    });
    expect(out.platform_input_unit_price).toBe(0.1);
    expect(out.platform_output_unit_price).toBe(0.5);
  });

  it('per_image：缺售价时按 unit 成本回填', () => {
    const out = fillDefaultPlatformPricesFromCost({
      charge_mode: 'per_image',
      unit_price: 0.0035,
      platform_unit_price: null,
    });
    expect(out.platform_unit_price).toBe(0.875);
  });
});
