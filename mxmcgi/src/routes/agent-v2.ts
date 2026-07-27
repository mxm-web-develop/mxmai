/**
 * Agent Chat v2 HTTP API
 * 挂载于 /api/v2/agent
 */

import { Router, type Request, type Response } from 'express';
import {
  RepositoryFactory,
  isAppLocale,
  normalizeAppLocale,
  type AgentReference,
} from '@mxmai/mxmdata';
import {
  normalizeMessageContent,
  partsToPlainText,
  enqueueAgentRun,
  subscribeConversationEvents,
  clearAgentAdminConfigCache,
} from '../agent-core';

const router = Router();

function parseBodyLocale(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const normalized = normalizeAppLocale(raw);
  // 仅当输入可识别为四语之一时写入（未知标记仍会 normalize 成 zh，这里用 isAppLocale 对原始短码）
  const lowered = raw.trim().replace(/_/g, '-');
  if (isAppLocale(lowered) || isAppLocale(normalized)) {
    // 接受 en-US / zh-TW / ja-JP 等 → 归一后写入
    if (
      /^en/i.test(lowered) ||
      /^zh/i.test(lowered) ||
      /^ja/i.test(lowered)
    ) {
      return normalized;
    }
  }
  return null;
}
function userIdFromReq(req: Request): string | null {
  const id = req.headers['x-user-id'];
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

function requireUser(req: Request, res: Response): string | null {
  const userId = userIdFromReq(req);
  if (!userId || userId === 'anonymous') {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return null;
  }
  return userId;
}

/** GET /settings — 登录用户可读的公开助手设置（不含 Key / 采样 / 白名单） */
router.get('/settings', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const repo = RepositoryFactory.createModelConfigRepository();
    const cfg = await repo.getConfig();
    res.json({
      success: true,
      data: {
        welcome_message: cfg.welcome_message ?? null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/** GET /conversations */
router.get('/conversations', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    const repo = RepositoryFactory.createAgentConversationRepository();
    const list = await repo.listByUserId(userId, limit, offset);
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/** POST /conversations */
router.post('/conversations', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const title = typeof req.body?.title === 'string' ? req.body.title : null;
    const rawScope = typeof req.body?.scope === 'string' ? req.body.scope.trim() : '';
    const allowedScopes = new Set(['writing', 'graph', 'video', 'audio', 'music', 'text', 'outline']);
    const scope = rawScope && allowedScopes.has(rawScope) ? rawScope : null;
    const locale = parseBodyLocale(req.body?.locale);
    const repo = RepositoryFactory.createAgentConversationRepository();
    const conv = await repo.create({ user_id: userId, title, scope, locale });
    res.json({ success: true, data: conv });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/** GET /conversations/:id */
router.get('/conversations/:id', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const repo = RepositoryFactory.createAgentConversationRepository();
    const conv = await repo.findById(req.params.id, userId);
    if (!conv) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: conv });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/** PATCH /conversations/:id */
router.patch('/conversations/:id', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const repo = RepositoryFactory.createAgentConversationRepository();
    const patch: { title?: string | null; status?: 'active' | 'archived' | 'deleted' } = {};
    if (req.body?.title !== undefined) patch.title = req.body.title;
    if (req.body?.status !== undefined) patch.status = req.body.status;
    const conv = await repo.update(req.params.id, userId, patch);
    res.json({ success: true, data: conv });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/** DELETE /conversations/:id */
router.delete('/conversations/:id', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const repo = RepositoryFactory.createAgentConversationRepository();
    await repo.softDelete(req.params.id, userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/** GET /conversations/:id/messages */
router.get('/conversations/:id/messages', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const repo = RepositoryFactory.createAgentConversationRepository();
    const conv = await repo.findById(req.params.id, userId);
    if (!conv) return res.status(404).json({ success: false, error: 'Not found' });
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const before = typeof req.query.before === 'string' ? req.query.before : undefined;
    const messages = await repo.listMessages(req.params.id, userId, limit, before);
    res.json({ success: true, data: messages });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/** POST /conversations/:id/messages — 入队 agent run */
router.post('/conversations/:id/messages', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const repo = RepositoryFactory.createAgentConversationRepository();
    const conv = await repo.findById(req.params.id, userId);
    if (!conv) return res.status(404).json({ success: false, error: 'Not found' });

    const content = normalizeMessageContent(req.body?.content ?? '');
    const text = partsToPlainText(content);
    if (!text.trim()) {
      return res.status(400).json({ success: false, error: 'content is required' });
    }

    const references: AgentReference[] = Array.isArray(req.body?.references) ? req.body.references : [];

    const locale = parseBodyLocale(req.body?.locale);
    if (locale && locale !== conv.locale) {
      await repo.update(conv.id, userId, { locale });
      conv.locale = locale;
    }

    const userMsg = await repo.createMessage({
      conversation_id: conv.id,
      user_id: userId,
      role: 'user',
      content,
      references,
    });

    if (!conv.title) {
      await repo.update(conv.id, userId, { title: text.slice(0, 40) });
    }

    const run = await repo.createRun({
      conversation_id: conv.id,
      user_id: userId,
      message_id: userMsg.id,
      status: 'queued',
    });

    await enqueueAgentRun(run.id);

    res.json({
      success: true,
      data: {
        message: userMsg,
        runId: run.id,
        conversationId: conv.id,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * GET /conversations/:id/stream?cursor=<seq>
 * SSE：先回放 DB，再订阅 Redis
 */
router.get('/conversations/:id/stream', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;

  const conversationId = req.params.id;
  const cursor = Number(req.query.cursor) || 0;

  try {
    const repo = RepositoryFactory.createAgentConversationRepository();
    const conv = await repo.findById(conversationId, userId);
    if (!conv) return res.status(404).json({ success: false, error: 'Not found' });

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const write = (event: Record<string, unknown>) => {
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    write({ type: 'stream_open', conversationId, cursor });

    const history = await repo.listEventsAfter(conversationId, cursor, 1000);
    let lastSeq = cursor;
    for (const ev of history) {
      lastSeq = Math.max(lastSeq, ev.seq);
      write({
        type: ev.type,
        seq: ev.seq,
        runId: ev.run_id,
        conversationId: ev.conversation_id,
        payload: ev.payload,
        createdAt: ev.created_at,
      });
    }
    write({ type: 'replay_done', cursor: lastSeq });

    const ac = new AbortController();
    const cleanupSub = await subscribeConversationEvents(
      conversationId,
      (ev) => {
        if (ev.seq <= lastSeq) return;
        lastSeq = ev.seq;
        write({
          type: ev.type,
          seq: ev.seq,
          runId: ev.run_id,
          conversationId: ev.conversation_id,
          payload: ev.payload,
          createdAt: ev.created_at,
        });
      },
      ac.signal
    );

    // 无 Redis 时低频轮询 DB
    const pollTimer = setInterval(() => {
      void (async () => {
        try {
          const more = await repo.listEventsAfter(conversationId, lastSeq, 100);
          for (const ev of more) {
            if (ev.seq <= lastSeq) continue;
            lastSeq = ev.seq;
            write({
              type: ev.type,
              seq: ev.seq,
              runId: ev.run_id,
              conversationId: ev.conversation_id,
              payload: ev.payload,
              createdAt: ev.created_at,
            });
          }
        } catch {
          /* ignore */
        }
      })();
    }, 2000);

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(`: ping\n\n`);
    }, 15000);

    req.on('close', () => {
      clearInterval(pollTimer);
      clearInterval(heartbeat);
      ac.abort();
      cleanupSub();
    });
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    } else {
      res.end();
    }
  }
});

/** POST /runs/:id/cancel */
router.post('/runs/:id/cancel', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const repo = RepositoryFactory.createAgentConversationRepository();
    const run = await repo.findRunById(req.params.id);
    if (!run || run.user_id !== userId) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    if (['completed', 'failed', 'cancelled'].includes(run.status)) {
      return res.json({ success: true, data: run });
    }
    const updated = await repo.updateRun(run.id, {
      status: 'cancelled',
      completed_at: new Date().toISOString(),
    });
    const { appendAndPublishEvent } = await import('../agent-core/event-bus');
    await appendAndPublishEvent({
      runId: run.id,
      conversationId: run.conversation_id,
      type: 'run_cancelled',
      payload: {},
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/** GET /runs/:id */
router.get('/runs/:id', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const repo = RepositoryFactory.createAgentConversationRepository();
    const run = await repo.findRunById(req.params.id);
    if (!run || run.user_id !== userId) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    res.json({ success: true, data: run });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

export function invalidateAgentConfigCache(): void {
  clearAgentAdminConfigCache();
}

export default router;
