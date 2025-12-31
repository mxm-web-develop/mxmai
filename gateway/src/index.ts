/**
 * Gateway - API 网关服务
 * 提供统一入口、路由转发、认证、限流等功能
 */

import express from 'express';
import dotenv from 'dotenv';
import { resolve } from 'path';
import cors from 'cors';
import httpProxy from 'http-proxy-middleware';
import healthRouter from './routes/health';
import { authMiddleware } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { responseMiddleware } from './middleware/response';
import { createProxyRouter } from './routes/proxy';
import { logger } from './utils/logger';

// 禁用 dotenv 的提示信息
process.env.DOTENV_CONFIG_DEBUG = 'false';

// 加载环境变量
dotenv.config();

const app = express();
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

app.listen(port, () => {
  logger.info(`🚀 Gateway service listening on port ${port}`);
  logger.info(`📡 Routes configured:`);
  logger.info(`   - /api/v1/account -> mxmauth (${process.env.MXMAUTH_URL || 'http://localhost:4001'})`);
  logger.info(`   - /api/v1/payment -> mxmpay (${process.env.MXMPAY_URL || 'http://localhost:4002'})`);
  logger.info(`   - /api/v1/wallets -> mxmpay (${process.env.MXMPAY_URL || 'http://localhost:4002'})`);
  logger.info(`   - /api/v1/generation -> mxmcgi (${process.env.MXMCGI_URL || 'http://localhost:4003'})`);
  logger.info(`   - /api/v1/cgi/graph -> mxmcgi/graph (${process.env.MXMCGI_URL || 'http://localhost:4003'})`);
  logger.info(`   - /api/v1/cgi/text -> mxmcgi/text (${process.env.MXMCGI_URL || 'http://localhost:4003'})`);
  logger.info(`   - /api/v1/cgi/audio -> mxmcgi/audio (${process.env.MXMCGI_URL || 'http://localhost:4003'})`);
  logger.info(`   - /api/v1/cgi/video -> mxmcgi/video (${process.env.MXMCGI_URL || 'http://localhost:4003'})`);
  logger.info(`   - /api/v1/system -> mxmcgi/system (${process.env.MXMCGI_URL || 'http://localhost:4003'})`);
  logger.info(`   - /api/v1/knowledge -> mxmcgi/knowledge (${process.env.MXMCGI_URL || 'http://localhost:4003'})`);
  logger.info(`   - /api/v1/agents -> mxmagent (${process.env.MXMAGENT_URL || 'http://localhost:4004'})`);
  logger.info(`   - /api/v1/smartflows -> mxmagent (${process.env.MXMAGENT_URL || 'http://localhost:4004'})`);
  logger.info(`   - /api/v1/smartflow-tasks -> mxmagent/tasks (${process.env.MXMAGENT_URL || 'http://localhost:4004'})`);
  logger.info(`   - /api/v1/notifications -> mxmnotify (${process.env.MXMNOTIFY_URL || 'http://localhost:4005'})`);
  logger.info(`   - /api/v1/tasks -> mxmnotify (${process.env.MXMNOTIFY_URL || 'http://localhost:4005'})`);
  logger.info(`   - /api/v1/sse -> mxmnotify SSE (${process.env.MXMNOTIFY_URL || 'http://localhost:4005'})`);
});
