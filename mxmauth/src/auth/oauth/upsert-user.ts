/**
 * OAuth 登录：绑定已有用户或创建新用户
 */

import crypto from 'crypto';
import { RepositoryFactory, getSupabaseClient, DuplicateError } from '@mxmai/mxmdata';
import type { User } from '@mxmai/mxmdata';
import { hashPassword } from '../password';
import type { OAuthProfile } from './providers';
import { FolderService } from '../../services/folder.service';

const userRepo = RepositoryFactory.createUserRepository();
const folderService = new FolderService();

function sanitizeUsernameBase(hint: string | null, email: string | null): string {
  const raw = (hint || email?.split('@')[0] || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 24);
  return raw || 'user';
}

async function allocateUsername(base: string): Promise<string> {
  let candidate = base;
  for (let i = 0; i < 20; i++) {
    const existing = await userRepo.findByUsername(candidate);
    if (!existing) return candidate;
    candidate = `${base}_${crypto.randomBytes(2).toString('hex')}`;
  }
  return `user_${crypto.randomBytes(4).toString('hex')}`;
}

async function findIdentity(
  provider: string,
  providerUserId: string
): Promise<{ user_id: string } | null> {
  const { data, error } = await getSupabaseClient()
    .from('oauth_identities')
    .select('user_id')
    .eq('provider', provider)
    .eq('provider_user_id', providerUserId)
    .maybeSingle();
  if (error || !data) return null;
  return { user_id: data.user_id as string };
}

async function linkIdentity(userId: string, profile: OAuthProfile): Promise<void> {
  const { error } = await getSupabaseClient().from('oauth_identities').upsert(
    {
      user_id: userId,
      provider: profile.provider,
      provider_user_id: profile.providerUserId,
      email: profile.email,
      raw_profile: profile.raw,
    },
    { onConflict: 'provider,provider_user_id' }
  );
  if (error) {
    throw new Error(`Failed to link oauth identity: ${error.message}`);
  }
}

export async function upsertUserFromOAuth(profile: OAuthProfile): Promise<User> {
  const existingIdentity = await findIdentity(profile.provider, profile.providerUserId);
  if (existingIdentity) {
    const user = await userRepo.findById(existingIdentity.user_id);
    if (!user) throw new Error('OAuth identity points to missing user');
    if (!user.email_verified_at && profile.email) {
      await userRepo.update(user.id, {
        email_verified_at: new Date().toISOString(),
        ...(user.email ? {} : { email: profile.email }),
        ...(profile.avatarUrl && !user.avatar_url ? { avatar_url: profile.avatarUrl } : {}),
      });
      return (await userRepo.findById(user.id))!;
    }
    return user;
  }

  let user: User | null = null;
  if (profile.email) {
    user = await userRepo.findByEmail(profile.email);
  }

  if (user) {
    await linkIdentity(user.id, profile);
    const patch: { email_verified_at?: string; avatar_url?: string } = {};
    if (!user.email_verified_at) patch.email_verified_at = new Date().toISOString();
    if (profile.avatarUrl && !user.avatar_url) patch.avatar_url = profile.avatarUrl;
    if (Object.keys(patch).length) {
      await userRepo.update(user.id, patch);
      user = (await userRepo.findById(user.id))!;
    }
    return user;
  }

  const username = await allocateUsername(sanitizeUsernameBase(profile.usernameHint, profile.email));
  // OAuth 用户无可用密码：写入随机 hash，禁止密码登录（无明文）
  const password_hash = await hashPassword(crypto.randomBytes(32).toString('hex'));

  try {
    user = await userRepo.create({
      username,
      email: profile.email || undefined,
      password_hash,
      avatar_url: profile.avatarUrl || undefined,
      email_verified_at: new Date().toISOString(),
    });
  } catch (e) {
    if (e instanceof DuplicateError && profile.email) {
      user = await userRepo.findByEmail(profile.email);
      if (!user) throw e;
    } else {
      throw e;
    }
  }

  await linkIdentity(user.id, profile);
  await folderService.createDefaultFolders(user.id);
  return user;
}
