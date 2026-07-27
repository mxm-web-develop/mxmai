/**
 * Partner 任务 scoped WebSocket（session 鉴权，仅订阅本人 job）
 */
import { Server } from 'http';
import { createHash } from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

const MXMCGI_URL = process.env.MXMCGI_URL || 'http://localhost:4003';

interface PartnerWsAuth {
  callerUserId: string;
  partnerAppId: string;
  endUserId: string;
}

async function authenticatePartnerSession(token: string): Promise<PartnerWsAuth | null> {
  const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  try {
    const decoded = jwt.verify(token, secret) as {
      type: string;
      partnerAppId: string;
      endUserId: string;
      callerUserId: string;
    };
    if (decoded.type !== 'partner_session') return null;

    const { RepositoryFactory } = require('@mxmai/mxmdata');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const partnerRepo = RepositoryFactory.createPartnerRepository();
    const session = await partnerRepo.findSessionByTokenHash(tokenHash);
    if (!session || session.revoked_at) return null;
    if (new Date(session.expires_at).getTime() < Date.now()) return null;

    return {
      callerUserId: decoded.callerUserId,
      partnerAppId: decoded.partnerAppId,
      endUserId: decoded.endUserId,
    };
  } catch {
    return null;
  }
}

function parseJobQuery(url: string): { slug: string; jobId: string } | null {
  try {
    const u = new URL(url, 'http://localhost');
    const slug = u.searchParams.get('slug');
    const jobId = u.searchParams.get('jobId');
    if (!slug || !jobId) return null;
    return { slug, jobId };
  } catch {
    return null;
  }
}

export function setupOpenApiWebSocketProxy(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/api/v1/ws/open/subscribe' });

  wss.on('connection', async (socket: WebSocket, req: { url?: string }) => {
    const url = req.url ?? '';
    const tokenMatch = url.match(/[?&]token=([^&]+)/);
    const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : null;
    const jobQ = parseJobQuery(url);

    if (!token || !jobQ) {
      socket.close(1008, 'token, slug, jobId required');
      return;
    }

    const auth = await authenticatePartnerSession(token);
    if (!auth) {
      socket.close(1008, 'Invalid partner session');
      return;
    }

    const { RepositoryFactory } = require('@mxmai/mxmdata');
    const usageRepo = RepositoryFactory.createPublishedApiUsageRepository();
    const event = await usageRepo.findByJobId(jobQ.jobId);
    if (
      event &&
      event.partner_app_id === auth.partnerAppId &&
      event.end_user_id &&
      event.end_user_id !== auth.endUserId
    ) {
      socket.close(1008, 'Job not owned by end user');
      return;
    }

    logger.info(`[OpenWs] subscribe slug=${jobQ.slug} job=${jobQ.jobId} endUser=${auth.endUserId}`);

    let closed = false;
    const poll = async () => {
      if (closed) return;
      try {
        const res = await fetch(
          `${MXMCGI_URL}/api/v1/open/${encodeURIComponent(jobQ.slug)}/jobs/${encodeURIComponent(jobQ.jobId)}`,
          {
            headers: {
              'x-user-id': auth.callerUserId,
              'x-partner-app-id': auth.partnerAppId,
              'x-partner-end-user-id': auth.endUserId,
            },
          }
        );
        if (res.ok) {
          const json = await res.json();
          socket.send(JSON.stringify({ type: 'job_snapshot', data: json.data ?? json }));
          const status = String((json.data ?? json)?.status ?? '');
          if (status === 'completed' || status === 'failed') {
            closed = true;
            socket.close(1000, 'terminal');
            return;
          }
        }
      } catch (e) {
        logger.debug('[OpenWs] poll error', e);
      }
      if (!closed) setTimeout(poll, 2000);
    };

    void poll();
    socket.on('close', () => {
      closed = true;
    });
  });

  logger.info('[OpenWs] Partner scoped WS on /api/v1/ws/open/subscribe');
}
