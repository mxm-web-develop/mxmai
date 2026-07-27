/**
 * Gateway - API 网关服务
 * 提供统一入口、路由转发、认证、限流等功能
 */

import { loadMonorepoEnv } from '@mxmai/mxmdata';
import express, { type Response, type NextFunction } from 'express';
import cors from 'cors';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import { createServer } from 'http';
import { setupWebSocketProxy } from './routes/websocket-proxy';
import { setupOpenApiWebSocketProxy } from './routes/open-websocket-proxy';
import healthRouter from './routes/health';
import clientHintsRouter from './routes/client-hints';
import { authMiddleware, type AuthRequest } from './middleware/auth';
import { apiKeyScopeMiddleware } from './middleware/api-key-scope';
import { partnerSlugMiddleware, partnerSessionScopeMiddleware } from './middleware/partner-auth';
import { integrationPartnerAclMiddleware } from './middleware/integration-partner-acl';
import { partnerRateLimitMiddleware } from './middleware/partner-rate-limit';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { responseMiddleware } from './middleware/response';
import { createProxyRouter } from './routes/proxy';
import { logger } from './utils/logger';
import { setupOpenApiDocs } from './openapi/setup';

loadMonorepoEnv({ service: 'gateway' });

// 初始化数据层
try {
  const { RepositoryFactory } = require('@mxmai/mxmdata');
  RepositoryFactory.init();
} catch (e) {
  logger.warn('[Gateway] ⚠️  mxmdata 初始化失败:', e instanceof Error ? e.message : String(e));
}

// 验证 JWT_SECRET
if (process.env.JWT_SECRET === 'your-secret-key-change-in-production') {
  logger.warn(`[Gateway] ⚠️  使用默认 JWT_SECRET，请在项目根 .env 中配置 JWT_SECRET`);
} else if (!process.env.JWT_SECRET) {
  logger.warn(`[Gateway] ⚠️  JWT_SECRET 未配置`);
}

const app = express();
const server = createServer(app);
const port = Number(process.env.GATEWAY_PORT || process.env.PORT || 3000);

// WebSocket 须在 HTTP 代理路由之前挂载（生产环境 Nginx 对 /api/v1/ws/notifications 直连 mxmnotify）
setupWebSocketProxy(server);
setupOpenApiWebSocketProxy(server);

