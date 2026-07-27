'use client';

import { getStoredPartnerSession, isSmsLoggedIn } from './partner-session';
import { getApiMode } from './runtime-config';

/** Open API 鉴权：须短信登录后的 Partner session */
export async function getAuthBearerToken(): Promise<string | null> {
  if (getApiMode() !== 'http') return null;
  if (!isSmsLoggedIn()) return null;
  return getStoredPartnerSession();
}

export function getAuthBearerTokenSync(): string | null {
  if (getApiMode() !== 'http') return null;
  if (!isSmsLoggedIn()) return null;
  return getStoredPartnerSession();
}
