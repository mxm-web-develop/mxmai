/**
 * 支付状态枚举
 */
export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCESS = 'success',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

/**
 * 支付方式枚举
 */
export enum PaymentMethod {
  ETH = 'eth',
  USDT = 'usdt',
  USDC = 'usdc',
  BTC = 'btc',
  CNY = 'cny',
  USD = 'usd',
}

/**
 * 支付通道（网关）
 */
export enum PaymentChannel {
  ALIPAY = 'alipay',
  WECHAT = 'wechat',
  PAYPAL = 'paypal',
  CARD = 'card',
  CRYPTO = 'crypto',
  VOUCHER = 'voucher',
}

/**
 * 创建支付订单请求 DTO
 */
export interface CreatePaymentDto {
  amount: number;
  currency: PaymentMethod;
  channel: PaymentChannel;
  toAddress: string;
  description?: string;
  orderId?: string;
  userId?: string;
  assetCode?: string;
  bizType?: string;
  bizId?: string;
}

/**
 * 支付订单响应 DTO
 */
export interface PaymentOrderDto {
  id: string;
  amount: number;
  currency: PaymentMethod;
  channel: PaymentChannel;
  toAddress: string;
  status: PaymentStatus;
  description: string;
  orderId: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  paymentUrl?: string;
  qrCodeDataUrl?: string;
  userId?: string;
  assetCode?: string;
  bizType?: string;
  bizId?: string;
  extra?: string;
}

/**
 * 支付确认请求 DTO
 */
export interface ConfirmPaymentDto {
  orderId: string;
  txHash: string;
  blockNumber?: number;
}

/**
 * 查询支付订单请求 DTO
 */
export interface QueryPaymentDto {
  orderId?: string;
  status?: PaymentStatus;
  currency?: PaymentMethod;
  channel?: PaymentChannel;
}

