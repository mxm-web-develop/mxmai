/**
 * 客户端环境推断（主题/语言默认值辅助）
 */

import { Router, type Request } from 'express';

const router = Router();

function extractClientIp(req: Request): string {
  const cfConnecting = req.headers['cf-connecting-ip'];
  if (typeof cfConnecting === 'string' && cfConnecting.trim()) return cfConnecting.trim();

  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string') {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }

  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();

  return req.ip || req.socket.remoteAddress || '';
}

function isPrivateIp(ip: string): boolean {
  const normalized = ip.replace(/^::ffff:/, '');
  if (!normalized || normalized === '127.0.0.1' || normalized === '::1') return true;
  if (normalized.startsWith('10.')) return true;
  if (normalized.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)) return true;
  return false;
}

async function lookupCountryByIp(ip: string): Promise<string | null> {
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode`,
      { signal: AbortSignal.timeout(2500) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { status?: string; countryCode?: string };
    if (data.status === 'success' && data.countryCode) {
      return String(data.countryCode).toUpperCase();
    }
  } catch {
    /* 忽略 geo 失败，由前端回退 */
  }
  return null;
}

async function resolveCountryCode(req: Request): Promise<string | null> {
  const cfCountry = req.headers['cf-ipcountry'];
  if (typeof cfCountry === 'string') {
    const code = cfCountry.trim().toUpperCase();
    if (code.length === 2 && code !== 'XX' && code !== 'T1') return code;
  }

  const ip = extractClientIp(req);
  if (!ip || isPrivateIp(ip)) return null;
  return lookupCountryByIp(ip);
}

/**
 * GET /client-hints
 * 根据请求 IP 推断国家/地区（供前端默认语言）
 */
router.get('/client-hints', async (req, res) => {
  const countryCode = await resolveCountryCode(req);
  res.json({
    countryCode,
    timestamp: new Date().toISOString(),
  });
});

export default router;
