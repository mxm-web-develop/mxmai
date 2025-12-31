import {
  PaymentGateway,
  GatewayCreateParams,
  GatewayCreateResult,
  GatewayQueryResult,
  GatewayRefundParams,
  GatewayRefundResult,
} from './payment-gateway.interface';

export class WechatGateway implements PaymentGateway {
  readonly name = 'wechat';

  async create(params: GatewayCreateParams): Promise<GatewayCreateResult> {
    return {
      orderId: params.orderId,
      status: 'pending',
      qrCodeUrl: `weixin://wxpay/bizpayurl?pr=${encodeURIComponent(params.orderId)}`,
      raw: { mocked: true },
    };
  }

  async query(orderId: string): Promise<GatewayQueryResult> {
    return { orderId, status: 'processing', raw: { mocked: true } };
  }

  async refund(params: GatewayRefundParams): Promise<GatewayRefundResult> {
    return { orderId: params.orderId, status: 'success', raw: { mocked: true } };
  }

  async handleWebhook(headers: Record<string, any>, body: any): Promise<GatewayQueryResult> {
    return { orderId: body?.out_trade_no ?? 'unknown', status: 'success', raw: { headers, body } };
  }
}

