/**
 * 人工审核草稿：按 taskId + gateId 存 Redis / 进程内存
 */
import type { ReviewDraftPayload } from './manual-review-types';
import { isRedisTaskBusConfigured } from '../task/task-event-bus';

type RedisClient = import('ioredis').default;

const KEY_PREFIX = 'cgi:manual-review:';
const DEFAULT_TTL_SEC = 7 * 24 * 3600;

type MemoryEntry = { payload: ReviewDraftPayload; expiresAt: number };

const memoryStore = new Map<string, MemoryEntry>();

let redisClient: RedisClient | null = null;
let redisAvailable: boolean | null = null;

function reviewKey(taskId: string, gateId: string): string {
  return `${KEY_PREFIX}${taskId}:${gateId}`;
}

function memoryKey(taskId: string, gateId: string): string {
  return `${taskId}::${gateId}`;
}

function ttlSec(): number {
  const n = Number(process.env.PRE_REVIEW_DRAFT_TTL_SEC || DEFAULT_TTL_SEC);
  return Number.isFinite(n) && n > 300 ? Math.min(n, 7 * 24 * 3600) : DEFAULT_TTL_SEC;
}

function createRedis(): RedisClient {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Redis = require('ioredis') as typeof import('ioredis').default;
  const url = process.env.REDIS_URL?.trim();
  if (url) {
    return new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
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

async function ensureRedis(): Promise<RedisClient | null> {
  if (!isRedisTaskBusConfigured()) {
    redisAvailable = false;
    return null;
  }
  if (redisAvailable === false) return null;
  if (!redisClient) {
    try {
      redisClient = createRedis();
      await redisClient.connect();
      redisAvailable = true;
    } catch {
      redisAvailable = false;
      redisClient = null;
      return null;
    }
  }
  return redisClient;
}

function memoryGet(taskId: string, gateId: string): ReviewDraftPayload | null {
  const hit = memoryStore.get(memoryKey(taskId, gateId));
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    memoryStore.delete(memoryKey(taskId, gateId));
    return null;
  }
  return hit.payload;
}

function memorySet(taskId: string, gateId: string, payload: ReviewDraftPayload): void {
  memoryStore.set(memoryKey(taskId, gateId), {
    payload,
    expiresAt: Date.now() + ttlSec() * 1000,
  });
}

export async function setManualReviewDraft(
  taskId: string,
  gateId: string,
  payload: ReviewDraftPayload
): Promise<void> {
  const client = await ensureRedis();
  const serialized = JSON.stringify(payload);
  if (client) {
    try {
      await client.set(reviewKey(taskId, gateId), serialized, 'EX', ttlSec());
      return;
    } catch (e) {
      console.warn('[ManualReviewStore] redis set failed, fallback memory:', e instanceof Error ? e.message : e);
    }
  }
  memorySet(taskId, gateId, payload);
}

export async function getManualReviewDraft(
  taskId: string,
  gateId: string
): Promise<ReviewDraftPayload | null> {
  const client = await ensureRedis();
  if (client) {
    try {
      const raw = await client.get(reviewKey(taskId, gateId));
      if (typeof raw === 'string' && raw.trim()) {
        return JSON.parse(raw) as ReviewDraftPayload;
      }
    } catch (e) {
      console.warn('[ManualReviewStore] redis get failed, fallback memory:', e instanceof Error ? e.message : e);
    }
  }
  return memoryGet(taskId, gateId);
}

export async function deleteManualReviewDraft(taskId: string, gateId: string): Promise<void> {
  memoryStore.delete(memoryKey(taskId, gateId));
  const client = await ensureRedis();
  if (!client) return;
  try {
    await client.del(reviewKey(taskId, gateId));
  } catch {
    /* ignore */
  }
}

export async function deleteAllManualReviewDrafts(taskId: string): Promise<void> {
  for (const key of [...memoryStore.keys()]) {
    if (key.startsWith(`${taskId}::`)) memoryStore.delete(key);
  }
  const client = await ensureRedis();
  if (!client) return;
  try {
    const pattern = `${KEY_PREFIX}${taskId}:*`;
    const keys = await client.keys(pattern);
    if (keys.length) await client.del(...keys);
  } catch {
    /* ignore */
  }
}
