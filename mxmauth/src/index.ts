import './config/loadEnv';
import express from 'express';
import cors from 'cors';
import healthRouter from './routes/health';
import accountRouter from './routes/account';
import { responseMiddleware } from './middleware/response';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { RepositoryFactory, loadDataConfig } from '@mxmai/mxmdata';

// 初始化数据访问层
try {
  const config = loadDataConfig();
  RepositoryFactory.init(config);
  console.log('✅ mxmdata 初始化成功');
} catch (error) {
  console.error('❌ mxmdata 初始化失败:', error instanceof Error ? error.message : error);
  process.exit(1);
}

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 4001;

// CORS 配置
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
app.use(
  cors({
    origin: corsOrigin.split(','),
    credentials: true,
  })
);

// 请求体解析
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 响应中间件
app.use(responseMiddleware);

// 路由
app.use('/', healthRouter);
app.use('/api/v1/account', accountRouter);

// 404 处理
app.use(notFoundHandler);

// 错误处理（必须在最后）
app.use(errorHandler);

app.listen(port, () => {
  console.log(`mxmauth service listening on port ${port}`);
});
