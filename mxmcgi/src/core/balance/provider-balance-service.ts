/**
 * Provider 余额服务
 * - Admin 手动录入余额
 * - 每次任务按 provider_pricing 计算成本后扣减
 * - 无定价或余额不足时抛出错误，截断请求
 */

import { getSupabaseClient } from '@mxmai/mxmdata';

const PRICING_ERROR_MSG = '服务价格报错，请联系管理人员';

export interface UsageForCost {
  provider: string;
  model_key: string;
  scope?: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  image_count: number;
  audio_seconds: number;
  video_seconds: number;
  request_count: number;
}

export class ProviderBalanceService {
  /**
   * 根据 usage 和 provider_pricing 计算成本，并从 provider_balances 扣减
   * 无定价或余额不足时抛出 PRICING_ERROR_MSG，截断请求
   */
  static async deductFromUsage(usage: UsageForCost): Promise<number> {
    const { cost, hasPricing } = await this.calculateCostWithCheck(usage);
    if (!hasPricing) {
      console.warn('[ProviderBalanceService] 无定价记录:', {
        provider: usage.provider,
        model_key: usage.model_key,
        scope: usage.scope,
      });
      throw new Error(PRICING_ERROR_MSG);
    }
    if (cost <= 0) return 0;

    const supabase = getSupabaseClient();
    const { data: existing, error: fetchErr } = await supabase
      .from('provider_balances')
      .select('id, balance')
      .eq('provider', usage.provider)
      .maybeSingle();

    if (fetchErr) {
      console.warn('[ProviderBalanceService] 查询 provider_balances 失败:', {
        provider: usage.provider,
        error: fetchErr.message,
        code: fetchErr.code,
      });
      throw new Error(PRICING_ERROR_MSG);
    }

    const currentBalance = existing ? Number(existing.balance || 0) : 0;
    if (currentBalance < cost) {
      console.warn('[ProviderBalanceService] 余额不足:', {
        provider: usage.provider,
        currentBalance,
        cost,
      });
      throw new Error(PRICING_ERROR_MSG);
    }

    const nextBalance = currentBalance - cost;

    if (existing) {
      const { error: updateErr } = await supabase
        .from('provider_balances')
        .update({ balance: nextBalance, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (updateErr) {
        throw new Error(PRICING_ERROR_MSG);
      }
    } else {
      const { error: insertErr } = await supabase
        .from('provider_balances')
        .insert({
          provider: usage.provider,
          balance: nextBalance,
          currency: 'USD',
        });
      if (insertErr) {
        throw new Error(PRICING_ERROR_MSG);
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('[ProviderBalanceService] ✅ 已扣减 Provider 余额:', {
        provider: usage.provider,
        model_key: usage.model_key,
        cost,
        nextBalance,
      });
    }
    return cost;
  }

  /**
   * 根据 usage + provider_pricing 计算本次成本（USD），并检查定价是否存在
   */
  static async calculateCostWithCheck(
    usage: UsageForCost
  ): Promise<{ cost: number; hasPricing: boolean }> {
    const supabase = getSupabaseClient();
    let query = supabase
      .from('provider_pricing')
      .select('*')
      .eq('provider', usage.provider)
      .eq('model_key', usage.model_key);

    if (usage.scope) {
      query = query.eq('scope', usage.scope);
    }

    const { data: pricingRows } = await query;

    const pricing = Array.isArray(pricingRows) && pricingRows.length > 0 ? pricingRows[0] : null;
    if (!pricing) {
      // 若指定了 scope 未命中，尝试 scope='default'
      if (usage.scope && usage.scope !== 'default') {
        const { data: defaultRows } = await supabase
          .from('provider_pricing')
          .select('*')
          .eq('provider', usage.provider)
          .eq('model_key', usage.model_key)
          .eq('scope', 'default');
        const defaultPricing = Array.isArray(defaultRows) && defaultRows.length > 0 ? defaultRows[0] : null;
        if (defaultPricing) {
          return { cost: this.computeCost(defaultPricing, usage), hasPricing: true };
        }
      }
      return { cost: 0, hasPricing: false };
    }

    return { cost: this.computeCost(pricing, usage), hasPricing: true };
  }

  private static computeCost(pricing: any, usage: UsageForCost): number {
    const chargeMode = pricing.charge_mode;
    const unitPrice = Number(pricing.unit_price || 0);
    const inputUnitPrice = pricing.input_unit_price != null ? Number(pricing.input_unit_price) : null;
    const outputUnitPrice =
      pricing.output_unit_price != null ? Number(pricing.output_unit_price) : null;

    let cost = 0;
    switch (chargeMode) {
      case 'token_based': {
        const hasInputOutput =
          inputUnitPrice != null &&
          outputUnitPrice != null &&
          (usage.input_tokens > 0 || usage.output_tokens > 0);
        if (hasInputOutput) {
          cost =
            (usage.input_tokens / 1000) * inputUnitPrice +
            (usage.output_tokens / 1000) * outputUnitPrice;
        } else {
          const units = usage.total_tokens > 0 ? usage.total_tokens / 1000 : 0;
          cost = units * unitPrice;
        }
        break;
      }
      case 'per_image':
        cost = usage.image_count * unitPrice;
        break;
      case 'per_second_audio':
        cost = usage.audio_seconds * unitPrice;
        break;
      case 'per_second_video':
        cost = usage.video_seconds * unitPrice;
        break;
      case 'per_request':
        cost = usage.request_count * unitPrice;
        break;
      default:
        break;
    }
    return Math.max(0, cost);
  }
}
