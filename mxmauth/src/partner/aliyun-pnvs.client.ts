/**
 * 阿里云号码认证 · 短信认证（SendSmsVerifyCode）
 * 个人开发者免企业资质，使用控制台预置签名/模板。
 */
import Dypnsapi20170525, {
  SendSmsVerifyCodeRequest,
} from '@alicloud/dypnsapi20170525';
import * as OpenApi from '@alicloud/openapi-client';

let clientSingleton: Dypnsapi20170525 | null = null;

function getClient(): Dypnsapi20170525 {
  if (clientSingleton) return clientSingleton;

  const accessKeyId =
    process.env.ALIYUN_PNVS_ACCESS_KEY_ID?.trim() ||
    process.env.ALIYUN_ACCESS_KEY_ID?.trim();
  const accessKeySecret =
    process.env.ALIYUN_PNVS_ACCESS_KEY_SECRET?.trim() ||
    process.env.ALIYUN_ACCESS_KEY_SECRET?.trim();

  if (!accessKeyId || !accessKeySecret) {
    throw new Error('未配置 ALIYUN_PNVS_ACCESS_KEY_ID / ALIYUN_PNVS_ACCESS_KEY_SECRET');
  }

  const config = new OpenApi.Config({
    accessKeyId,
    accessKeySecret,
    endpoint: process.env.ALIYUN_PNVS_ENDPOINT?.trim() || 'dypnsapi.aliyuncs.com',
  });

  clientSingleton = new Dypnsapi20170525(config);
  return clientSingleton;
}

export interface SendPnvsSmsParams {
  phone: string;
  code: string;
  validTimeSec?: number;
}

/** 发送验证码短信；验证码由本服务生成，阿里云仅负责下发 */
export async function sendAliyunPnvsVerifySms(params: SendPnvsSmsParams): Promise<void> {
  const signName = process.env.ALIYUN_PNVS_SIGN_NAME?.trim();
  const templateCode = process.env.ALIYUN_PNVS_TEMPLATE_CODE?.trim();
  if (!signName || !templateCode) {
    throw new Error('未配置 ALIYUN_PNVS_SIGN_NAME / ALIYUN_PNVS_TEMPLATE_CODE');
  }

  const min = String(
    process.env.ALIYUN_PNVS_TEMPLATE_MIN?.trim() ||
      Math.max(1, Math.ceil((params.validTimeSec ?? 300) / 60))
  );

  const req = new SendSmsVerifyCodeRequest({
    phoneNumber: params.phone,
    countryCode: '86',
    signName,
    templateCode,
    templateParam: JSON.stringify({ code: params.code, min }),
    validTime: params.validTimeSec ?? Number(process.env.PARTNER_SMS_OTP_TTL_SEC || 300),
    duplicatePolicy: 1,
    autoRetry: 1,
  });

  const client = getClient();
  const res = await client.sendSmsVerifyCode(req);
  const body = res.body;

  if (!body?.success && body?.code !== 'OK') {
    const msg = body?.message || body?.code || '短信发送失败';
    throw new Error(msg);
  }
}
