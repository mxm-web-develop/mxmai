/**
 * Partner 终端用户短信 OTP（Redis）
 */
import Redis from 'ioredis';
import crypto from 'crypto';
import { sendAliyunPnvsVerifySms } from './aliyun-pnvs.client';
import { maskPhone, normalizeCnPhone } from './phone';

function createRedis(): Redis {
  return new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 2000)),
  });
}

let redisSingleton: Redis | null = null;

function getRedis(): Redis {
  if (!redisSingleton) redisSingleton = createRedis();
  return redisSingleton;
}

function otpKey(appId: string, phone: string): string {
  return `partner:sms:otp:${appId}:${phone}`;
}

function sendCooldownKey(appId: string, phone: string): string {
  return `partner:sms:cooldown:${appId}:${phone}`;
}

function dailySendKey(appId: string, phone: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return `partner:sms:daily:${appId}:${phone}:${day}`;
}

function generateOtp(): string {
  if (process.env.PARTNER_SMS_MOCK === 'true') return '123456';
  return String(crypto.randomInt(100000, 999999));
}

export interface SendSmsOtpResult {
  sent: boolean;
  phoneMasked: string;
  expiresInSec: number;
  /** 仅 mock 模式返回，便于开发 */
  debugCode?: string;
}

export class PartnerSmsService {
  private otpTtlSec = Number(process.env.PARTNER_SMS_OTP_TTL_SEC || 300);
  private cooldownSec = Number(process.env.PARTNER_SMS_COOLDOWN_SEC || 60);
  private dailyMax = Number(process.env.PARTNER_SMS_DAILY_MAX || 10);

  async sendOtp(partnerAppId: string, rawPhone: string): Promise<SendSmsOtpResult> {
    const phone = normalizeCnPhone(rawPhone);
    if (!phone) throw new Error('手机号格式无效');

    const redis = getRedis();
    const cooldown = await redis.get(sendCooldownKey(partnerAppId, phone));
    if (cooldown) {
      throw new Error('发送过于频繁，请稍后再试');
    }

    const dailyKey = dailySendKey(partnerAppId, phone);
    const dailyCount = Number((await redis.get(dailyKey)) ?? 0);
    if (dailyCount >= this.dailyMax) {
      throw new Error('今日验证码发送次数已达上限');
    }

    const code = generateOtp();

    try {
      await this.dispatchSms(phone, code);
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : '短信发送失败');
    }

    await redis.setex(otpKey(partnerAppId, phone), this.otpTtlSec, code);
    await redis.setex(sendCooldownKey(partnerAppId, phone), this.cooldownSec, '1');
    await redis.incr(dailyKey);
    await redis.expire(dailyKey, 86400);

    return {
      sent: true,
      phoneMasked: maskPhone(phone),
      expiresInSec: this.otpTtlSec,
      ...(process.env.PARTNER_SMS_MOCK === 'true' ? { debugCode: code } : {}),
    };
  }

  async verifyOtp(partnerAppId: string, rawPhone: string, code: string): Promise<boolean> {
    const phone = normalizeCnPhone(rawPhone);
    if (!phone || !code?.trim()) return false;

    const redis = getRedis();
    const stored = await redis.get(otpKey(partnerAppId, phone));
    if (!stored) return false;

    const ok = stored === code.trim();
    if (ok) await redis.del(otpKey(partnerAppId, phone));
    return ok;
  }

  /** 对接真实短信网关；mock 模式仅打日志 */
  private async dispatchSms(phone: string, code: string): Promise<void> {
    if (process.env.PARTNER_SMS_MOCK === 'true') {
      console.log(`[PartnerSms][mock] → ${maskPhone(phone)} code=${code}`);
      return;
    }

    const provider = process.env.PARTNER_SMS_PROVIDER?.trim();
    if (!provider) {
      throw new Error('未配置 PARTNER_SMS_PROVIDER');
    }

    if (provider === 'aliyun_pnvs' || provider === 'aliyun') {
      await sendAliyunPnvsVerifySms({ phone, code, validTimeSec: this.otpTtlSec });
      console.log(`[PartnerSms][aliyun_pnvs] sent → ${maskPhone(phone)}`);
      return;
    }

    throw new Error(`不支持的短信服务商: ${provider}`);
  }
}

export const partnerSmsService = new PartnerSmsService();
