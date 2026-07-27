/**
 * TOTP 两步验证服务
 */

import crypto from 'crypto';
import { authenticator } from 'otplib';
import { getSupabaseClient } from '@mxmai/mxmdata';
import type { User } from '@mxmai/mxmdata';
import { verifyPassword } from '../auth/password';
import { decryptSecret, encryptSecret } from './mfa-crypto';

const ISSUER = process.env.MFA_TOTP_ISSUER || 'SuperMXM';

authenticator.options = { window: 1 };

const mfaAttemptMap = new Map<string, { count: number; resetAt: number }>();
const MFA_MAX_ATTEMPTS = Number(process.env.MFA_MAX_ATTEMPTS || 5);
const MFA_ATTEMPT_WINDOW_MS = 5 * 60 * 1000;

function attemptKey(kind: string, id: string): string {
  return `${kind}:${id}`;
}

function checkRateLimit(kind: string, id: string): boolean {
  const key = attemptKey(kind, id);
  const now = Date.now();
  const row = mfaAttemptMap.get(key);
  if (!row || now > row.resetAt) {
    mfaAttemptMap.set(key, { count: 1, resetAt: now + MFA_ATTEMPT_WINDOW_MS });
    return false;
  }
  row.count += 1;
  if (row.count > MFA_MAX_ATTEMPTS) return true;
  return false;
}

function clearRateLimit(kind: string, id: string): void {
  mfaAttemptMap.delete(attemptKey(kind, id));
}

export type MfaStatus = {
  totpEnabled: boolean;
  hasPassword: boolean;
  oauthOnly: boolean;
  pendingSetup: boolean;
};

export class MfaTotpService {
  private client = getSupabaseClient();

  async getStatus(user: User): Promise<MfaStatus> {
    const hasPassword = Boolean(user.password_hash);
    const { data } = await this.client
      .from('user_mfa_totp')
      .select('enabled_at')
      .eq('user_id', user.id)
      .maybeSingle();

    return {
      totpEnabled: Boolean(user.mfa_totp_enabled),
      hasPassword,
      oauthOnly: !hasPassword,
      pendingSetup: Boolean(data && !data.enabled_at),
    };
  }

  async assertPassword(user: User, password: string): Promise<void> {
    if (!user.password_hash) {
      throw Object.assign(new Error('OAUTH_ONLY'), { code: 'OAUTH_ONLY' });
    }
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      throw Object.assign(new Error('INVALID_PASSWORD'), { code: 'INVALID_PASSWORD' });
    }
  }

  async setup(user: User, password: string): Promise<{ secret: string; otpauthUrl: string }> {
    await this.assertPassword(user, password);

    const secret = authenticator.generateSecret();
    const label = user.email || user.username;
    const otpauthUrl = authenticator.keyuri(label, ISSUER, secret);

    const { error } = await this.client.from('user_mfa_totp').upsert(
      {
        user_id: user.id,
        secret_encrypted: encryptSecret(secret),
        enabled_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      throw new Error(`Failed to save MFA setup: ${error.message}`);
    }

    return { secret, otpauthUrl };
  }

  async enable(user: User, password: string, code: string): Promise<void> {
    await this.assertPassword(user, password);

    const row = await this.getTotpRow(user.id);
    if (!row) {
      throw Object.assign(new Error('MFA_SETUP_REQUIRED'), { code: 'MFA_SETUP_REQUIRED' });
    }

    const secret = decryptSecret(row.secret_encrypted);
    if (!authenticator.check(code.replace(/\s/g, ''), secret)) {
      throw Object.assign(new Error('INVALID_TOTP'), { code: 'INVALID_TOTP' });
    }

    const now = new Date().toISOString();
    const { error: totpErr } = await this.client
      .from('user_mfa_totp')
      .update({ enabled_at: now, updated_at: now })
      .eq('user_id', user.id);

    if (totpErr) throw new Error(totpErr.message);

    const { error: userErr } = await this.client
      .from('users')
      .update({ mfa_totp_enabled: true, updated_at: now })
      .eq('id', user.id);

    if (userErr) throw new Error(userErr.message);

    await this.clearUserSessions(user.id);
  }

  async disable(user: User, password: string, code: string): Promise<void> {
    await this.assertPassword(user, password);
    await this.verifyEnabledCode(user.id, code);

    await this.client.from('user_mfa_totp').delete().eq('user_id', user.id);
    await this.client
      .from('users')
      .update({ mfa_totp_enabled: false, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    await this.clearUserSessions(user.id);
  }

  async verifyEnabledCode(userId: string, code: string): Promise<void> {
    if (checkRateLimit('totp', userId)) {
      throw Object.assign(new Error('MFA_RATE_LIMITED'), { code: 'MFA_RATE_LIMITED' });
    }

    const row = await this.getTotpRow(userId);
    if (!row?.enabled_at) {
      throw Object.assign(new Error('MFA_NOT_ENABLED'), { code: 'MFA_NOT_ENABLED' });
    }

    const secret = decryptSecret(row.secret_encrypted);
    const normalized = code.replace(/\s/g, '');
    if (!authenticator.check(normalized, secret)) {
      throw Object.assign(new Error('INVALID_TOTP'), { code: 'INVALID_TOTP' });
    }

    clearRateLimit('totp', userId);
  }

  async verifyLoginChallenge(userId: string, code: string): Promise<void> {
    return this.verifyEnabledCode(userId, code);
  }

  private async getTotpRow(userId: string): Promise<{
    secret_encrypted: string;
    enabled_at: string | null;
  } | null> {
    const { data, error } = await this.client
      .from('user_mfa_totp')
      .select('secret_encrypted, enabled_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as { secret_encrypted: string; enabled_at: string | null } | null;
  }

  async clearUserSessions(userId: string): Promise<void> {
    try {
      await this.client.from('user_sessions').delete().eq('user_id', userId);
    } catch {
      // non-fatal
    }
  }
}

export const mfaTotpService = new MfaTotpService();
