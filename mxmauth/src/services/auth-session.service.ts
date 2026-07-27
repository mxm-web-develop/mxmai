/**
 * 登录成功后写 JWT + user_sessions
 */

import crypto from 'crypto';
import { getSupabaseClient } from '@mxmai/mxmdata';
import type { User } from '@mxmai/mxmdata';
import { generateTokenPair, getRefreshTokenExpiresInSeconds } from '../auth/jwt';

export function issueSessionTokens(user: User) {
  const tokens = generateTokenPair({
    userId: user.id,
    username: user.username,
    role: user.role,
  });

  const tokenHash = crypto.createHash('sha256').update(tokens.accessToken).digest('hex');
  const refreshHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + getRefreshTokenExpiresInSeconds() * 1000);

  void (async () => {
    try {
      const { error } = await getSupabaseClient().from('user_sessions').insert({
        user_id: user.id,
        token_hash: tokenHash,
        refresh_token_hash: refreshHash,
        expires_at: expiresAt.toISOString(),
      });
      if (error) console.warn('[auth-session] user_sessions insert failed:', error.message);
    } catch (e) {
      console.warn('[auth-session] user_sessions insert error:', e instanceof Error ? e.message : e);
    }
  })();

  return tokens;
}

export function publicUser(user: User) {
  const { password_hash: _, ...rest } = user;
  return rest;
}
