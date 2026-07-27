/**
 * Redis 任务唤醒队列：api 建任务后 RPUSH，worker BLPOP 触发 claim
 */
import { isRedisTaskBusConfigured } from './task-event-bus';

type RedisClient = import('ioredis').default;

let queueClient: RedisClient | null = null;
let queueAvailable: boolean | null = null;

export function taskQueueRedisKey(): string {
  return String(process.env.TASK_QUEUE_REDIS_KEY || 'cgi:task:queue').trim() || 'cgi:task:queue';
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

async function ensureQueueClient(): Promise<RedisClient | null> {
  if (!isRedisTaskBusConfigured()) {
    queueAvailable = false;
    return null;
  }
  if (queueAvailable === false) return null;
  if (!queueClient) {
    try {
      queueClient = createRedis();
      await queueClient.connect();
      queueAvailable = true;
    } catch {
      queueAvailable = false;
      queueClient = null;
      return null;
    }
  }
  return queueClient;
}

/** 任务创建后唤醒 worker（失败不阻塞建任务） */
export async function enqueueTaskWake(taskId: string): Promise<void> {
  const client = await ensureQueueClient();
  if (!client) return;
  try {
    await client.rpush(taskQueueRedisKey(), taskId);
  } catch (e) {
    console.warn('[TaskQueue] enqueue failed:', e instanceof Error ? e.message : e);
  }
}

export function blpopTimeoutSec(): number {
  const n = Number(process.env.TASK_QUEUE_BLPOP_TIMEOUT_SEC || 5);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 30) : 5;
}

/**
 * 阻塞等待队列唤醒；返回 taskId 或 null（超时）
 */
export async function waitForTaskWake(signal?: AbortSignal): Promise<string | null> {
  const client = await ensureQueueClient();
  if (!client) return null;

  const key = taskQueueRedisKey();
  const timeout = blpopTimeoutSec();

  if (signal?.aborted) return null;

  try {
    const result = await client.blpop(key, timeout);
    if (!result || result.length < 2) return null;
    const taskId = String(result[1] ?? '').trim();
    return taskId || null;
  } catch (e) {
    if (signal?.aborted) return null;
    console.warn('[TaskQueue] blpop failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function disconnectTaskQueue(): Promise<void> {
  if (queueClient) {
    try {
      await queueClient.quit();
    } catch {
      // ignore
    }
    queueClient = null;
  }
}
