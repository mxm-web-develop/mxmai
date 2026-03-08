import Decimal from 'decimal.js';
import type { IWalletRepository, Asset, Wallet, WalletTransaction } from '@mxmai/mxmdata';
import { DEFAULT_ASSETS } from './default-assets';

Decimal.set({ precision: 36, rounding: Decimal.ROUND_DOWN });

export interface WalletOperationOptions {
  referenceId?: string;
  metadata?: Record<string, any>;
  bizTag?: string;
}

export class WalletService {
  private walletRepo: IWalletRepository;

  constructor(walletRepo: IWalletRepository) {
    this.walletRepo = walletRepo;
  }

  /**
   * 初始化默认资产配置
   */
  async ensureDefaultAssets(): Promise<void> {
    for (const asset of DEFAULT_ASSETS) {
      const exists = await this.walletRepo.findAssetByCode(asset.assetCode);

      if (!exists) {
        await this.walletRepo.createAsset({
          code: asset.assetCode,
          name: asset.displayName,
          symbol: asset.assetCode,
          type: asset.type === 'crypto' ? 'crypto' : 'fiat',
          decimals: asset.precision,
          enabled: true,
        });
      }
    }
  }

  async listAssets(): Promise<Asset[]> {
    return this.walletRepo.findAllAssets();
  }

  /**
   * 获取用户全部钱包，懒创建：若没有任何钱包则自动创建默认 CNY 钱包
   */
  async getWallets(userId: string): Promise<Wallet[]> {
    const wallets = await this.walletRepo.findWalletsByUserId(userId);
    if (wallets.length === 0) {
      const defaultAsset = (await this.walletRepo.findAllAssets()).find((a) => a.code === 'CNY') || { code: 'CNY' };
      const created = await this.getOrCreateWallet(userId, defaultAsset.code);
      return [created];
    }
    return wallets;
  }

  /**
   * 获取单个资产钱包，懒创建：若不存在则自动创建
   */
  async getWallet(userId: string, assetCode: string): Promise<Wallet | null> {
    const wallet = await this.walletRepo.findWalletByUserAndAsset(userId, assetCode);
    if (wallet) return wallet;
    const asset = await this.walletRepo.findAssetByCode(assetCode);
    if (!asset) return null;
    return this.getOrCreateWallet(userId, assetCode);
  }

  private async getOrCreateWallet(userId: string, assetCode: string): Promise<Wallet> {
    let wallet = await this.walletRepo.findWalletByUserAndAsset(userId, assetCode);
    if (!wallet) {
      wallet = await this.walletRepo.createWallet({
        user_id: userId,
        asset_code: assetCode,
        available_balance: '0',
        frozen_balance: '0',
      });
    }
    return wallet;
  }

  async getTransactions(userId: string, assetCode: string, limit = 20): Promise<WalletTransaction[]> {
    return this.walletRepo.findTransactionsByUserAndAsset(userId, assetCode, limit);
  }

  async deposit(userId: string, assetCode: string, amount: string, options: WalletOperationOptions = {}): Promise<Wallet> {
    return this.adjustBalance(userId, assetCode, amount, 'deposit', options);
  }

  async withdraw(userId: string, assetCode: string, amount: string, options: WalletOperationOptions = {}): Promise<Wallet> {
    return this.adjustBalance(userId, assetCode, amount, 'withdraw', options);
  }

  private async adjustBalance(
    userId: string,
    assetCode: string,
    rawAmount: string,
    type: 'deposit' | 'withdraw',
    options: WalletOperationOptions
  ): Promise<Wallet> {
    const amount = new Decimal(rawAmount);
    if (amount.lte(0)) {
      throw new Error('金额必须大于 0');
    }

    const wallet = await this.getOrCreateWallet(userId, assetCode);

    // 获取资产配置
    const asset = await this.walletRepo.findAssetByCode(assetCode);
    if (!asset) {
      throw new Error(`资产 ${assetCode} 未配置`);
    }

    const currentBalance = new Decimal(wallet.available_balance || '0');
    let nextBalance: Decimal;
    
    if (type === 'deposit') {
      nextBalance = currentBalance.add(amount);
    } else {
      nextBalance = currentBalance.minus(amount);
      if (nextBalance.lt(0)) {
        throw new Error('余额不足');
      }
    }

    // 更新钱包余额
    const updatedWallet = await this.walletRepo.updateWalletBalance(wallet.id, {
      available_balance: nextBalance.toFixed(asset.decimals),
    });

    // 创建交易记录
    await this.walletRepo.createTransaction({
      wallet_id: wallet.id,
      user_id: userId,
      asset_code: assetCode,
      type,
      amount: amount.toFixed(asset.decimals),
      balance_before: currentBalance.toFixed(asset.decimals),
      balance_after: nextBalance.toFixed(asset.decimals),
      reference_id: options.referenceId,
      metadata: {
        ...options.metadata,
        bizTag: options.bizTag,
      },
    });

    return updatedWallet;
  }
}
