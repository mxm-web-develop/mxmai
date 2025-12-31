/**
 * Supabase 钱包数据仓库实现
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type {
  IWalletRepository,
  Asset,
  Wallet,
  WalletTransaction,
  WalletTask,
  CreateAssetDto,
  UpdateAssetDto,
  CreateWalletDto,
  UpdateWalletBalanceDto,
  CreateTransactionDto,
  CreateWalletTaskDto,
  UpdateWalletTaskDto,
} from '../../interfaces/IWalletRepository';
import { NotFoundError, DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

export class SupabaseWalletRepository implements IWalletRepository {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client || getSupabaseClient();
  }

  // 资产操作
  async createAsset(asset: CreateAssetDto): Promise<Asset> {
    try {
      const { data, error } = await this.client
        .from('assets')
        .insert({
          code: asset.code,
          name: asset.name,
          symbol: asset.symbol,
          type: asset.type,
          decimals: asset.decimals,
          enabled: asset.enabled !== false,
        })
        .select()
        .single();

      if (error) {
        throw new DataAccessError(`Failed to create asset: ${error.message}`, 'CREATE_ERROR', error);
      }

      if (!data) {
        throw new DataAccessError('Failed to create asset: no data returned', 'CREATE_ERROR');
      }

      return this.mapToAsset(data);
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error creating asset: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async findAssetByCode(code: string): Promise<Asset | null> {
    try {
      const { data, error } = await this.client
        .from('assets')
        .select('*')
        .eq('code', code)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new DataAccessError(`Failed to find asset by code: ${error.message}`, 'QUERY_ERROR', error);
      }

      return data ? this.mapToAsset(data) : null;
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error finding asset by code: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async findAllAssets(): Promise<Asset[]> {
    try {
      const { data, error } = await this.client
        .from('assets')
        .select('*')
        .eq('enabled', true)
        .order('code');

      if (error) {
        throw new DataAccessError(`Failed to find all assets: ${error.message}`, 'QUERY_ERROR', error);
      }

      return (data || []).map((item) => this.mapToAsset(item));
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error finding all assets: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async updateAsset(code: string, data: UpdateAssetDto): Promise<Asset> {
    try {
      const updateData: Record<string, any> = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.symbol !== undefined) updateData.symbol = data.symbol;
      if (data.enabled !== undefined) updateData.enabled = data.enabled;

      const { data: updated, error } = await this.client
        .from('assets')
        .update(updateData)
        .eq('code', code)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundError('Asset', code);
        }
        throw new DataAccessError(`Failed to update asset: ${error.message}`, 'UPDATE_ERROR', error);
      }

      if (!updated) {
        throw new NotFoundError('Asset', code);
      }

      return this.mapToAsset(updated);
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error updating asset: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  // 钱包操作
  async createWallet(wallet: CreateWalletDto): Promise<Wallet> {
    try {
      const { data, error } = await this.client
        .from('wallets')
        .insert({
          user_id: wallet.user_id,
          asset_code: wallet.asset_code,
          available_balance: wallet.available_balance || '0',
          frozen_balance: wallet.frozen_balance || '0',
        })
        .select()
        .single();

      if (error) {
        throw new DataAccessError(`Failed to create wallet: ${error.message}`, 'CREATE_ERROR', error);
      }

      if (!data) {
        throw new DataAccessError('Failed to create wallet: no data returned', 'CREATE_ERROR');
      }

      return this.mapToWallet(data);
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error creating wallet: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async findWalletByUserAndAsset(userId: string, assetCode: string): Promise<Wallet | null> {
    try {
      const { data, error } = await this.client
        .from('wallets')
        .select('*')
        .eq('user_id', userId)
        .eq('asset_code', assetCode)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new DataAccessError(`Failed to find wallet: ${error.message}`, 'QUERY_ERROR', error);
      }

      return data ? this.mapToWallet(data) : null;
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error finding wallet: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async findWalletsByUserId(userId: string): Promise<Wallet[]> {
    try {
      const { data, error } = await this.client
        .from('wallets')
        .select('*')
        .eq('user_id', userId)
        .order('asset_code');

      if (error) {
        throw new DataAccessError(`Failed to find wallets by user id: ${error.message}`, 'QUERY_ERROR', error);
      }

      return (data || []).map((item) => this.mapToWallet(item));
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error finding wallets by user id: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async updateWalletBalance(id: string, data: UpdateWalletBalanceDto): Promise<Wallet> {
    try {
      const updateData: Record<string, any> = {};
      if (data.available_balance !== undefined) updateData.available_balance = data.available_balance;
      if (data.frozen_balance !== undefined) updateData.frozen_balance = data.frozen_balance;

      const { data: updated, error } = await this.client
        .from('wallets')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundError('Wallet', id);
        }
        throw new DataAccessError(`Failed to update wallet balance: ${error.message}`, 'UPDATE_ERROR', error);
      }

      if (!updated) {
        throw new NotFoundError('Wallet', id);
      }

      return this.mapToWallet(updated);
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error updating wallet balance: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async updateWallet(id: string, data: Partial<Wallet>): Promise<Wallet> {
    try {
      const updateData: Record<string, any> = {};
      if (data.available_balance !== undefined) updateData.available_balance = data.available_balance;
      if (data.frozen_balance !== undefined) updateData.frozen_balance = data.frozen_balance;
      if (data.status !== undefined) updateData.status = data.status;

      const { data: updated, error } = await this.client
        .from('wallets')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundError('Wallet', id);
        }
        throw new DataAccessError(`Failed to update wallet: ${error.message}`, 'UPDATE_ERROR', error);
      }

      if (!updated) {
        throw new NotFoundError('Wallet', id);
      }

      return this.mapToWallet(updated);
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error updating wallet: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  // 交易记录操作
  async createTransaction(transaction: CreateTransactionDto): Promise<WalletTransaction> {
    try {
      const { data, error } = await this.client
        .from('wallet_transactions')
        .insert({
          wallet_id: transaction.wallet_id,
          user_id: transaction.user_id,
          asset_code: transaction.asset_code,
          type: transaction.type,
          amount: transaction.amount,
          balance_before: transaction.balance_before,
          balance_after: transaction.balance_after,
          reference_id: transaction.reference_id,
          metadata: transaction.metadata || {},
        })
        .select()
        .single();

      if (error) {
        throw new DataAccessError(`Failed to create transaction: ${error.message}`, 'CREATE_ERROR', error);
      }

      if (!data) {
        throw new DataAccessError('Failed to create transaction: no data returned', 'CREATE_ERROR');
      }

      return this.mapToTransaction(data);
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error creating transaction: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async findTransactionsByWalletId(walletId: string, limit = 20): Promise<WalletTransaction[]> {
    try {
      const { data, error } = await this.client
        .from('wallet_transactions')
        .select('*')
        .eq('wallet_id', walletId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw new DataAccessError(`Failed to find transactions by wallet id: ${error.message}`, 'QUERY_ERROR', error);
      }

      return (data || []).map((item) => this.mapToTransaction(item));
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error finding transactions by wallet id: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async findTransactionsByUserAndAsset(userId: string, assetCode: string, limit = 20): Promise<WalletTransaction[]> {
    try {
      const { data, error } = await this.client
        .from('wallet_transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('asset_code', assetCode)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw new DataAccessError(`Failed to find transactions by user and asset: ${error.message}`, 'QUERY_ERROR', error);
      }

      return (data || []).map((item) => this.mapToTransaction(item));
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error finding transactions by user and asset: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  // 钱包任务操作
  async createTask(task: CreateWalletTaskDto): Promise<WalletTask> {
    try {
      const { data, error } = await this.client
        .from('wallet_tasks')
        .insert({
          user_id: task.user_id,
          payment_id: task.payment_id,
          type: task.type,
          asset_code: task.asset_code,
          amount: task.amount,
          channel: task.channel,
          status: task.status || 'pending',
          biz_type: task.biz_type,
          biz_id: task.biz_id,
          metadata: task.metadata || {},
        })
        .select()
        .single();

      if (error) {
        throw new DataAccessError(`Failed to create wallet task: ${error.message}`, 'CREATE_ERROR', error);
      }

      if (!data) {
        throw new DataAccessError('Failed to create wallet task: no data returned', 'CREATE_ERROR');
      }

      return this.mapToTask(data);
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error creating wallet task: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async findTaskById(id: string): Promise<WalletTask | null> {
    try {
      const { data, error } = await this.client
        .from('wallet_tasks')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new DataAccessError(`Failed to find task by id: ${error.message}`, 'QUERY_ERROR', error);
      }

      return data ? this.mapToTask(data) : null;
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error finding task by id: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async findTasksByUserId(
    userId: string,
    options?: {
      type?: 'deposit' | 'payment';
      status?: 'pending' | 'processing' | 'success' | 'failed';
      limit?: number;
      offset?: number;
    }
  ): Promise<{ tasks: WalletTask[]; total: number }> {
    try {
      let query = this.client
        .from('wallet_tasks')
        .select('*', { count: 'exact' })
        .eq('user_id', userId);

      if (options?.type) {
        query = query.eq('type', options.type);
      }
      if (options?.status) {
        query = query.eq('status', options.status);
      }

      query = query.order('created_at', { ascending: false });

      if (options?.limit) {
        query = query.limit(options.limit);
      }
      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
      }

      const { data, error, count } = await query;

      if (error) {
        throw new DataAccessError(`Failed to find tasks by user id: ${error.message}`, 'QUERY_ERROR', error);
      }

      return {
        tasks: (data || []).map((item) => this.mapToTask(item)),
        total: count || 0,
      };
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error finding tasks by user id: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async updateTask(id: string, data: UpdateWalletTaskDto): Promise<WalletTask> {
    try {
      const updateData: Record<string, any> = {};
      if (data.status !== undefined) updateData.status = data.status;
      if (data.metadata !== undefined) updateData.metadata = data.metadata;

      const { data: updated, error } = await this.client
        .from('wallet_tasks')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundError('WalletTask', id);
        }
        throw new DataAccessError(`Failed to update task: ${error.message}`, 'UPDATE_ERROR', error);
      }

      if (!updated) {
        throw new NotFoundError('WalletTask', id);
      }

      return this.mapToTask(updated);
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error updating task: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  // 映射方法
  private mapToAsset(data: any): Asset {
    return {
      code: data.code,
      name: data.name,
      symbol: data.symbol,
      type: data.type,
      decimals: data.decimals,
      enabled: data.enabled,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  private mapToWallet(data: any): Wallet {
    return {
      id: data.id,
      user_id: data.user_id,
      asset_code: data.asset_code,
      available_balance: String(data.available_balance),
      frozen_balance: String(data.frozen_balance),
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  private mapToTransaction(data: any): WalletTransaction {
    return {
      id: data.id,
      wallet_id: data.wallet_id,
      user_id: data.user_id,
      asset_code: data.asset_code,
      type: data.type,
      amount: String(data.amount),
      balance_before: String(data.balance_before),
      balance_after: String(data.balance_after),
      reference_id: data.reference_id,
      metadata: data.metadata || {},
      created_at: data.created_at,
    };
  }

  private mapToTask(data: any): WalletTask {
    return {
      id: data.id,
      user_id: data.user_id,
      payment_id: data.payment_id,
      type: data.type,
      asset_code: data.asset_code,
      amount: String(data.amount),
      channel: data.channel,
      status: data.status,
      biz_type: data.biz_type,
      biz_id: data.biz_id,
      metadata: data.metadata || {},
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }
}

