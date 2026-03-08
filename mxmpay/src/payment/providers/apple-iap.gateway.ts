import {
  PaymentGateway,
  GatewayCreateParams,
  GatewayCreateResult,
  GatewayQueryResult,
  GatewayRefundParams,
  GatewayRefundResult,
} from './payment-gateway.interface';

/**
 * Apple In-App Purchase 支付网关（占位）
 * 流程：客户端创建订单 → StoreKit 购买 → 服务端 iap/verify 校验收据 → 入账
 */
export class AppleIapGateway implements PaymentGateway {
  readonly name = 'apple_iap';

  async create(params: GatewayCreateParams): Promise<GatewayCreateResult> {
    // IAP 不生成支付链接，由客户端完成 StoreKit 购买后调用 iap/verify
    return {
      orderId: params.orderId,
      status: 'pending',
      raw: { productId: params.metadata?.productId },
    };
  }

  async query(orderId: string): Promise<GatewayQueryResult> {
    return {
      orderId,
      status: 'pending',
      raw: { mocked: true },
    };
  }

  async refund(params: GatewayRefundParams): Promise<GatewayRefundResult> {
    return {
      orderId: params.orderId,
      status: 'failed',
      raw: { message: 'Apple IAP 退款需通过 App Store 处理' },
    };
  }

  async handleWebhook(headers: Record<string, any>, body: any): Promise<GatewayQueryResult> {
    return {
      orderId: body?.orderId || 'unknown',
      status: 'pending',
      raw: body,
    };
  }
}
