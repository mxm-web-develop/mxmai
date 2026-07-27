/**
 * 平台用户计费服务
 *
 * 从 provider_pricing 表读取 platform_* 字段，计算并扣减用户钱包中的 MXM-TOKEN。
 * 与提供商成本（USD）共用同一张定价表，方便 Admin 在一处管理成本与售价。
 *
 * 规则（真实上线）：
 * - 无有效 platform_* 售价 → 禁止调用：BILLING_MISCONFIGURED
 * - Admin 仅免「余额是否够」，不免「售价必须配置」
 * - provider=internal（编排父任务）不扣 TOKEN、不查售价；由子调用各自计费
 */

import { getSupabaseClient, RepositoryFactory } from '@mxmai/mxmdata';

export const BILLING_MISCONFIGURED_CODE = 'BILLING_MISCONFIGURED';
export const BILLING_MISCONFIGURED_MESSAGE = '该业务由于计费模块错误，暂不可用';

export class BillingMisconfiguredError extends Error {
  readonly code = BILLING_MISCONFIGURED_CODE;
  constructor(message = BILLING_MISCONFIGURED_MESSAGE) {
    super(message);
    this.name = 'BillingMisconfiguredError';
  }
}

export interface ConsumeForTaskParams {
  taskId: string;
  userId: string;
  /** 实际使用的物理 provider（deer / openai / replicate …） */
  provider: string;
  /** 物理模型 key（gemini-2-5-flash / nano-banana …） */
  modelKey: string;
  /** 业务域（writing / graph / audio / video / text） */
  scope: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  imageCount?: number;
  audioSeconds?: number;
  videoSeconds?: number;
  requestCount?: number;
  providerCostUsd?: number;
  publishedSlug?: string;
  publishedApiId?: string;
  openApiCallerId?: string;
}

export interface CheckBalanceParams {
  userId: string;
  provider: string;
  modelKey: string;
  scope: string;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  estimatedTotalTokens?: number;
  estimatedImageCount?: number;
  estimatedAudioSeconds?: number;
  estimatedVideoSeconds?: number;
  estimatedRequestCount?: number;
  /**
   * 管线粗估覆盖：当 provider=internal 时用此值做余额预检，不查 orchestrator 售价。
   */
  estimatedTokensOverride?: number;
  /**
   * 人工审核前窗口已知费用为 0 时仍放行（后续费用在审核后再估）。
   * 不可用于掩饰「未配置售价」的普通业务。
   */
  allowZeroKnownCost?: boolean;
}

export interface CheckBalanceResult {
  allowed: boolean;
  estimatedTokens: number;
  currentBalance: number;
  /** 平台售价是否有效配置 */
  hasPricing: boolean;
  /** 失败原因码（可选） */
  code?: typeof BILLING_MISCONFIGURED_CODE | 'INSUFFICIENT_BALANCE';
  message?: string;
}

interface PricingRow {
  id: string;
  charge_mode: string;
  platform_unit_price: string | null;
  platform_input_unit_price: string | null;
  platform_output_unit_price: string | null;
  platform_min_charge: string | null;
}

function isInternalProvider(provider: string): boolean {
  return provider === 'internal';
}

export class BillingService {
  /** 是否具备可计费的平台售价 */
  static hasEffectivePlatformPricing(pricing: PricingRow | null | undefined): boolean {
    if (!pricing) return false;
    const unitPrice = Number(pricing.platform_unit_price || 0);
    const inputPrice =
      pricing.platform_input_unit_price != null ? Number(pricing.platform_input_unit_price) : null;
    const outputPrice =
      pricing.platform_output_unit_price != null ? Number(pricing.platform_output_unit_price) : null;

    if (pricing.charge_mode === 'token_based') {
      if (inputPrice != null && outputPrice != null && (inputPrice > 0 || outputPrice > 0)) {
        return true;
      }
      return unitPrice > 0;
    }
    return unitPrice > 0;
  }

  static throwIfMisconfigured(pricing: PricingRow | null | undefined): asserts pricing is PricingRow {
    if (!this.hasEffectivePlatformPricing(pricing)) {
      throw new BillingMisconfiguredError();
    }
  }

