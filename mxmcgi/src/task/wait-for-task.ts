/**
 * 等待 cgi_tasks 完成（Agent 等场景）
 * 优先 Redis pub/sub；无 Redis 时回退 DB 轮询。
 */

import type { TaskSnapshot } from './task-snapshot';
import { isTerminalTaskStatus } from './task-snapshot';
import type { Task, TaskStatus } from './types';
import { taskExecutor } from './task-executor';

export interface WaitForTaskOptions {
  timeoutMs?: number;
  /** DB 回退轮询间隔（默认 3000ms） */
  pollIntervalMs?: number;
  onProgress?: (task: Task) => void;
}

export interface WaitForTaskResult {
  task: Task | null;
  timedOut: boolean;
}

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'network_error']);

function snapshotToPartialTask(snapshot: TaskSnapshot): Task {
  return {
    id: snapshot.id,
    type: snapshot.type,
    status: snapshot.status,
    progress: {
      status: snapshot.progress.status,
      progress: snapshot.progress.progress,
      error: snapshot.progress.error,
    },
    metadata: {
      model: snapshot.metadata?.model ?? '',
      provider: snapshot.metadata?.provider ?? '',
      userId: snapshot.metadata?.userId,
      label: snapshot.metadata?.label,
    },
    createdAt: new Date(snapshot.createdAt),
    updatedAt: new Date(snapshot.updatedAt),
    requestParams: {},
  };
}

/**
 * 智能等待：Redis 事件优先，否则 DB 轮询
 */
export async function waitForTaskCompletion(
  taskId: string,
  options: WaitForTaskOptions = {}
): Promise<WaitForTaskResult> {
  const timeoutMs = options.timeoutMs ?? Number(process.env.AGENT_TASK_WAIT_TIMEOUT_MS || 120_000);

  try {
    const { waitForTaskEvent } = await import('./task-event-bus');
    const redisWait = await waitForTaskEvent(taskId, {
      timeoutMs,
      onSnapshot: (snap) => {
        options.onProgress?.(snapshotToPartialTask(snap));
      },
    });

    if (redisWait.snapshot && !redisWait.timedOut) {
      const taskManager = taskExecutor.getTaskManager();
      const { task } = await taskManager.getTask(taskId);
      return { task: task ?? snapshotToPartialTask(redisWait.snapshot), timedOut: false };
    }

    if (redisWait.timedOut) {
      const taskManager = taskExecutor.getTaskManager();
      const { task } = await taskManager.getTask(taskId);
      return { task: task ?? null, timedOut: true };
    }
  } catch {
    // Redis 不可用，回退 DB
  }

  return waitForTaskCompletionDb(taskId, options);
}

async function waitForTaskCompletionDb(
  taskId: string,
  options: WaitForTaskOptions = {}
): Promise<WaitForTaskResult> {
  const timeoutMs = options.timeoutMs ?? Number(process.env.AGENT_TASK_WAIT_TIMEOUT_MS || 120_000);
  const pollIntervalMs = options.pollIntervalMs ?? Number(process.env.TASK_WAIT_POLL_MS || 3000);
  const started = Date.now();
  const taskManager = taskExecutor.getTaskManager();

  while (Date.now() - started < timeoutMs) {
    const { task } = await taskManager.getTask(taskId);
    if (!task) {
      return { task: null, timedOut: false };
    }
    options.onProgress?.(task);
    if (TERMINAL.has(task.status)) {
      return { task, timedOut: false };
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  const { task } = await taskManager.getTask(taskId);
  return { task: task ?? null, timedOut: true };
}

/**
 * Agent SSE：流式产出进度快照，终态后返回
 */
export async function* iterateTaskCompletion(
  taskId: string,
  options: WaitForTaskOptions = {}
): AsyncGenerator<TaskSnapshot, WaitForTaskResult, undefined> {
  const timeoutMs = options.timeoutMs ?? Number(process.env.AGENT_TASK_WAIT_TIMEOUT_MS || 120_000);

  try {
    const { subscribeTaskEvents } = await import('./task-event-bus');
    let lastSnap: TaskSnapshot | null = null;
    let hadRedisEvents = false;
    for await (const snap of subscribeTaskEvents(taskId, { timeoutMs })) {
      hadRedisEvents = true;
      lastSnap = snap;
      options.onProgress?.(snapshotToPartialTask(snap));
      yield snap;
    }
    if (lastSnap && isTerminalTaskStatus(lastSnap.status)) {
      const taskManager = taskExecutor.getTaskManager();
      const { task } = await taskManager.getTask(taskId);
      return {
        task: task ?? snapshotToPartialTask(lastSnap),
        timedOut: false,
      };
    }
    if (hadRedisEvents) {
      const taskManager = taskExecutor.getTaskManager();
      const { task } = await taskManager.getTask(taskId);
      return { task: task ?? null, timedOut: true };
    }
  } catch {
    // fallback to DB
  }

  const pollIntervalMs = options.pollIntervalMs ?? Number(process.env.TASK_WAIT_POLL_MS || 3000);
  const started = Date.now();
  const taskManager = taskExecutor.getTaskManager();

  while (Date.now() - started < timeoutMs) {
    const { task } = await taskManager.getTask(taskId);
    if (!task) {
      return { task: null, timedOut: false };
    }
    const snap: TaskSnapshot = {
      id: task.id,
      type: task.type,
      status: task.status,
      progress: {
        status: task.progress.status,
        progress: task.progress.progress,
        error: task.progress.error,
      },
      metadata: { label: task.metadata?.label },
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
    yield snap;
    options.onProgress?.(task);
    if (isTerminalTaskStatus(task.status)) {
      return { task, timedOut: false };
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  const { task } = await taskManager.getTask(taskId);
  return { task: task ?? null, timedOut: true };
}
