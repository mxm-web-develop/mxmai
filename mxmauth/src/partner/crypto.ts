import crypto from 'crypto';

const PARTNER_SECRET_PREFIX = 'mxmps_';

export function generatePartnerSecret(): { plain: string; hash: string; prefix: string } {
  const raw = crypto.randomBytes(32).toString('hex');
  const plain = `${PARTNER_SECRET_PREFIX}${raw}`;
  const hash = hashPartnerSecret(plain);
  const prefix = plain.slice(0, 12);
  return { plain, hash, prefix };
}

export function hashPartnerSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** HMAC-SHA256(partner_secret, timestamp + body) */
export function verifyPartnerHmac(
  secret: string,
  timestamp: string,
  body: string,
  signature: string
): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}${body}`)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export function isTimestampFresh(timestamp: string, maxSkewSec = 300): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - ts) <= maxSkewSec;
}
