/**
 * 支付数据仓库接口
 * 提供支付订单、支付记录、退款记录的数据访问
 */

export interface PaymentOrder {
  id: string;
  user_id: string;
  order_no: string;
  order_type: 'recharge' | 'subscription' | 'purchase';
  amount: number;
  currency: string;
  payment_channel: string;
  payment_method?: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded' | 'expired';
  expires_at: Date | string;
  third_party_order_id?: string;
  third_party_transaction_id?: string;
  payment_url?: string;
  qr_code_data_url?: string;
  payment_params?: Record<string, any>;
  description?: string;
  metadata?: Record<string, any>;
  callback_data?: Record<string, any>;
  callback_received_at?: Date | string;
  paid_at?: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreatePaymentOrderDto {
  user_id: string;
  order_type: 'recharge' | 'subscription' | 'purchase';
  amount: number;
  currency?: string;
  payment_channel: string;
  payment_method?: string;
  expires_at: Date | string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface UpdatePaymentOrderDto {
  status?: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded' | 'expired';
  third_party_order_id?: string;
  third_party_transaction_id?: string;
  payment_url?: string;
  qr_code_data_url?: string;
  payment_params?: Record<string, any>;
  callback_data?: Record<string, any>;
  callback_received_at?: Date | string;
  paid_at?: Date | string;
}

export interface PaymentRecord {
  id: string;
  order_id: string;
  user_id: string;
  record_type: 'recharge' | 'subscription' | 'purchase';
  amount: number;
  details: Record<string, any>;
  created_at: Date | string;
}

export interface CreatePaymentRecordDto {
  order_id: string;
  user_id: string;
  record_type: 'recharge' | 'subscription' | 'purchase';
  amount: number;
  details: Record<string, any>;
}

export interface RefundRecord {
  id: string;
  order_id: string;
  refund_no: string;
  refund_amount: number;
  refund_reason?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  third_party_refund_id?: string;
  refunded_at?: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreateRefundRecordDto {
  refund_no?: string;
  order_id: string;
  refund_amount: number;
  refund_reason?: string;
  third_party_refund_id?: string;
}

export interface UpdateRefundRecordDto {
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  third_party_refund_id?: string;
  refunded_at?: Date | string;
}

/**
 * 支付数据仓库接口
 */
export interface IPaymentRepository {
  // 支付订单操作
  /**
   * 创建支付订单
   */
  createOrder(order: CreatePaymentOrderDto): Promise<PaymentOrder>;

  /**
   * 根据订单ID查找订单
   */
  findOrderById(id: string): Promise<PaymentOrder | null>;

  /**
   * 根据订单号查找订单
   */
  findOrderByOrderNo(orderNo: string): Promise<PaymentOrder | null>;

  /**
   * 根据第三方订单ID查找订单
   */
  findOrderByThirdPartyOrderId(thirdPartyOrderId: string): Promise<PaymentOrder | null>;

  /**
   * 更新订单
   */
  updateOrder(id: string, data: UpdatePaymentOrderDto): Promise<PaymentOrder>;

  /**
   * 根据用户ID查询订单列表
   */
  findOrdersByUserId(
    userId: string,
    options?: {
      status?: string;
      orderType?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ orders: PaymentOrder[]; total: number }>;

  // 支付记录操作
  /**
   * 创建支付记录
   */
  createPaymentRecord(record: CreatePaymentRecordDto): Promise<PaymentRecord>;

  /**
   * 根据订单ID查找支付记录
   */
  findPaymentRecordsByOrderId(orderId: string): Promise<PaymentRecord[]>;

  /**
   * 根据用户ID查找支付记录
   */
  findPaymentRecordsByUserId(
    userId: string,
    options?: {
      recordType?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ records: PaymentRecord[]; total: number }>;

  // 退款记录操作
  /**
   * 创建退款记录
   */
  createRefundRecord(record: CreateRefundRecordDto): Promise<RefundRecord>;

  /**
   * 根据订单ID查找退款记录
   */
  findRefundRecordsByOrderId(orderId: string): Promise<RefundRecord[]>;

  /**
   * 根据退款单号查找退款记录
   */
  findRefundRecordByRefundNo(refundNo: string): Promise<RefundRecord | null>;

  /**
   * 更新退款记录
   */
  updateRefundRecord(id: string, data: UpdateRefundRecordDto): Promise<RefundRecord>;
}

