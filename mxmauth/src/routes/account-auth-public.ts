/**
 * 公开认证扩展：邮箱验证、重置密码、OAuth、providers
 */

import crypto from 'crypto';
import type { Router, Request, Response, NextFunction } from 'express';
import { RepositoryFactory, normalizeAppLocaleFromAcceptLanguage, type AppLocale } from '@mxmai/mxmdata';
import { hashPassword } from '../auth/password';
import { captchaMiddleware } from '../middleware/captcha.middleware';
import { mailService, isSmtpConfigured } from '../services/mail.service';
import { authEmailTokenService } from '../services/auth-email-token.service';
import { issueSessionTokens, publicUser } from '../services/auth-session.service';
import { verifyMfaChallengeToken } from '../auth/jwt';
import { mfaTotpService } from '../services/mfa-totp.service';
import {
  buildAuthorizeUrl,
  exchangeOAuthCode,
  getAppPublicUrl,
  isOAuthProvider,
  isOAuthProviderConfigured,
} from '../auth/oauth/providers';
import { consumeOAuthState, createOAuthState } from '../auth/oauth/state';
import { upsertUserFromOAuth } from '../auth/oauth/upsert-user';

const userRepo = RepositoryFactory.createUserRepository();

const resendCooldown = new Map<string, number>();
const forgotCooldown = new Map<string, number>();

function localeFromReq(req: Request): AppLocale {
  return normalizeAppLocaleFromAcceptLanguage(String(req.headers['accept-language'] || ''));
}

function rateLimited(map: Map<string, number>, key: string, ms: number): boolean {
  const now = Date.now();
  const prev = map.get(key) || 0;
  if (now - prev < ms) return true;
  map.set(key, now);
  return false;
}

