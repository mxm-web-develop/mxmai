/**
 * 滑动拼图验证码服务
 */

import { randomUUID } from 'crypto';
import sharp from 'sharp';
import Redis from 'ioredis';

export const CAPTCHA_WIDTH = 320;
export const CAPTCHA_HEIGHT = 160;
export const CAPTCHA_PUZZLE_TOP = 75;
export const CAPTCHA_PUZZLE_SIZE = 50;
const CAPTCHA_VERIFIED = 'verified';
const POSITION_MIN = 55;
const POSITION_MAX = 249;

export interface SlideCaptchaResult {
  captchaId: string;
  bgUrl: string;
  puzzleUrl: string;
}

export interface SlideVerifyPayload {
  x: number;
  duration?: number;
  trail?: [number, number][];
}

export class CaptchaService {
  private redis: Redis;
  private prefix = 'captcha:';
  private expireSeconds = 300;

  constructor() {
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = Number(process.env.REDIS_PORT || 6379);
    const redisPassword = process.env.REDIS_PASSWORD;

    this.redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
      maxRetriesPerRequest: 3,
    });

    this.redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });
  }

  private redisKey(captchaId: string): string {
    return `${this.prefix}${captchaId}`;
  }

  private toDataUrl(buffer: Buffer, mime = 'image/jpeg'): string {
    return `data:${mime};base64,${buffer.toString('base64')}`;
  }

  private async buildBackgroundImage(): Promise<Buffer> {
    const w = CAPTCHA_WIDTH;
    const h = CAPTCHA_HEIGHT;

    const blobs = [
      { cx: w * 0.22, cy: h * 0.35, r: 72, color: '#38bdf8', op: 0.55 },
      { cx: w * 0.78, cy: h * 0.28, r: 64, color: '#0ea5e9', op: 0.45 },
      { cx: w * 0.55, cy: h * 0.72, r: 80, color: '#7dd3fc', op: 0.4 },
      { cx: w * 0.15, cy: h * 0.78, r: 48, color: '#0284c7', op: 0.28 },
    ]
      .map(
        (b) =>
          `<circle cx="${b.cx}" cy="${b.cy}" r="${b.r}" fill="${b.color}" opacity="${b.op}"/>`
      )
      .join('');

    const grid = Array.from({ length: 9 }, (_, i) => {
      const x = ((i % 3) + 1) * (w / 4);
      const y = (Math.floor(i / 3) + 1) * (h / 4);
      return `<rect x="${x - 18}" y="${y - 18}" width="36" height="36" rx="8" fill="none" stroke="#ffffff" stroke-width="1.2" opacity="0.22"/>`;
    }).join('');

    const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f0f9ff"/>
      <stop offset="45%" stop-color="#e0f2fe"/>
      <stop offset="100%" stop-color="#bae6fd"/>
    </linearGradient>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.06"/>
      </feComponentTransfer>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  ${blobs}
  ${grid}
  <rect width="100%" height="100%" filter="url(#grain)" opacity="0.35"/>
</svg>`;

    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  private async createSlideImages(image: Buffer, sliderOffset: number) {
    const originalImage = sharp(image);
    const hole = await sharp({
      create: {
        width: CAPTCHA_PUZZLE_SIZE,
        height: CAPTCHA_PUZZLE_SIZE,
        channels: 4,
        background: { r: 15, g: 23, b: 42, alpha: 0.55 },
      },
    })
      .png()
      .toBuffer();

    const puzzlePiece = await originalImage
      .clone()
      .extract({
        left: sliderOffset,
        top: CAPTCHA_PUZZLE_TOP,
        width: CAPTCHA_PUZZLE_SIZE,
        height: CAPTCHA_PUZZLE_SIZE,
      })
      .png()
      .toBuffer();

    const puzzleWithShadow = await sharp(puzzlePiece)
      .extend({ top: 2, bottom: 4, left: 2, right: 2, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    const composedImage = await originalImage
      .composite([
        {
          input: hole,
          top: CAPTCHA_PUZZLE_TOP,
          left: sliderOffset,
          blend: 'over',
        },
      ])
      .jpeg({ quality: 90 })
      .toBuffer();

    return { puzzlePieceBuffer: puzzleWithShadow, composedImage };
  }

  async generate(): Promise<SlideCaptchaResult> {
    try {
      const image = await this.buildBackgroundImage();
      const sliderOffset = Math.max(
        POSITION_MIN,
        Math.floor(Math.random() * (POSITION_MAX - POSITION_MIN + 1))
      );
      const captchaId = `cap_${Date.now()}_${randomUUID().slice(0, 8)}`;
      const { puzzlePieceBuffer, composedImage } = await this.createSlideImages(
        image,
        sliderOffset
      );

      await this.redis.setex(
        this.redisKey(captchaId),
        this.expireSeconds,
        String(sliderOffset)
      );

      return {
        captchaId,
        bgUrl: this.toDataUrl(composedImage),
        puzzleUrl: this.toDataUrl(puzzlePieceBuffer, 'image/png'),
      };
    } catch (error) {
      console.error('生成滑动验证码失败:', error);
      throw new Error('生成验证码失败');
    }
  }

  private isSuspiciousSlide(payload: SlideVerifyPayload): boolean {
    const duration = payload.duration ?? 0;
    const trail = payload.trail ?? [];
    if (duration < 280) return true;
    if (trail.length < 4) return true;
    return false;
  }

  async verifySlide(
    captchaId: string,
    payload: SlideVerifyPayload
  ): Promise<{ success: boolean; reason?: string }> {
    if (!captchaId || !Number.isFinite(payload.x)) {
      return { success: false, reason: '参数无效' };
    }

    if (this.isSuspiciousSlide(payload)) {
      return { success: false, reason: '操作异常，请重试' };
    }

    try {
      const storedValue = await this.redis.get(this.redisKey(captchaId));
      if (!storedValue) {
        return { success: false, reason: '验证码不存在或已过期' };
      }
      if (storedValue === CAPTCHA_VERIFIED) {
        return { success: true };
      }

      const userPosition = Math.round(payload.x);
      const correctPosition = parseInt(storedValue, 10);
      if (Number.isNaN(correctPosition)) {
        return { success: false, reason: '验证码状态异常' };
      }

      const tolerance = 8;
      if (Math.abs(correctPosition - userPosition) <= tolerance) {
        await this.redis.setex(
          this.redisKey(captchaId),
          this.expireSeconds,
          CAPTCHA_VERIFIED
        );
        return { success: true };
      }

      return { success: false, reason: '请把拼图滑到正确位置' };
    } catch (error) {
      console.error('验证滑动验证码失败:', error);
      return { success: false, reason: '验证失败' };
    }
  }

  async isVerified(captchaId: string): Promise<boolean> {
    if (!captchaId) return false;
    try {
      const storedValue = await this.redis.get(this.redisKey(captchaId));
      return storedValue === CAPTCHA_VERIFIED;
    } catch (error) {
      console.error('检查验证码状态失败:', error);
      return false;
    }
  }

  async consumeVerified(captchaId: string): Promise<void> {
    if (!captchaId) return;
    try {
      await this.redis.del(this.redisKey(captchaId));
    } catch (error) {
      console.error('清理验证码失败:', error);
    }
  }

  async checkConnection(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      console.error('Redis 连接检查失败:', error);
      return false;
    }
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}