  /**
   * 任务成功后扣减用户 MXM-TOKEN。
   * 无有效 platform_* → 抛 BILLING_MISCONFIGURED（不静默跳过）。
   * provider=internal → 跳过（编排本身不计费）。
   */
  static async consumeForTask(params: ConsumeForTaskParams): Promise<void> {
    const {
      taskId,
      userId,
      provider,
      modelKey,
      scope,
      inputTokens = 0,
      outputTokens = 0,
      totalTokens = 0,
      imageCount = 0,
      audioSeconds = 0,
      videoSeconds = 0,
      requestCount = 1,
      providerCostUsd,
      publishedSlug,
      publishedApiId,
      openApiCallerId,
    } = params;

    if (isInternalProvider(provider)) {
      return;
    }

    const pricing = await this.getPricing(provider, modelKey, scope);
    this.throwIfMisconfigured(pricing);

    const tokens = this.computePlatformTokens(pricing, {
      inputTokens,
      outputTokens,
      totalTokens,
      imageCount,
      audioSeconds,
      videoSeconds,
      requestCount,
    });

    if (tokens <= 0) {
      throw new BillingMisconfiguredError();
    }

    const isAdmin = await this.isAdminUser(userId);
    const assetCode = process.env.PLATFORM_TOKEN_ASSET_CODE || 'MXM-TOKEN';
    const walletRepo = RepositoryFactory.createWalletRepository();

    let asset = await walletRepo.findAssetByCode(assetCode);
    if (!asset) {
      asset = await walletRepo.createAsset({
        code: assetCode,
        name: 'Platform Token',
        symbol: assetCode,
        type: 'other' as any,
        decimals: 8,
        enabled: true,
      });
    }

    let wallet = await walletRepo.findWalletByUserAndAsset(userId, assetCode);
    if (!wallet) {
      wallet = await walletRepo.createWallet({
        user_id: userId,
        asset_code: assetCode,
        available_balance: '0',
        frozen_balance: '0',
      });
    }

    const currentBalance = Number(wallet.available_balance || '0');
    const nextBalance = currentBalance - tokens;

    if (!isAdmin && nextBalance < -1e-8) {
      const err: any = new Error(`余额不足：当前 ${currentBalance} ${assetCode}，需要 ${tokens}`);
      err.code = 'INSUFFICIENT_BALANCE';
      throw err;
    }

    const dec = asset.decimals ?? 8;
    await walletRepo.updateWalletBalance(wallet.id, {
      available_balance: nextBalance.toFixed(dec),
    });

    await walletRepo.createTransaction({
      wallet_id: wallet.id,
      user_id: userId,
      asset_code: assetCode,
      type: 'withdraw',
      amount: tokens.toFixed(dec),
      balance_before: currentBalance.toFixed(dec),
      balance_after: nextBalance.toFixed(dec),
      reference_id: taskId,
      metadata: {
        provider,
        modelKey,
        scope,
        charge_mode: pricing.charge_mode,
        pricing_id: pricing.id,
        inputTokens,
        outputTokens,
        totalTokens,
        imageCount,
        audioSeconds,
        videoSeconds,
        requestCount,
        tokensCharged: tokens,
        providerCostUsd: providerCostUsd ?? null,
        isAdmin,
        ...(publishedSlug ? { published_slug: publishedSlug, source: 'open_api' } : {}),
        ...(publishedApiId ? { published_api_id: publishedApiId } : {}),
        ...(openApiCallerId ? { open_api_caller_id: openApiCallerId } : {}),
      },
    });

    if (publishedSlug) {
      try {
        const { completeOpenApiUsage } = await import('../open-api/usage');
        await completeOpenApiUsage(taskId, tokens);
      } catch {
        // ignore
      }
    }

    try {
      const { UsageAnalyticsService } = await import('./usage-analytics-service');
      await UsageAnalyticsService.backfillMxmTokenCharged(taskId, scope, tokens);
    } catch {
      // ignore
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('[BillingService] ✅ 已扣减用户 Token', {
        userId,
        taskId,
        provider,
        modelKey,
        scope,
        tokens,
        isAdmin,
        ...(providerCostUsd != null ? { providerCostUsd } : {}),
      });
    }
  }

