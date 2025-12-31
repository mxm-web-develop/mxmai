/**
 * Supabase 支付数据仓库实现
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type {
  IPaymentRepository,
  PaymentOrder,
  CreatePaymentOrderDto,
  UpdatePaymentOrderDto,
  PaymentRecord,
  CreatePaymentRecordDto,
  RefundRecord,
  CreateRefundRecordDto,
  UpdateRefundRecordDto,
} from '../../interfaces/IPaymentRepository';
import { NotFoundError, DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

export class SupabasePaymentRepository implements IPaymentRepository {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client || getSupabaseClient();
  }

  async createOrder(order: CreatePaymentOrderDto): Promise<PaymentOrder> {
    try {
      // 如果没有提供 order_no，自动生成
      const orderNo = (order as any).order_no || `PAY${Date.now()}`;
      const { data, error } = await this.client
        .from('payment_orders')
        .insert({
          user_id: order.user_id,
          order_no: orderNo,
          order_type: order.order_type,
          amount: order.amount,
          currency: order.currency || 'usdt',
          payment_channel: order.payment_channel,
          payment_method: order.payment_method,
          expires_at: typeof order.expires_at === 'string' ? order.expires_at : order.expires_at.toISOString(),
          description: order.description,
          metadata: order.metadata || {},
        })
        .select()
        .single();

      if (error) {
        throw new DataAccessError(`Failed to create payment order: ${error.message}`, 'CREATE_ERROR', error);
      }

      if (!data) {
        throw new DataAccessError('Failed to create payment order: no data returned', 'CREATE_ERROR');
      }

      return this.mapToPaymentOrder(data);
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error creating payment order: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async findOrderById(id: string): Promise<PaymentOrder | null> {
    try {
      const { data, error } = await this.client
        .from('payment_orders')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new DataAccessError(`Failed to find order by id: ${error.message}`, 'QUERY_ERROR', error);
      }

      return data ? this.mapToPaymentOrder(data) : null;
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error finding order by id: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async findOrderByOrderNo(orderNo: string): Promise<PaymentOrder | null> {
    try {
      const { data, error } = await this.client
        .from('payment_orders')
        .select('*')
        .eq('order_no', orderNo)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new DataAccessError(`Failed to find order by order no: ${error.message}`, 'QUERY_ERROR', error);
      }

      return data ? this.mapToPaymentOrder(data) : null;
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error finding order by order no: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async findOrderByThirdPartyOrderId(thirdPartyOrderId: string): Promise<PaymentOrder | null> {
    try {
      const { data, error } = await this.client
        .from('payment_orders')
        .select('*')
        .eq('third_party_order_id', thirdPartyOrderId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new DataAccessError(`Failed to find order by third party order id: ${error.message}`, 'QUERY_ERROR', error);
      }

      return data ? this.mapToPaymentOrder(data) : null;
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error finding order by third party order id: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async updateOrder(id: string, data: UpdatePaymentOrderDto): Promise<PaymentOrder> {
    try {
      const updateData: Record<string, any> = {};
      if (data.status !== undefined) updateData.status = data.status;
      if (data.third_party_order_id !== undefined) updateData.third_party_order_id = data.third_party_order_id;
      if (data.third_party_transaction_id !== undefined) updateData.third_party_transaction_id = data.third_party_transaction_id;
      if (data.payment_url !== undefined) updateData.payment_url = data.payment_url;
      if (data.qr_code_data_url !== undefined) updateData.qr_code_data_url = data.qr_code_data_url;
      if (data.payment_params !== undefined) updateData.payment_params = data.payment_params;
      if (data.callback_data !== undefined) updateData.callback_data = data.callback_data;
      if (data.callback_received_at !== undefined) updateData.callback_received_at = data.callback_received_at;
      if (data.paid_at !== undefined) updateData.paid_at = data.paid_at;

      const { data: updated, error } = await this.client
        .from('payment_orders')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundError('PaymentOrder', id);
        }
        throw new DataAccessError(`Failed to update order: ${error.message}`, 'UPDATE_ERROR', error);
      }

      if (!updated) {
        throw new NotFoundError('PaymentOrder', id);
      }

      return this.mapToPaymentOrder(updated);
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error updating order: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async findOrdersByUserId(
    userId: string,
    options?: {
      status?: string;
      orderType?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ orders: PaymentOrder[]; total: number }> {
    try {
      let query = this.client
        .from('payment_orders')
        .select('*', { count: 'exact' });

      // 如果 userId 不为空，添加用户筛选条件
      // 如果 userId 为空字符串，则查询所有订单（用于 admin 权限）
      if (userId && userId.trim() !== '') {
        query = query.eq('user_id', userId);
      }

      if (options?.status) {
        query = query.eq('status', options.status);
      }
      if (options?.orderType) {
        query = query.eq('order_type', options.orderType);
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
        throw new DataAccessError(`Failed to find orders by user id: ${error.message}`, 'QUERY_ERROR', error);
      }

      return {
        orders: (data || []).map((item) => this.mapToPaymentOrder(item)),
        total: count || 0,
      };
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error finding orders by user id: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async createPaymentRecord(record: CreatePaymentRecordDto): Promise<PaymentRecord> {
    try {
      const { data, error } = await this.client
        .from('payment_records')
        .insert({
          order_id: record.order_id,
          user_id: record.user_id,
          record_type: record.record_type,
          amount: record.amount,
          details: record.details || {},
        })
        .select()
        .single();

      if (error) {
        throw new DataAccessError(`Failed to create payment record: ${error.message}`, 'CREATE_ERROR', error);
      }

      if (!data) {
        throw new DataAccessError('Failed to create payment record: no data returned', 'CREATE_ERROR');
      }

      return this.mapToPaymentRecord(data);
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error creating payment record: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async findPaymentRecordsByOrderId(orderId: string): Promise<PaymentRecord[]> {
    try {
      const { data, error } = await this.client
        .from('payment_records')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new DataAccessError(`Failed to find payment records by order id: ${error.message}`, 'QUERY_ERROR', error);
      }

      return (data || []).map((item) => this.mapToPaymentRecord(item));
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error finding payment records by order id: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async findPaymentRecordsByUserId(
    userId: string,
    options?: {
      recordType?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ records: PaymentRecord[]; total: number }> {
    try {
      let query = this.client
        .from('payment_records')
        .select('*', { count: 'exact' })
        .eq('user_id', userId);

      if (options?.recordType) {
        query = query.eq('record_type', options.recordType);
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
        throw new DataAccessError(`Failed to find payment records by user id: ${error.message}`, 'QUERY_ERROR', error);
      }

      return {
        records: (data || []).map((item) => this.mapToPaymentRecord(item)),
        total: count || 0,
      };
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error finding payment records by user id: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async createRefundRecord(record: CreateRefundRecordDto): Promise<RefundRecord> {
    try {
      const refundNo = record.refund_no || `REF${Date.now()}`;
      const { data, error } = await this.client
        .from('refund_records')
        .insert({
          order_id: record.order_id,
          refund_no: refundNo,
          refund_amount: record.refund_amount,
          refund_reason: record.refund_reason,
          third_party_refund_id: record.third_party_refund_id,
        })
        .select()
        .single();

      if (error) {
        throw new DataAccessError(`Failed to create refund record: ${error.message}`, 'CREATE_ERROR', error);
      }

      if (!data) {
        throw new DataAccessError('Failed to create refund record: no data returned', 'CREATE_ERROR');
      }

      return this.mapToRefundRecord(data);
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error creating refund record: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async findRefundRecordsByOrderId(orderId: string): Promise<RefundRecord[]> {
    try {
      const { data, error } = await this.client
        .from('refund_records')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new DataAccessError(`Failed to find refund records by order id: ${error.message}`, 'QUERY_ERROR', error);
      }

      return (data || []).map((item) => this.mapToRefundRecord(item));
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error finding refund records by order id: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async findRefundRecordByRefundNo(refundNo: string): Promise<RefundRecord | null> {
    try {
      const { data, error } = await this.client
        .from('refund_records')
        .select('*')
        .eq('refund_no', refundNo)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new DataAccessError(`Failed to find refund record by refund no: ${error.message}`, 'QUERY_ERROR', error);
      }

      return data ? this.mapToRefundRecord(data) : null;
    } catch (error) {
      if (error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error finding refund record by refund no: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  async updateRefundRecord(id: string, data: UpdateRefundRecordDto): Promise<RefundRecord> {
    try {
      const updateData: Record<string, any> = {};
      if (data.status !== undefined) updateData.status = data.status;
      if (data.third_party_refund_id !== undefined) updateData.third_party_refund_id = data.third_party_refund_id;
      if (data.refunded_at !== undefined) updateData.refunded_at = data.refunded_at;

      const { data: updated, error } = await this.client
        .from('refund_records')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundError('RefundRecord', id);
        }
        throw new DataAccessError(`Failed to update refund record: ${error.message}`, 'UPDATE_ERROR', error);
      }

      if (!updated) {
        throw new NotFoundError('RefundRecord', id);
      }

      return this.mapToRefundRecord(updated);
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof DataAccessError) {
        throw error;
      }
      throw new DataAccessError(`Unexpected error updating refund record: ${error}`, 'UNEXPECTED_ERROR', error as Error);
    }
  }

  private mapToPaymentOrder(data: any): PaymentOrder {
    return {
      id: data.id,
      user_id: data.user_id,
      order_no: data.order_no,
      order_type: data.order_type,
      amount: Number(data.amount),
      currency: data.currency,
      payment_channel: data.payment_channel,
      payment_method: data.payment_method,
      status: data.status,
      expires_at: data.expires_at,
      third_party_order_id: data.third_party_order_id,
      third_party_transaction_id: data.third_party_transaction_id,
      payment_url: data.payment_url,
      qr_code_data_url: data.qr_code_data_url,
      payment_params: data.payment_params || {},
      description: data.description,
      metadata: data.metadata || {},
      callback_data: data.callback_data || {},
      callback_received_at: data.callback_received_at,
      paid_at: data.paid_at,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  private mapToPaymentRecord(data: any): PaymentRecord {
    return {
      id: data.id,
      order_id: data.order_id,
      user_id: data.user_id,
      record_type: data.record_type,
      amount: Number(data.amount),
      details: data.details || {},
      created_at: data.created_at,
    };
  }

  private mapToRefundRecord(data: any): RefundRecord {
    return {
      id: data.id,
      order_id: data.order_id,
      refund_no: data.refund_no,
      refund_amount: Number(data.refund_amount),
      refund_reason: data.refund_reason,
      status: data.status,
      third_party_refund_id: data.third_party_refund_id,
      refunded_at: data.refunded_at,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }
}

