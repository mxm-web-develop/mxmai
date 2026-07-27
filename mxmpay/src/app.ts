import express, { Express } from 'express';
import cors from 'cors';
import { RepositoryFactory, loadDataConfig } from '@mxmai/mxmdata';
import { PaymentService } from './payment/payment.service';
import { GatewayFactory } from './payment/providers/gateway.factory';
import { createPaymentRoutes } from './api/payment.routes';
import { createWebhookRoutes } from './api/webhook.routes';
import { WalletService } from './wallet/wallet.service';
import { WalletTaskService } from './wallet/wallet-task.service';
import { createWalletRoutes } from './api/wallet.routes';
import { ListenerFactory } from './payment/listeners/listener.factory';
import { IdempotencyMiddleware } from './common/middleware/idempotency.middleware';
import { setupSwagger } from './config/swagger';
import { PaymentExpirationScheduler } from './payment/payment.expiration.scheduler';
export async function createApp(): Promise<Express> {
  // 初始化 mxmdata
  try {
    const config = loadDataConfig();
    RepositoryFactory.init(config);
    console.log('✅ mxmdata 初始化成功');
  } catch (error) {
    console.error('❌ mxmdata 初始化失败:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // 初始化 repository
  const paymentRepo = RepositoryFactory.createPaymentRepository();
  const walletRepo = RepositoryFactory.createWalletRepository();

  // 初始化服务
  const walletService = new WalletService(walletRepo);
  const walletTaskService = new WalletTaskService(walletRepo, walletService);
  const paymentService = new PaymentService(paymentRepo, walletTaskService);
  const gatewayFactory = new GatewayFactory();

  // 创建 Express 应用
  const app = express();

  // 中间件
  // CORS 配置：仅允许来自 Gateway 的请求（内部服务访问）
  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  }));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // 幂等性中间件
  const idempotencyMiddleware = new IdempotencyMiddleware();
  app.use(idempotencyMiddleware.middleware());

  // Swagger 文档
  setupSwagger(app);

  // 路由
  app.get('/', (req, res) => {
    res.json({
      message: 'Web3 支付系统 API',
      version: '1.0.0',
      docs: '/api',
    });
  });

  // 确保默认资产存在（如果 Supabase 连接失败，不阻止应用启动）
  try {
    await walletService.ensureDefaultAssets();
    console.log('✅ 默认资产检查完成');
  } catch (error) {
    console.error('⚠️  默认资产检查失败（应用将继续运行）:', error instanceof Error ? error.message : error);
    // 不阻止应用启动，允许应用继续运行
    // 这样即使 Supabase 暂时不可用，应用也能启动，后续可以重试
  }

  const paymentRouter = createPaymentRoutes(paymentService);
  const webhookRouter = createWebhookRoutes(gatewayFactory, paymentService);
  const walletRouter = createWalletRoutes(walletService, walletTaskService);
  
  app.use('/payment', paymentRouter);
  paymentRouter.use('/webhook', webhookRouter);
  app.use('/wallets', walletRouter);

  // 启动定时任务
  const scheduler = new PaymentExpirationScheduler(paymentRepo);
  scheduler.start();

  // 启动区块链监听服务（如果启用）
  if (process.env.ENABLE_BLOCKCHAIN_LISTENER === 'true') {
    try {
      const listener = ListenerFactory.create(paymentService);
      await listener.start();
      console.log(`✅ 区块链监听服务已启动 (类型: ${ListenerFactory.getType()})`);
    } catch (error: any) {
      console.error(`❌ 区块链监听服务启动失败: ${error.message}`, error);
    }
  }

  return app;
}

