/**
 * 支付用户 Repository 适配器示例
 * 展示如何为特定业务模块创建精简接口
 */

import type { IUserRepository } from '../../interfaces/IUserRepository';

/**
 * 支付模块专用的用户 Repository 接口
 * 只关心用户余额和基本信息
 */
export interface IPaymentUserRepository {
  /**
   * 获取用户余额
   */
  getUserBalance(userId: string): Promise<number>;

  /**
   * 获取用户基本信息（用于支付）
   */
  getUserBasicInfo(userId: string): Promise<{ id: string; username: string; balance: number }>;
}

/**
 * 支付用户 Repository 适配器实现
 */
export class PaymentUserRepositoryAdapter implements IPaymentUserRepository {
  constructor(private baseRepo: IUserRepository) {}

  async getUserBalance(userId: string): Promise<number> {
    const user = await this.baseRepo.findById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }
    return user.balance;
  }

  async getUserBasicInfo(userId: string): Promise<{ id: string; username: string; balance: number }> {
    const user = await this.baseRepo.findById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    return {
      id: user.id,
      username: user.username,
      balance: user.balance,
    };
  }
}

