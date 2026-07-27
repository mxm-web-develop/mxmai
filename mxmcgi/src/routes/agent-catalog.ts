/**
 * Agent 能力目录 — 供 OpenClaw / Cursor 等外部 Agent 动态发现业务与 Smartflow
 * GET /api/v1/agent/catalog
 */

import { Router, Request, Response } from 'express';
import { buildAgentCatalog } from '../agent/build-catalog';
import { requireUserId } from '../open-api/authz';

const router = Router();

function publicBaseUrl(req: Request): string {
  const env = process.env.PUBLIC_API_BASE_URL || process.env.GATEWAY_PUBLIC_URL || '';
  if (env) return env.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

router.get('/catalog', async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: '需要登录或个人访问凭证 API Key' },
      });
    }

    const catalog = await buildAgentCatalog({
      userId,
      baseUrl: publicBaseUrl(req),
    });

    res.json({ success: true, data: catalog });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    });
  }
});

export default router;
