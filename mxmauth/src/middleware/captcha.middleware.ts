/**
 * 验证码验证中间件
 */

import { Request, Response, NextFunction } from 'express';
import { CaptchaService } from '../services/captcha.service';

const captchaService = new CaptchaService();

/**
 * 验证码验证中间件
 * 从请求 body 中读取 captchaId 和 captchaAnswer 进行验证
 * 可通过环境变量 CAPTCHA_ENABLE 控制是否启用验证码
 */
export function captchaMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // 检查是否启用验证码（默认启用）
  const captchaEnabled = process.env.CAPTCHA_ENABLE !== 'false';
  
  if (!captchaEnabled) {
    // 验证码已禁用，直接通过
    return next();
  }

  const { captchaId, captchaAnswer } = req.body;

  if (!captchaId || !captchaAnswer) {
    res.status(400).json({
      code: 400,
      message: '验证码不能为空',
      error: 'CAPTCHA_REQUIRED',
    });
    return;
  }

  // 异步验证
  captchaService
    .verify(captchaId, captchaAnswer)
    .then((isValid) => {
      if (!isValid) {
        res.status(400).json({
          code: 400,
          message: '验证码错误或已过期',
          error: 'CAPTCHA_INVALID',
        });
        return;
      }
      // 验证通过，继续处理
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

