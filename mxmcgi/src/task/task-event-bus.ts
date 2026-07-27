/**
 * Redis pub/sub：api 进程等待 worker 任务状态（api/worker 拆分）
 */
import type { TaskSnapshot } from './task-snapshot';
import { isTerminalTaskStatus } from './task-snapshot';
import type { TaskStatus } from './types';

type RedisClient = import('ioredis').default;

let publisher: RedisClient | null = null;
let redisAvailable: boolean | null = null;
let statusLogged = false;

function channelForTask(taskId: string): string {
  return `cgi:task:${taskId}`;
}

function isTruthyEnv(v: string | undefined): boolean {
  return v === '1' || v === 'true' || v === 'yes';
}

/** 是否启用 Redis 任务总线（未配置则不连 localhost，Agent 走 DB 轮询） */
export function isRedisTaskBusConfigured(): boolean {
  if (isTruthyEnv(process.env.REDIS_DISABLED)) return false;
  if (isTruthyEnv(process.env.REDIS_ENABLED)) return true;
  const url = process.env.REDIS_URL?.trim();
  if (url) return true;
  const host = process.env.REDIS_HOST?.trim();
  if (host) return true;
  return false;
}

/** 启动时打印一次（api / worker） */
export function logTaskEventBusStatus(): void {
  if (statusLogged) return;
  statusLogged = true;
  if (!isRedisTaskBusConfigured()) {
    console.log(
      '[TaskEventBus] Redis 未启用（未设置 REDIS_ENABLED/REDIS_HOST/REDIS_URL）。' +
        'api+worker 拆分时 Agent 将使用 DB 轮询等待任务；列表/WebSocket 通知不受影响。'
    );
    return;
  }
  const url = process.env.REDIS_URL?.trim();
  const host = process.env.REDIS_HOST?.trim() || 'localhost';
  const port = process.env.REDIS_PORT || '6379';
  console.log(
    `[TaskEventBus] Redis 已配置: ${url ? 'REDIS_URL' : `${host}:${port}`}（channel: cgi:task:{taskId}）`
  );
}

function createRedis(): RedisClient {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Redis = require('ioredis') as typeof import('ioredis').default;
  const url = process.env.REDIS_URL?.trim();
  if (url) {
    return new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
  }
  const host = process.env.REDIS_HOST?.trim() || 'localhost';
  const port = Number(process.env.REDIS_PORT || 6379);
  const password = process.env.REDIS_PASSWORD;
  return new Redis({
    host,
    port,
    password: password || undefined,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
}

async function ensurePublisher(): Promise<RedisClient | null> {
  if (!isRedisTaskBusConfigured()) {
    redisAvailable = false;
    return null;
  }
  if (redisAvailable === false) return null;
  if (!publisher) {
    try {
      publisher = createRedis();
      await publisher.connect();
      redisAvailable = true;
    } catch {
      redisAvailable = false;
      publisher = null;
      return null;
    }
  }
  return publisher;
}

async function createSubscriber(): Promise<RedisClient | null> {
  if (!isRedisTaskBusConfigured()) {
    redisAvailable = false;
    return null;
  }
  if (redisAvailable === false) return null;
  try {
    const sub = createRedis();
    await sub.connect();
    if (redisAvailable === null) redisAvailable = true;
    return sub;
  } catch {
    redisAvailable = false;
    return null;
  }
}

export function isTaskEventBusAvailable(): boolean {
  return isRedisTaskBusConfigured() && redisAvailable === true;
}

export async function publishTaskEvent(taskId: string, snapshot: TaskSnapshot): Promise<void> {
  const client = await ensurePublisher();
  if (!client) return;
  try {
    await client.publish(channelForTask(taskId), JSON.stringify(snapshot));
  } catch (e) {
    console.warn('[TaskEventBus] publish failed:', e instanceof Error ? e.message : e);
  }
}

export interface WaitForTaskEventOptions {
  timeoutMs?: number;
  onSnapshot?: (snapshot: TaskSnapshot) => void;
}

export interface WaitForTaskEventResult {
  snapshot: TaskSnapshot | null;
  timedOut: boolean;
}

/**
 * 订阅单任务 Redis 通道，逐条产出快照直至终态或超时
 */
export async function* subscribeTaskEvents(
  taskId: string,
  options: { timeoutMs?: number } = {}
): AsyncGenerator<TaskSnapshot, void, undefined> {
  const timeoutMs = options.timeoutMs ?? Number(process.env.AGENT_TASK_WAIT_TIMEOUT_MS || 120_000);
  const sub = await createSubscriber();
  if (!sub) return;

  const channel = channelForTask(taskId);
  const queue: TaskSnapshot[] = [];
  let resolveWait: (() => void) | null = null;
  let done = false;

  const onMessage = (ch: string, message: string) => {
    if (ch !== channel || done) return;
    try {
      const snapshot = JSON.parse(message) as TaskSnapshot;
      queue.push(snapshot);
      resolveWait?.();
    } catch {
      // ignore
    }
  };

  await sub.subscribe(channel);
  sub.on('message', onMessage);

  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      while (queue.length > 0) {
        const snap = queue.shift()!;
        yield snap;
        if (isTerminalTaskStatus(snap.status as TaskStatus)) {
          return;
        }
      }
      await new Promise<void>((r) => {
        resolveWait = r;
        setTimeout(() => {
          resolveWait = null;
          r();
        }, 500);
      });
    }
  } finally {
    done = true;
    sub.removeListener('message', onMessage);
    await sub.unsubscribe(channel).catch(() => {});
    sub.quit().catch(() => {});
  }
}

export async function waitForTaskEvent(
  taskId: string,
  options: WaitForTaskEventOptions = {}
): Promise<WaitForTaskEventResult> {
  const timeoutMs = options.timeoutMs ?? Number(process.env.AGENT_TASK_WAIT_TIMEOUT_MS || 120_000);
  const sub = await createSubscriber();
  if (!sub) {
    return { snapshot: null, timedOut: false };
  }

  const channel = channelForTask(taskId);

  return new Promise((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout | null = null;

    const finish = (snapshot: TaskSnapshot | null, timedOut: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      sub.unsubscribe(channel).catch(() => {});
      sub.removeListener('message', onMessage);
      sub.quit().catch(() => {});
      resolve({ snapshot, timedOut });
    };

    const onMessage = (ch: string, message: string) => {
      if (ch !== channel) return;
      try {
        const snapshot = JSON.parse(message) as TaskSnapshot;
        options.onSnapshot?.(snapshot);
        if (isTerminalTaskStatus(snapshot.status as TaskStatus)) {
          finish(snapshot, false);
        }
      } catch {
        // ignore malformed
      }
    };

    sub.on('message', onMessage);

    sub
      .subscribe(channel)
      .then(() => {
        timer = setTimeout(() => finish(null, true), timeoutMs);
      })
      .catch(() => {
        finish(null, false);
      });
  });
}