  /**
   * 任务创建前预检。
   * - 无有效售价 → allowed=false + BILLING_MISCONFIGURED（Admin 同样）
   * - internal：用 estimatedTokensOverride 只验余额
   * - Admin：余额不足仍 allowed（免余额），售价缺失不允许
   */
  static async checkBalance(params: CheckBalanceParams): Promise<CheckBalanceResult> {
    const {
      userId,
      provider,
      modelKey,
      scope,
      estimatedInputTokens = 0,
      estimatedOutputTokens = 0,
      estimatedTotalTokens = 0,
      estimatedImageCount = 0,
      estimatedAudioSeconds = 0,
      estimatedVideoSeconds = 0,
      estimatedRequestCount = 1,
      estimatedTokensOverride,
      allowZeroKnownCost = false,
    } = params;

    const isAdmin = await this.isAdminUser(userId);
    const assetCode = process.env.PLATFORM_TOKEN_ASSET_CODE || 'MXM-TOKEN';
    const walletRepo = RepositoryFactory.createWalletRepository();
    const wallet = await walletRepo.findWalletByUserAndAsset(userId, assetCode);
    const currentBalance = Number(wallet?.available_balance || '0');

    // 调用方已按管线多跳粗算总额时，优先用 override（含 TTS+LLM 等加总）
    if (estimatedTokensOverride != null && Number.isFinite(Number(estimatedTokensOverride))) {
      const estimatedTokens = Math.max(0, Number(estimatedTokensOverride) || 0);
      if (estimatedTokens === 0) {
        if (allowZeroKnownCost) {
          return {
            allowed: true,
            estimatedTokens: 0,
            currentBalance,
            hasPricing: true,
          };
        }
        // 非延后估价的 0 覆盖：仍走后面 internal / 常规校验
      } else {
        if (!isInternalProvider(provider)) {
          const pricing = await this.getPricing(provider, modelKey, scope);
          if (!this.hasEffectivePlatformPricing(pricing)) {
            return {
              allowed: false,
              estimatedTokens: 0,
              currentBalance,
              hasPricing: false,
              code: BILLING_MISCONFIGURED_CODE,
              message: BILLING_MISCONFIGURED_MESSAGE,
            };
          }
        }
        const allowed = isAdmin || currentBalance >= estimatedTokens;
        return {
          allowed,
          estimatedTokens,
          currentBalance,
          hasPricing: true,
          ...(!allowed
            ? {
                code: 'INSUFFICIENT_BALANCE' as const,
                message: `余额不足，本次预计消耗约 ${estimatedTokens} MXM-TOKEN，当前余额 ${currentBalance}`,
              }
            : {}),
        };
      }
    }

    if (isInternalProvider(provider)) {
      // 编排入口未给出粗估时视为计费未配齐
      return {
        allowed: false,
        estimatedTokens: 0,
        currentBalance,
        hasPricing: false,
        code: BILLING_MISCONFIGURED_CODE,
        message: BILLING_MISCONFIGURED_MESSAGE,
      };
    }

    const pricing = await this.getPricing(provider, modelKey, scope);
    if (!this.hasEffectivePlatformPricing(pricing)) {
      return {
        allowed: false,
        estimatedTokens: 0,
        currentBalance,
        hasPricing: false,
        code: BILLING_MISCONFIGURED_CODE,
        message: BILLING_MISCONFIGURED_MESSAGE,
      };
    }

    const estimatedTokens = this.computePlatformTokens(pricing!, {
      inputTokens: estimatedInputTokens,
      outputTokens: estimatedOutputTokens,
      totalTokens: estimatedTotalTokens,
      imageCount: estimatedImageCount,
      audioSeconds: estimatedAudioSeconds,
      videoSeconds: estimatedVideoSeconds,
      requestCount: estimatedRequestCount,
    });

    if (estimatedTokens <= 0) {
      return {
        allowed: false,
        estimatedTokens: 0,
        currentBalance,
        hasPricing: false,
        code: BILLING_MISCONFIGURED_CODE,
        message: BILLING_MISCONFIGURED_MESSAGE,
      };
    }

    const allowed = isAdmin || currentBalance >= estimatedTokens;
    return {
      allowed,
      estimatedTokens,
      currentBalance,
      hasPricing: true,
      ...(!allowed
        ? {
            code: 'INSUFFICIENT_BALANCE' as const,
            message: `余额不足，本次预计消耗约 ${estimatedTokens} MXM-TOKEN，当前余额 ${currentBalance}`,
          }
        : {}),
    };
  }

