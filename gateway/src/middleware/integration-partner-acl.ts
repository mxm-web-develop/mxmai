/**
 * integration Key 直连 Open API 时校验 partner_apps slug ACL
 */
import { Response, NextFunction } from 'express';
import type { AuthRequest } from './auth';
import { logger } from '../utils/logger';

const OPEN_API_PREFIX = '/api/v1/open';

export async function integrationPartnerAclMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (req.user?.apiKeyType !== 'integration' || !req.user.apiKeyId) {
    return next();
  }
  if (req.partner) {
    return next();
  }

  const path = String(req.originalUrl || req.url || '').split('?')[0];
  if (!path.startsWith(OPEN_API_PREFIX)) return next();

  const match = path.match(/^\/api\/v1\/open\/([^/]+)/);
  const slug = match?.[1];
  if (!slug || slug === 'jobs') return next();

  try {
    const { RepositoryFactory } = require('@mxmai/mxmdata');
    const partnerRepo = RepositoryFactory.createPartnerRepository();
    const app = await partnerRepo.findAppByApiKeyId(req.user.apiKeyId);
    if (!app) return next();

    if (app.slug_access_mode !== 'restricted') return next();
    if (app.allowed_slugs.length === 0 || !app.allowed_slugs.includes(slug)) {
      logger.warn('[IntegrationPartnerACL] Slug forbidden', {
        slug,
        apiKeyId: req.user.apiKeyId,
        allowed: app.allowed_slugs,
      });
      res.status(403).json({
        success: false,
        error: {
          code: 'PARTNER_SLUG_FORBIDDEN',
          message: `当前 API Key 无权访问 slug: ${slug}`,
        },
      });
      return;
    }
    next();
  } catch (e) {
    logger.error('[IntegrationPartnerACL] Error:', e instanceof Error ? e.message : e);
    next(e);
  }
}
