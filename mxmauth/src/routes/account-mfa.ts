/**
 * 账号 MFA（TOTP）路由 — 需登录
 */

import type { Router } from 'express';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { authMiddleware } from '../middleware/auth';
import { mfaTotpService } from '../services/mfa-totp.service';

const userRepo = RepositoryFactory.createUserRepository();

function mfaError(res: import('express').Response, err: unknown): void {
  const code = (err as { code?: string })?.code;
  const map: Record<string, { status: number; message: string; error: string }> = {
    OAUTH_ONLY: { status: 400, message: '请先设置登录密码后再开启两步验证', error: 'OAUTH_ONLY' },
    INVALID_PASSWORD: { status: 400, message: '当前密码不正确', error: 'INVALID_PASSWORD' },
    MFA_SETUP_REQUIRED: { status: 400, message: '请先完成验证器绑定', error: 'MFA_SETUP_REQUIRED' },
    INVALID_TOTP: { status: 400, message: '验证码不正确', error: 'INVALID_TOTP' },
    MFA_RATE_LIMITED: { status: 429, message: '尝试次数过多，请稍后再试', error: 'MFA_RATE_LIMITED' },
    MFA_NOT_ENABLED: { status: 400, message: '两步验证未开启', error: 'MFA_NOT_ENABLED' },
  };
  const mapped = code ? map[code] : null;
  if (mapped) {
    res.status(mapped.status).json({ code: mapped.status, message: mapped.message, error: mapped.error });
    return;
  }
  const message = err instanceof Error ? err.message : 'MFA operation failed';
  res.status(500).json({ code: 500, message, error: 'INTERNAL_ERROR' });
}

export function registerAccountMfaRoutes(router: Router): void {
  router.get('/mfa/status', authMiddleware, async (req, res, next) => {
    try {
      const user = await userRepo.findById(req.user!.userId);
      if (!user) {
        return res.status(404).json({ code: 404, message: 'User not found', error: 'NOT_FOUND' });
      }
      const status = await mfaTotpService.getStatus(user);
      res.json({ code: 200, message: 'ok', data: status });
    } catch (error) {
      next(error);
    }
  });

  router.post('/mfa/totp/setup', authMiddleware, async (req, res, next) => {
    try {
      const user = await userRepo.findById(req.user!.userId);
      if (!user) {
        return res.status(404).json({ code: 404, message: 'User not found', error: 'NOT_FOUND' });
      }
      const password = String(req.body?.password || '');
      if (!password) {
        return res.status(400).json({
          code: 400,
          message: 'password is required',
          error: 'VALIDATION_ERROR',
        });
      }
      const data = await mfaTotpService.setup(user, password);
      res.json({ code: 200, message: 'ok', data });
    } catch (error) {
      if ((error as { code?: string })?.code) {
        mfaError(res, error);
        return;
      }
      next(error);
    }
  });

  router.post('/mfa/totp/enable', authMiddleware, async (req, res, next) => {
    try {
      const user = await userRepo.findById(req.user!.userId);
      if (!user) {
        return res.status(404).json({ code: 404, message: 'User not found', error: 'NOT_FOUND' });
      }
      const password = String(req.body?.password || '');
      const code = String(req.body?.code || '').trim();
      if (!password || !code) {
        return res.status(400).json({
          code: 400,
          message: 'password and code are required',
          error: 'VALIDATION_ERROR',
        });
      }
      await mfaTotpService.enable(user, password, code);
      res.json({ code: 200, message: 'Two-factor authentication enabled' });
    } catch (error) {
      if ((error as { code?: string })?.code) {
        mfaError(res, error);
        return;
      }
      next(error);
    }
  });

  router.post('/mfa/totp/disable', authMiddleware, async (req, res, next) => {
    try {
      const user = await userRepo.findById(req.user!.userId);
      if (!user) {
        return res.status(404).json({ code: 404, message: 'User not found', error: 'NOT_FOUND' });
      }
      const password = String(req.body?.password || '');
      const code = String(req.body?.code || '').trim();
      if (!password || !code) {
        return res.status(400).json({
          code: 400,
          message: 'password and code are required',
          error: 'VALIDATION_ERROR',
        });
      }
      await mfaTotpService.disable(user, password, code);
      res.json({ code: 200, message: 'Two-factor authentication disabled' });
    } catch (error) {
      if ((error as { code?: string })?.code) {
        mfaError(res, error);
        return;
      }
      next(error);
    }
  });
}
