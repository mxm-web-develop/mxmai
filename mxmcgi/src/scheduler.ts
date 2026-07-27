/**
 * mxmcgi scheduler 入口：outbox + recovery + storage cleanup（单实例）
 * MXMCGI_ROLE=scheduler
 */

import express from 'express';
import { loadMxmcgiEnv } from './bootstrap-env';
import { getMxmcgiRole, shouldRunSchedulerJobs } from './config/runtime-role';
import { startBackgroundJobs } from './background-jobs';

loadMxmcgiEnv();

const port = process.env.SCHEDULER_PORT ? Number(process.env.SCHEDULER_PORT) : 4006;

async function start(): Promise<void> {
  const role = getMxmcgiRole();
  if (role !== 'scheduler' && role !== 'all') {
    console.warn(`[mxmcgi-scheduler] MXMCGI_ROLE=${role}, expected scheduler or all`);
  }

  const { RepositoryFactory } = await import('@mxmai/mxmdata');
  RepositoryFactory.init();

  const app = express();
  const { default: healthRouter } = await import('./routes/health');
  app.use('/', healthRouter);

  app.listen(port, async () => {
    console.log(`[mxmcgi-scheduler] 🚀 role=${role} listening on ${port}`);

    if (shouldRunSchedulerJobs()) {
      await startBackgroundJobs();
    } else {
      console.warn('[mxmcgi-scheduler] scheduler jobs disabled for current role');
    }
  });
}

start().catch((err) => {
  console.error('[mxmcgi-scheduler] 启动失败:', err);
  process.exit(1);
});
