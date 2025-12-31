import {
  PaymentGateway,
  GatewayCreateParams,
  GatewayCreateResult,
  GatewayQueryResult,
  GatewayRefundParams,
  GatewayRefundResult,
} from './payment-gateway.interface';

export class PaypalGateway implements PaymentGateway {
  readonly name = 'paypal';

  async create(params: GatewayCreateParams): Promise<GatewayCreateResult> {
    return {
      orderId: params.orderId,
      status: 'pending',
      paymentUrl: `https://www.paypal.com/checkoutnow?token=${encodeURIComponent(
        params.orderId,
      )}`,
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
    return { orderId: body?.resource?.id ?? 'unknown', status: 'success', raw: { headers, body } };
  }
}

