import { Router, Request, Response } from 'express';
import { param } from 'express-validator';
import { GatewayFactory } from '../payment/providers/gateway.factory';
import { PaymentService } from '../payment/payment.service';
import { PaymentChannel } from '../common/dto/payment.dto';
import { ApiResponseDto } from '../common/dto/common.dto';
import { validate } from '../common/middleware/validation.middleware';
import { ListenerFactory } from '../payment/listeners/listener.factory';
import { AlchemyListenerService } from '../payment/listeners/alchemy-listener.service';
import { InfuraListenerService } from '../payment/listeners/infura-listener.service';

export function createWebhookRoutes(gatewayFactory: GatewayFactory, paymentService: PaymentService): Router {
  const router = Router({ mergeParams: true });

  /**
   * @swagger
   * /payment/webhook/{channel}:
   *   post:
   *     summary: 支付回调入口
   *     description: 各支付通道的统一回调入口
   *     tags:
   *       - 支付
   *     parameters:
   *       - in: path
   *         name: channel
   *         required: true
   *         schema:
   *           type: string
   *           enum: [alipay, wechat, paypal, card, crypto]
   *     responses:
   *       200:
   *         description: 回调处理成功
   */
  router.post(
    '/:channel',
    [
      param('channel').isIn([
        PaymentChannel.ALIPAY,
        PaymentChannel.WECHAT,
        PaymentChannel.PAYPAL,
        PaymentChannel.CARD,
        PaymentChannel.CRYPTO,
      ]).withMessage('无效的支付通道'),
      validate,
    ],
    async (req: Request, res: Response) => {
      try {
        const channel = req.params.channel as PaymentChannel;
        
        // 如果是 crypto 渠道，检查是否是第三方监听服务的回调
        if (channel === PaymentChannel.CRYPTO) {
          const listenerType = ListenerFactory.getType();
          
          // Alchemy 或 Infura 的 webhook 回调
          if (listenerType === 'alchemy' || listenerType === 'infura') {
            let listener: AlchemyListenerService | InfuraListenerService;
            
            if (listenerType === 'alchemy') {
              listener = new AlchemyListenerService(paymentService);
              await listener.handleWebhook(req.body);
            } else {
              listener = new InfuraListenerService(paymentService);
              await listener.handleWebhook(req.body);
            }
            
            // 第三方服务已经处理了订单匹配和入账，这里直接返回成功
            return res.json(ApiResponseDto.success({ processed: true }, '回调处理成功'));
          }
        }

        // 其他情况使用网关处理（本地监听或手动触发）
        const gateway = gatewayFactory.get(channel);
        const result = await gateway.handleWebhook(req.headers, req.body);

        // 如果是 crypto 渠道且处理成功，更新支付订单状态并触发钱包入账
        if (channel === PaymentChannel.CRYPTO && result.status === 'success') {
          const orderId = result.orderId;
          if (orderId && orderId !== 'unknown') {
            try {
              // 通过 orderId 查找支付订单
              const payment = await paymentService.getPaymentOrder(orderId);
              // 标记支付成功并触发钱包入账
              await paymentService.markPaymentSuccess(payment.id, result.raw || {});
            } catch (error: any) {
              console.error(`更新支付订单状态失败: ${error.message}`, error);
              // 不阻断 webhook 响应，但记录错误
            }
          }
        }

        res.json(ApiResponseDto.success(result, '回调处理成功'));
      } catch (error: any) {
        res.status(400).json(ApiResponseDto.error(error.message || '回调处理失败', 400));
      }
    }
  );

  return router;
}

