import { Router, Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import { WalletService } from '../wallet/wallet.service';
import { WalletTaskService } from '../wallet/wallet-task.service';
import { ApiResponseDto } from '../common/dto/common.dto';
import { validate } from '../common/middleware/validation.middleware';

function resolveUserId(req: Request): string | null {
  return (
    (req.headers['x-user-id'] as string) ||
    (req.query.userId as string) ||
    (req.body?.userId as string) ||
    null
  );
}

export function createWalletRoutes(walletService: WalletService, walletTaskService: WalletTaskService): Router {
  const router = Router();

  router.get('/assets', async (_req: Request, res: Response) => {
    const assets = await walletService.listAssets();
    res.json(ApiResponseDto.success(assets, '获取资产配置成功'));
  });

  router.get(
    '/',
    [
      query('userId').optional().isString(),
      validate,
    ],
    async (req: Request, res: Response) => {
      const userId = resolveUserId(req);
      if (!userId) {
        return res.status(400).json(ApiResponseDto.error('缺少用户标识 (userId 或 x-user-id)', 400));
      }
      const wallets = await walletService.getWallets(userId);
      res.json(ApiResponseDto.success(wallets, '获取钱包列表成功'));
    }
  );

  router.get(
    '/:assetCode',
    [
      param('assetCode').isString().notEmpty(),
      query('userId').optional().isString(),
      validate,
    ],
    async (req: Request, res: Response) => {
      const userId = resolveUserId(req);
      if (!userId) {
        return res.status(400).json(ApiResponseDto.error('缺少用户标识', 400));
      }
      const wallet = await walletService.getWallet(userId, req.params.assetCode);
      if (!wallet) {
        return res.status(404).json(ApiResponseDto.error('钱包不存在', 404));
      }
      res.json(ApiResponseDto.success(wallet, '获取钱包详情成功'));
    }
  );

  router.get(
    '/:assetCode/transactions',
    [
      param('assetCode').isString().notEmpty(),
      query('limit').optional().isInt({ min: 1, max: 100 }),
      query('userId').optional().isString(),
      validate,
    ],
    async (req: Request, res: Response) => {
      const userId = resolveUserId(req);
      if (!userId) {
        return res.status(400).json(ApiResponseDto.error('缺少用户标识', 400));
      }
      const limit = Number(req.query.limit) || 20;
      const txs = await walletService.getTransactions(userId, req.params.assetCode, limit);
      res.json(ApiResponseDto.success(txs, '获取交易记录成功'));
    }
  );

  router.post(
    '/:assetCode/deposit',
    [
      param('assetCode').isString().notEmpty(),
      body('amount').isString().notEmpty().withMessage('amount 不能为空'),
      body('referenceId').optional().isString(),
      body('metadata').optional().isObject(),
      body('bizTag').optional().isString(),
      body('userId').optional().isString(),
      validate,
    ],
    async (req: Request, res: Response) => {
      try {
        const userId = resolveUserId(req);
        if (!userId) {
          return res.status(400).json(ApiResponseDto.error('缺少用户标识', 400));
        }
        const wallet = await walletService.deposit(userId, req.params.assetCode, req.body.amount, req.body);
        res.status(201).json(ApiResponseDto.success(wallet, '充值成功'));
      } catch (error: any) {
        res.status(400).json(ApiResponseDto.error(error.message || '充值失败', 400));
      }
    }
  );

  router.post(
    '/:assetCode/withdraw',
    [
      param('assetCode').isString().notEmpty(),
      body('amount').isString().notEmpty(),
      body('referenceId').optional().isString(),
      body('metadata').optional().isObject(),
      body('bizTag').optional().isString(),
      body('userId').optional().isString(),
      validate,
    ],
    async (req: Request, res: Response) => {
      try {
        const userId = resolveUserId(req);
        if (!userId) {
          return res.status(400).json(ApiResponseDto.error('缺少用户标识', 400));
        }
        const wallet = await walletService.withdraw(userId, req.params.assetCode, req.body.amount, req.body);
        res.json(ApiResponseDto.success(wallet, '扣款成功'));
      } catch (error: any) {
        const status = error.message.includes('余额不足') ? 422 : 400;
        res.status(status).json(ApiResponseDto.error(error.message || '扣款失败', status));
      }
    }
  );

  /**
   * 钱包支付（消费）
   */
  router.post(
    '/payment',
    [
      body('asset_code').isString().notEmpty().withMessage('资产代码不能为空'),
      body('price').isString().notEmpty().withMessage('价格不能为空'),
      body('biz_type').optional().isString(),
      body('biz_id').optional().isString(),
      body('description').optional().isString(),
      body('userId').optional().isString(),
      validate,
    ],
    async (req: Request, res: Response) => {
      try {
        const userId = resolveUserId(req);
        if (!userId) {
          return res.status(400).json(ApiResponseDto.error('缺少用户标识', 400));
        }
        const task = await walletTaskService.createPaymentTaskAndApply({
          userId,
          assetCode: req.body.asset_code,
          amount: req.body.price,
          bizType: req.body.biz_type,
          bizId: req.body.biz_id,
          metadata: req.body.description ? { description: req.body.description } : undefined,
        });
        const wallet = await walletService.getWallet(userId, req.body.asset_code);
        res.status(201).json(ApiResponseDto.success(
          {
            task,
            wallet,
          },
          '支付成功'
        ));
      } catch (error: any) {
        const status = error.message.includes('余额不足') ? 422 : 400;
        res.status(status).json(ApiResponseDto.error(error.message || '支付失败', status));
      }
    }
  );

  /**
   * 查询任务列表
   */
  router.get(
    '/tasks',
    [
      query('userId').optional().isString(),
      query('type').optional().isIn(['deposit', 'payment']),
      query('status').optional().isIn(['pending', 'success', 'failed']),
      query('asset_code').optional().isString(),
      query('channel').optional().isString(),
      query('page').optional().isInt({ min: 1 }),
      query('limit').optional().isInt({ min: 1, max: 100 }),
      validate,
    ],
    async (req: Request, res: Response) => {
      try {
        const userId = resolveUserId(req);
        if (!userId) {
          return res.status(400).json(ApiResponseDto.error('缺少用户标识', 400));
        }
        const result = await walletTaskService.listTasks(
          userId,
          {
            type: req.query.type as any,
            status: req.query.status as any,
            assetCode: req.query.asset_code as string,
            channel: req.query.channel as any,
          },
          {
            page: Number(req.query.page) || 1,
            limit: Number(req.query.limit) || 20,
          }
        );
        res.json(ApiResponseDto.success(result, '获取任务列表成功'));
      } catch (error: any) {
        res.status(400).json(ApiResponseDto.error(error.message || '查询失败', 400));
      }
    }
  );

  return router;
}

