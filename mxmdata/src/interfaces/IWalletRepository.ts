/**
 * 钱包数据仓库接口
 * 提供钱包、资产、交易、任务的数据访问
 */

/**
 * 资产配置
 */
export interface Asset {
  code: string; // 资产代码，如 'CNY', 'USD', 'USDT-ERC20'
  name: string; // 资产名称
  symbol: string; // 资产符号
  type: 'fiat' | 'crypto'; // 资产类型
  decimals: number; // 小数位数
  enabled: boolean; // 是否启用
  created_at: Date | string;
  updated_at: Date | string;
}

/**
 * 钱包余额
 */
export interface Wallet {
  id: string;
  user_id: string;
  asset_code: string; // 关联的资产代码
  available_balance: string; // 可用余额（使用字符串避免精度问题）
  frozen_balance: string; // 冻结余额
  status?: 'active' | 'frozen' | 'closed'; // 钱包状态
  created_at: Date | string;
  updated_at: Date | string;
}

/**
 * 钱包交易记录
 */
export interface WalletTransaction {
  id: string;
  wallet_id: string;
  user_id: string;
  asset_code: string;
  type: 'deposit' | 'withdraw' | 'freeze' | 'unfreeze' | 'transfer';
  amount: string; // 交易金额
  balance_before: string; // 交易前余额
  balance_after: string; // 交易后余额
  reference_id?: string; // 关联的业务ID（如订单ID、任务ID）
  metadata?: Record<string, any>; // 额外信息
  created_at: Date | string;
}

/**
 * 钱包任务（充值、支付等）
 */
export interface WalletTask {
  id: string;
  user_id: string;
  payment_id?: string; // 关联的支付订单ID
  type: 'deposit' | 'payment'; // 任务类型
  asset_code: string;
  amount: string; // 金额
  channel: string; // 渠道（如 'crypto', 'alipay'）
  status: 'pending' | 'processing' | 'success' | 'failed';
  biz_type?: string; // 业务类型
  biz_id?: string; // 业务ID
  metadata?: Record<string, any>; // 额外信息（如交易哈希）
  created_at: Date | string;
  updated_at: Date | string;
}

/**
 * 创建资产 DTO
 */
export interface CreateAssetDto {
  code: string;
  name: string;
  symbol: string;
  type: 'fiat' | 'crypto';
  decimals: number;
  enabled?: boolean;
}

/**
 * 更新资产 DTO
 */
export interface UpdateAssetDto {
  name?: string;
  symbol?: string;
  enabled?: boolean;
}

/**
 * 创建钱包 DTO
 */
export interface CreateWalletDto {
  user_id: string;
  asset_code: string;
  available_balance?: string;
  frozen_balance?: string;
}

/**
 * 更新钱包余额 DTO
 */
export interface UpdateWalletBalanceDto {
  available_balance?: string;
  frozen_balance?: string;
}

/**
 * 创建交易记录 DTO
 */
export interface CreateTransactionDto {
  wallet_id: string;
  user_id: string;
  asset_code: string;
  type: 'deposit' | 'withdraw' | 'freeze' | 'unfreeze' | 'transfer';
  amount: string;
  balance_before: string;
  balance_after: string;
  reference_id?: string;
  metadata?: Record<string, any>;
}

/**
 * 创建钱包任务 DTO
 */
export interface CreateWalletTaskDto {
  user_id: string;
  payment_id?: string;
  type: 'deposit' | 'payment';
  asset_code: string;
  amount: string;
  channel: string;
  status?: 'pending' | 'processing' | 'success' | 'failed';
  biz_type?: string;
  biz_id?: string;
  metadata?: Record<string, any>;
}

/**
 * 更新钱包任务 DTO
 */
export interface UpdateWalletTaskDto {
  status?: 'pending' | 'processing' | 'success' | 'failed';
  metadata?: Record<string, any>;
}

/**
 * 钱包数据仓库接口
 */
export interface IWalletRepository {
  // 资产操作
  /**
   * 创建资产
   */
  createAsset(asset: CreateAssetDto): Promise<Asset>;

  /**
   * 根据代码查找资产
   */
  findAssetByCode(code: string): Promise<Asset | null>;

  /**
   * 查询所有资产
   */
  findAllAssets(): Promise<Asset[]>;

  /**
   * 更新资产
   */
  updateAsset(code: string, data: UpdateAssetDto): Promise<Asset>;

  // 钱包操作
  /**
   * 创建钱包
   */
  createWallet(wallet: CreateWalletDto): Promise<Wallet>;

  /**
   * 根据用户ID和资产代码查找钱包
   */
  findWalletByUserAndAsset(userId: string, assetCode: string): Promise<Wallet | null>;

  /**
   * 根据用户ID查询所有钱包
   */
  findWalletsByUserId(userId: string): Promise<Wallet[]>;

  /**
   * 更新钱包余额
   */
  updateWalletBalance(id: string, data: UpdateWalletBalanceDto): Promise<Wallet>;

  /**
   * 更新钱包（通用更新）
   */
  updateWallet(id: string, data: Partial<Wallet>): Promise<Wallet>;

  // 交易记录操作
  /**
   * 创建交易记录
   */
  createTransaction(transaction: CreateTransactionDto): Promise<WalletTransaction>;

  /**
   * 根据钱包ID查询交易记录
   */
  findTransactionsByWalletId(walletId: string, limit?: number): Promise<WalletTransaction[]>;

  /**
   * 根据用户ID和资产代码查询交易记录
   */
  findTransactionsByUserAndAsset(userId: string, assetCode: string, limit?: number): Promise<WalletTransaction[]>;

  // 钱包任务操作
  /**
   * 创建钱包任务
   */
  createTask(task: CreateWalletTaskDto): Promise<WalletTask>;

  /**
   * 根据ID查找任务
   */
  findTaskById(id: string): Promise<WalletTask | null>;

  /**
   * 根据用户ID查询任务列表
   */
  findTasksByUserId(
    userId: string,
    options?: {
      type?: 'deposit' | 'payment';
      status?: 'pending' | 'processing' | 'success' | 'failed';
      limit?: number;
      offset?: number;
    }
  ): Promise<{ tasks: WalletTask[]; total: number }>;

  /**
   * 更新任务
   */
  updateTask(id: string, data: UpdateWalletTaskDto): Promise<WalletTask>;
}

