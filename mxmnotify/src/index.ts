import express from 'express';
import dotenv from 'dotenv';
import { resolve } from 'path';
import healthRouter from './routes/health';
import tasksRouter from './routes/tasks';
import notificationsRouter from './routes/notifications';
import sseRouter from './routes/sse';
import { logger } from './utils/logger';

// 禁用 dotenv 的提示信息
process.env.DOTENV_CONFIG_DEBUG = 'false';

// 加载环境变量（优先加载项目根目录的 .env）
dotenv.config({ path: resolve(__dirname, '../../.env') });
dotenv.config(); // 也加载当前目录的 .env（如果有）

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 4005;

app.use(express.json());

// 路由
app.use('/', healthRouter);
app.use('/tasks', tasksRouter);
app.use('/notifications', notificationsRouter);
app.use('/sse', sseRouter);

app.listen(port, () => {
  logger.info(`mxmnotify service listening on port ${port}`);
  logger.info('Routes:');
  logger.info('  - GET  /health');
  logger.info('  - POST /tasks');
  logger.info('  - PUT  /tasks/:taskId');
  logger.info('  - GET  /tasks/:taskId');
  logger.info('  - GET  /tasks/user/:userId');
  logger.info('  - POST /notifications/task-completed');
  logger.info('  - POST /notifications/task-failed');
  logger.info('  - GET  /notifications/user/:userId');
  logger.info('  - PUT  /notifications/:notificationId/read');
  logger.info('  - PUT  /notifications/user/:userId/read-all');
  logger.info('  - GET  /sse/:userId (SSE connection)');
});
