/**
 * mxmcgi worker 入口：消费 pending 任务（claim + execute）
 * MXMCGI_ROLE=worker
 */

import express from 'express';
import { loadMxmcgiEnv } from './bootstrap-env';
import { getMxmcgiRole, shouldRunWorkerPoller } from './config/runtime-role';
import { startTaskWorkerPoller } from './task/task-worker-poller';

loadMxmcgiEnv();

const port = process.env.WORKER_PORT ? Number(process.env.WORKER_PORT) : 4004;

async function start(): Promise<void> {
  const role = getMxmcgiRole();
  if (role !== 'worker' && role !== 'all') {
    console.warn(`[mxmcgi-worker] MXMCGI_ROLE=${role}, expected worker or all`);
  }

  const { RepositoryFactory } = await import('@mxmai/mxmdata');
  RepositoryFactory.init();

  try {
    const { providerFactory } = await import('./core/providers');
    await providerFactory.loadProviderCatalog();
  } catch (e) {
    console.warn('[mxmcgi-worker] ⚠️  loadProviderCatalog failed:', e instanceof Error ? e.message : String(e));
  }

  const { logTaskEventBusStatus } = await import('./task/task-event-bus');
  logTaskEventBusStatus();

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const { default: healthRouter } = await import('./routes/health');
  app.use('/', healthRouter);

  const { createInternalTasksRouter } = await import('./routes/internal-tasks');
  app.use(createInternalTasksRouter());

  app.listen(port, async () => {
    console.log(`[mxmcgi-worker] 🚀 role=${role} listening on ${port}`);

    if (shouldRunWorkerPoller()) {
      startTaskWorkerPoller();
      const { startAgentRunWorkerPoller } = await import('./agent-core/worker-poller');
      startAgentRunWorkerPoller();
    }
  });
}

start().catch((err) => {
  console.error('[mxmcgi-worker] 启动失败:', err);
  process.exit(1);
});
