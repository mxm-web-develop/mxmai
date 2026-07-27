import express from 'express';
import { loadMxmcgiEnv } from './bootstrap-env';
import { getMxmcgiRole, shouldRunSchedulerJobs, shouldStartHttpApi } from './config/runtime-role';
import { startBackgroundJobs } from './background-jobs';

loadMxmcgiEnv();

const port = Number(process.env.MXMCGI_PORT || process.env.PORT || 4003);

async function start(): Promise<void> {
  const role = getMxmcgiRole();
  console.log(`[mxmcgi] starting with MXMCGI_ROLE=${role}`);

  if (!shouldStartHttpApi()) {
    console.error(`[mxmcgi] MXMCGI_ROLE=${role} 不应使用 src/index.ts 启动，请使用 src/worker.ts`);
    process.exit(1);
  }

  const { RepositoryFactory, validateStorageConfig, formatStorageConfigSummary } =
    await import('@mxmai/mxmdata');
  RepositoryFactory.init();
  validateStorageConfig();
  console.log(`[mxmcgi] storage: ${formatStorageConfigSummary()}`);

  const [
    { default: healthRouter },
    { default: audioRouter },
    { default: videoRouter },
    { default: uploadRouter },
    { default: systemRouter },
    { default: mediaRouter },
    { default: knowledgeRouter },
    { default: writingRouter },
    { default: tasksV2Router },
    { default: smartflowRouter },
    { default: smartflowTaskRouter },
    { default: agentsRouter },
    { default: searchRouter },
    { default: openApiRouter },
    { default: accountPublishedApisRouter },
    { default: accountUsageRouter },
    { default: agentCatalogRouter },
    { default: storageRouter },
    { default: adminStorageRouter },
    { default: partnerUploadRouter },
    { default: staticRouter },
    { default: virtualFolderIndexRouter },
    { default: agentV2Router },
  ] = await Promise.all([
    import('./routes/health'),
    import('./routes/audio'),
    import('./routes/video'),
    import('./routes/upload'),
    import('./routes/system'),
    import('./routes/media'),
    import('./routes/knowledge'),
    import('./routes/writing'),
    import('./tasks/routes'),
    import('./smartflow/routes/smartflow'),
    import('./smartflow/routes/tasks'),
    import('./agents'),
    import('./routes/search'),
    import('./routes/open-api'),
    import('./routes/account-published-apis'),
    import('./routes/account-usage'),
    import('./routes/agent-catalog'),
    import('./storage/storage-routes'),
    import('./storage/admin-storage-routes'),
    import('./storage/partner-upload-routes'),
    import('./storage/static-routes'),
    import('./folder-index/routes'),
    import('./routes/agent-v2'),
  ]);

  const app = express();

  app.use((req, res, next) => {
    if (req.headers['content-type'] === 'text/plain' && req.method === 'POST') {
      req.headers['content-type'] = 'application/json';
    }
    next();
  });

  app.use(express.json({
    limit: '20mb',
    type: ['application/json', 'text/plain'],
  }));
  app.use(express.urlencoded({ extended: true, limit: '20mb' }));

  app.use('/', healthRouter);
  app.use('/audio', audioRouter);
  app.use('/video', videoRouter);
  app.use('/upload', uploadRouter);
  app.use('/system', systemRouter);
  app.use('/media', mediaRouter);
  app.use('/knowledge', knowledgeRouter);
  app.use('/writing', writingRouter);
  app.use('/api/v2/tasks', tasksV2Router);
  app.use('/api/v1/smartflows', smartflowRouter);
  app.use('/api/v1/smartflow-tasks', smartflowTaskRouter);
  app.use('/api/v1/agents', agentsRouter);
  app.use('/api/v1/search', searchRouter);
  app.use('/api/v1/open', openApiRouter);
  app.use('/api/v1/account/published-apis', accountPublishedApisRouter);
  app.use('/api/v1/account/usage', accountUsageRouter);
  app.use('/api/v1/agent', agentCatalogRouter);
  app.use('/storage', storageRouter);
  app.use('/admin/storage', adminStorageRouter);
  app.use('/api/v1/partner/me', partnerUploadRouter);
  app.use('/static', staticRouter);
  app.use('/virtual-folder-index', virtualFolderIndexRouter);
  app.use('/api/v2/agent', agentV2Router);

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return;
    const msg = err?.message ?? String(err);
    const isAborted = err?.code === 'ECONNABORTED' || /request aborted|aborted/i.test(msg);
    if (isAborted) {
      try { if (!res.writableEnded) res.status(499).json({ success: false, error: 'Client closed request' }); } catch { /* 连接已关闭 */ }
      return;
    }
    console.error('[mxmcgi] Unhandled error:', err);
    try { res.status(500).json({ success: false, error: msg }); } catch { /* ignore */ }
  });

  try {
    const { providerFactory } = await import('./core/providers');
    await providerFactory.loadProviderCatalog();
  } catch (e) {
    console.warn('[mxmcgi] ⚠️  加载 Provider 模型目录失败:', e instanceof Error ? e.message : String(e));
  }

  const { logTaskEventBusStatus } = await import('./task/task-event-bus');
  logTaskEventBusStatus();

  app.listen(port, async () => {
    console.log(`[mxmcgi] 🚀 API listening on port ${port} (role=${role})`);

    if (shouldRunSchedulerJobs()) {
      await startBackgroundJobs();
    } else {
      console.log('[mxmcgi] scheduler jobs disabled on api role (use worker/scheduler process)');
    }

    // role=all 单进程：同时跑 agent run poller（split 模式由 worker.ts 负责）
    const { shouldRunWorkerPoller } = await import('./config/runtime-role');
    if (role === 'all' && shouldRunWorkerPoller()) {
      const { startAgentRunWorkerPoller } = await import('./agent-core/worker-poller');
      startAgentRunWorkerPoller();
    }
  });
}

start().catch((err) => {
  console.error('[mxmcgi] 启动失败:', err);
  process.exit(1);
});
