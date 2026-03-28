/**
 * 代理路由配置
 * 将请求转发到对应的微服务
 */

import { ServerResponse } from 'http';
import { Router, Request, Response, NextFunction } from 'express';
import { createProxyMiddleware, Options, fixRequestBody } from 'http-proxy-middleware';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

function isLegacyGatewayTaskNotificationEnabled(): boolean {
  // 默认关闭：由 mxmcgi 统一发送任务事件到 mxmnotify，避免双写/重复通知
  return String(process.env.ENABLE_LEGACY_GATEWAY_TASK_NOTIFICATION || '').toLowerCase() === 'true';
}

function isLegacyGatewayCgiStorageEnabled(): boolean {
  // 默认关闭：由 mxmcgi 统一负责 storeToMinio/data-store 与元数据落库，避免双写/重复存储
  return String(process.env.ENABLE_LEGACY_GATEWAY_CGI_STORAGE || '').toLowerCase() === 'true';
}

/**
 * 创建代理路由
 */
export function createProxyRouter(): Router {
  const router = Router();

  // 服务 URL 配置
  const services = {
    account: process.env.MXMAUTH_URL || 'http://localhost:4001',
    payment: process.env.MXMPAY_URL || 'http://localhost:4002',
    generation: process.env.MXMCGI_URL || 'http://localhost:4003',
    agents: process.env.MXMAGENT_URL || 'http://localhost:4004',
    notifications: process.env.MXMNOTIFY_URL || 'http://localhost:4005',
  };

  // mxmnotify 通知服务路由 (/api/v1/notifications)
  // 认证模型与其他模块统一：由 mxmauth+gateway 校验 JWT，gateway 通过 x-user-id/x-username 透传用户信息
  // 将 /api/v1/notifications/* 代理到 mxmnotify 的 /notifications/*
  router.use(
    '/notifications',
    authMiddleware,
    createProxyMiddleware({
      target: services.notifications,
      changeOrigin: true,
      pathRewrite: (path, req) => {
        const originalPath = (req as Request).originalUrl || path;
        return originalPath.replace('/api/v1/notifications', '/notifications');
      },
      on: {
        proxyReq: (proxyReq, req: Request) => {
          const authReq = req as AuthRequest;
          if (authReq.user) {
            proxyReq.setHeader('x-user-id', authReq.user.userId);
            proxyReq.setHeader('x-username', authReq.user.username);
          }
          
          // 重要：使用 fixRequestBody 修复请求体
          // 当 Express 已经解析了请求体（通过 express.json()）时，
          // 原始请求流已经被消费，需要使用 fixRequestBody 重新构建请求体
          fixRequestBody(proxyReq, req);
        },
        proxyRes: (proxyRes: any, req: Request, res: Response) => {
          logger.debug(`[Notifications Proxy] Response: ${req.method} ${req.path} -> ${proxyRes.statusCode}`);
        },
        error: (err: Error, req: Request, res: any) => {
          logger.error(`[Notifications Proxy] Error: ${req.method} ${req.path}`, {
            message: err.message,
            stack: err.stack,
            code: (err as any).code,
            target: services.notifications,
          });
          if (res && typeof res.status === 'function' && !res.headersSent) {
            res.status(502).json({
              success: false,
              error: {
                code: 'PROXY_ERROR',
                message: `无法连接到通知服务: ${err.message}`,
              },
            });
          }
        },
      },
    })
  );

  // mxmnotify 任务服务路由 (/api/v1/tasks) - 需要认证
  // 将 /api/v1/tasks/* 代理到 mxmnotify 的 /tasks/*
  router.use(
    '/tasks',
    authMiddleware,
    createProxyMiddleware({
      target: services.notifications,
      changeOrigin: true,
      pathRewrite: (path, req) => {
        // 将 /api/v1/tasks 替换为 /tasks
        const originalPath = (req as Request).originalUrl || path;
        return originalPath.replace('/api/v1/tasks', '/tasks');
      },
    })
  );

  // mxmnotify SSE 路由 (/api/v1/sse) - 需要认证
  // 将 /api/v1/sse/* 代理到 mxmnotify 的 /sse/*
  router.use(
    '/sse',
    authMiddleware,
    (req: Request, res: Response, next: NextFunction) => {
      const authReq = req as AuthRequest;
      
      // 验证用户 ID 是否匹配
      const userId = req.params.userId || req.path.split('/').pop();
      if (authReq.user && userId !== authReq.user.userId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You can only connect to your own SSE stream',
          },
        });
      }

      createProxyMiddleware({
        target: services.notifications,
        changeOrigin: true,
        pathRewrite: (path, req) => {
          // 将 /api/v1/sse 替换为 /sse
          const originalPath = (req as Request).originalUrl || path;
          return originalPath.replace('/api/v1/sse', '/sse');
        },
        on: {
          proxyReq: (proxyReq: any, req: any) => {
            // 转发用户信息
            // 注意：这里的 req 是 IncomingMessage，需要通过其他方式获取用户信息
            // 由于已经在中间件中验证了用户，这里可以安全地转发
            const expressReq = req as any;
            if (expressReq.user) {
              proxyReq.setHeader('x-user-id', expressReq.user.userId);
              proxyReq.setHeader('x-username', expressReq.user.username);
            }
          },
        },
      })(req, res, next);
    }
  );

  // 代理配置选项
  const createProxyConfig = (target: string, removeApiPrefix: boolean = false): Options<Request, Response> => ({
    target,
    changeOrigin: true,
    pathRewrite: (path, req) => {
      const originalPath = (req as Request).originalUrl || path;
      // 如果 removeApiPrefix 为 true，去掉 /api/v1 前缀（用于 mxmpay）
      // mxmauth 的路由是 /api/v1/account，所以不需要去掉前缀
      if (removeApiPrefix && originalPath.startsWith('/api/v1')) {
        return originalPath.replace('/api/v1', '');
      }
      // 否则保留完整路径
      return originalPath;
    },
    on: {
      proxyReq: (proxyReq, req: Request) => {
        // 转发原始请求头
        if (req.headers['x-forwarded-for']) {
          proxyReq.setHeader('x-forwarded-for', req.headers['x-forwarded-for']);
        }
        if (req.headers['x-real-ip']) {
          proxyReq.setHeader('x-real-ip', req.headers['x-real-ip']);
        }
        // 转发用户信息（如果已认证）
        const authReq = req as AuthRequest;
        if (authReq.user) {
          proxyReq.setHeader('x-user-id', authReq.user.userId);
          proxyReq.setHeader('x-username', authReq.user.username);
        }

        // 如果请求体已经被解析，需要重新写入到代理请求
        if (
          req.body &&
          Object.keys(req.body).length > 0 &&
          req.headers['content-type'] &&
          req.headers['content-type'].includes('application/json')
        ) {
          const bodyData = JSON.stringify(req.body);
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
        }
      },
      proxyRes: (proxyRes, req: Request) => {
        // 关闭详细 Proxy response 日志，避免刷屏
        // logger.debug(`Proxy response: ${req.method} ${req.path} -> ${proxyRes.statusCode}`);
      },
        error: (err: Error, req: Request, res: any) => {
          logger.error(`Proxy error: ${req.method} ${req.path}`, err);

          const sendJsonError = (write: (body: string) => void, setHeader?: (name: string, value: string) => void) => {
            setHeader?.('Content-Type', 'application/json');
            write(
              JSON.stringify({
                success: false,
                error: {
                  code: 'PROXY_ERROR',
                  message: 'Service unavailable',
                },
              })
            );
          };

          if (res && typeof res.status === 'function') {
            const expressRes = res as Response;
            if (!expressRes.headersSent) {
              expressRes.status(502).json({
                success: false,
                error: {
                  code: 'PROXY_ERROR',
                  message: 'Service unavailable',
                },
              });
            }
          } else if (res && typeof res.writeHead === 'function') {
            const nodeRes = res as ServerResponse;
            if (!nodeRes.headersSent) {
              nodeRes.writeHead(502);
              sendJsonError((body) => nodeRes.end(body));
            }
          }
        },
    },
  });

  // 账户服务路由 (/api/v1/account)
  // 注册和登录不需要认证，其他需要
  router.use(
    '/account',
    (req: Request, res: Response, next: NextFunction) => {
      // 注册、登录、验证码、健康检查接口不需要认证
      if (req.path === '/register' || req.path === '/login' || req.path === '/captcha' || req.path === '/health') {
        return next();
      }
      // 其他接口需要认证
      return authMiddleware(req as AuthRequest, res, next);
    },
    createProxyMiddleware(createProxyConfig(services.account))
  );

  // 资源管理服务路由 (/api/v1/assets) - 需要认证
  // 文件夹管理接口，代理到 mxmauth 服务
  router.use(
    '/assets',
    authMiddleware,
    createProxyMiddleware(createProxyConfig(services.account))
  );

  // 支付服务路由 (/api/v1/payment)
  // Webhook 路由不需要认证（第三方服务回调），其他需要认证
  // mxmpay 的路由是 /payment 和 /wallets（没有 /api/v1 前缀），所以需要去掉前缀
  router.use(
    '/payment',
    (req: Request, res: Response, next: NextFunction) => {
      // Webhook 路由不需要认证
      if (req.path.startsWith('/webhook/')) {
        return next();
      }
      // 其他接口需要认证
      return authMiddleware(req as AuthRequest, res, next);
    },
    createProxyMiddleware(createProxyConfig(services.payment, true))
  );

  // 钱包服务路由 (/api/v1/wallets) - 需要认证
  // mxmpay 的路由是 /wallets（没有 /api/v1 前缀），所以需要去掉前缀
  router.use(
    '/wallets',
    authMiddleware,
    createProxyMiddleware(createProxyConfig(services.payment, true))
  );

  // 生成服务路由 (/api/v1/generation) - 需要认证
  router.use(
    '/generation',
    authMiddleware,
    createProxyMiddleware(createProxyConfig(services.generation))
  );

  // mxmcgi 图片生成路由 (/cgi/graph) - 需要认证
  // 将 /api/v1/cgi/graph/* 代理到 mxmcgi 的 /graph/*
  router.use(
    '/cgi/graph',
    authMiddleware,
    (req: Request, res: Response, next: NextFunction) => {
      const authReq = req as AuthRequest;
      // 遗留逻辑：网关层创建/更新任务、拦截响应体做存储（默认关闭）
      const enableLegacyTaskNotify = isLegacyGatewayTaskNotificationEnabled();
      const enableLegacyStorage = isLegacyGatewayCgiStorageEnabled();
      const storageHandler = enableLegacyStorage ? require('../middleware/cgiStorage').createCgiStorageHandler(authReq) : null;
      const taskNotificationHandler = enableLegacyTaskNotify ? require('../middleware/taskNotification').createTaskNotificationHandler(authReq) : null;
      
      const proxyMiddleware = createProxyMiddleware({
        target: services.generation,
        changeOrigin: true,
        pathRewrite: (path, req) => {
          // 将 /api/v1/cgi/graph 替换为 /graph
          const originalPath = (req as Request).originalUrl || path;
          return originalPath.replace('/api/v1/cgi/graph', '/graph');
        },
        on: {
          proxyReq: (proxyReq, req: Request) => {
            // 转发原始请求头
            if (req.headers['x-forwarded-for']) {
              proxyReq.setHeader('x-forwarded-for', req.headers['x-forwarded-for']);
            }
            if (req.headers['x-real-ip']) {
              proxyReq.setHeader('x-real-ip', req.headers['x-real-ip']);
            }
            // 转发用户信息（如果已认证）
            const authReq = req as AuthRequest;
            if (authReq.user) {
              proxyReq.setHeader('x-user-id', authReq.user.userId);
              proxyReq.setHeader('x-username', authReq.user.username);
            }

            // 重要：使用 fixRequestBody 修复请求体
            // 当 Express 已经解析了请求体（通过 express.json()）时，
            // 原始请求流已经被消费，需要使用 fixRequestBody 重新构建请求体
            fixRequestBody(proxyReq, req);

            // 调用任务通知处理（创建任务）
            if (taskNotificationHandler) {
              taskNotificationHandler.onProxyReq(proxyReq, req);
            }
          },
          proxyRes: (proxyRes: any, req: Request, res: Response) => {
            logger.debug(`Proxy response: ${req.method} ${req.path} -> ${proxyRes.statusCode}`);
            // 调用存储处理
            if (storageHandler) {
              storageHandler.onProxyRes(proxyRes, req, res);
            }
            // 调用任务通知处理（更新任务并发送通知）
            if (taskNotificationHandler) {
              taskNotificationHandler.onProxyRes(proxyRes, req, res);
            }
          },
          error: (err: Error, req: Request, res: any) => {
            logger.error(`Proxy error: ${req.method} ${req.path}`, err);
            // 调用任务通知处理（处理错误）
            if (res && typeof res.status === 'function') {
              if (taskNotificationHandler) {
                taskNotificationHandler.onError(err, req, res);
              }
            }
            if (res && typeof res.status === 'function' && !res.headersSent) {
              res.status(502).json({
                success: false,
                error: {
                  code: 'PROXY_ERROR',
                  message: 'Service unavailable',
                },
              });
            }
          },
        },
      });
      
      proxyMiddleware(req, res, next);
    }
  );

  // mxmcgi 临时文件上传路由 (/cgi/upload) - 需要认证
  // 将 /api/v1/cgi/upload/* 代理到 mxmcgi 的 /upload/*
  router.use(
    '/cgi/upload',
    authMiddleware,
    createProxyMiddleware({
      target: services.generation,
      changeOrigin: true,
      pathRewrite: (path, req) => {
        const originalPath = (req as Request).originalUrl || path;
        return originalPath.replace('/api/v1/cgi/upload', '/upload');
      },
      on: {
        proxyReq: (proxyReq, req: Request) => {
          // 转发用户信息（如果已认证）
          const authReq = req as AuthRequest;
          if (authReq.user) {
            proxyReq.setHeader('x-user-id', authReq.user.userId);
            proxyReq.setHeader('x-username', authReq.user.username);
          }
        },
        proxyRes: (proxyRes: any, req: Request, res: Response) => {
          logger.debug(`Proxy response: ${req.method} ${req.path} -> ${proxyRes.statusCode}`);
        },
      },
    })
  );

  // mxmcgi 文本生成路由 (/cgi/text) - 需要认证
  // 将 /api/v1/cgi/text/* 代理到 mxmcgi 的 /text/*
  router.use(
    '/cgi/text',
    authMiddleware,
    (req: Request, res: Response, next: NextFunction) => {
      const authReq = req as AuthRequest;
      const enableLegacyTaskNotify = isLegacyGatewayTaskNotificationEnabled();
      const enableLegacyStorage = isLegacyGatewayCgiStorageEnabled();
      const storageHandler = enableLegacyStorage ? require('../middleware/cgiStorage').createCgiStorageHandler(authReq) : null;
      const taskNotificationHandler = enableLegacyTaskNotify ? require('../middleware/taskNotification').createTaskNotificationHandler(authReq) : null;
      
      const proxyMiddleware = createProxyMiddleware({
        target: services.generation,
        changeOrigin: true,
        pathRewrite: (path, req) => {
          // 将 /api/v1/cgi/text 替换为 /text
          const originalPath = (req as Request).originalUrl || path;
          return originalPath.replace('/api/v1/cgi/text', '/text');
        },
        on: {
          proxyReq: (proxyReq, req: Request) => {
            // 转发原始请求头
            if (req.headers['x-forwarded-for']) {
              proxyReq.setHeader('x-forwarded-for', req.headers['x-forwarded-for']);
            }
            if (req.headers['x-real-ip']) {
              proxyReq.setHeader('x-real-ip', req.headers['x-real-ip']);
            }
            // 转发用户信息（如果已认证）
            const authReq = req as AuthRequest;
            if (authReq.user) {
              proxyReq.setHeader('x-user-id', authReq.user.userId);
              proxyReq.setHeader('x-username', authReq.user.username);
            }

            // 如果请求体已经被解析，需要重新写入到代理请求
            if (
              req.body &&
              Object.keys(req.body).length > 0 &&
              req.headers['content-type'] &&
              req.headers['content-type'].includes('application/json')
            ) {
              const bodyData = JSON.stringify(req.body);
              proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
              proxyReq.write(bodyData);
            }

            // 调用任务通知处理（创建任务）
            if (taskNotificationHandler) {
              taskNotificationHandler.onProxyReq(proxyReq, req);
            }
          },
          proxyRes: (proxyRes: any, req: Request, res: Response) => {
            logger.debug(`Proxy response: ${req.method} ${req.path} -> ${proxyRes.statusCode}`);
            // 调用存储处理
            if (storageHandler) {
              storageHandler.onProxyRes(proxyRes, req, res);
            }
            // 调用任务通知处理（更新任务并发送通知）
            if (taskNotificationHandler) {
              taskNotificationHandler.onProxyRes(proxyRes, req, res);
            }
          },
          error: (err: Error, req: Request, res: any) => {
            logger.error(`Proxy error: ${req.method} ${req.path}`, err);
            // 调用任务通知处理（处理错误）
            if (res && typeof res.status === 'function') {
              if (taskNotificationHandler) {
                taskNotificationHandler.onError(err, req, res);
              }
            }
            if (res && typeof res.status === 'function' && !res.headersSent) {
              res.status(502).json({
                success: false,
                error: {
                  code: 'PROXY_ERROR',
                  message: 'Service unavailable',
                },
              });
            }
          },
        },
      });
      
      proxyMiddleware(req, res, next);
    }
  );

  // mxmcgi 音频生成路由 (/cgi/audio) - 需要认证
  // 将 /api/v1/cgi/audio/* 代理到 mxmcgi 的 /audio/*
  router.use(
    '/cgi/audio',
    authMiddleware,
    (req: Request, res: Response, next: NextFunction) => {
      const authReq = req as AuthRequest;
      const enableLegacyTaskNotify = isLegacyGatewayTaskNotificationEnabled();
      const enableLegacyStorage = isLegacyGatewayCgiStorageEnabled();
      const storageHandler = enableLegacyStorage ? require('../middleware/cgiStorage').createCgiStorageHandler(authReq) : null;
      const taskNotificationHandler = enableLegacyTaskNotify ? require('../middleware/taskNotification').createTaskNotificationHandler(authReq) : null;
      
      const proxyMiddleware = createProxyMiddleware({
        target: services.generation,
        changeOrigin: true,
        pathRewrite: (path, req) => {
          // 将 /api/v1/cgi/audio 替换为 /audio
          const originalPath = (req as Request).originalUrl || path;
          return originalPath.replace('/api/v1/cgi/audio', '/audio');
        },
        on: {
          proxyReq: (proxyReq, req: Request) => {
            // 转发原始请求头
            if (req.headers['x-forwarded-for']) {
              proxyReq.setHeader('x-forwarded-for', req.headers['x-forwarded-for']);
            }
            if (req.headers['x-real-ip']) {
              proxyReq.setHeader('x-real-ip', req.headers['x-real-ip']);
            }
            // 转发用户信息（如果已认证）
            const authReq = req as AuthRequest;
            if (authReq.user) {
              proxyReq.setHeader('x-user-id', authReq.user.userId);
              proxyReq.setHeader('x-username', authReq.user.username);
            }

            // 重要：使用 fixRequestBody 修复请求体
            // 当 Express 已经解析了请求体（通过 express.json()）时，
            // 原始请求流已经被消费，需要使用 fixRequestBody 重新构建请求体
            logger.debug(`[Audio Proxy] Before fixRequestBody:`, {
              hasBody: !!req.body,
              bodyKeys: req.body ? Object.keys(req.body) : [],
              bodyText: req.body?.text,
              contentType: req.headers['content-type'],
            });
            
            fixRequestBody(proxyReq, req);
            
            logger.debug(`[Audio Proxy] After fixRequestBody, proxyReq headers:`, {
              contentType: proxyReq.getHeader('content-type'),
              contentLength: proxyReq.getHeader('content-length'),
            });

            // 调用任务通知处理（创建任务）
            if (taskNotificationHandler) {
              taskNotificationHandler.onProxyReq(proxyReq, req);
            }
          },
          proxyRes: (proxyRes: any, req: Request, res: Response) => {
            logger.debug(`Proxy response: ${req.method} ${req.path} -> ${proxyRes.statusCode}`);
            // 调用存储处理
            if (storageHandler) {
              storageHandler.onProxyRes(proxyRes, req, res);
            }
            // 调用任务通知处理（更新任务并发送通知）
            if (taskNotificationHandler) {
              taskNotificationHandler.onProxyRes(proxyRes, req, res);
            }
          },
          error: (err: Error, req: Request, res: any) => {
            logger.error(`Proxy error: ${req.method} ${req.path}`, err);
            // 调用任务通知处理（处理错误）
            if (res && typeof res.status === 'function') {
              if (taskNotificationHandler) {
                taskNotificationHandler.onError(err, req, res);
              }
            }
            if (res && typeof res.status === 'function' && !res.headersSent) {
              res.status(502).json({
                success: false,
                error: {
                  code: 'PROXY_ERROR',
                  message: 'Service unavailable',
                },
              });
            }
          },
        },
      });
      
      proxyMiddleware(req, res, next);
    }
  );

  // mxmcgi 视频生成路由 (/cgi/video) - 需要认证
  // 将 /api/v1/cgi/video/* 代理到 mxmcgi 的 /video/*
  router.use(
    '/cgi/video',
    authMiddleware,
    (req: Request, res: Response, next: NextFunction) => {
      const authReq = req as AuthRequest;
      const enableLegacyTaskNotify = isLegacyGatewayTaskNotificationEnabled();
      const enableLegacyStorage = isLegacyGatewayCgiStorageEnabled();
      const storageHandler = enableLegacyStorage ? require('../middleware/cgiStorage').createCgiStorageHandler(authReq) : null;
      const taskNotificationHandler = enableLegacyTaskNotify ? require('../middleware/taskNotification').createTaskNotificationHandler(authReq) : null;
      
      const proxyMiddleware = createProxyMiddleware({
        target: services.generation,
        changeOrigin: true,
        timeout: 60000, // 60秒超时（视频生成可能需要更长时间）
        proxyTimeout: 60000,
        pathRewrite: (path, req) => {
          // 将 /api/v1/cgi/video 替换为 /video
          const originalPath = (req as Request).originalUrl || path;
          return originalPath.replace('/api/v1/cgi/video', '/video');
        },
        on: {
          proxyReq: (proxyReq, req: Request) => {
            // 转发原始请求头
            if (req.headers['x-forwarded-for']) {
              proxyReq.setHeader('x-forwarded-for', req.headers['x-forwarded-for']);
            }
            if (req.headers['x-real-ip']) {
              proxyReq.setHeader('x-real-ip', req.headers['x-real-ip']);
            }
            // 转发用户信息（如果已认证）
            const authReq = req as AuthRequest;
            if (authReq.user) {
              proxyReq.setHeader('x-user-id', authReq.user.userId);
              proxyReq.setHeader('x-username', authReq.user.username);
            }

            // 重要：使用 fixRequestBody 修复请求体
            fixRequestBody(proxyReq, req);

            // 调用任务通知处理（创建任务）
            if (taskNotificationHandler) {
              taskNotificationHandler.onProxyReq(proxyReq, req);
            }
          },
          proxyRes: (proxyRes: any, req: Request, res: Response) => {
            logger.debug(`Proxy response: ${req.method} ${req.path} -> ${proxyRes.statusCode}`);
            // 调用存储处理
            if (storageHandler) {
              storageHandler.onProxyRes(proxyRes, req, res);
            }
            // 调用任务通知处理（更新任务并发送通知）
            if (taskNotificationHandler) {
              taskNotificationHandler.onProxyRes(proxyRes, req, res);
            }
          },
          error: (err: Error, req: Request, res: any) => {
            logger.error(`Proxy error: ${req.method} ${req.path}`, err);
            // 调用任务通知处理（处理错误）
            if (res && typeof res.status === 'function') {
              if (taskNotificationHandler) {
                taskNotificationHandler.onError(err, req, res);
              }
            }
            if (res && typeof res.status === 'function' && !res.headersSent) {
              res.status(502).json({
                success: false,
                error: {
                  code: 'PROXY_ERROR',
                  message: 'Service unavailable',
                },
              });
            }
          },
        },
      });
      
      proxyMiddleware(req, res, next);
    }
  );

  // mxmcgi 系统信息路由 (/system) - 需要认证
  // 将 /api/v1/system/* 代理到 mxmcgi 的 /system/*
  router.use(
    '/system',
    authMiddleware,
    createProxyMiddleware({
      target: services.generation,
      changeOrigin: true,
      timeout: 60000, // 60 秒（敏感词等 admin 操作）
      proxyTimeout: 60000,
      pathRewrite: (path, req) => {
        const originalPath = (req as Request).originalUrl || path;
        // /api/v1/system/admin/sensitive-words/lists -> /system/admin/sensitive-words/lists
        return originalPath.replace(/^\/api\/v1\/system/, '/system');
      },
      on: {
        proxyReq: (proxyReq, req: Request) => {
          // 转发用户信息（如果已认证）；x-user-role 由 mxmauth JWT 写入，下游可免查库校验 admin
          const authReq = req as AuthRequest;
          if (authReq.user) {
            proxyReq.setHeader('x-user-id', authReq.user.userId);
            proxyReq.setHeader('x-username', authReq.user.username);
            if (authReq.user.role) {
              proxyReq.setHeader('x-user-role', authReq.user.role);
            }
          }
          // Gateway 已用 express.json() 解析 body，必须用 fixRequestBody 重新写入代理请求，否则 mxmcgi 收不到 body 会挂起并 request aborted
          fixRequestBody(proxyReq, req);
        },
        proxyRes: (proxyRes: any, req: Request, res: Response) => {
          logger.debug(`Proxy response: ${req.method} ${req.path} -> ${proxyRes.statusCode}`);
        },
        error: (err: Error, req: Request, res: any) => {
          logger.error(`Proxy error: ${req.method} ${req.path}`, err);
          if (res && typeof res.status === 'function' && !res.headersSent) {
            res.status(502).json({
              success: false,
              error: {
                code: 'PROXY_ERROR',
                message: 'Service unavailable',
              },
            });
          }
        },
      },
    })
  );

  // mxmcgi 媒体访问路由 (/media) - 需要认证
  // 说明：
  // - 移动端在登录后持有 Token，可以在图片请求中附带 Authorization 头
  // - 网关负责校验 JWT，并通过 x-user-id/x-username 透传给 mxmcgi
  // - 请求路径：/api/v1/media/* -> /media/*
  router.use(
    '/media',
    authMiddleware,
    createProxyMiddleware({
      target: services.generation,
      changeOrigin: true,
      pathRewrite: (path, req) => {
        const originalPath = (req as Request).originalUrl || path;
        // /api/v1/media/graph/:taskId -> /media/graph/:taskId
        return originalPath.replace('/api/v1/media', '/media');
      },
      on: {
        proxyReq: (proxyReq, req: Request) => {
          const authReq = req as AuthRequest;
          if (authReq.user) {
            proxyReq.setHeader('x-user-id', authReq.user.userId);
            proxyReq.setHeader('x-username', authReq.user.username);
          }

          // 重要：使用 fixRequestBody 修复请求体
          // Gateway 顶层已经通过 express.json() 解析过 body，原始请求流已被消费
          // 这里需要将解析后的 JSON 重新写入到代理请求中，否则后端（mxmcgi）的 express.json()
          // 在读取 body 时会遇到 request aborted / 408 超时
          if (
            req.body &&
            Object.keys(req.body).length > 0 &&
            req.headers['content-type'] &&
            req.headers['content-type'].includes('application/json')
          ) {
            fixRequestBody(proxyReq, req);
          }
        },
        proxyRes: (proxyRes: any, req: Request, res: Response) => {
          logger.debug(`Proxy response: ${req.method} ${req.path} -> ${proxyRes.statusCode}`);
        },
        error: (err: Error, req: Request, res: any) => {
          logger.error(`Proxy error: ${req.method} ${req.path}`, err);
          if (res && typeof res.status === 'function' && !res.headersSent) {
            res.status(502).json({
              success: false,
              error: {
                code: 'PROXY_ERROR',
                message: 'Service unavailable',
              },
            });
          }
        },
      },
    })
  );

  // mxmcgi 生成任务路由 (/cgi-tasks) - 需要认证
  // 说明：
  // - Gateway 对外暴露 /api/v1/cgi-tasks，用于查询/管理图文等异步生成任务
  // - 直接将路径原样转发到 mxmcgi 的 /api/v1/cgi-tasks（mxmcgi 已挂载 app.use('/api/v1/cgi-tasks', ...)）
  // - 通过 authMiddleware 注入的 user 信息，转成 x-user-id/x-username 头部，供 mxmcgi 做权限校验
  router.use(
    '/cgi-tasks',
    authMiddleware,
    createProxyMiddleware({
      target: services.generation,
      changeOrigin: true,
      pathRewrite: (path, req) => {
        // 保持 /api/v1/cgi-tasks 前缀不变，直接透传给 mxmcgi
        const originalPath = (req as Request).originalUrl || path;
        return originalPath;
      },
      on: {
        proxyReq: (proxyReq, req: Request) => {
          // 转发用户信息（如果已认证）
          const authReq = req as AuthRequest;
          if (authReq.user) {
            proxyReq.setHeader('x-user-id', authReq.user.userId);
            proxyReq.setHeader('x-username', authReq.user.username);
          }
        },
        proxyRes: (proxyRes, req: Request, res: Response) => {
          // logger.debug(`Proxy response: ${req.method} ${req.path} -> ${proxyRes.statusCode}`);
        },
        error: (err: Error, req: Request, res: any) => {
          logger.error(`Proxy error: ${req.method} ${req.path}`, err);
          if (res && typeof res.status === 'function' && !res.headersSent) {
            res.status(502).json({
              success: false,
              error: {
                code: 'PROXY_ERROR',
                message: 'Service unavailable',
              },
            });
          }
        },
      },
    })
  );

  // 助手服务路由 (/api/v1/agents)
  // 列表和详情不需要认证，启动和历史需要
  router.use(
    '/agents',
    (req: Request, res: Response, next: NextFunction) => {
      // 列表、搜索、详情不需要认证
      if (
        req.method === 'GET' &&
        (req.path === '/' || req.path === '/search' || /^\/[^/]+$/.test(req.path))
      ) {
        return next();
      }
      // 其他接口需要认证
      return authMiddleware(req as AuthRequest, res, next);
    },
    createProxyMiddleware(createProxyConfig(services.agents))
  );

  // 模型列表服务路由 (/api/v1/models) - 不需要认证（公开信息）
  // 将 /api/v1/models/* 代理到 mxmagent 的 /api/v1/models/*
  router.use(
    '/models',
    createProxyMiddleware(createProxyConfig(services.agents))
  );

  // Smartflow 服务路由 (/api/v1/smartflows)
  // 列表和详情不需要认证，创建、更新、删除、执行需要认证
  router.use(
    '/smartflows',
    (req: Request, res: Response, next: NextFunction) => {
      // GET 列表和详情不需要认证
      if (req.method === 'GET' && (req.path === '/' || /^\/[^/]+$/.test(req.path))) {
        return next();
      }
      // GET /status 或 GET /execute 需要认证（查询任务状态）
      if (req.method === 'GET' && (/^\/[^/]+\/status$/.test(req.path) || /^\/[^/]+\/execute$/.test(req.path))) {
        return authMiddleware(req as AuthRequest, res, next);
      }
      // POST /execute 需要认证
      if (req.method === 'POST' && /^\/[^/]+\/execute$/.test(req.path)) {
        return authMiddleware(req as AuthRequest, res, next);
      }
      // 其他操作（POST, PUT, DELETE）需要认证
      return authMiddleware(req as AuthRequest, res, next);
    },
    createProxyMiddleware(createProxyConfig(services.agents))
  );

  // mxmcgi 写作服务路由 (/api/v1/writing) - 需要认证
  // 将 /api/v1/writing/* 代理到 mxmcgi 的 /writing/*
  // 注意：支持流式响应（SSE），需要确保响应头正确转发
  router.use(
    '/writing',
    authMiddleware,
    createProxyMiddleware({
      target: services.generation,
      changeOrigin: true,
      timeout: 60000, // 60秒超时（写作操作可能需要较长时间）
      proxyTimeout: 60000,
      // http-proxy-middleware 默认支持流式响应，无需特殊配置
      pathRewrite: (path, req) => {
        // 将 /api/v1/writing 替换为 /writing
        const originalPath = (req as Request).originalUrl || path;
        return originalPath.replace('/api/v1/writing', '/writing');
      },
      on: {
        proxyReq: (proxyReq, req: Request) => {
          // 转发原始请求头
          if (req.headers['x-forwarded-for']) {
            proxyReq.setHeader('x-forwarded-for', req.headers['x-forwarded-for']);
          }
          if (req.headers['x-real-ip']) {
            proxyReq.setHeader('x-real-ip', req.headers['x-real-ip']);
          }
          // 转发用户信息（如果已认证）
          const authReq = req as AuthRequest;
          if (authReq.user) {
            proxyReq.setHeader('x-user-id', authReq.user.userId);
            proxyReq.setHeader('x-username', authReq.user.username);
          }

          // 重要：使用 fixRequestBody 修复请求体
          // 当 Express 已经解析了请求体（通过 express.json()）时，
          // 原始请求流已经被消费，需要使用 fixRequestBody 重新构建请求体
          fixRequestBody(proxyReq, req);
        },
        proxyRes: (proxyRes: any, req: Request, res: Response) => {
          logger.debug(`Proxy response: ${req.method} ${req.path} -> ${proxyRes.statusCode}`);
          
          // 对于流式响应（SSE），确保响应头正确设置
          // 必须在数据开始传输之前设置响应头
          const contentType = proxyRes.headers['content-type'] || '';
          if (contentType.includes('text/event-stream')) {
            // 确保 SSE 响应头正确转发（必须在数据开始传输前设置）
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no'); // 禁用 nginx 缓冲（如果使用 nginx）
            // 确保响应不会被压缩或缓冲
            res.setHeader('Transfer-Encoding', 'chunked');
            logger.info(`[Writing Proxy] SSE stream detected, headers set for ${req.path}`);
          }
        },
        error: (err: Error, req: Request, res: any) => {
          logger.error(`Proxy error: ${req.method} ${req.path}`, err);
          if (res && typeof res.status === 'function' && !res.headersSent) {
            res.status(502).json({
              success: false,
              error: {
                code: 'PROXY_ERROR',
                message: 'Service unavailable',
              },
            });
          }
        },
      },
    })
  );

  // Character角色服务路由 (/api/v1/characters) - 需要认证
  // 将 /api/v1/characters/* 代理到 mxmcgi 的 /api/v1/characters/*
  router.use(
    '/characters',
    authMiddleware,
    createProxyMiddleware({
      target: services.generation,
      changeOrigin: true,
      timeout: 30000, // 30秒超时
      proxyTimeout: 30000,
      pathRewrite: (path, req) => {
        // 保持路径不变，因为mxmcgi的路由已经是 /api/v1/characters
        const originalPath = (req as Request).originalUrl || path;
        logger.debug(`[Character Proxy] Path rewrite: ${originalPath} -> ${originalPath}`);
        return originalPath;
      },
      on: {
        proxyReq: (proxyReq, req: Request) => {
          // 转发原始请求头
          if (req.headers['x-forwarded-for']) {
            proxyReq.setHeader('x-forwarded-for', req.headers['x-forwarded-for']);
          }
          if (req.headers['x-real-ip']) {
            proxyReq.setHeader('x-real-ip', req.headers['x-real-ip']);
          }
          // 转发用户信息（如果已认证）
          const authReq = req as AuthRequest;
          if (authReq.user) {
            proxyReq.setHeader('x-user-id', authReq.user.userId);
            proxyReq.setHeader('x-username', authReq.user.username);
            logger.debug(`[Character Proxy] Forwarding user: ${authReq.user.userId}`);
          }

          // 重要：使用 fixRequestBody 修复请求体
          // 当 Express 已经解析了请求体（通过 express.json()）时，
          // 原始请求流已经被消费，需要使用 fixRequestBody 重新构建请求体
          fixRequestBody(proxyReq, req);
        },
        proxyRes: (proxyRes: any, req: Request, res: Response) => {
          logger.debug(`[Character Proxy] Response: ${req.method} ${req.path} -> ${proxyRes.statusCode}`);
          // 确保响应头正确设置，避免Postman卡住
          // 移除可能导致问题的响应头
          if (proxyRes.headers['transfer-encoding']) {
            delete proxyRes.headers['transfer-encoding'];
          }
          // 确保Connection头正确
          if (!proxyRes.headers['connection']) {
            proxyRes.headers['connection'] = 'close';
          }
        },
        error: (err: Error, req: Request, res: any) => {
          logger.error(`[Character Proxy] Error: ${req.method} ${req.path}`, err);
          if (res && typeof res.status === 'function' && !res.headersSent) {
            res.status(502).json({
              success: false,
              error: {
                code: 'PROXY_ERROR',
                message: 'Character service unavailable',
                details: err.message,
              },
            });
          }
        },
      },
    })
  );

  // 知识库服务路由 (/api/v1/knowledge)
  // 所有接口需要认证
  router.use(
    '/knowledge',
    (req: Request, res: Response, next: NextFunction) => {
      logger.info(`[Knowledge Proxy] Incoming request: ${req.method} ${req.originalUrl || req.path}`);
      next();
    },
    authMiddleware,
    (req: Request, res: Response, next: NextFunction) => {
      logger.info(`[Knowledge Proxy] After auth, proceeding to proxy: ${req.method} ${req.originalUrl || req.path}`);
      next();
    },
    createProxyMiddleware({
      target: services.generation,
      changeOrigin: true,
      timeout: 60000, // 60秒超时（知识库操作可能需要较长时间）
      proxyTimeout: 60000,
      pathRewrite: (path, req) => {
        // 将 /api/v1/knowledge 替换为 /knowledge
        const originalPath = (req as Request).originalUrl || path;
        // 移除 /api/v1/knowledge 前缀，保留后续路径
        const rewritten = originalPath.replace(/^\/api\/v1\/knowledge/, '/knowledge');
        logger.info(`[Knowledge Proxy] Path rewrite: ${originalPath} -> ${rewritten}`);
        logger.info(`[Knowledge Proxy] Target URL: ${services.generation}${rewritten}`);
        return rewritten;
      },
      on: {
        proxyReq: (proxyReq: any, req: any) => {
          // 转发用户信息（必须在 fixRequestBody 之前设置 header）
          const expressReq = req as AuthRequest;
          logger.info(`[Knowledge Proxy] Proxying ${req.method} ${req.originalUrl || req.path}`);
          if (expressReq.user) {
            proxyReq.setHeader('x-user-id', expressReq.user.userId);
            proxyReq.setHeader('x-username', expressReq.user.username);
            logger.info(`[Knowledge Proxy] User: ${expressReq.user.userId} (${expressReq.user.username})`);
          } else {
            logger.warn(`[Knowledge Proxy] No user info in request`);
          }
          
          // 重要：使用 fixRequestBody 修复请求体（必须在设置 header 之后调用）
          // 因为 Express 已经解析了请求体，原始请求流已经被消费
          // 需要使用 fixRequestBody 重新构建请求体以便代理转发
          fixRequestBody(proxyReq, req);
          
          logger.info(`[Knowledge Proxy] Target: ${services.generation}${req.path}`);
        },
        proxyRes: (proxyRes: any, req: Request, res: Response) => {
          logger.info(`[Knowledge Proxy] Response: ${req.method} ${req.path} -> ${proxyRes.statusCode}`);
        },
        error: (err: Error, req: Request, res: any) => {
          logger.error(`[Knowledge Proxy] Proxy error: ${req.method} ${req.path}`, err);
          logger.error(`[Knowledge Proxy] Error details:`, {
            message: err.message,
            stack: err.stack,
            code: (err as any).code,
          });
          if (res && typeof res.status === 'function' && !res.headersSent) {
            res.status(502).json({
              success: false,
              error: {
                code: 'PROXY_ERROR',
                message: `无法连接到知识库服务: ${err.message}`,
              },
            });
          } else {
            logger.error(`[Knowledge Proxy] Cannot send error response: headers already sent or res is invalid`);
          }
        },
      },
    })
  );

  // Prompt Template 服务路由 (/api/v1/prompt-templates)
  // 列表和详情不需要认证，创建、更新、删除需要认证
  router.use(
    '/prompt-templates',
    (req: Request, res: Response, next: NextFunction) => {
      // GET 列表和详情不需要认证
      if (req.method === 'GET') {
        return next();
      }
      // 其他操作（POST, PUT, DELETE）需要认证
      return authMiddleware(req as AuthRequest, res, next);
    },
    createProxyMiddleware(createProxyConfig(services.agents))
  );

  // Smartflow Task 服务路由 (/api/v1/smartflow-tasks) - 需要认证
  // 将 /api/v1/smartflow-tasks/* 代理到 mxmagent 的 /api/v1/tasks/*
  // 注意：避免与 mxmnotify 的 /api/v1/tasks 冲突
  router.use(
    '/smartflow-tasks',
    authMiddleware,
    createProxyMiddleware({
      target: services.agents,
      changeOrigin: true,
      pathRewrite: (path, req) => {
        // 将 /api/v1/smartflow-tasks 替换为 /api/v1/tasks
        const originalPath = (req as Request).originalUrl || path;
        return originalPath.replace('/api/v1/smartflow-tasks', '/api/v1/tasks');
      },
      on: {
        proxyReq: (proxyReq, req: Request) => {
          // 转发原始请求头
          if (req.headers['x-forwarded-for']) {
            proxyReq.setHeader('x-forwarded-for', req.headers['x-forwarded-for']);
          }
          if (req.headers['x-real-ip']) {
            proxyReq.setHeader('x-real-ip', req.headers['x-real-ip']);
          }
          // 转发用户信息（如果已认证）
          const authReq = req as AuthRequest;
          if (authReq.user) {
            proxyReq.setHeader('x-user-id', authReq.user.userId);
            proxyReq.setHeader('x-username', authReq.user.username);
          }

          // 如果请求体已经被解析，需要重新写入到代理请求
          if (
            req.body &&
            Object.keys(req.body).length > 0 &&
            req.headers['content-type'] &&
            req.headers['content-type'].includes('application/json')
          ) {
            const bodyData = JSON.stringify(req.body);
            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
            proxyReq.write(bodyData);
          }
        },
        proxyRes: (proxyRes: any, req: Request, res: Response) => {
          logger.debug(`Proxy response: ${req.method} ${req.path} -> ${proxyRes.statusCode}`);
        },
        error: (err: Error, req: Request, res: any) => {
          logger.error(`Proxy error: ${req.method} ${req.path}`, err);
          if (res && typeof res.status === 'function' && !res.headersSent) {
            res.status(502).json({
              success: false,
              error: {
                code: 'PROXY_ERROR',
                message: 'Service unavailable',
              },
            });
          }
        },
      },
    })
  );


  // mxmnotify 任务事件路由 (/api/v1/task-events) - 需要认证
  // 将 /api/v1/task-events/* 代理到 mxmnotify 的 /task-events/*
  router.use(
    '/task-events',
    authMiddleware,
    createProxyMiddleware({
      target: services.notifications,
      changeOrigin: true,
      pathRewrite: (path, req) => {
        // 将 /api/v1/task-events 替换为 /task-events
        const originalPath = (req as Request).originalUrl || path;
        return originalPath.replace('/api/v1/task-events', '/task-events');
      },
    })
  );

  return router;
}
