/**
 * 支付数据模型
 * 与 IPaymentRepository 接口中的类型定义保持一致
 */

import type {
  PaymentOrder,
  CreatePaymentOrderDto,
  UpdatePaymentOrderDto,
  PaymentRecord,
  CreatePaymentRecordDto,
  RefundRecord,
  CreateRefundRecordDto,
  UpdateRefundRecordDto,
} from '../interfaces/IPaymentRepository';

export type {
  PaymentOrder,
  CreatePaymentOrderDto,
  UpdatePaymentOrderDto,
  PaymentRecord,
  CreatePaymentRecordDto,
  RefundRecord,
  CreateRefundRecordDto,
  UpdateRefundRecordDto,
};

/**
 * 订单查询选项
 */
export interface PaymentOrderQueryOptions {
  status?: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded' | 'expired';
  orderType?: 'recharge' | 'subscription' | 'purchase';
  paymentChannel?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  limit?: number;
  offset?: number;
}

/**
 * 支付记录查询选项
 */
export interface PaymentRecordQueryOptions {
  recordType?: 'recharge' | 'subscription' | 'purchase';
  startDate?: Date | string;
  endDate?: Date | string;
  limit?: number;
  offset?: number;
}

