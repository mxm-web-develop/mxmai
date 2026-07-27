/**
 * 验证码验证中间件
 */

import { Request, Response, NextFunction } from 'express';
import { CaptchaService } from '../services/captcha.service';

const captchaService = new CaptchaService();

/**
 * 滑动拼图验证中间件
 * 登录/注册前须先 POST /captcha/verify 完成拼图，再携带 captchaId 提交
 */
export function captchaMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const captchaEnabled = process.env.CAPTCHA_ENABLE === 'true';

  if (!captchaEnabled) {
    return next();
  }

  const { captchaId } = req.body;

  if (!captchaId) {
    res.status(400).json({
      code: 400,
      message: '请先完成滑动验证',
      error: 'CAPTCHA_REQUIRED',
    });
    return;
  }

  captchaService
    .isVerified(captchaId)
    .then(async (isValid) => {
      if (!isValid) {
        res.status(400).json({
          code: 400,
          message: '请先完成滑动验证或验证已过期',
          error: 'CAPTCHA_INVALID',
        });
        return;
      }

      await captchaService.consumeVerified(captchaId);
      next();
    })
    .catch((error) => {
      console.error('验证码验证异常:', error);
      res.status(500).json({
        code: 500,
        message: '验证码验证失败',
        error: 'CAPTCHA_ERROR',
      });
    });
}
