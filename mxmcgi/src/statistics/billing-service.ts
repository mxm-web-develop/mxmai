/**
 * 平台用户计费服务
 *
 * 从 provider_pricing 表读取 platform_* 字段，计算并扣减用户钱包中的 MXM-TOKEN。
 * 与提供商成本（USD）共用同一张定价表，方便 Admin 在一处管理成本与售价。
 *
 * 调用时机（任务成功后）：
 *   - writing-task.ts  → consumeForTask()
 *   - graph-task.ts    → consumeForTask()
 *   - task-executor.ts processResult() → consumeForTask()（audio / video / 其它）
 */

import { getSupabaseClient, RepositoryFactory } from '@mxmai/mxmdata';

// ──────────────────────────────────────────────────────
// 类型定义
// ──────────────────────────────────────────────────────

export interface ConsumeForTaskParams {
  taskId: string;
  userId: string;
  /** 实际使用的物理 provider（deer / openai / replicate …） */
  provider: string;
  /** 物理模型 key（gemini-2-5-flash / nano-banana …） */
  modelKey: string;
  /** 业务域（writing / graph / audio / video / text） */
  scope: string;
  // 实际用量 —— 与 charge_mode 对应
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  imageCount?: number;
  audioSeconds?: number;
  videoSeconds?: number;
  requestCount?: number;
  /**
   * Provider 实际成本（USD），由 ProviderBalanceService.deductFromUsage() 返回。
   * 写入 wallet_transactions.metadata，供 margin 分析使用。
   */
  providerCostUsd?: number;
}

export interface CheckBalanceParams {
  userId: string;
  provider: string;
  modelKey: string;
  scope: string;
  /** 预估用量（与实际 charge_mode 对应，任取一个即可） */
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  estimatedTotalTokens?: number;
  estimatedImageCount?: number;
  estimatedAudioSeconds?: number;
  estimatedVideoSeconds?: number;
  estimatedRequestCount?: number;
}

export interface CheckBalanceResult {
  allowed: boolean;
  estimatedTokens: number;
  currentBalance: number;
  /** 定价是否存在（无定价时 allowed = true，不拦截） */
  hasPricing: boolean;
}

// provider_pricing 行（只关心 platform_* 字段和 charge_mode）
interface PricingRow {
  id: string;
  charge_mode: string;
  platform_unit_price: string | null;
  platform_input_unit_price: string | null;
  platform_output_unit_price: string | null;
  platform_min_charge: string | null;
}

// ──────────────────────────────────────────────────────
// 服务主体
// ──────────────────────────────────────────────────────

export class BillingService {
  /**
   * 任务成功后扣减用户 MXM-TOKEN。
   * 无定价配置时跳过（不阻断），余额不足时抛出错误。
   */
  static async consumeForTask(params: ConsumeForTaskParams): Promise<void> {
    const {
      taskId, userId, provider, modelKey, scope,
      inputTokens = 0, outputTokens = 0, totalTokens = 0,
      imageCount = 0, audioSeconds = 0, videoSeconds = 0, requestCount = 1,
      providerCostUsd,
    } = params;

    try {
      const pricing = await this.getPricing(provider, modelKey, scope);
      if (!pricing) {
        console.warn('[BillingService] 未找到平台定价，跳过用户扣费', { provider, modelKey, scope, taskId });
        return;
      }

      const tokens = this.computePlatformTokens(pricing, {
        inputTokens, outputTokens, totalTokens,
        imageCount, audioSeconds, videoSeconds, requestCount,
      });

      if (tokens <= 0) {
        console.warn('[BillingService] 计算得到 0 token，跳过扣费', { provider, modelKey, taskId });
        return;
      }

      const isAdmin = await this.isAdminUser(userId);
      const assetCode = process.env.PLATFORM_TOKEN_ASSET_CODE || 'MXM-TOKEN';
      const walletRepo = RepositoryFactory.createWalletRepository();

      // 懒创建资产
      let asset = await walletRepo.findAssetByCode(assetCode);
      if (!asset) {
        asset = await walletRepo.createAsset({
          code: assetCode, name: 'Platform Token', symbol: assetCode,
          type: 'other' as any, decimals: 8, enabled: true,
        });
      }

      // 懒创建钱包
      let wallet = await walletRepo.findWalletByUserAndAsset(userId, assetCode);
      if (!wallet) {
        wallet = await walletRepo.createWallet({
          user_id: userId, asset_code: assetCode,
          available_balance: '0', frozen_balance: '0',
        });
      }

      const currentBalance = Number(wallet.available_balance || '0');
      const nextBalance = currentBalance - tokens;

      if (!isAdmin && nextBalance < -1e-8) {
        throw new Error(`余额不足：当前 ${currentBalance} ${assetCode}，需要 ${tokens}`);
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
          provider, modelKey, scope,
          charge_mode: pricing.charge_mode,
          pricing_id: pricing.id,
          inputTokens, outputTokens, totalTokens,
          imageCount, audioSeconds, videoSeconds, requestCount,
          tokensCharged: tokens,
          providerCostUsd: providerCostUsd ?? null,
          isAdmin,
        },
      });

