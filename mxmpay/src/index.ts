import { createApp } from './app';
import { env } from './config/env';

async function bootstrap() {
  try {
    const app = await createApp();
    const port = env.port;

    app.listen(port, '127.0.0.1', () => {
      console.log(`[mxmpay] 🚀 Listening on port ${port}`);
    });
  } catch (error) {
    console.error('[mxmpay] ❌ 启动失败:', error);
    process.exit(1);
  }
}

bootstrap();
