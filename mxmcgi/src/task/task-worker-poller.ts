/**
 * Worker：Redis 唤醒 + DB claim（SKIP LOCKED）+ 低频兜底 poll
 */

import os from 'os';
import { taskExecutor } from './task-executor';
import { buildExecuteOptionsFromTask } from './build-execute-params';
import { BATCH_PARENT_TASK_TYPES } from './batch-parent-aggregate';
import type { Task } from './types';
import { waitForTaskWake } from './task-queue';

let running = false;
let activeCount = 0;
let stopRequested = false;
let abortController: AbortController | null = null;

function workerId(): string {
  const fromEnv = String(process.env.WORKER_ID || '').trim();
  if (fromEnv) return fromEnv;
  return os.hostname();
}

function maxConcurrent(): number {
  const n = Number(process.env.WORKER_MAX_CONCURRENT || 2);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 32) : 2;
}

function claimBatchSize(): number {
  const n = Number(process.env.WORKER_CLAIM_BATCH || process.env.WORKER_PENDING_BATCH || 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 10;
}

function idlePollMs(): number {
  const n = Number(process.env.WORKER_IDLE_POLL_MS || 30_000);
  return Number.isFinite(n) && n >= 5_000 ? n : 30_000;
}

function orphanStaleMs(): number {
  const n = Number(process.env.WORKER_ORPHAN_STALE_MS || 60_000);
  return Number.isFinite(n) && n >= 30_000 ? n : 60_000;
}

function pollerEnabled(): boolean {
  const raw = String(process.env.WORKER_POLLER_ENABLED ?? 'true').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'no';
}

function logTaskMetric(event: string, fields: Record<string, string | number | undefined>): void {
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${v}`);
  console.log(`[task_metric] event=${event} ${parts.join(' ')}`);
}

/**
 * worker 重启后：无进程在执行但 DB 仍为 processing/queued（低进度）的任务，重置为 pending 以便重新领取
 */
async function reclaimOrphanedTasks(): Promise<void> {
  const taskManager = taskExecutor.getTaskManager();
  const staleMs = orphanStaleMs();
  const now = Date.now();
  const limit = claimBatchSize();

  const [processingRes, queuedRes] = await Promise.all([
    taskManager.listTasks({ status: 'processing', limit, offset: 0 }),
    taskManager.listTasks({ status: 'queued', limit, offset: 0 }),
  ]);

  const candidates = [...(processingRes.tasks || []), ...(queuedRes.tasks || [])];
  for (const task of candidates) {
    const age = now - task.updatedAt.getTime();
    if (age < staleMs) continue;
    const p = task.progress?.progress ?? 0;
    if (p >= 90) continue;

    await taskManager.updateTaskStatus(task.id, 'pending', {
      progress: 0,
      error: undefined,
    });
    console.log(
      `[TaskWorker] reclaimed orphan task ${task.id} (${task.status} → pending, stale ${Math.round(age / 1000)}s, progress=${p}%)`
    );
    const { enqueueTaskWake } = await import('./task-queue');
    await enqueueTaskWake(task.id).catch(() => {});
  }
}

/** 列表接口返回 summary requestParams（截断 prompt/text）；执行前必须用 getTask 还原全量 input_data */
async function hydrateTaskForExecution(task: Task): Promise<Task> {
  try {
    const res = await taskExecutor.getTaskManager().getTask(task.id);
    return res?.task ?? task;
  } catch {
    return task;
  }
}

/** 回退：RPC 未部署时用 listTasks（兼容 dev） */
async function listClaimableTasksFallback(): Promise<Task[]> {
  const taskManager = taskExecutor.getTaskManager();
  const limit = claimBatchSize();
  const [pendingRes, queuedRes] = await Promise.all([
    taskManager.listTasks({ status: 'pending', limit, offset: 0 }),
    taskManager.listTasks({ status: 'queued', limit, offset: 0 }),
  ]);
  const byId = new Map<string, Task>();
  for (const t of pendingRes.tasks || []) {
    byId.set(t.id, t);
  }
  for (const t of queuedRes.tasks || []) {
    if (byId.has(t.id)) continue;
    const p = t.progress?.progress ?? 0;
    const started = t.progress?.startedAt;
    if (p === 0 && !started) {
      byId.set(t.id, t);
    }
  }
  const summaries = Array.from(byId.values());
  return Promise.all(summaries.map((t) => hydrateTaskForExecution(t)));
}

async function claimTasks(): Promise<Task[]> {
  const taskManager = taskExecutor.getTaskManager();
  const slots = maxConcurrent() - activeCount;
  if (slots <= 0) return [];

  const limit = Math.min(claimBatchSize(), slots);
  try {
    const claimed = await taskManager.claimPendingTasks(workerId(), limit);
    if (claimed.length > 0) {
      return Promise.all(claimed.map((t) => hydrateTaskForExecution(t)));
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes('claim_pending_cgi_tasks') && !msg.includes('RPC_ERROR')) {
      console.warn('[TaskWorker] claimPendingTasks failed, fallback to list:', msg);
    }
  }

  return listClaimableTasksFallback().then((tasks) => tasks.slice(0, limit));
}

async function tryRunOne(task: Task): Promise<void> {
  if (BATCH_PARENT_TASK_TYPES.has(task.type)) {
    return;
  }

  const createdAt = task.createdAt?.getTime?.() ?? Date.now();
  logTaskMetric('claimed', {
    taskId: task.id,
    workerId: workerId(),
    queueWaitMs: Math.max(0, Date.now() - createdAt),
  });

  const fullTask = await hydrateTaskForExecution(task);
  const opts = buildExecuteOptionsFromTask(fullTask);
  if (!opts) {
    console.warn(`[TaskWorker] skip task ${task.id}: cannot build execute options (type=${task.type})`);
    return;
  }

  activeCount += 1;
  const executeStarted = Date.now();
  try {
    await taskExecutor.executeTask(opts);
  } catch (e) {
    console.error(`[TaskWorker] executeTask failed for ${task.id}:`, e);
  } finally {
    activeCount -= 1;
    logTaskMetric('execute_finished', {
      taskId: task.id,
      executeMs: Date.now() - executeStarted,
    });
  }
}

async function processClaimBatch(): Promise<void> {
  if (activeCount >= maxConcurrent()) return;
  if (running) return;

  running = true;
  try {
    const claimable = await claimTasks();
    for (const task of claimable) {
      if (activeCount >= maxConcurrent()) break;
      void tryRunOne(task);
    }
  } catch (e) {
    console.error('[TaskWorker] processClaimBatch error:', e);
  } finally {
    running = false;
  }
}

let idleTimer: ReturnType<typeof setInterval> | null = null;

async function idleFallbackTick(): Promise<void> {
  await processClaimBatch();
}

async function wakeLoop(): Promise<void> {
  abortController = new AbortController();
  const signal = abortController.signal;

  while (!stopRequested) {
    if (activeCount >= maxConcurrent()) {
      await new Promise((r) => setTimeout(r, 200));
      continue;
    }

    const wokeTaskId = await waitForTaskWake(signal);
    if (stopRequested) break;

    if (wokeTaskId) {
      await processClaimBatch();
      continue;
    }

    // BLPOP 超时：短间隔再试 claim（可能有无 Redis 唤醒的积压）
    await processClaimBatch();
  }
}

export function startTaskWorkerPoller(): void {
  if (!pollerEnabled()) {
    console.log('[TaskWorker] poller disabled (WORKER_POLLER_ENABLED=false)');
    return;
  }

  console.log(
    `[TaskWorker] poller started (workerId=${workerId()}, maxConcurrent=${maxConcurrent()}, ` +
      `claimBatch=${claimBatchSize()}, idlePollMs=${idlePollMs()})`
  );

  void reclaimOrphanedTasks()
    .catch((e) => console.error('[TaskWorker] reclaimOrphanedTasks error:', e))
    .finally(() => {
      void processClaimBatch();
      void wakeLoop();
    });

  idleTimer = setInterval(() => {
    void idleFallbackTick();
  }, idlePollMs());
}

export function stopTaskWorkerPoller(): void {
  stopRequested = true;
  abortController?.abort();
  if (idleTimer) {
    clearInterval(idleTimer);
    idleTimer = null;
  }
}
