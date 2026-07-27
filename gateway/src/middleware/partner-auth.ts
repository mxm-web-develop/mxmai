/**
 * Partner session JWT 解析与 slug 白名单校验
 */
import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import type { AuthRequest } from './auth';
import { logger } from '../utils/logger';

export interface PartnerContext {
  partnerAppId: string;
  endUserId: string;
  allowedSlugs: string[];
  sessionId?: string;
}

declare module './auth' {
  interface AuthRequest {
    partner?: PartnerContext;
  }
}

export interface PartnerSessionJwtPayload {
  type: 'partner_session';
  partnerAppId: string;
  endUserId: string;
  callerUserId: string;
  allowedSlugs: string[];
  sessionId: string;
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 从 JWT payload 解析 partner session（auth 中间件已校验签名） */
export async function attachPartnerFromToken(
  req: AuthRequest,
  token: string,
  decoded: PartnerSessionJwtPayload
): Promise<boolean> {
  if (decoded.type !== 'partner_session') return false;

  try {
    const { RepositoryFactory } = require('@mxmai/mxmdata');
    const partnerRepo = RepositoryFactory.createPartnerRepository();
    const session = await partnerRepo.findSessionByTokenHash(hashSessionToken(token));
    if (!session || session.revoked_at) {
      logger.warn('[PartnerAuth] Session revoked or not found');
      return false;
    }
    if (new Date(session.expires_at).getTime() < Date.now()) {
      logger.warn('[PartnerAuth] Session expired');
      return false;
    }

    const endUser = await partnerRepo.findEndUserById(decoded.endUserId);
    if (!endUser || endUser.status === 'blocked') {
      logger.warn('[PartnerAuth] End user blocked or missing');
      return false;
    }

    const app = await partnerRepo.findAppById(decoded.partnerAppId);
    if (!app || app.status !== 'active') {
      logger.warn('[PartnerAuth] Partner app disabled');
      return false;
    }

    req.user = {
      userId: decoded.callerUserId,
      username: decoded.callerUserId,
      type: 'access',
      role: 'user',
      authViaPartnerSession: true,
    };
    req.partner = {
      partnerAppId: decoded.partnerAppId,
      endUserId: decoded.endUserId,
      allowedSlugs:
        app.slug_access_mode === 'restricted'
          ? app.allowed_slugs
          : decoded.allowedSlugs?.length
            ? decoded.allowedSlugs
            : [],
      sessionId: session.id,
    };
    return true;
  } catch (e) {
    logger.debug('[PartnerAuth] attach failed:', e instanceof Error ? e.message : e);
    return false;
  }
}

export function tryDecodePartnerSession(token: string): PartnerSessionJwtPayload | null {
  try {
    const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    const decoded = jwt.decode(token) as PartnerSessionJwtPayload | null;
    if (!decoded || decoded.type !== 'partner_session') return null;
    const clockTolerance = Number(process.env.JWT_CLOCK_TOLERANCE_SECONDS) || 120;
    jwt.verify(token, secret, { clockTolerance });
    return decoded;
  } catch {
    return null;
  }
}

const OPEN_API_PREFIX = '/api/v1/open';

/** run 前校验 slug ∈ allowed_slugs（空数组表示不限制，向后兼容） */
export function partnerSlugMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.partner) return next();

  const path = String(req.originalUrl || req.url || '').split('?')[0];
  if (!path.startsWith(OPEN_API_PREFIX)) return next();

  const match = path.match(/^\/api\/v1\/open\/([^/]+)/);
  const slug = match?.[1];
  if (!slug || slug === 'jobs') return next();

  const allowed = req.partner.allowedSlugs;
  if (allowed.length === 0) return next();

  if (!allowed.includes(slug)) {
    res.status(403).json({
      success: false,
      error: {
        code: 'PARTNER_SLUG_FORBIDDEN',
        message: `Partner 应用未授权 slug: ${slug}`,
      },
    });
    return;
  }
  next();
}

/** partner session 与 integration Key 相同路径范围 */
export function partnerSessionScopeMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user?.authViaPartnerSession) return next();

  const path = String(req.originalUrl || req.url || '').split('?')[0];
  const m = req.method.toUpperCase();
  const ok =
    path.startsWith('/api/v1/open') ||
    (path.startsWith('/api/v1/cgi/upload') && (m === 'POST' || m === 'PUT')) ||
    (path.startsWith('/api/v1/media') && (m === 'GET' || m === 'HEAD')) ||
    path.startsWith('/api/v1/partner/me/uploads') ||
    path.startsWith('/api/v1/partner/sessions/revoke');

  if (ok) return next();

  res.status(403).json({
    success: false,
    error: {
      code: 'PARTNER_SESSION_SCOPE_FORBIDDEN',
      message: 'Partner session 仅可访问 Open API、上传与媒体读取',
    },
  });
}