export function registerAccountAuthPublicRoutes(router: Router): void {
  /**
   * GET /auth/providers
   */
  router.get('/auth/providers', (_req, res) => {
    res.json({
      code: 200,
      message: 'ok',
      data: {
        google: isOAuthProviderConfigured('google'),
        github: isOAuthProviderConfigured('github'),
        smtp: isSmtpConfigured(),
      },
    });
  });

  /**
   * POST /resend-verification
   */
  router.post('/resend-verification', captchaMiddleware, async (req, res, next) => {
    try {
      const email = String(req.body?.email || '')
        .trim()
        .toLowerCase();
      if (!email) {
        return res.status(400).json({
          code: 400,
          message: 'Email is required',
          error: 'VALIDATION_ERROR',
        });
      }
      if (rateLimited(resendCooldown, email, 60_000)) {
        return res.status(429).json({
          code: 429,
          message: 'Please wait before requesting another email',
          error: 'RATE_LIMITED',
        });
      }

      const user = await userRepo.findByEmail(email);
      // 防枚举：统一成功文案
      if (!user || user.email_verified_at) {
        return res.json({
          code: 200,
          message: 'If the account exists and needs verification, an email has been sent',
          data: { sent: true },
        });
      }

      if (!isSmtpConfigured()) {
        return res.status(503).json({
          code: 503,
          message: 'Email service is not configured',
          error: 'SMTP_NOT_CONFIGURED',
        });
      }

      const token = await authEmailTokenService.issue(user.id, 'email_verify');
      const mail = mailService.buildVerifyEmail({ token, locale: localeFromReq(req) });
      await mailService.sendMail({ to: email, ...mail });

      res.json({
        code: 200,
        message: 'If the account exists and needs verification, an email has been sent',
        data: { sent: true },
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /verify-email?token=
   */
  router.get('/verify-email', async (req, res, next) => {
    try {
      const token = String(req.query.token || '').trim();
      const wantsJson = String(req.headers.accept || '').includes('application/json');
      const appUrl = getAppPublicUrl();

      if (!token) {
        if (wantsJson) {
          return res.status(400).json({
            code: 400,
            message: 'Token is required',
            error: 'VALIDATION_ERROR',
          });
        }
        return res.redirect(`${appUrl}/?verified=0`);
      }

      const consumed = await authEmailTokenService.consume(token, 'email_verify');
      if (!consumed) {
        if (wantsJson) {
          return res.status(400).json({
            code: 400,
            message: 'Invalid or expired verification token',
            error: 'TOKEN_INVALID',
          });
        }
        return res.redirect(`${appUrl}/?verified=0`);
      }

      await userRepo.update(consumed.userId, {
        email_verified_at: new Date().toISOString(),
      });

      if (wantsJson) {
        return res.json({
          code: 200,
          message: 'Email verified',
          data: { verified: true },
        });
      }
      return res.redirect(`${appUrl}/?verified=1`);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /forgot-password
   */
  router.post('/forgot-password', captchaMiddleware, async (req, res, next) => {
    try {
      const email = String(req.body?.email || '')
        .trim()
        .toLowerCase();
      if (!email) {
        return res.status(400).json({
          code: 400,
          message: 'Email is required',
          error: 'VALIDATION_ERROR',
        });
      }

      // 防枚举：始终成功
      const okBody = {
        code: 200,
        message: 'If the account exists, a reset email has been sent',
        data: { sent: true },
      };

      if (rateLimited(forgotCooldown, email, 60_000)) {
        return res.json(okBody);
      }

      const user = await userRepo.findByEmail(email);
      if (!user) {
        return res.json(okBody);
      }

      if (!isSmtpConfigured()) {
        return res.status(503).json({
          code: 503,
          message: 'Email service is not configured',
          error: 'SMTP_NOT_CONFIGURED',
        });
      }

      const token = await authEmailTokenService.issue(user.id, 'password_reset');
      const mail = mailService.buildResetPassword({ token, locale: localeFromReq(req) });
      await mailService.sendMail({ to: email, ...mail });
      return res.json(okBody);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /reset-password
   */
  router.post('/reset-password', async (req, res, next) => {
    try {
      const token = String(req.body?.token || '').trim();
      const newPassword = String(req.body?.newPassword || req.body?.password || '');
      if (!token || !newPassword) {
        return res.status(400).json({
          code: 400,
          message: 'Token and newPassword are required',
          error: 'VALIDATION_ERROR',
        });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({
          code: 400,
          message: 'Password must be at least 8 characters',
          error: 'VALIDATION_ERROR',
        });
      }

      const consumed = await authEmailTokenService.consume(token, 'password_reset');
      if (!consumed) {
        return res.status(400).json({
          code: 400,
          message: 'Invalid or expired reset token',
          error: 'TOKEN_INVALID',
        });
      }

      const password_hash = await hashPassword(newPassword);
      await userRepo.update(consumed.userId, {
        password_hash,
        email_verified_at: new Date().toISOString(),
      });

      try {
        const { getSupabaseClient } = await import('@mxmai/mxmdata');
        await getSupabaseClient().from('user_sessions').delete().eq('user_id', consumed.userId);
      } catch (e) {
        console.warn('[reset-password] clear sessions failed:', e instanceof Error ? e.message : e);
      }

      res.json({
        code: 200,
        message: 'Password reset successful',
        data: { ok: true },
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /oauth/:provider/start
   */
  router.get('/oauth/:provider/start', async (req, res) => {
    const provider = String(req.params.provider || '').toLowerCase();
    if (!isOAuthProvider(provider)) {
      return res.status(400).json({
        code: 400,
        message: 'Unsupported OAuth provider',
        error: 'VALIDATION_ERROR',
      });
    }
    if (!isOAuthProviderConfigured(provider)) {
      return res.status(503).json({
        code: 503,
        message: `${provider} OAuth is not configured`,
        error: 'OAUTH_NOT_CONFIGURED',
      });
    }
    try {
      const state = await createOAuthState(provider);
      const url = buildAuthorizeUrl(provider, state);
      return res.redirect(302, url);
    } catch (e) {
      console.error('[oauth/start]', e);
      return res.status(500).json({
        code: 500,
        message: 'Failed to start OAuth',
        error: 'OAUTH_START_FAILED',
      });
    }
  });

  /**
   * GET /oauth/:provider/callback
   */
  router.get('/oauth/:provider/callback', async (req: Request, res: Response, _next: NextFunction) => {
    const provider = String(req.params.provider || '').toLowerCase();
    const appUrl = getAppPublicUrl();
    const fail = (reason: string) => res.redirect(`${appUrl}/?oauth_error=${encodeURIComponent(reason)}`);

    if (!isOAuthProvider(provider)) {
      return fail('unsupported_provider');
    }

    const code = String(req.query.code || '').trim();
    const state = String(req.query.state || '').trim();
    const oauthErr = String(req.query.error || '').trim();
    if (oauthErr) return fail(oauthErr);
    if (!code || !state) return fail('missing_code');

    try {
      const stateProvider = await consumeOAuthState(state);
      if (!stateProvider || stateProvider !== provider) {
        return fail('invalid_state');
      }

      const profile = await exchangeOAuthCode(provider, code);
      if (!profile.email) {
        return fail('email_required');
      }

      const user = await upsertUserFromOAuth(profile);
      if (user.status !== 'active') {
        return fail('account_inactive');
      }

      const tokens = issueSessionTokens(user);
      const payload = Buffer.from(
        JSON.stringify({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          user: publicUser(user),
        }),
        'utf8'
      ).toString('base64url');

      return res.redirect(`${appUrl}/#oauth=${payload}`);
    } catch (e) {
      console.error('[oauth/callback]', e);
      return fail('oauth_failed');
    }
  });

  /**
   * POST /auth/mfa/verify
   * 登录第二步：校验 TOTP 并签发 JWT
   */
  router.post('/auth/mfa/verify', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const mfaToken = String(req.body?.mfaToken || '').trim();
      const code = String(req.body?.code || '').trim();
      if (!mfaToken || !code) {
        return res.status(400).json({
          code: 400,
          message: 'mfaToken and code are required',
          error: 'VALIDATION_ERROR',
        });
      }

      let payload;
      try {
        payload = verifyMfaChallengeToken(mfaToken);
      } catch {
        return res.status(401).json({
          code: 401,
          message: 'MFA session expired, please login again',
          error: 'MFA_TOKEN_EXPIRED',
        });
      }

      try {
        await mfaTotpService.verifyLoginChallenge(payload.userId, code);
      } catch (err) {
        const errCode = (err as { code?: string })?.code;
        if (errCode === 'INVALID_TOTP') {
          return res.status(400).json({
            code: 400,
            message: 'Invalid verification code',
            error: 'INVALID_TOTP',
          });
        }
        if (errCode === 'MFA_RATE_LIMITED') {
          return res.status(429).json({
            code: 429,
            message: 'Too many attempts',
            error: 'MFA_RATE_LIMITED',
          });
        }
        throw err;
      }

      const user = await userRepo.findById(payload.userId);
      if (!user || user.status !== 'active') {
        return res.status(403).json({
          code: 403,
          message: 'Account unavailable',
          error: 'FORBIDDEN',
        });
      }

      const tokens = issueSessionTokens(user);
      res.json({
        code: 200,
        message: 'Login successful',
        data: {
          user: publicUser(user),
          tokens,
        },
      });
    } catch (error) {
      next(error);
    }
  });
}

/** 从邮箱本地部分生成 username */
export async function allocateUsernameFromEmail(email: string): Promise<string> {
  const local = email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 24) || 'user';

  let candidate = local;
  for (let i = 0; i < 20; i++) {
    const existing = await userRepo.findByUsername(candidate);
    if (!existing) return candidate;
    candidate = `${local}_${crypto.randomBytes(2).toString('hex')}`;
  }
  return `user_${crypto.randomBytes(4).toString('hex')}`;
}
