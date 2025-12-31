import {
  PaymentGateway,
  GatewayCreateParams,
  GatewayCreateResult,
  GatewayQueryResult,
  GatewayRefundParams,
  GatewayRefundResult,
} from './payment-gateway.interface';

/**
 * 代金券支付网关
 * 代金券支付直接从用户钱包扣除，不需要外部支付流程
 */
export class VoucherGateway implements PaymentGateway {
  readonly name = 'voucher';

  async create(params: GatewayCreateParams): Promise<GatewayCreateResult> {
    // 代金券支付不需要创建外部支付链接
    // 支付会直接从钱包扣除，在 PaymentService 中处理
    return {
      orderId: params.orderId,
      status: 'pending',
      paymentUrl: '',
      qrCodeUrl: '',
      raw: {
        assetCode: params.metadata?.assetCode || 'VOUCHER-CNY',
        amount: params.amount,
      },
    };
  }

  async query(orderId: string): Promise<GatewayQueryResult> {
    // 代金券支付状态由 PaymentService 直接管理
    return {
      orderId,
      status: 'processing',
      raw: { mocked: true },
    };
  }

  async refund(params: GatewayRefundParams): Promise<GatewayRefundResult> {
    // 代金券支付不支持退款，只能反向转账
    return {
      orderId: params.orderId,
      status: 'failed',
      raw: { message: '代金券支付不支持退款' },
    };
  }

  async handleWebhook(headers: Record<string, any>, body: any): Promise<GatewayQueryResult> {
    // 代金券支付不需要 webhook
    return {
      orderId: body?.orderId || 'unknown',
      status: 'success',
      raw: body,
    };
  }
}

