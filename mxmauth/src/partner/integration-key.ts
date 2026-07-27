import crypto from 'crypto';
import { RepositoryFactory } from '@mxmai/mxmdata';
import type { PartnerAppRecord } from '@mxmai/mxmdata';

export interface ResolvedIntegrationKey {
  keyId: string;
  userId: string;
  username: string;
  partnerApp: PartnerAppRecord | null;
}

function extractKeyFromRequest(headers: {
  authorization?: string;
  'x-partner-key'?: string;
}): string | null {
  const fromHeader = headers['x-partner-key'];
  if (typeof fromHeader === 'string' && fromHeader.trim()) return fromHeader.trim();

  const auth = headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    if (token.startsWith('mxm_')) return token;
  }
  return null;
}

export async function resolveIntegrationKeyFromRequest(headers: {
  authorization?: string;
  'x-partner-key'?: string;
}): Promise<ResolvedIntegrationKey | null> {
  const rawKey = extractKeyFromRequest(headers);
  if (!rawKey) return null;

  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const userApiKeyRepo = RepositoryFactory.createUserApiKeyRepository();
  const keyRecord = await userApiKeyRepo.findByKeyHash(keyHash);
  if (!keyRecord || keyRecord.key_type !== 'integration') return null;

  const expiresAt = keyRecord.expires_at ? new Date(keyRecord.expires_at).getTime() : null;
  if (expiresAt != null && Date.now() > expiresAt) return null;

  const userRepo = RepositoryFactory.createUserRepository();
  const user = await userRepo.findById(keyRecord.user_id);
  if (!user) return null;

  const partnerRepo = RepositoryFactory.createPartnerRepository();
  const partnerApp = await partnerRepo.findAppByApiKeyId(keyRecord.id);

  await userApiKeyRepo.updateLastUsedAt(keyRecord.id).catch(() => {});

  return {
    keyId: keyRecord.id,
    userId: user.id,
    username: user.username ?? user.id,
    partnerApp,
  };
}