  /**
   * 仅计算预计 TOKEN（须已有有效售价），供 estimate API 使用。
   */
  static async estimateTokens(params: {
    provider: string;
    modelKey: string;
    scope: string;
    estimatedInputTokens?: number;
    estimatedOutputTokens?: number;
    estimatedTotalTokens?: number;
    estimatedImageCount?: number;
    estimatedAudioSeconds?: number;
    estimatedVideoSeconds?: number;
    estimatedRequestCount?: number;
  }): Promise<{ tokens: number; pricingId: string; chargeMode: string }> {
    if (isInternalProvider(params.provider)) {
      throw new BillingMisconfiguredError();
    }
    const pricing = await this.getPricing(params.provider, params.modelKey, params.scope);
    this.throwIfMisconfigured(pricing);
    const tokens = this.computePlatformTokens(pricing, {
      inputTokens: params.estimatedInputTokens ?? 0,
      outputTokens: params.estimatedOutputTokens ?? 0,
      totalTokens: params.estimatedTotalTokens ?? 0,
      imageCount: params.estimatedImageCount ?? 0,
      audioSeconds: params.estimatedAudioSeconds ?? 0,
      videoSeconds: params.estimatedVideoSeconds ?? 0,
      requestCount: params.estimatedRequestCount ?? 1,
    });
    if (tokens <= 0) throw new BillingMisconfiguredError();
    return { tokens, pricingId: pricing.id, chargeMode: pricing.charge_mode };
  }

  static async getPricing(
    provider: string,
    modelKey: string,
    scope: string,
  ): Promise<PricingRow | null> {
    const supabase = getSupabaseClient();
    const cols =
      'id, charge_mode, platform_unit_price, platform_input_unit_price, platform_output_unit_price, platform_min_charge';

    const { data } = await supabase
      .from('provider_pricing')
      .select(cols)
      .eq('provider', provider)
      .eq('model_key', modelKey)
      .eq('scope', scope)
      .maybeSingle();

    if (data) return data as PricingRow;

    if (scope !== 'default') {
      const { data: fallback } = await supabase
        .from('provider_pricing')
        .select(cols)
        .eq('provider', provider)
        .eq('model_key', modelKey)
        .eq('scope', 'default')
        .maybeSingle();
      if (fallback) return fallback as PricingRow;
    }

    // writing ↔ text 回落（与 ProviderBalanceService 对齐）
    if (scope === 'writing' || scope === 'text') {
      const alt = scope === 'writing' ? 'text' : 'writing';
      const { data: altRow } = await supabase
        .from('provider_pricing')
        .select(cols)
        .eq('provider', provider)
        .eq('model_key', modelKey)
        .eq('scope', alt)
        .maybeSingle();
      if (altRow) return altRow as PricingRow;
    }

    return null;
  }

  /** 公开：供估价计算复用 */
  static computePlatformTokensPublic(
    pricing: PricingRow,
    usage: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      imageCount: number;
      audioSeconds: number;
      videoSeconds: number;
      requestCount: number;
    },
  ): number {
    return this.computePlatformTokens(pricing, usage);
  }

  private static computePlatformTokens(
    pricing: PricingRow,
    usage: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      imageCount: number;
      audioSeconds: number;
      videoSeconds: number;
      requestCount: number;
    },
  ): number {
    const minCharge = Number(pricing.platform_min_charge || 0);
    const unitPrice = Number(pricing.platform_unit_price || 0);
    const inputPrice =
      pricing.platform_input_unit_price != null ? Number(pricing.platform_input_unit_price) : null;
    const outputPrice =
      pricing.platform_output_unit_price != null ? Number(pricing.platform_output_unit_price) : null;

    if (unitPrice === 0 && inputPrice === null && outputPrice === null) {
      return 0;
    }

    let tokens = 0;
    switch (pricing.charge_mode) {
      case 'token_based': {
        const hasIO =
          inputPrice != null &&
          outputPrice != null &&
          (usage.inputTokens > 0 || usage.outputTokens > 0);
        if (hasIO) {
          tokens =
            (usage.inputTokens / 1000) * inputPrice! + (usage.outputTokens / 1000) * outputPrice!;
        } else {
          const t =
            usage.totalTokens > 0 ? usage.totalTokens : usage.inputTokens + usage.outputTokens;
          tokens = (t / 1000) * unitPrice;
        }
        break;
      }
      case 'per_image':
        tokens = usage.imageCount * unitPrice;
        break;
      case 'per_second_audio':
        tokens = usage.audioSeconds * unitPrice;
        break;
      case 'per_second_video':
        tokens = usage.videoSeconds * unitPrice;
        break;
      case 'per_request':
        tokens = usage.requestCount * unitPrice;
        break;
      default:
        tokens = unitPrice;
        break;
    }

    tokens = Math.max(0, tokens);
    if (minCharge > 0 && tokens < minCharge) tokens = minCharge;
    return tokens;
  }

  private static async isAdminUser(userId: string): Promise<boolean> {
    try {
      const userRepo = RepositoryFactory.createUserRepository();
      const user = await userRepo.findById(userId);
      return user?.role === 'admin';
    } catch {
      return false;
    }
  }
}
