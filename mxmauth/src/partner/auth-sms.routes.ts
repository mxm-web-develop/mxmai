/**
 * Partner 短信登录：发码 / 验码 → partner_session
 */
import { Router, Request, Response, NextFunction } from 'express';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { resolveIntegrationKeyFromRequest } from './integration-key';
import { signPartnerSessionToken } from './session-jwt';
import { partnerSmsService } from './sms.service';
import { maskPhone, normalizeCnPhone, phoneExternalId } from './phone';
import {
  assertSmsLoginAllowed,
  effectiveAllowedSlugs,
  onSmsVerifySuccess,
  PartnerAccessDeniedError,
} from './access-control';

const router = Router();
const partnerRepo = RepositoryFactory.createPartnerRepository();

function jsonOk(res: Response, data: unknown, message = 'ok') {
  return res.json({ code: 200, message, data });
}

function jsonErr(res: Response, status: number, message: string, error = 'ERROR') {
  return res.status(status).json({ code: status, message, error });
}

async function requireIntegrationKey(req: Request, res: Response, next: NextFunction) {
  try {
    const resolved = await resolveIntegrationKeyFromRequest(req.headers);
    if (!resolved) {
      return jsonErr(res, 401, '需要有效的 integration API Key 或 X-Partner-Key', 'UNAUTHORIZED');
    }
    (req as any).integrationKey = resolved;
    next();
  } catch (e) {
    next(e);
  }
}

async function ensurePartnerApp(resolved: Awaited<ReturnType<typeof resolveIntegrationKeyFromRequest>>) {
  if (!resolved) return null;
  if (resolved.partnerApp) return resolved.partnerApp;
  const { generatePartnerSecret } = await import('./crypto');
  const secret = generatePartnerSecret();
  return partnerRepo.createApp({
    ownerUserId: resolved.userId,
    apiKeyId: resolved.keyId,
    name: '默认 Partner 应用',
    secretHash: secret.hash,
    secretPrefix: secret.prefix,
    allowedSlugs: [],
  });
}

async function issueSessionForEndUser(
  res: Response,
  app: { id: string; allowed_slugs: string[]; slug_access_mode?: string },
  callerUserId: string,
  endUserId: string,
  extra?: Record<string, unknown>
) {
  const endUser = await partnerRepo.findEndUserById(endUserId);
  if (!endUser || endUser.status === 'blocked') {
    return jsonErr(res, 403, '终端用户已封禁', 'END_USER_BLOCKED');
  }

  const fullApp = await partnerRepo.findAppById(app.id);
  const allowedSlugs = fullApp ? effectiveAllowedSlugs(fullApp) : app.allowed_slugs;

  const { token, expiresAt, tokenHash } = signPartnerSessionToken({
    partnerAppId: app.id,
    endUserId,
    callerUserId,
    allowedSlugs,
    sessionId: '',
  });
  await partnerRepo.createSession(endUserId, tokenHash, expiresAt);

  return jsonOk(res, {
    sessionToken: token,
    expiresAt,
    endUserId,
    ...extra,
  });
}

/** POST /api/v1/partner/auth/sms/send（CAPTCHA_ENABLE=true 时需 captchaId + captchaAnswer） */
router.post('/send', requireIntegrationKey, async (req, res, next) => {
  try {
    const resolved = (req as any).integrationKey;
    const app = await ensurePartnerApp(resolved);
    if (!app || app.status !== 'active') {
      return jsonErr(res, 403, 'Partner 应用不可用', 'FORBIDDEN');
    }

    const { phone, inviteToken } = req.body ?? {};
    if (!phone) return jsonErr(res, 400, 'phone 必填', 'VALIDATION_ERROR');

    try {
      await assertSmsLoginAllowed(app, String(phone), inviteToken ? String(inviteToken) : undefined);
    } catch (e) {
      if (e instanceof PartnerAccessDeniedError) {
        return jsonErr(res, 403, e.message, e.code);
      }
      throw e;
    }

    const result = await partnerSmsService.sendOtp(app.id, String(phone));
    await partnerRepo.appendAuditLog({
      partnerAppId: app.id,
      action: 'auth.sms.send',
      detail: { phoneMasked: result.phoneMasked },
    });

    return jsonOk(res, result, '验证码已发送');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('频繁') || msg.includes('上限') || msg.includes('无效')) {
      return jsonErr(res, 429, msg, 'SMS_RATE_LIMIT');
    }
    if (e instanceof PartnerAccessDeniedError) {
      return jsonErr(res, 403, e.message, e.code);
    }
    next(e);
  }
});

/** POST /api/v1/partner/auth/sms/verify */
router.post('/verify', requireIntegrationKey, async (req, res, next) => {
  try {
    const resolved = (req as any).integrationKey;
    const app = await ensurePartnerApp(resolved);
    if (!app || app.status !== 'active') {
      return jsonErr(res, 403, 'Partner 应用不可用', 'FORBIDDEN');
    }

    const { phone, code, deviceId, inviteToken } = req.body ?? {};
    const normalized = normalizeCnPhone(String(phone ?? ''));
    if (!normalized || !code) {
      return jsonErr(res, 400, 'phone 与 code 必填', 'VALIDATION_ERROR');
    }

    try {
      await assertSmsLoginAllowed(app, normalized, inviteToken ? String(inviteToken) : undefined);
    } catch (e) {
      if (e instanceof PartnerAccessDeniedError) {
        return jsonErr(res, 403, e.message, e.code);
      }
      throw e;
    }

    const ok = await partnerSmsService.verifyOtp(app.id, normalized, String(code));
    if (!ok) return jsonErr(res, 401, '验证码错误或已过期', 'INVALID_OTP');

    const externalId = phoneExternalId(normalized);
    const endUser = await partnerRepo.upsertExternalUser(
      app.id,
      externalId,
      maskPhone(normalized)
    );
    await partnerRepo.bindIdentity(app.id, 'sms', normalized, endUser.id);

    await onSmsVerifySuccess(
      app,
      normalized,
      inviteToken ? String(inviteToken) : undefined,
      endUser.id
    );

    const device =
      String(deviceId ?? req.headers['x-device-id'] ?? '').trim() ||
      undefined;
    if (device && device.length >= 8) {
      const anonymous = await partnerRepo.findAnonymousUserByDevice(app.id, device);
      if (anonymous && anonymous.id !== endUser.id) {
        await partnerRepo.mergeEndUsers(app.id, anonymous.id, endUser.id);
        await partnerRepo.appendAuditLog({
          partnerAppId: app.id,
          action: 'end_user.merge',
          endUserId: endUser.id,
          detail: { from: anonymous.id, reason: 'sms_login' },
        });
      }
    }

    await partnerRepo.appendAuditLog({
      partnerAppId: app.id,
      action: 'auth.sms.verify',
      endUserId: endUser.id,
      detail: { phoneMasked: maskPhone(normalized) },
    });

    return issueSessionForEndUser(res, app, resolved!.userId, endUser.id, {
      phoneMasked: maskPhone(normalized),
      loginMethod: 'sms',
    });
  } catch (e) {
    if (e instanceof PartnerAccessDeniedError) {
      return jsonErr(res, 403, e.message, e.code);
    }
    next(e);
  }
});

export default router;
