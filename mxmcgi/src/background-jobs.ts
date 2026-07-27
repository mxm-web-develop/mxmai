/**
 * Outbox + TaskRecovery（scheduler / worker / all）
 */

import {
  shouldRunSchedulerJobs,
} from './config/runtime-role';

export async function startBackgroundJobs(): Promise<void> {
  if (!shouldRunSchedulerJobs()) {
    return;
  }

  try {
    const { TaskEventOutboxProcessor } = await import('./task/notification-outbox');
    const processor = new TaskEventOutboxProcessor({
      intervalMs: Number(process.env.TASK_EVENT_OUTBOX_INTERVAL_MS || 3000),
      batchSize: Number(process.env.TASK_EVENT_OUTBOX_BATCH_SIZE || 30),
      maxAttempts: Number(process.env.TASK_EVENT_OUTBOX_MAX_ATTEMPTS || 20),
    });
    processor.start();
    console.log('[mxmcgi] TaskEventOutboxProcessor started');
  } catch (e) {
    console.warn('[mxmcgi] ⚠️  Outbox processor failed:', e instanceof Error ? e.message : String(e));
  }

  try {
    const { getTaskRecoveryService } = await import('./task/task-recovery');
    const taskRecoveryService = getTaskRecoveryService({
      timeoutMs: 60 * 60 * 1000,
      checkIntervalMs: 5 * 60 * 1000,
      autoRecoverOnStartup: true,
      autoRetry: false,
    });
    await taskRecoveryService.start();
    console.log('[mxmcgi] TaskRecoveryService started');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
      console.warn('[mxmcgi] ⚠️  Task recovery unavailable (Supabase connection failed)');
    } else {
      console.warn('[mxmcgi] ⚠️  Task recovery failed:', msg);
    }
  }

  try {
    const { StorageObjectCleanupProcessor } = await import('./storage/storage-object-cleanup-job');
    const storageCleanup = new StorageObjectCleanupProcessor();
    storageCleanup.start();
    console.log('[mxmcgi] StorageObjectCleanupProcessor started');
  } catch (e) {
    console.warn('[mxmcgi] ⚠️  Storage object cleanup failed:', e instanceof Error ? e.message : String(e));
  }
}
