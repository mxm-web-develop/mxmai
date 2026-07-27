/**
 * Agent run worker poller：Redis 唤醒 + DB claim + 心跳回收
 */

import os from 'os';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { waitForAgentRunWake } from './event-bus';
import { runAgentLoop } from './runner';

let running = false;
let activeCount = 0;
let stopRequested = false;

function workerId(): string {
  const fromEnv = String(process.env.WORKER_ID || '').trim();
  if (fromEnv) return `agent-${fromEnv}`;
  return `agent-${os.hostname()}-${process.pid}`;
}

function maxConcurrent(): number {
  const n = Number(process.env.AGENT_WORKER_MAX_CONCURRENT || process.env.WORKER_MAX_CONCURRENT || 2);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 16) : 2;
}

function idlePollMs(): number {
  const n = Number(process.env.AGENT_WORKER_IDLE_POLL_MS || 10_000);
  return Number.isFinite(n) && n >= 2_000 ? n : 10_000;
}

function staleMs(): number {
  const n = Number(process.env.AGENT_RUN_STALE_MS || 180_000);
  return Number.isFinite(n) && n >= 60_000 ? n : 180_000;
}

export function startAgentRunWorkerPoller(): void {
  if (running) return;
  running = true;
  stopRequested = false;
  console.log(`[agent-worker] started workerId=${workerId()} maxConcurrent=${maxConcurrent()}`);
  void loop();
}

export function stopAgentRunWorkerPoller(): void {
  stopRequested = true;
}

async function reclaimStale(): Promise<void> {
  try {
    const repo = RepositoryFactory.createAgentConversationRepository();
    const before = new Date(Date.now() - staleMs()).toISOString();
    const n = await repo.markStaleRunsFailed(before, 'worker heartbeat timeout');
    if (n > 0) console.warn(`[agent-worker] marked ${n} stale runs as failed`);
  } catch (err) {
    console.warn('[agent-worker] reclaim stale failed:', err instanceof Error ? err.message : err);
  }
}

async function loop(): Promise<void> {
  let lastReclaim = 0;
  while (!stopRequested) {
    try {
      if (Date.now() - lastReclaim > 60_000) {
        await reclaimStale();
        lastReclaim = Date.now();
      }

      const slots = maxConcurrent() - activeCount;
      if (slots <= 0) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }

      const repo = RepositoryFactory.createAgentConversationRepository();
      const claimed = await repo.claimQueuedRuns(workerId(), slots);
      if (claimed.length === 0) {
        await waitForAgentRunWake(idlePollMs());
        continue;
      }

      for (const run of claimed) {
        activeCount += 1;
        void (async () => {
          try {
            await runAgentLoop({
              runId: run.id,
              conversationId: run.conversation_id,
              userId: run.user_id,
              workerId: workerId(),
            });
          } catch (err) {
            console.error('[agent-worker] run failed:', err instanceof Error ? err.message : err);
          } finally {
            activeCount -= 1;
          }
        })();
      }
    } catch (err) {
      console.error('[agent-worker] loop error:', err instanceof Error ? err.message : err);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  running = false;
}
