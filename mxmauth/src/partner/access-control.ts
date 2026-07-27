/**
 * Partner 终端用户访问控制：开放/白名单 + 一次性邀请码
 */
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { PartnerAppInviteRecord, PartnerAppRecord } from '@mxmai/mxmdata';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { maskPhone, normalizeCnPhone } from './phone';

const partnerRepo = () => RepositoryFactory.createPartnerRepository();

export class PartnerAccessDeniedError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NOT_ALLOWLISTED'
      | 'END_USER_BLOCKED'
      | 'INVITE_INVALID'
      | 'INVITE_ALREADY_USED' = 'NOT_ALLOWLISTED'
  ) {
    super(message);
    this.name = 'PartnerAccessDeniedError';
  }
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateInviteToken(): { plain: string; hash: string } {
  const plain = randomBytes(32).toString('base64url');
  return { plain, hash: hashInviteToken(plain) };
}

/** @deprecated 应用级邀请 token，已由 partner_app_invites 取代 */
export function isInviteTokenValid(app: PartnerAppRecord, inviteToken?: string | null): boolean {
  if (!inviteToken?.trim() || !app.invite_token_hash) return false;
  const hash = hashInviteToken(inviteToken.trim());
  try {
    return timingSafeEqual(Buffer.from(hash), Buffer.from(app.invite_token_hash));
  } catch {
    return false;
  }
}

export async function resolvePendingInvite(
  partnerAppId: string,
  inviteToken?: string | null
): Promise<PartnerAppInviteRecord | null> {
  if (!inviteToken?.trim()) return null;
  const hash = hashInviteToken(inviteToken.trim());
  return partnerRepo().findPendingInviteByTokenHash(partnerAppId, hash);
}

export function maskIdentitySubject(provider: string, subject: string): string {
  if (provider === 'sms') {
    return subject.length === 11 ? maskPhone(subject) : subject;
  }
  if (subject.length <= 6) return subject;
  return `${subject.slice(0, 3)}***${subject.slice(-3)}`;
}

export function buildH5LoginUrl(app: PartnerAppRecord, defaultH5Origin?: string): string {
  const base = (app.h5_login_base_url || defaultH5Origin || '').replace(/\/$/, '');
  return base ? `${base}/login` : '/login';
}

export function buildInviteUrl(
  app: PartnerAppRecord,
  tokenPlain: string,
  defaultH5Origin?: string
): string {
  const base = buildH5LoginUrl(app, defaultH5Origin).replace(/\/login$/, '');
  if (!base || base === '') {
    return `/login?invite=${encodeURIComponent(tokenPlain)}`;
  }
  return `${base}/login?invite=${encodeURIComponent(tokenPlain)}`;
}

export function buildOpenModeShareCopy(app: PartnerAppRecord, defaultH5Origin?: string): string {
  const url = buildH5LoginUrl(app, defaultH5Origin);
  return `请使用手机验证码登录：${url}`;
}

/** SMS 发码前：白名单 / 一次性邀请 / 开放模式校验 */
export async function assertSmsLoginAllowed(
  app: PartnerAppRecord,
  phone: string,
  inviteToken?: string | null
): Promise<void> {
  const normalized = normalizeCnPhone(phone);
  if (!normalized) throw new PartnerAccessDeniedError('无效的手机号');

  const existing = await partnerRepo().findEndUserBySmsPhone(app.id, normalized);
  if (existing?.status === 'blocked') {
    throw new PartnerAccessDeniedError('终端用户已封禁', 'END_USER_BLOCKED');
  }

  if (app.end_user_access_mode !== 'whitelist') return;

  const inAllowlist = await partnerRepo().isInAllowlist(app.id, 'sms', normalized);
  if (inAllowlist) return;

  const invite = await resolvePendingInvite(app.id, inviteToken);
  if (invite) return;

  if (inviteToken?.trim()) {
    throw new PartnerAccessDeniedError('邀请码无效或已被使用', 'INVITE_INVALID');
  }
  throw new PartnerAccessDeniedError('该手机号不在白名单中，请使用邀请链接或联系管理员');
}

/** SMS 验码成功后：消耗一次性邀请码并写入白名单 */
export async function onSmsVerifySuccess(
  app: PartnerAppRecord,
  phone: string,
  inviteToken?: string | null,
  endUserId?: string
): Promise<void> {
  const normalized = normalizeCnPhone(phone);
  if (!normalized) return;

  if (app.end_user_access_mode !== 'whitelist') return;

  const inAllowlist = await partnerRepo().isInAllowlist(app.id, 'sms', normalized);
  if (inAllowlist) return;

  const invite = await resolvePendingInvite(app.id, inviteToken);
  if (!invite) {
    if (inviteToken?.trim()) {
      throw new PartnerAccessDeniedError('邀请码无效或已被使用', 'INVITE_ALREADY_USED');
    }
    return;
  }

  if (!endUserId) {
    throw new PartnerAccessDeniedError('邀请码核销失败', 'INVITE_INVALID');
  }

  const consumed = await partnerRepo().consumeAppInvite(
    app.id,
    invite.id,
    normalized,
    endUserId
  );
  if (!consumed) {
    throw new PartnerAccessDeniedError('邀请码已被使用', 'INVITE_ALREADY_USED');
  }

  await partnerRepo().upsertAllowlist({
    partnerAppId: app.id,
    provider: 'sms',
    subject: normalized,
    source: 'invite',
  });
}

/** slug 是否允许访问（restricted 模式校验 allowed_slugs） */
export function isSlugAllowed(app: PartnerAppRecord, slug: string): boolean {
  if (app.slug_access_mode !== 'restricted') return true;
  if (app.allowed_slugs.length === 0) return false;
  return app.allowed_slugs.includes(slug);
}

/** partner session JWT 写入的 allowedSlugs（与 gateway 校验一致） */
export function effectiveAllowedSlugs(app: PartnerAppRecord): string[] {
  if (app.slug_access_mode === 'restricted') return app.allowed_slugs;
  return [];
}
