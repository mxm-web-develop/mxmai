import express from 'express';
import { createServer } from 'http';
import { RepositoryFactory, initSupabaseClient, getSupabaseClient, loadMonorepoEnv } from '@mxmai/mxmdata';
import healthRouter from './routes/health';
import tasksRouter from './routes/tasks';
import notificationsRouter from './routes/notifications';
import sseRouter from './routes/sse';
import websocketRouter, { setupWebSocketServer } from './routes/websocket';
import taskEventsRouter from './routes/task-events';
import notificationsBroadcastRouter from './routes/notifications-broadcast';
import { logger } from './utils/logger';

loadMonorepoEnv({ service: 'mxmnotify' });

// 初始化 RepositoryFactory（必须在导入路由之前）
try {
  // 记录环境变量状态（用于调试）
  logger.info('🔍 环境变量检查:', {
    SUPABASE_URL: process.env.SUPABASE_URL ? '已设置' : '未设置',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? '已设置' : '未设置',
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ? '已设置' : '未设置',
  });
  
  // 先初始化 RepositoryFactory
  RepositoryFactory.init();
  logger.info('✅ mxmdata 初始化成功');
  
  // 显式初始化 Supabase 客户端（确保它被初始化）
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    logger.error('❌ SUPABASE_URL 和 SUPABASE_ANON_KEY 环境变量是必需的');
    process.exit(1);
  }
  
  // 显式初始化 Supabase 客户端
  try {
    initSupabaseClient({
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
      serviceKey: supabaseServiceKey,
    });
    logger.info('✅ Supabase 客户端显式初始化成功');
  } catch (supabaseInitError) {
    logger.error('❌ Supabase 客户端初始化失败:', supabaseInitError instanceof Error ? supabaseInitError.message : supabaseInitError);
    process.exit(1);
  }
  
  // 验证 Supabase 客户端是否已初始化
  try {
    const client = getSupabaseClient();
    logger.info('✅ Supabase 客户端验证成功');
  } catch (supabaseError) {
    logger.error('❌ Supabase 客户端验证失败:', supabaseError instanceof Error ? supabaseError.message : supabaseError);
    process.exit(1);
  }
} catch (error) {
  logger.error('❌ mxmdata 初始化失败:', error instanceof Error ? error.message : error);
  logger.error('❌ 错误堆栈:', error instanceof Error ? error.stack : String(error));
  process.exit(1);
}

const app = express();
const server = createServer(app);
const port = Number(process.env.MXMNOTIFY_PORT || process.env.PORT || 4005);

app.use(express.json());

// 路由
app.use('/', healthRouter);
app.use('/tasks', tasksRouter);
app.use('/notifications', notificationsRouter);
app.use('/sse', sseRouter);
app.use('/ws', websocketRouter);
app.use('/task-events', taskEventsRouter);
app.use('/notifications/broadcast', notificationsBroadcastRouter);

// 启动 WebSocket 服务器
setupWebSocketServer(server);

server.listen(port, () => {
  logger.info(`mxmnotify service listening on port ${port}`);
  logger.info('Routes:');
  logger.info('  - GET  /health');
  logger.info('  - POST /tasks');
  logger.info('  - PUT  /tasks/:taskId');
  logger.info('  - GET  /tasks/:taskId');
  logger.info('  - GET  /tasks/user/:userId');
  logger.info('  - POST /notifications/task-completed');
  logger.info('  - POST /notifications/task-failed');
  logger.info('  - GET  /notifications (当前用户通知列表)');
  logger.info('  - GET  /notifications/user/:userId (兼容旧接口)');
  logger.info('  - PUT  /notifications/:notificationId/read (标记已读)');
  logger.info('  - PUT  /notifications/read-all (标记所有已读)');
  logger.info('  - PUT  /notifications/user/:userId/read-all (兼容旧接口)');
  logger.info('  - DELETE /notifications/:notificationId (删除通知)');
  logger.info('  - POST  /notifications/delete-batch (批量删除通知)');
  logger.info('  - GET  /sse/:userId (SSE connection)');
  logger.info('  - WS   /ws/notifications (WebSocket connection)');
  logger.info('  - GET  /ws/health (WebSocket health check)');
  logger.info('  - POST /task-events/status-changed (Task status changed event)');
  logger.info('  - POST /notifications/broadcast (Global notification broadcast)');
  logger.info('  - POST /notifications/broadcast/users (Multi-user notification)');
});

// 优雅关闭
process.on('SIGTERM', () => {
  logger.info('[Server] SIGTERM received, closing server...');
  server.close(() => {
    logger.info('[Server] Server closed');
    process.exit(0);
  });
});