      if (process.env.NODE_ENV !== 'production') {
        console.log('[BillingService] ✅ 已扣减用户 Token', {
          userId, taskId, provider, modelKey, scope, tokens, isAdmin,
          ...(providerCostUsd != null ? { providerCostUsd } : {}),
        });
      }
    } catch (err) {
      // 余额不足：向上抛出，由调用方决定是否标记任务失败
      if (err instanceof Error && err.message.startsWith('余额不足')) {
        throw err;
      }
      console.warn(
        '[BillingService] 扣费失败（不影响主流程）',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  /**
   * 任务创建前预检：用户余额是否足以支付本次预估费用。
   * 无定价时返回 allowed=true（不拦截）。
   */
  static async checkBalance(params: CheckBalanceParams): Promise<CheckBalanceResult> {
    const {
      userId, provider, modelKey, scope,
      estimatedInputTokens = 0, estimatedOutputTokens = 0, estimatedTotalTokens = 0,
      estimatedImageCount = 0, estimatedAudioSeconds = 0, estimatedVideoSeconds = 0,
      estimatedRequestCount = 1,
    } = params;

    const pricing = await this.getPricing(provider, modelKey, scope);
    if (!pricing) {
      return { allowed: true, estimatedTokens: 0, currentBalance: 0, hasPricing: false };
    }

    const estimatedTokens = this.computePlatformTokens(pricing, {
      inputTokens: estimatedInputTokens,
      outputTokens: estimatedOutputTokens,
      totalTokens: estimatedTotalTokens,
      imageCount: estimatedImageCount,
      audioSeconds: estimatedAudioSeconds,
      videoSeconds: estimatedVideoSeconds,
      requestCount: estimatedRequestCount,
    });

    const assetCode = process.env.PLATFORM_TOKEN_ASSET_CODE || 'MXM-TOKEN';
    const walletRepo = RepositoryFactory.createWalletRepository();
    const wallet = await walletRepo.findWalletByUserAndAsset(userId, assetCode);
    const currentBalance = Number(wallet?.available_balance || '0');

    const isAdmin = await this.isAdminUser(userId);
    const allowed = isAdmin || currentBalance >= estimatedTokens;

    return { allowed, estimatedTokens, currentBalance, hasPricing: true };
  }

  // ──────────────────────────────────────────────────────
  // 私有工具方法
  // ──────────────────────────────────────────────────────

  /**
   * 查询 provider_pricing 中的平台定价。
   * 优先精确匹配 (provider, model_key, scope)，未命中则回落 scope='default'。
   */
  static async getPricing(
    provider: string,
    modelKey: string,
    scope: string,
  ): Promise<PricingRow | null> {
    const supabase = getSupabaseClient();

    const cols = 'id, charge_mode, platform_unit_price, platform_input_unit_price, platform_output_unit_price, platform_min_charge';

    const { data } = await supabase
      .from('provider_pricing')
      .select(cols)
      .eq('provider', provider)
      .eq('model_key', modelKey)
      .eq('scope', scope)
      .maybeSingle();

    if (data) return data as PricingRow;

    // 回落：scope='default'
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

    return null;
  }

  private static computePlatformTokens(
    pricing: PricingRow,
    usage: {
      inputTokens: number; outputTokens: number; totalTokens: number;
      imageCount: number; audioSeconds: number; videoSeconds: number; requestCount: number;
    },
  ): number {
    const minCharge = Number(pricing.platform_min_charge || 0);
    const unitPrice = Number(pricing.platform_unit_price || 0);
    const inputPrice = pricing.platform_input_unit_price != null
      ? Number(pricing.platform_input_unit_price) : null;
    const outputPrice = pricing.platform_output_unit_price != null
      ? Number(pricing.platform_output_unit_price) : null;

    // 如果所有平台单价均未配置，说明该模型对用户免费
    if (unitPrice === 0 && inputPrice === null && outputPrice === null) {
      return 0;
    }

    let tokens = 0;
    switch (pricing.charge_mode) {
      case 'token_based': {
        const hasIO = inputPrice != null && outputPrice != null
          && (usage.inputTokens > 0 || usage.outputTokens > 0);
        if (hasIO) {
          tokens = (usage.inputTokens / 1000) * inputPrice!
            + (usage.outputTokens / 1000) * outputPrice!;
        } else {
          const t = usage.totalTokens > 0 ? usage.totalTokens
            : usage.inputTokens + usage.outputTokens;
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
