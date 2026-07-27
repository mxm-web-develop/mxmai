import jwt from 'jsonwebtoken';
import { hashSessionToken } from './crypto';

export interface PartnerSessionJwtPayload {
  type: 'partner_session';
  partnerAppId: string;
  endUserId: string;
  callerUserId: string;
  allowedSlugs: string[];
  sessionId: string;
}

function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'your-secret-key-change-in-production';
}

function getSessionExpiresInSec(): number {
  return Number(process.env.PARTNER_SESSION_EXPIRES_IN_SECONDS || 7 * 24 * 3600);
}

export function signPartnerSessionToken(payload: Omit<PartnerSessionJwtPayload, 'type'>): {
  token: string;
  expiresAt: string;
  tokenHash: string;
} {
  const expiresIn = getSessionExpiresInSec();
  const token = jwt.sign(
    {
      ...payload,
      type: 'partner_session',
      jti: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
    getJwtSecret(),
    { expiresIn }
  );
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  return { token, expiresAt, tokenHash: hashSessionToken(token) };
}

export function verifyPartnerSessionToken(token: string): PartnerSessionJwtPayload {
  const clockTolerance = Number(process.env.JWT_CLOCK_TOLERANCE_SECONDS) || 120;
  const decoded = jwt.verify(token, getJwtSecret(), { clockTolerance }) as PartnerSessionJwtPayload;
  if (decoded.type !== 'partner_session') {
    throw new Error('Invalid token type');
  }
  return decoded;
}
