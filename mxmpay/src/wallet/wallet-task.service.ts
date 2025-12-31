import type { IWalletRepository, WalletTask } from '@mxmai/mxmdata';
import { WalletService } from './wallet.service';
import { PaymentChannel } from '../common/dto/payment.dto';

export interface CreateDepositTaskOptions {
  userId: string;
  assetCode: string;
  amount: string;
  channel: PaymentChannel | string;
  bizType?: string;
  bizId?: string;
  paymentId?: string;
  metadata?: Record<string, any>;
}

export interface CreatePaymentTaskOptions {
  userId: string;
  assetCode: string;
  amount: string;
  bizType?: string;
  bizId?: string;
  metadata?: Record<string, any>;
}

export interface ListTasksFilters {
  type?: 'deposit' | 'payment';
  status?: 'pending' | 'processing' | 'success' | 'failed';
  assetCode?: string;
  channel?: PaymentChannel | string;
}

export interface ListTasksPagination {
  page?: number;
  limit?: number;
}

export class WalletTaskService {
  private walletRepo: IWalletRepository;
  private walletService: WalletService;

  constructor(walletRepo: IWalletRepository, walletService: WalletService) {
    this.walletRepo = walletRepo;
    this.walletService = walletService;
  }

  /**
   * 创建充值任务并执行入账
   */
  async createDepositTaskAndApply(options: CreateDepositTaskOptions): Promise<WalletTask> {
    const task = await this.walletRepo.createTask({
      user_id: options.userId,
      payment_id: options.paymentId,
      type: 'deposit',
      asset_code: options.assetCode,
      amount: options.amount,
      channel: options.channel,
      status: 'pending',
      biz_type: options.bizType,
      biz_id: options.bizId,
      metadata: options.metadata || {},
    });

    try {
      // 调用 WalletService.deposit 进行入账
      await this.walletService.deposit(
        options.userId,
        options.assetCode,
        options.amount,
        {
          referenceId: task.id,
          metadata: options.metadata,
          bizTag: options.bizType,
        }
      );

      // 更新任务状态为成功
      const updatedTask = await this.walletRepo.updateTask(task.id, {
        status: 'success',
      });

      return updatedTask;
    } catch (error: any) {
      // 更新任务状态为失败
      const errorMetadata = options.metadata || {};
      errorMetadata.error = error.message;
      await this.walletRepo.updateTask(task.id, {
        status: 'failed',
        metadata: errorMetadata,
      });
      throw error;
    }
  }

  /**
   * 创建支付任务并执行扣款
   */
  async createPaymentTaskAndApply(options: CreatePaymentTaskOptions): Promise<WalletTask> {
    const task = await this.walletRepo.createTask({
      user_id: options.userId,
      payment_id: undefined,
      type: 'payment',
      asset_code: options.assetCode,
      amount: options.amount,
      channel: 'crypto', // 默认使用 crypto，实际应该从业务层传入
      status: 'pending',
      biz_type: options.bizType,
      biz_id: options.bizId,
      metadata: options.metadata || {},
    });

    try {
      // 调用 WalletService.withdraw 进行扣款
      await this.walletService.withdraw(
        options.userId,
        options.assetCode,
        options.amount,
        {
          referenceId: task.id,
          metadata: options.metadata,
          bizTag: options.bizType,
        }
      );

      // 更新任务状态为成功
      const updatedTask = await this.walletRepo.updateTask(task.id, {
        status: 'success',
      });

      return updatedTask;
    } catch (error: any) {
      // 更新任务状态为失败
      const errorMetadata = options.metadata || {};
      errorMetadata.error = error.message;
      await this.walletRepo.updateTask(task.id, {
        status: 'failed',
        metadata: errorMetadata,
      });
      throw error;
    }
  }

  /**
   * 查询任务列表
   */
  async listTasks(
    userId: string,
    filters?: ListTasksFilters,
    pagination?: ListTasksPagination
  ): Promise<{
    items: WalletTask[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 20;

    const { tasks, total } = await this.walletRepo.findTasksByUserId(userId, {
      type: filters?.type,
      status: filters?.status,
      limit,
      offset: (page - 1) * limit,
    });

    // 过滤 assetCode 和 channel（如果提供）
    let filteredTasks = tasks;
    if (filters?.assetCode) {
      filteredTasks = filteredTasks.filter(t => t.asset_code === filters.assetCode);
    }
    if (filters?.channel) {
      filteredTasks = filteredTasks.filter(t => t.channel === filters.channel);
    }

    return {
      items: filteredTasks,
      total,
      page,
      limit,
    };
  }
}
