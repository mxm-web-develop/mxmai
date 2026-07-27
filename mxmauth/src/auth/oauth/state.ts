/**
 * OAuth state（Redis，TTL 10min）
 */

import crypto from 'crypto';
import Redis from 'ioredis';

let redisSingleton: Redis | null = null;

function getRedis(): Redis {
  if (!redisSingleton) {
    redisSingleton = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 2000)),
    });
  }
  return redisSingleton;
}

const TTL_SEC = 600;

function key(state: string): string {
  return `oauth:state:${state}`;
}

/** 内存兜底（无 Redis 时） */
const memoryStates = new Map<string, { provider: string; exp: number }>();

export async function createOAuthState(provider: string): Promise<string> {
  const state = crypto.randomBytes(24).toString('hex');
  try {
    await getRedis().set(key(state), provider, 'EX', TTL_SEC);
  } catch (e) {
    console.warn('[oauth/state] Redis unavailable, using memory:', e instanceof Error ? e.message : e);
    memoryStates.set(state, { provider, exp: Date.now() + TTL_SEC * 1000 });
  }
  return state;
}

export async function consumeOAuthState(state: string): Promise<string | null> {
  if (!state) return null;
  try {
    const redis = getRedis();
    const provider = await redis.get(key(state));
    if (provider) {
      await redis.del(key(state));
      return provider;
    }
  } catch {
    /* fall through */
  }
  const mem = memoryStates.get(state);
  if (!mem) return null;
  memoryStates.delete(state);
  if (mem.exp < Date.now()) return null;
  return mem.provider;
}
