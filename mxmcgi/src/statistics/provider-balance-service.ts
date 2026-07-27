/**
 * Provider 余额服务
 * - Admin 手动录入余额
 * - 每次任务按 provider_pricing 计算成本后扣减
 * - 无定价或余额不足时抛出错误，截断请求
 */

import { getSupabaseClient } from '@mxmai/mxmdata';

export const PRICING_ERROR_MSG = '服务价格报错，请联系管理人员';
export const PRICING_ERROR_NO_RECORD = '无定价记录';
export const PRICING_ERROR_INSUFFICIENT = 'Provider 余额不足';

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
   * 仅检查 provider_pricing 是否存在（用于“调用 provider 之前”早失败，避免消耗上游余额）。
   * 不会扣减余额，也不会计算真实成本（usage 为 0 仅用于复用查询逻辑）。
   */
  static async assertPricingConfigured(params: { provider: string; model_key: string; scope?: string }): Promise<void> {
    const { provider, model_key, scope } = params;
    const { hasPricing } = await this.calculateCostWithCheck({
      provider,
      model_key,
      scope,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      image_count: 0,
      audio_seconds: 0,
      video_seconds: 0,
      request_count: 1,
    });
    if (!hasPricing) {
      const detail = `provider=${provider} model_key=${model_key} scope=${scope ?? 'default'}`;
      console.warn('[ProviderBalanceService] 无定价记录(预检):', detail);
      throw new Error(`${PRICING_ERROR_NO_RECORD}: ${detail}，请在「Provider 管理 - 模型价格」中配置`);
    }
  }

  /**
   * 根据 usage 和 provider_pricing 计算成本，并从 provider_balances 扣减
   * 无定价或余额不足时抛出 PRICING_ERROR_MSG，截断请求
   */
  static async deductFromUsage(usage: UsageForCost): Promise<number> {
    const { cost, hasPricing } = await this.calculateCostWithCheck(usage);
    if (!hasPricing) {
      const detail = `provider=${usage.provider} model_key=${usage.model_key} scope=${usage.scope ?? 'default'}`;
      console.warn('[ProviderBalanceService] 无定价记录:', detail);
      throw new Error(`${PRICING_ERROR_NO_RECORD}: ${detail}，请在「Provider 管理 - 模型价格」中配置`);
    }
    if (cost <= 0) return 0;

    const supabase = getSupabaseClient();
    const { data: existing, error: fetchErr } = await supabase
      .from('provider_balances')
      .select('id, balance, currency')
      .eq('provider', usage.provider)
      .maybeSingle();

    if (fetchErr) {
      console.warn('[ProviderBalanceService] 查询 provider_balances 失败:', {
        provider: usage.provider,
        error: fetchErr.message,
        code: fetchErr.code,
      });
      throw new Error(`${PRICING_ERROR_MSG}（查询 provider_balances 失败）`);
    }

    const currentBalance = existing ? Number(existing.balance || 0) : 0;
    const balanceCurrency =
      (existing?.currency && String(existing.currency).trim()) || 'USD';
    if (currentBalance < cost) {
      console.warn('[ProviderBalanceService] 余额不足:', {
        provider: usage.provider,
        currentBalance,
        cost,
        currency: balanceCurrency,
      });
      throw new Error(
        `${PRICING_ERROR_INSUFFICIENT}: ${usage.provider} 当前 ${currentBalance.toFixed(4)} ${balanceCurrency}，本次需 ${cost.toFixed(4)} ${balanceCurrency}，请在「Provider 管理」中充值`
      );
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
      const pricingCurrency = await this.resolveBalanceCurrencyForProvider(usage.provider);
      const { error: insertErr } = await supabase
        .from('provider_balances')
        .insert({
          provider: usage.provider,
          balance: nextBalance,
          currency: pricingCurrency,
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
      // 若 normalized scope（text/graph/audio/video）未命中，尝试业务 scope（writing/outline）作为 fallback
      // 原因：provider_pricing.scope 通常与 provider_models.scope 一致，但 deerapi/provider.ts
      // 在定价检查时会将 writing→text、outline→text 等 normalized 为 text/graph 等
      if (usage.scope && ['text', 'graph', 'audio', 'video'].includes(usage.scope)) {
        const businessScopeMap: Record<string, string[]> = {
          text: ['writing', 'outline', 'default'],
          graph: ['graph', 'default'],
          audio: ['audio', 'music', 'default'],
          video: ['video', 'default'],
        };
        const businessScopes = businessScopeMap[usage.scope] || [];
        for (const bs of businessScopes) {
          if (bs === usage.scope) continue; // 已尝试过
          const { data: businessRows } = await supabase
            .from('provider_pricing')
            .select('*')
            .eq('provider', usage.provider)
            .eq('model_key', usage.model_key)
            .eq('scope', bs);
          const businessPricing = Array.isArray(businessRows) && businessRows.length > 0 ? businessRows[0] : null;
          if (businessPricing) {
            return { cost: this.computeCost(businessPricing, usage), hasPricing: true };
          }
        }
      }
      return { cost: 0, hasPricing: false };
    }

    return { cost: this.computeCost(pricing, usage), hasPricing: true };
  }

  /** 新建 provider_balances 行时：优先该 provider 在 provider_pricing 中最常见的币种 */
  private static async resolveBalanceCurrencyForProvider(provider: string): Promise<string> {
    const supabase = getSupabaseClient();
    const { data: rows } = await supabase
      .from('provider_pricing')
      .select('currency')
      .eq('provider', provider);
    const counts = new Map<string, number>();
    for (const r of rows || []) {
      const c = String((r as { currency?: string }).currency || 'USD').toUpperCase();
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    if (counts.size === 0) return 'USD';
    let best = 'USD';
    let max = 0;
    for (const [c, n] of counts) {
      if (n > max) {
        max = n;
        best = c;
      }
    }
    return best;
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
