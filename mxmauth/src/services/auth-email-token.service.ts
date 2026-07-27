/**
 * 邮箱验证 / 重置密码 token（只存 hash）
 */

import crypto from 'crypto';
import { getSupabaseClient } from '@mxmai/mxmdata';

export type AuthEmailTokenType = 'email_verify' | 'password_reset';

const TTL_MS: Record<AuthEmailTokenType, number> = {
  email_verify: 24 * 60 * 60 * 1000,
  password_reset: 60 * 60 * 1000,
};

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export class AuthEmailTokenService {
  private client = getSupabaseClient();

  /** 创建 token，返回明文（仅用于邮件链接） */
  async issue(userId: string, type: AuthEmailTokenType): Promise<string> {
    const raw = crypto.randomBytes(32).toString('hex');
    const token_hash = hashToken(raw);
    const expires_at = new Date(Date.now() + TTL_MS[type]).toISOString();

    // 使同类型未使用 token 失效
    await this.client
      .from('auth_email_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('type', type)
      .is('used_at', null);

    const { error } = await this.client.from('auth_email_tokens').insert({
      user_id: userId,
      type,
      token_hash,
      expires_at,
    });
    if (error) {
      throw new Error(`Failed to issue auth email token: ${error.message}`);
    }
    return raw;
  }

  async consume(
    rawToken: string,
    type: AuthEmailTokenType
  ): Promise<{ userId: string } | null> {
    const token_hash = hashToken(rawToken);
    const { data, error } = await this.client
      .from('auth_email_tokens')
      .select('id, user_id, expires_at, used_at')
      .eq('token_hash', token_hash)
      .eq('type', type)
      .maybeSingle();

    if (error || !data) return null;
    if (data.used_at) return null;
    if (new Date(data.expires_at).getTime() < Date.now()) return null;

    const { error: updErr } = await this.client
      .from('auth_email_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', data.id)
      .is('used_at', null);

    if (updErr) return null;
    return { userId: data.user_id as string };
  }
}

export const authEmailTokenService = new AuthEmailTokenService();