// CORS 配置（开发时前端多为 5173，生产为 3000 或实际域名）
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:5173';
app.use(
  cors({
    origin: corsOrigin.split(',').map((s) => s.trim()).filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Partner-Key', 'X-Device-Id', 'X-Partner-Timestamp', 'X-Partner-Signature', 'X-Partner-Secret'],
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

// 请求日志（避免任务状态轮询刷屏）
app.use((req, res, next) => {
  if (req.path.startsWith('/api/v2/tasks/') && req.method === 'GET') {
    return next();
  }
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
app.use('/', clientHintsRouter);

// OpenAPI / Swagger UI（不需要认证）
setupOpenApiDocs(app);

// Task v2 / 开放 API / 发布管理 — 须在 /api/v1 通用代理之前注册（避免 /account 落到 mxmauth）
// scope=text 等为同步 LLM，思考模型常 >60s；过短会导致 Vite/Gateway 侧 socket hang up
const tasksV2ProxyMs = Math.max(
  60_000,
  Number(process.env.GATEWAY_TASKS_V2_PROXY_TIMEOUT_MS || 600_000)
);
const mxmcgiUrl = process.env.MXMCGI_URL || 'http://localhost:4003';
const mxmauthUrl = process.env.MXMAUTH_URL || 'http://localhost:4001';

function injectAuthHeaders(proxyReq: any, req: AuthRequest): void {
  const user = req.user;
  if (user) {
    proxyReq.setHeader('x-user-id', user.userId);
    proxyReq.setHeader('x-username', user.username);
    if (user.role) proxyReq.setHeader('x-user-role', user.role);
  }
  if (req.partner) {
    proxyReq.setHeader('x-partner-app-id', req.partner.partnerAppId);
    proxyReq.setHeader('x-partner-end-user-id', req.partner.endUserId);
    if (req.partner.allowedSlugs.length > 0) {
      proxyReq.setHeader('x-partner-allowed-slugs', req.partner.allowedSlugs.join(','));
    }
  }
}

function mxmcgiAuthProxy(label: string) {
  return createProxyMiddleware({
    target: mxmcgiUrl,
    changeOrigin: true,
    timeout: tasksV2ProxyMs,
    proxyTimeout: tasksV2ProxyMs,
    pathRewrite: (_path, req) => (req as any).originalUrl || _path,
    on: {
      proxyReq: (proxyReq, req: any) => {
        injectAuthHeaders(proxyReq, req as AuthRequest);
        fixRequestBody(proxyReq as any, req);
      },
      proxyRes: (proxyRes, req: any) => {
        logger.debug(`[${label}] ${req.method} ${req.originalUrl || req.url} -> ${proxyRes.statusCode}`);
      },
      error: (err: any, req: any, res: any) => {
        logger.error(`[${label}] Error: ${req?.method} ${req?.originalUrl || req?.url}`, {
          message: err?.message,
          code: err?.code,
          target: mxmcgiUrl,
        });
        try {
          if (res && typeof res.status === 'function' && !res.headersSent) {
            res.status(502).json({
              success: false,
              error: { code: 'PROXY_ERROR', message: `${label} unavailable: ${err?.message || 'unknown error'}` },
            });
          }
        } catch {
          // ignore
        }
      },
    },
  });
}

function runAuthWithScope(req: AuthRequest, res: Response, next: NextFunction): void {
  authMiddleware(req, res, (err?: unknown) => {
    if (err) return next(err);
    if (res.headersSent) return;
    partnerSessionScopeMiddleware(req, res, () => {
      if (res.headersSent) return;
      apiKeyScopeMiddleware(req, res, () => {
        if (res.headersSent) return;
        void integrationPartnerAclMiddleware(req, res, () => {
          if (res.headersSent) return;
          partnerSlugMiddleware(req, res, () => {
            if (res.headersSent) return;
            void partnerRateLimitMiddleware(req, res, next);
          });
        });
      });
    });
  });
}

/** Partner 终端用户上传 — mxmcgi（须在 /api/v1/partner → mxmauth 之前注册） */
app.use('/api/v1/partner/me/uploads', runAuthWithScope, mxmcgiAuthProxy('Partner Me Uploads Proxy'));

/** Partner API — 匿名/delegate 等由 mxmauth 自行校验 Key，不经 Gateway JWT */
app.use(
  '/api/v1/partner',
  createProxyMiddleware({
    target: mxmauthUrl,
    changeOrigin: true,
    pathRewrite: (_path, req) => (req as any).originalUrl || _path,
    on: {
      proxyReq: (proxyReq, req: any) => {
        injectAuthHeaders(proxyReq, req as AuthRequest);
        fixRequestBody(proxyReq as any, req);
      },
    },
  })
);

app.use('/api/v2/tasks', runAuthWithScope, mxmcgiAuthProxy('TasksV2 Proxy'));
app.use('/api/v2/agent', runAuthWithScope, mxmcgiAuthProxy('AgentV2 Proxy'));
app.use('/api/v1/open', runAuthWithScope, mxmcgiAuthProxy('Open API Proxy'));
app.use('/api/v1/agent', runAuthWithScope, mxmcgiAuthProxy('Agent Catalog Proxy'));
app.use(
  '/api/v1/account/published-apis',
  runAuthWithScope,
  mxmcgiAuthProxy('Published APIs Account Proxy')
);
app.use(
  '/api/v1/account/usage',
  runAuthWithScope,
  mxmcgiAuthProxy('Account Usage Proxy')
);
app.use(
  '/api/v1/cgi/upload',
  runAuthWithScope,
  (req: AuthRequest, _res, next) => {
    if (req.user) {
      req.headers['x-user-id'] = req.user.userId;
      req.headers['x-username'] = req.user.username;
      if (req.user.role) req.headers['x-user-role'] = req.user.role;
    }
    if (req.partner) {
      req.headers['x-partner-app-id'] = req.partner.partnerAppId;
      req.headers['x-partner-end-user-id'] = req.partner.endUserId;
    }
    next();
  },
  createProxyMiddleware({
    target: mxmcgiUrl,
    changeOrigin: true,
    pathRewrite: (_path, req) => {
      const originalPath = (req as express.Request).originalUrl || _path;
      return originalPath.replace('/api/v1/cgi/upload', '/upload');
    },
    on: {
      proxyReq: (proxyReq, req: express.Request) => {
        injectAuthHeaders(proxyReq, req as AuthRequest);
        const ct = String(req.headers['content-type'] ?? '');
        if (!ct.includes('multipart/form-data')) {
          fixRequestBody(proxyReq as any, req);
        }
      },
    },
  })
);

// 代理路由配置（/api/v1/account/api-keys 等 → mxmauth）
const proxyRouter = createProxyRouter();
app.use('/api/v1', proxyRouter);

// 404 处理
app.use(notFoundHandler);

// 错误处理（必须在最后）
app.use(errorHandler);

server.listen(port, () => {
  logger.info(`🚀 Gateway listening on port ${port}`);
});
