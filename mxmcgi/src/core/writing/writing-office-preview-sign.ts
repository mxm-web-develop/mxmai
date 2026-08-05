/**
 * 写作 PPTX 公网预览签名（供 Office Online 无 JWT 拉取）。
 * URL：{PUBLIC_GATEWAY_ORIGIN}/api/v1/media/public/writing/{taskId}?exp=&sig=
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_TTL_SEC = 6 * 60 * 60; // 6h，足够打开查看器

function signSecret(): string {
  const s =
    process.env.MEDIA_SIGN_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    process.env.SUPABASE_JWT_SECRET?.trim() ||
    '';
  if (!s) {
    throw new Error('MEDIA_SIGN_SECRET / JWT_SECRET 未配置，无法签发 Office 预览链接');
  }
  return s;
}

export function publicGatewayOrigin(): string {
  const raw = (process.env.PUBLIC_GATEWAY_ORIGIN || '').trim().replace(/\/$/, '');
  if (raw.startsWith('https://') || raw.startsWith('http://')) return raw;
  return '';
}

function payload(taskId: string, exp: number): string {
  return `writing-pptx:${taskId}:${exp}`;
}

export function signWritingPptxPublicAccess(
  taskId: string,
  opts?: { ttlSec?: number; nowSec?: number }
): { exp: number; sig: string } {
  const ttl = Math.max(60, Math.min(7 * 24 * 3600, opts?.ttlSec ?? DEFAULT_TTL_SEC));
  const exp = (opts?.nowSec ?? Math.floor(Date.now() / 1000)) + ttl;
  const sig = createHmac('sha256', signSecret()).update(payload(taskId, exp)).digest('hex');
  return { exp, sig };
}

export function verifyWritingPptxPublicAccess(
  taskId: string,
  expRaw: unknown,
  sigRaw: unknown
): boolean {
  const exp = Number(expRaw);
  const sig = String(sigRaw ?? '').trim().toLowerCase();
  if (!taskId || !Number.isFinite(exp) || exp <= 0 || !/^[a-f0-9]{64}$/.test(sig)) return false;
  if (exp < Math.floor(Date.now() / 1000)) return false;
  const expected = createHmac('sha256', signSecret()).update(payload(taskId, exp)).digest('hex');
  try {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(sig, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** 返回 Office Online 可 GET 的绝对 HTTPS URL；无公网 origin 时返回 null */
export function buildWritingPptxOfficeEmbedSrc(taskId: string, opts?: { ttlSec?: number }): string | null {
  const origin = publicGatewayOrigin();
  if (!origin.startsWith('https://')) return null;
  const { exp, sig } = signWritingPptxPublicAccess(taskId, opts);
  const path = `/api/v1/media/public/writing/${encodeURIComponent(taskId)}`;
  return `${origin}${path}?exp=${exp}&sig=${sig}`;
}
