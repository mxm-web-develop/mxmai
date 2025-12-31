export type GatewayCreateParams = {
  orderId: string;
  amount: number;
  currency: string;
  description?: string;
  metadata?: Record<string, any>;
};

export type GatewayCreateResult = {
  orderId: string;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'cancelled';
  clientSecret?: string; // 前端用到的密钥/二维码/跳转链接
  qrCodeUrl?: string;
  paymentUrl?: string;
  raw?: any;
};

export type GatewayQueryResult = {
  orderId: string;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'cancelled';
  raw?: any;
};

export type GatewayRefundParams = {
  orderId: string;
  amount?: number;
  reason?: string;
};

export type GatewayRefundResult = {
  orderId: string;
  status: 'success' | 'failed';
  raw?: any;
};

export interface PaymentGateway {
  readonly name: string;
  create(params: GatewayCreateParams): Promise<GatewayCreateResult>;
  query(orderId: string): Promise<GatewayQueryResult>;
  refund(params: GatewayRefundParams): Promise<GatewayRefundResult>;
  handleWebhook(headers: Record<string, any>, body: any): Promise<GatewayQueryResult>;
}

