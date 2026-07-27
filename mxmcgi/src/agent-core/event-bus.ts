/**
 * Agent run 事件总线：DB 持久化 + Redis pub/sub（SSE 实时）
 */

import type { AgentRunEvent } from '@mxmai/mxmdata';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { isRedisTaskBusConfigured } from '../task/task-event-bus';

type RedisClient = import('ioredis').default;

let publisher: RedisClient | null = null;
let redisOk: boolean | null = null;

function channelForConversation(conversationId: string): string {
  return `agent:conv:${conversationId}`;
}

function createRedis(): RedisClient {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Redis = require('ioredis') as typeof import('ioredis').default;
  const url = process.env.REDIS_URL?.trim();
  if (url) {
    return new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
  }
  return new Redis({
    host: process.env.REDIS_HOST?.trim() || 'localhost',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
}

async function ensurePublisher(): Promise<RedisClient | null> {
  if (!isRedisTaskBusConfigured()) {
    redisOk = false;
    return null;
  }
  if (redisOk === false) return null;
  if (!publisher) {
    publisher = createRedis();
    try {
      await publisher.connect();
      redisOk = true;
    } catch (err) {
      console.warn('[AgentEventBus] Redis connect failed:', err instanceof Error ? err.message : err);
      redisOk = false;
      try {
        publisher.disconnect();
      } catch {
        /* ignore */
      }
      publisher = null;
      return null;
    }
  }
  return publisher;
}

export async function appendAndPublishEvent(args: {
  runId: string;
  conversationId: string;
  type: string;
  payload?: Record<string, unknown>;
}): Promise<AgentRunEvent> {
  const repo = RepositoryFactory.createAgentConversationRepository();
  const event = await repo.appendEvent({
    run_id: args.runId,
    conversation_id: args.conversationId,
    type: args.type,
    payload: args.payload ?? {},
  });

  const pub = await ensurePublisher();
  if (pub) {
    try {
      await pub.publish(
        channelForConversation(args.conversationId),
        JSON.stringify({
          id: event.id,
          run_id: event.run_id,
          conversation_id: event.conversation_id,
          seq: event.seq,
          type: event.type,
          payload: event.payload,
          created_at: event.created_at,
        })
      );
    } catch (err) {
      console.warn('[AgentEventBus] publish failed:', err instanceof Error ? err.message : err);
    }
  }

  return event;
}

export async function subscribeConversationEvents(
  conversationId: string,
  onEvent: (event: AgentRunEvent) => void,
  signal?: AbortSignal
): Promise<() => void> {
  if (!isRedisTaskBusConfigured()) {
    return () => undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Redis = require('ioredis') as typeof import('ioredis').default;
  const url = process.env.REDIS_URL?.trim();
  const sub: RedisClient = url
    ? new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true })
    : new Redis({
        host: process.env.REDIS_HOST?.trim() || 'localhost',
        port: Number(process.env.REDIS_PORT || 6379),
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });

  const channel = channelForConversation(conversationId);
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    try {
      sub.unsubscribe(channel).catch(() => undefined);
      sub.disconnect();
    } catch {
      /* ignore */
    }
  };

  if (signal) {
    if (signal.aborted) {
      cleanup();
      return cleanup;
    }
    signal.addEventListener('abort', cleanup, { once: true });
  }

  try {
    await sub.connect();
    await sub.subscribe(channel);
    sub.on('message', (_ch, message) => {
      if (closed) return;
      try {
        const parsed = JSON.parse(message) as AgentRunEvent;
        onEvent(parsed);
      } catch {
        /* ignore bad payload */
      }
    });
  } catch (err) {
    console.warn('[AgentEventBus] subscribe failed:', err instanceof Error ? err.message : err);
    cleanup();
  }

  return cleanup;
}

/** Redis 队列：唤醒 worker */
const QUEUE_KEY = 'agent:runs:queue';

export async function enqueueAgentRun(runId: string): Promise<void> {
  const pub = await ensurePublisher();
  if (!pub) return;
  try {
    await pub.lpush(QUEUE_KEY, runId);
    await pub.publish('agent:runs:wake', runId);
  } catch (err) {
    console.warn('[AgentEventBus] enqueue failed:', err instanceof Error ? err.message : err);
  }
}

export async function waitForAgentRunWake(timeoutMs: number, signal?: AbortSignal): Promise<string | null> {
  if (!isRedisTaskBusConfigured()) {
    await new Promise((r) => setTimeout(r, Math.min(timeoutMs, 5_000)));
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Redis = require('ioredis') as typeof import('ioredis').default;
  const url = process.env.REDIS_URL?.trim();
  const sub: RedisClient = url
    ? new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true })
    : new Redis({
        host: process.env.REDIS_HOST?.trim() || 'localhost',
        port: Number(process.env.REDIS_PORT || 6379),
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });

  try {
    await sub.connect();
    return await new Promise<string | null>((resolve) => {
      let done = false;
      const finish = (v: string | null) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try {
          sub.unsubscribe('agent:runs:wake').catch(() => undefined);
          sub.disconnect();
        } catch {
          /* ignore */
        }
        resolve(v);
      };
      const timer = setTimeout(() => finish(null), timeoutMs);
      if (signal) {
        signal.addEventListener('abort', () => finish(null), { once: true });
      }
      sub.subscribe('agent:runs:wake').then(() => {
        sub.on('message', (_ch, msg) => finish(msg || null));
      }).catch(() => finish(null));
    });
  } catch {
    try {
      sub.disconnect();
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, Math.min(timeoutMs, 5_000)));
    return null;
  }
}

export { QUEUE_KEY };
