import { createApp } from './app';
import { env } from './config/env';

async function bootstrap() {
  try {
    const app = await createApp();
    const port = env.port;

    app.listen(port, '127.0.0.1', () => {
      console.log(`🚀 mxmpay 服务已启动: http://127.0.0.1:${port}`);
      console.log(`📚 Swagger 文档: http://127.0.0.1:${port}/api`);
      console.log(`⚠️  注意：此服务仅用于内部访问，客户端应通过 Gateway (http://localhost:3000/api/v1) 访问`);
    });
  } catch (error) {
    console.error('❌ 应用启动失败:', error);
    process.exit(1);
  }
}

bootstrap();
