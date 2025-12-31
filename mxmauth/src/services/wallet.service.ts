/**
 * 钱包服务客户端
 * 用于调用 mxmpay 服务创建和管理用户钱包
 */

import axios, { AxiosInstance } from 'axios';

export interface WalletCreateResult {
  walletId: string;
  assetCode: string;
  availableBalance: string;
}

export class WalletService {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.MXMPAY_URL || 'http://localhost:4002';
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * 检查服务是否可用
   */
  private async checkServiceAvailable(): Promise<boolean> {
    try {
      await this.client.get('/health', { timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 为用户创建默认钱包（CNY）
   * 通过充值 0 金额来初始化钱包
   */
  async createDefaultWallet(userId: string): Promise<WalletCreateResult | null> {
    // 检查服务是否可用
    const isAvailable = await this.checkServiceAvailable();
    if (!isAvailable) {
      console.warn(`⚠️ mxmpay 服务不可用，跳过钱包创建`);
      return null;
    }

    try {
      // 先尝试获取钱包，如果已存在则直接返回
      try {
        const walletResponse = await this.client.get(`/wallets/CNY`, {
          headers: {
            'x-user-id': userId,
          },
        });
        if (walletResponse.data.code === 200 && walletResponse.data.data) {
          return {
            walletId: walletResponse.data.data.id || `wallet_cny_${userId}`,
            assetCode: 'CNY',
            availableBalance: walletResponse.data.data.availableBalance || '0',
          };
        }
      } catch (e) {
        // 钱包不存在，继续创建
      }

      // 通过充值 0 金额来创建钱包
      const response = await this.client.post(
        `/wallets/CNY/deposit`,
        {
          amount: '0',
          referenceId: `user_init_${userId}`,
          description: '用户注册初始化钱包',
        },
        {
          headers: {
            'x-user-id': userId,
          },
        }
      );

      if (response.data.code === 200 && response.data.data) {
        return {
          walletId: response.data.data.walletId || response.data.data.id || `wallet_cny_${userId}`,
          assetCode: 'CNY',
          availableBalance: response.data.data.availableBalance || '0',
        };
      }

      throw new Error('创建钱包失败');
    } catch (error: any) {
      // 如果钱包已存在或其他错误，尝试再次获取
      try {
        const walletResponse = await this.client.get(`/wallets/CNY`, {
          headers: {
            'x-user-id': userId,
          },
        });
        if (walletResponse.data.code === 200 && walletResponse.data.data) {
          return {
            walletId: walletResponse.data.data.id || `wallet_cny_${userId}`,
            assetCode: 'CNY',
            availableBalance: walletResponse.data.data.availableBalance || '0',
          };
        }
      } catch (e) {
        // 忽略获取失败
      }
      console.error(`创建钱包失败: ${error.message}`);
      return null; // 返回 null 而不是抛出错误，避免影响用户注册
    }
  }

  /**
   * 获取用户钱包列表
   */
  async getUserWallets(userId: string): Promise<any[]> {
    try {
      const response = await this.client.get(`/wallets`, {
        headers: {
          'x-user-id': userId,
        },
      });

      if (response.data.code === 200 && response.data.data) {
        return response.data.data.wallets || [];
      }
      return [];
    } catch (error) {
      console.error('获取钱包列表失败:', error);
      return [];
    }
  }
}

