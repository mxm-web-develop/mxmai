/**
 * Gateway - API 网关服务
 * 提供统一入口、路由转发、认证、限流等功能
 */

import express from 'express';
import dotenv from 'dotenv';
import { resolve } from 'path';
import cors from 'cors';
import httpProxy from 'http-proxy-middleware';
import { createServer } from 'http';
import { setupWebSocketProxy } from './routes/websocket-proxy';
import healthRouter from './routes/health';
import { authMiddleware } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { responseMiddleware } from './middleware/response';
import { createProxyRouter } from './routes/proxy';
import { logger } from './utils/logger';

// 禁用 dotenv 的提示信息
process.env.DOTENV_CONFIG_DEBUG = 'false';

// 加载环境变量
// 优先从 mxmdata/.env 加载（与 mxmauth 保持一致，确保 JWT_SECRET 一致）
// 注意：__dirname 在 tsx watch 模式下指向 src 目录，在编译后指向 dist 目录
// 使用与 mxmauth 完全相同的路径解析逻辑：从 src/dist 向上三级到项目根目录，然后进入 mxmdata
// mxmauth 使用: resolve(__dirname, '../../../mxmdata/.env')
const workspaceEnvPath = resolve(__dirname, '../../../mxmdata/.env');

logger.info(`[Gateway] 尝试从以下路径加载环境变量: ${workspaceEnvPath}`);
logger.info(`[Gateway] __dirname: ${__dirname}`);

const envResult1 = dotenv.config({ path: workspaceEnvPath });
if (envResult1.error) {
  logger.warn(`[Gateway] 未能从 mxmdata/.env 加载环境变量: ${envResult1.error.message}`);
  logger.warn(`[Gateway] 尝试的路径: ${workspaceEnvPath}`);
  logger.warn(`[Gateway] 文件是否存在: ${require('fs').existsSync(workspaceEnvPath) ? '是' : '否'}`);
} else if (envResult1.parsed) {
  logger.info(`[Gateway] ✅ 已从 mxmdata/.env 加载环境变量`);
  logger.info(`[Gateway] 加载的路径: ${workspaceEnvPath}`);
  logger.info(`[Gateway] 加载的变量数量: ${Object.keys(envResult1.parsed).length}`);
}

// 然后加载 gateway/.env（如果有的话，会覆盖上面的配置）
const gatewayEnvPath = resolve(__dirname, '../.env');
const envResult2 = dotenv.config({ path: gatewayEnvPath });
if (envResult2.parsed) {
  logger.info(`[Gateway] ✅ 已从 gateway/.env 加载环境变量（覆盖 mxmdata/.env）`);
  logger.info(`[Gateway] gateway/.env 路径: ${gatewayEnvPath}`);
}

// 最后尝试从当前工作目录加载（兼容性）
dotenv.config();

// 验证 JWT_SECRET 是否已加载
if (process.env.JWT_SECRET) {
  const secretLength = process.env.JWT_SECRET.length;
  const secretPreview = process.env.JWT_SECRET.substring(0, 10);
  logger.info(`[Gateway] ✅ JWT_SECRET 已配置 (length: ${secretLength})`);
  logger.info(`[Gateway] JWT_SECRET 前10个字符: ${secretPreview}...`);
  
  // 检查是否使用默认值
  if (process.env.JWT_SECRET === 'your-secret-key-change-in-production') {
    logger.warn(`[Gateway] ⚠️  警告: 正在使用默认 JWT_SECRET，这会导致认证失败！`);
    logger.warn(`[Gateway] 💡 请立即在 mxmdata/.env 中配置 JWT_SECRET`);
  }
} else {
  logger.warn(`[Gateway] ⚠️  JWT_SECRET 未配置，将使用默认值（会导致认证失败）`);
  logger.warn(`[Gateway] 💡 建议: 在 mxmdata/.env 中配置 JWT_SECRET`);
  logger.warn(`[Gateway] 💡 检查路径: ${workspaceEnvPath}`);
  logger.warn(`[Gateway] 💡 运行诊断脚本: ./check_jwt_secret.sh`);
}

const app = express();
const server = createServer(app);
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

