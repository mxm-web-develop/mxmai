import { Router, Request, Response } from 'express';
import { body, query, param } from 'express-validator';
import { PaymentService } from '../payment/payment.service';
import { ApiResponseDto } from '../common/dto/common.dto';
import { PaymentStatus, PaymentMethod, PaymentChannel } from '../common/dto/payment.dto';
import { validate } from '../common/middleware/validation.middleware';
import { adminMiddleware, AdminRequest } from '../common/middleware/admin.middleware';

export function createPaymentRoutes(paymentService: PaymentService): Router {
  const router = Router();

  /**
   * @swagger
   * /payment/create:
   *   post:
   *     summary: 创建支付订单
   *     description: 创建新的支付订单，返回订单信息
   *     tags:
   *       - 支付
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - amount
   *               - currency
   *               - channel
   *               - toAddress
   *             properties:
   *               amount:
   *                 type: number
   *                 minimum: 0.01
   *                 example: 100.5
   *               currency:
   *                 type: string
   *                 enum: [eth, usdt, usdc, btc]
   *                 example: usdt
   *               channel:
   *                 type: string
   *                 enum: [alipay, wechat, paypal, card, crypto]
   *                 example: alipay
   *               toAddress:
   *                 type: string
   *                 minLength: 42
   *                 maxLength: 64
   *                 example: 0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6
   *               description:
   *                 type: string
   *                 example: 购买商品服务
   *               orderId:
   *                 type: string
   *                 example: PAY202408160001
   *     responses:
   *       201:
   *         description: 订单创建成功
   *       400:
   *         description: 请求参数错误
   */
  router.post(
    '/create',
    [
      body('amount').isFloat({ min: 0.01 }).withMessage('金额必须大于等于 0.01'),
      body('currency')
        .custom((value, { req }) => {
          const channel = req.body.channel;
          // 对于 voucher / apple_iap 渠道，允许 CNY 和 USD
          if (channel === PaymentChannel.VOUCHER || channel === PaymentChannel.APPLE_IAP) {
            if (value !== PaymentMethod.CNY && value !== PaymentMethod.USD) {
              throw new Error(`${channel} 渠道的 currency 必须是 cny 或 usd`);
            }
            return true;
          }
          // 对于其他渠道，使用原有的验证
          const validCurrencies = [PaymentMethod.ETH, PaymentMethod.USDT, PaymentMethod.USDC, PaymentMethod.BTC];
          if (!validCurrencies.includes(value)) {
            throw new Error('无效的支付货币');
          }
          return true;
        }),
      body('channel').isIn([PaymentChannel.ALIPAY, PaymentChannel.WECHAT, PaymentChannel.PAYPAL, PaymentChannel.CARD, PaymentChannel.CRYPTO, PaymentChannel.VOUCHER, PaymentChannel.APPLE_IAP])
        .withMessage('无效的支付通道'),
      // 对于 crypto 渠道，toAddress 是可选的（会从环境变量获取）
      // 对于其他渠道，toAddress 是必需的
      body('toAddress')
        .optional()
        .custom((value, { req }) => {
          const channel = req.body.channel;
          // 如果是 crypto、voucher 或 apple_iap 渠道，toAddress 可以为空
          if (channel === PaymentChannel.CRYPTO || channel === PaymentChannel.VOUCHER || channel === PaymentChannel.APPLE_IAP) {
            return true;
          }
          // 其他渠道需要 toAddress
          if (!value || value.trim().length === 0) {
            throw new Error('收款地址不能为空');
          }
          return true;
        }),
      body('description').optional().isString(),
      body('orderId').optional().isString(),
      body('userId').optional().isString(),
      body('asset_code').optional().isString(),
      body('biz_type').optional().isString(),
      body('biz_id').optional().isString(),
      validate,
    ],
    async (req: Request, res: Response) => {
      try {
        // 从 header 或 body 获取 userId
        const userId = req.headers['x-user-id'] as string || req.body.userId;
        const createDto = {
          ...req.body,
          userId,
          assetCode: req.body.asset_code,
        };
        const order = await paymentService.createPayment(createDto);
        res.status(201).json(ApiResponseDto.success(order, '支付订单创建成功'));
      } catch (error: any) {
        res.status(400).json(ApiResponseDto.error(error.message || '创建订单失败', 400));
      }
    }
  );

  /**
   * Apple IAP 收据校验与入账
   * POST /payment/iap/verify
   * Body: { orderId, receipt, productId? }
   */
  router.post(
    '/iap/verify',
    [
      body('orderId').isString().notEmpty().withMessage('orderId 不能为空'),
      body('receipt').isString().notEmpty().withMessage('receipt 不能为空'),
      body('productId').optional().isString(),
      validate,
    ],
    async (req: Request, res: Response) => {
      try {
        const userId = req.headers['x-user-id'] as string || req.body.userId;
        if (!userId) {
          return res.status(401).json(ApiResponseDto.error('缺少 x-user-id 或 userId', 401));
        }
        const order = await paymentService.verifyIapReceipt(
          req.body.orderId,
          req.body.receipt,
          req.body.productId,
        );
        res.json(ApiResponseDto.success(order, 'IAP 校验成功，已入账'));
      } catch (error: any) {
        res.status(400).json(ApiResponseDto.error(error.message || 'IAP 校验失败', 400));
      }
    }
  );

  /**
   * @swagger
   * /payment/{orderId}:
   *   get:
   *     summary: 获取支付订单详情
   *     description: 根据订单ID获取订单的详细信息
   *     tags:
   *       - 支付
   *     parameters:
   *       - in: path
   *         name: orderId
   *         required: true
   *         schema:
   *           type: string
   *         example: 507f1f77bcf86cd799439011
   *     responses:
   *       200:
   *         description: 获取成功
   *       404:
   *         description: 订单不存在
   */
  router.get(
    '/:orderId',
    [
      param('orderId').isString().notEmpty().withMessage('订单ID不能为空'),
      validate,
    ],
    async (req: Request, res: Response) => {
      try {
        const order = await paymentService.getPaymentOrder(req.params.orderId);
        res.json(ApiResponseDto.success(order, '获取订单成功'));
      } catch (error: any) {
        res.status(404).json(ApiResponseDto.error(error.message || '订单不存在', 404));
      }
    }
  );

  /**
   * @swagger
   * /payment:
   *   get:
   *     summary: 查询支付订单列表
   *     description: 分页查询支付订单，支持状态和货币筛选
   *     tags:
   *       - 支付
   *     parameters:
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [pending, processing, success, failed, cancelled, expired]
   *       - in: query
   *         name: currency
   *         schema:
   *           type: string
   *           enum: [eth, usdt, usdc, btc]
   *       - in: query
   *         name: channel
   *         schema:
   *           type: string
   *           enum: [alipay, wechat, paypal, card, crypto]
   *       - in: query
   *         name: orderId
   *         schema:
   *           type: string
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           minimum: 1
   *           default: 1
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           default: 10
   *     responses:
   *       200:
   *         description: 查询成功
   */
  router.get(
    '/',
    [
      query('status').optional().isIn([
        PaymentStatus.PENDING,
        PaymentStatus.PROCESSING,
        PaymentStatus.SUCCESS,
        PaymentStatus.FAILED,
        PaymentStatus.CANCELLED,
        PaymentStatus.EXPIRED,
      ]),
      query('currency').optional().isIn([PaymentMethod.ETH, PaymentMethod.USDT, PaymentMethod.USDC, PaymentMethod.BTC]),
      query('channel').optional().isIn([PaymentChannel.ALIPAY, PaymentChannel.WECHAT, PaymentChannel.PAYPAL, PaymentChannel.CARD, PaymentChannel.CRYPTO, PaymentChannel.VOUCHER]),
      query('orderId').optional().isString(),
      query('page').optional().isInt({ min: 1 }).withMessage('页码必须大于等于 1'),
      query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须在 1-100 之间'),
      validate,
    ],
    async (req: Request, res: Response) => {
      try {
        // 从 header 获取 userId（Gateway 会传递）
        const userId = req.headers['x-user-id'] as string;
        const { items, total, page, limit } = await paymentService.getPaymentOrders(
          req.query,
          { page: Number(req.query.page) || 1, limit: Number(req.query.limit) || 10 },
          userId, // 只查询当前用户的订单
        );
        res.json(ApiResponseDto.success(
          {
            items,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
          },
          '查询订单列表成功'
        ));
      } catch (error: any) {
        res.status(400).json(ApiResponseDto.error(error.message || '查询失败', 400));
      }
    }
  );

  /**
   * @swagger
   * /payment/admin/orders:
   *   get:
   *     summary: 管理员：查询所有订单
   *     description: 管理员权限，查询所有用户的支付订单，支持分页和筛选
   *     tags:
   *       - 支付
   *       - 管理员
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [pending, processing, success, failed, cancelled, expired]
   *       - in: query
   *         name: currency
   *         schema:
   *           type: string
   *           enum: [eth, usdt, usdc, btc]
   *       - in: query
   *         name: channel
   *         schema:
   *           type: string
   *           enum: [alipay, wechat, paypal, card, crypto]
   *       - in: query
   *         name: orderId
   *         schema:
   *           type: string
   *       - in: query
   *         name: userId
   *         schema:
   *           type: string
   *         description: 可选，筛选特定用户的订单
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           minimum: 1
   *           default: 1
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           default: 10
   *     responses:
   *       200:
   *         description: 查询成功
   *       403:
   *         description: 权限不足，需要管理员权限
   */
  router.get(
    '/admin/orders',
    [
      query('status').optional().isIn([
        PaymentStatus.PENDING,
        PaymentStatus.PROCESSING,
        PaymentStatus.SUCCESS,
        PaymentStatus.FAILED,
        PaymentStatus.CANCELLED,
        PaymentStatus.EXPIRED,
      ]),
      query('currency').optional().isIn([PaymentMethod.ETH, PaymentMethod.USDT, PaymentMethod.USDC, PaymentMethod.BTC]),
      query('channel').optional().isIn([PaymentChannel.ALIPAY, PaymentChannel.WECHAT, PaymentChannel.PAYPAL, PaymentChannel.CARD, PaymentChannel.CRYPTO, PaymentChannel.VOUCHER]),
      query('orderId').optional().isString(),
      query('userId').optional().isString(),
      query('page').optional().isInt({ min: 1 }).withMessage('页码必须大于等于 1'),
      query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须在 1-100 之间'),
      validate,
      adminMiddleware,
    ],
    async (req: AdminRequest, res: Response) => {
      try {
        const queryParams = req.query as any;
        // 如果提供了 userId 参数，筛选特定用户的订单
        const userId = queryParams.userId || undefined;
        
        const { items, total, page, limit } = await paymentService.getAllPaymentOrders(
          queryParams,
          { page: Number(req.query.page) || 1, limit: Number(req.query.limit) || 10 }
        );
        
        res.json(ApiResponseDto.success(
          {
            items,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
          },
          '查询所有订单成功'
        ));
      } catch (error: any) {
        res.status(400).json(ApiResponseDto.error(error.message || '查询失败', 400));
      }
    }
  );

  /**
   * @swagger
   * /payment/confirm:
   *   post:
   *     summary: 确认支付
   *     description: 确认区块链交易，更新订单状态为成功
   *     tags:
   *       - 支付
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - orderId
   *               - txHash
   *             properties:
   *               orderId:
   *                 type: string
   *                 example: 507f1f77bcf86cd799439011
   *               txHash:
   *                 type: string
   *                 example: 0x1234567890abcdef...
   *               blockNumber:
   *                 type: number
   *                 example: 12345678
   *     responses:
   *       200:
   *         description: 确认成功
   *       400:
   *         description: 请求参数错误
   *       404:
   *         description: 订单不存在
   */
  router.post(
    '/confirm',
    [
      body('orderId').isString().notEmpty().withMessage('订单ID不能为空'),
      body('txHash').isString().notEmpty().withMessage('交易哈希不能为空'),
      body('blockNumber').optional().isInt({ min: 0 }),
      validate,
    ],
    async (req: Request, res: Response) => {
      try {
        const order = await paymentService.confirmPayment(req.body);
        res.json(ApiResponseDto.success(order, '支付确认成功'));
      } catch (error: any) {
        const status = error.message.includes('不存在') ? 404 : 400;
        res.status(status).json(ApiResponseDto.error(error.message || '确认支付失败', status));
      }
    }
  );

  /**
   * @swagger
   * /payment/{orderId}/cancel:
   *   post:
   *     summary: 取消支付订单
   *     description: 取消待处理的支付订单
   *     tags:
   *       - 支付
   *     parameters:
   *       - in: path
   *         name: orderId
   *         required: true
   *         schema:
   *           type: string
   *         example: 507f1f77bcf86cd799439011
   *     responses:
   *       200:
   *         description: 取消成功
   *       400:
   *         description: 订单状态不允许取消
   *       404:
   *         description: 订单不存在
   */
  router.post(
    '/:orderId/cancel',
    [
      param('orderId').isString().notEmpty().withMessage('订单ID不能为空'),
      validate,
    ],
    async (req: Request, res: Response) => {
      try {
        const order = await paymentService.cancelPayment(req.params.orderId);
        res.json(ApiResponseDto.success(order, '订单取消成功'));
      } catch (error: any) {
        const status = error.message.includes('不存在') ? 404 : 400;
        res.status(status).json(ApiResponseDto.error(error.message || '取消订单失败', status));
      }
    }
  );

  /**
   * @swagger
   * /payment/stats/overview:
   *   get:
   *     summary: 获取支付统计信息
   *     description: 获取支付总金额、订单数量等统计信息
   *     tags:
   *       - 支付
   *     responses:
   *       200:
   *         description: 获取成功
   */
  router.get('/stats/overview', async (req: Request, res: Response) => {
    try {
      // 从 header 获取 userId（Gateway 会传递）
      const userId = req.headers['x-user-id'] as string;
      const stats = await paymentService.getPaymentStats(userId);
      res.json(ApiResponseDto.success(stats, '获取统计信息成功'));
    } catch (error: any) {
      res.status(400).json(ApiResponseDto.error(error.message || '获取统计信息失败', 400));
    }
  });

  /**
   * @swagger
   * /payment/admin/voucher/issue:
   *   post:
   *     summary: 管理员：发放代金券
   *     description: 管理员权限，向指定用户发放代金券，代金券会直接入账到用户钱包
   *     tags:
   *       - 支付
   *       - 管理员
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - userId
   *               - amount
   *               - assetCode
   *             properties:
   *               userId:
   *                 type: string
   *                 description: 用户ID
   *                 example: user123
   *               amount:
   *                 type: number
   *                 description: 代金券金额
   *                 example: 100.00
   *               assetCode:
   *                 type: string
   *                 description: 代金券资产代码 (VOUCHER-CNY 或 VOUCHER-USD)
   *                 example: VOUCHER-CNY
   *               description:
   *                 type: string
   *                 description: 代金券描述
   *                 example: 活动奖励代金券
   *               bizType:
   *                 type: string
   *                 description: 业务类型
   *                 example: promotion
   *               bizId:
   *                 type: string
   *                 description: 业务ID
   *                 example: promo_001
   *     responses:
   *       201:
   *         description: 发放成功
   *       400:
   *         description: 参数错误
   *       403:
   *         description: 权限不足，需要管理员权限
   */
  router.post(
    '/admin/voucher/issue',
    [
      body('userId').isString().notEmpty().withMessage('用户ID不能为空'),
      body('amount').isFloat({ min: 0.01 }).withMessage('金额必须大于0'),
      body('assetCode').isIn(['VOUCHER-CNY', 'VOUCHER-USD']).withMessage('资产代码必须是 VOUCHER-CNY 或 VOUCHER-USD'),
      body('description').optional().isString(),
      body('bizType').optional().isString(),
      body('bizId').optional().isString(),
      validate,
      adminMiddleware,
    ],
    async (req: AdminRequest, res: Response) => {
      try {
        const { userId, amount, assetCode, description, bizType, bizId } = req.body;

        // 代金券发放是充值操作，直接调用钱包服务
        // 注意：这里需要从 paymentService 获取 walletTaskService
        // 为了简化，我们直接通过 paymentService 创建一个充值订单
        const orderId = `VOUCHER${Date.now()}`;
        
        // 根据资产代码确定货币类型
        const currency = assetCode === 'VOUCHER-CNY' ? PaymentMethod.CNY : PaymentMethod.USD;
        
        // 创建代金券充值订单（作为记录）
        const paymentOrder = await paymentService.createPayment({
          amount,
          currency,
          channel: PaymentChannel.VOUCHER,
          toAddress: '',
          description: description || '代金券发放',
          orderId,
          userId,
          assetCode,
          bizType: bizType || 'voucher_issue',
          bizId: bizId || orderId,
        });

        // 代金券发放时，订单状态应该是 success（因为已经直接入账）
        // 这个逻辑在 createPayment 中已经处理了（voucher 渠道会自动完成支付）

        res.status(201).json(ApiResponseDto.success(paymentOrder, '代金券发放成功'));
      } catch (error: any) {
        res.status(400).json(ApiResponseDto.error(error.message || '代金券发放失败', 400));
      }
    }
  );

  return router;
}

