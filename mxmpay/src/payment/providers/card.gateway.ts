import {
  PaymentGateway,
  GatewayCreateParams,
  GatewayCreateResult,
  GatewayQueryResult,
  GatewayRefundParams,
  GatewayRefundResult,
} from './payment-gateway.interface';

// 建议未来接 Stripe/Adyen 等，此处为占位实现
export class CardGateway implements PaymentGateway {
  readonly name = 'card';

  async create(params: GatewayCreateParams): Promise<GatewayCreateResult> {
    return {
      orderId: params.orderId,
      status: 'pending',
      clientSecret: `mock_client_secret_${params.orderId}`,
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
    return { orderId: body?.data?.object?.id ?? 'unknown', status: 'success', raw: { headers, body } };
  }
}