// CORS 配置
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
app.use(
  cors({
    origin: corsOrigin.split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// 请求体解析
// 配置 JSON 解析，允许空 body（用于 DELETE 等请求）
// 同时支持 application/json 和 text/plain（Postman 等工具可能发送 text/plain）
app.use((req, res, next) => {
  // 如果 Content-Type 是 text/plain 但内容是 JSON，转换为 application/json
  if (req.headers['content-type'] === 'text/plain' && req.method === 'POST') {
    req.headers['content-type'] = 'application/json';
  }
  next();
});

app.use(express.json({ 
  limit: '10mb',
  strict: false, // 允许非数组/对象的 JSON
  type: ['application/json', 'text/plain'], // 同时支持两种 Content-Type
  verify: (req: any, res: any, buf: Buffer) => {
    // 如果 body 为空，不尝试解析
    if (buf.length === 0) {
      req.body = {};
    }
  },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 请求日志
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// 响应中间件
app.use(responseMiddleware);

// 健康检查路由（不需要认证）
app.use('/', healthRouter);

// 代理路由配置
const proxyRouter = createProxyRouter();
app.use('/api/v1', proxyRouter);

// 404 处理
app.use(notFoundHandler);

// 错误处理（必须在最后）
app.use(errorHandler);

// 设置 WebSocket 代理
setupWebSocketProxy(server);

server.listen(port, () => {
  logger.info(`🚀 Gateway service listening on port ${port}`);
  logger.info(`📡 Routes configured:`);
  logger.info(`   - /api/v1/account -> mxmauth (${process.env.MXMAUTH_URL || 'http://localhost:4001'})`);
  logger.info(`   - /api/v1/assets -> mxmauth (${process.env.MXMAUTH_URL || 'http://localhost:4001'})`);
  logger.info(`   - /api/v1/payment -> mxmpay (${process.env.MXMPAY_URL || 'http://localhost:4002'})`);
  logger.info(`   - /api/v1/wallets -> mxmpay (${process.env.MXMPAY_URL || 'http://localhost:4002'})`);
  logger.info(`   - /api/v1/generation -> mxmcgi (${process.env.MXMCGI_URL || 'http://localhost:4003'})`);
  logger.info(`   - /api/v1/cgi/graph -> mxmcgi/graph (${process.env.MXMCGI_URL || 'http://localhost:4003'})`);
  logger.info(`   - /api/v1/cgi/text -> mxmcgi/text (${process.env.MXMCGI_URL || 'http://localhost:4003'})`);
  logger.info(`   - /api/v1/cgi/audio -> mxmcgi/audio (${process.env.MXMCGI_URL || 'http://localhost:4003'})`);
  logger.info(`   - /api/v1/cgi/video -> mxmcgi/video (${process.env.MXMCGI_URL || 'http://localhost:4003'})`);
  logger.info(`   - /api/v1/system -> mxmcgi/system (${process.env.MXMCGI_URL || 'http://localhost:4003'})`);
  logger.info(`   - /api/v1/knowledge -> mxmcgi/knowledge (${process.env.MXMCGI_URL || 'http://localhost:4003'})`);
  logger.info(`   - /api/v1/characters -> mxmcgi/characters (${process.env.MXMCGI_URL || 'http://localhost:4003'})`);
  logger.info(`   - /api/v1/agents -> mxmagent (${process.env.MXMAGENT_URL || 'http://localhost:4004'})`);
  logger.info(`   - /api/v1/smartflows -> mxmagent (${process.env.MXMAGENT_URL || 'http://localhost:4004'})`);
  logger.info(`   - /api/v1/smartflow-tasks -> mxmagent/tasks (${process.env.MXMAGENT_URL || 'http://localhost:4004'})`);
  logger.info(`   - /api/v1/notifications -> mxmnotify (${process.env.MXMNOTIFY_URL || 'http://localhost:4005'})`);
  logger.info(`   - /api/v1/tasks -> mxmnotify (${process.env.MXMNOTIFY_URL || 'http://localhost:4005'})`);
  logger.info(`   - /api/v1/sse -> mxmnotify SSE (${process.env.MXMNOTIFY_URL || 'http://localhost:4005'})`);
  logger.info(`   - /api/v1/task-events -> mxmnotify (${process.env.MXMNOTIFY_URL || 'http://localhost:4005'})`);
  logger.info(`   - WS /api/v1/ws/notifications -> mxmnotify WebSocket (${process.env.MXMNOTIFY_URL || 'http://localhost:4005'})`);
});
