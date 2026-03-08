import { PaymentChannel } from '../../common/dto/payment.dto';
import { PaymentGateway } from './payment-gateway.interface';
import { AlipayGateway } from './alipay.gateway';
import { WechatGateway } from './wechat.gateway';
import { PaypalGateway } from './paypal.gateway';
import { CardGateway } from './card.gateway';
import { CryptoGateway } from './crypto.gateway';
import { VoucherGateway } from './voucher.gateway';
import { AppleIapGateway } from './apple-iap.gateway';

export class GatewayFactory {
  private readonly gateways: Record<string, PaymentGateway>;

  constructor() {
    this.gateways = {
      [PaymentChannel.ALIPAY]: new AlipayGateway(),
      [PaymentChannel.WECHAT]: new WechatGateway(),
      [PaymentChannel.PAYPAL]: new PaypalGateway(),
      [PaymentChannel.CARD]: new CardGateway(),
      [PaymentChannel.CRYPTO]: new CryptoGateway(),
      [PaymentChannel.VOUCHER]: new VoucherGateway(),
      [PaymentChannel.APPLE_IAP]: new AppleIapGateway(),
    };
  }

  get(channel: PaymentChannel): PaymentGateway {
    const gw = this.gateways[channel];
    if (!gw) {
      throw new Error(`Unsupported payment channel: ${channel}`);
    }
    return gw;
  }
}

