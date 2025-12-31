/**
 * 验证码服务
 * 用于生成和验证图片验证码，防止机器人注册和登录
 */

import svgCaptcha from 'svg-captcha';
import Redis from 'ioredis';

export interface CaptchaResult {
  captchaId: string;
  image: string; // SVG 图片数据
}

export class CaptchaService {
  private redis: Redis;
  private prefix = 'captcha:';
  private expireSeconds = 300; // 5 分钟过期

  constructor() {
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = Number(process.env.REDIS_PORT || 6379);
    const redisPassword = process.env.REDIS_PASSWORD;

    this.redis = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      retryStrategy: (times) => {
        // 重试策略：最多重试 3 次
        if (times > 3) {
          return null; // 停止重试
        }
        return Math.min(times * 200, 2000); // 延迟时间
      },
      maxRetriesPerRequest: 3,
    });

    // 监听连接错误
    this.redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });
  }

  /**
   * 生成验证码
   * @returns 验证码 ID 和 SVG 图片
   */
  async generate(): Promise<CaptchaResult> {
    try {
      // 生成验证码
      const captcha = svgCaptcha.create({
        size: 4, // 验证码长度
        ignoreChars: '0o1il', // 忽略容易混淆的字符
        noise: 2, // 干扰线条数
        color: true, // 彩色
        background: '#f0f0f0', // 背景色
        width: 120,
        height: 40,
        fontSize: 50,
        charPreset: '123456789ABCDEFGHJKLMNPQRSTUVWXYZ', // 字符集（排除容易混淆的字符）
      });

      // 生成唯一 ID
      const captchaId = `cap_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // 存储验证码答案（转换为小写，不区分大小写）
      const answer = captcha.text.toLowerCase();
      await this.redis.setex(
        `${this.prefix}${captchaId}`,
        this.expireSeconds,
        answer
      );

      return {
        captchaId,
        image: captcha.data,
      };
    } catch (error) {
      console.error('生成验证码失败:', error);
      throw new Error('生成验证码失败');
    }
  }

  /**
   * 验证验证码
   * @param captchaId 验证码 ID
   * @param answer 用户输入的答案
   * @returns 是否验证通过
   */
  async verify(captchaId: string, answer: string): Promise<boolean> {
    if (!captchaId || !answer) {
      return false;
    }

    try {
      const key = `${this.prefix}${captchaId}`;
      const storedAnswer = await this.redis.get(key);

      if (!storedAnswer) {
        // 验证码不存在或已过期
        return false;
      }

      // 不区分大小写比较
      const isValid = storedAnswer.toLowerCase() === answer.toLowerCase();

      // 验证后删除验证码（一次性使用）
      if (isValid) {
        await this.redis.del(key);
      }

      return isValid;
    } catch (error) {
      console.error('验证验证码失败:', error);
      return false;
    }
  }

  /**
   * 检查 Redis 连接
   */
  async checkConnection(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      console.error('Redis 连接检查失败:', error);
      return false;
    }
  }

  /**
   * 关闭 Redis 连接
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}

