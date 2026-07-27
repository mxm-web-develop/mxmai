'use client';

const DEVICE_KEY = 'eshop_device_id';
const SESSION_KEY = 'eshop_partner_session';
const SESSION_EXP_KEY = 'eshop_partner_session_exp';
const PHONE_MASK_KEY = 'eshop_partner_phone_masked';
const LOGIN_METHOD_KEY = 'eshop_partner_login_method';
const END_USER_KEY = 'eshop_partner_end_user_id';
const INVITE_KEY = 'eshop_partner_invite';

export type PartnerLoginMethod = 'anonymous' | 'sms';

/** 中国大陆 11 位手机号校验 */
export function isValidCnPhone(raw: string): boolean {
  const digits = raw.trim().replace(/\D/g, '');
  const normalized =
    digits.startsWith('86') && digits.length === 13 ? digits.slice(2) : digits;
  return /^1[3-9]\d{9}$/.test(normalized);
}

export function getStoredLoginMethod(): PartnerLoginMethod {
  if (typeof window === 'undefined') return 'anonymous';
  return localStorage.getItem(LOGIN_METHOD_KEY) === 'sms' ? 'sms' : 'anonymous';
}

export function getStoredPhoneMasked(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(PHONE_MASK_KEY);
}

export function isSmsLoggedIn(): boolean {
  return getStoredLoginMethod() === 'sms' && !!getStoredPartnerSession();
}

export function getStoredEndUserId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(END_USER_KEY);
}

export function storePartnerInviteToken(token: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(INVITE_KEY, token.trim());
}

export function getStoredPartnerInviteToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(INVITE_KEY)?.trim() || null;
}

export function clearPartnerInviteToken(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(INVITE_KEY);
}

export function storePartnerSession(
  token: string,
  expiresAt: string,
  opts?: { phoneMasked?: string; loginMethod?: PartnerLoginMethod; endUserId?: string }
): void {
  const prevEndUser = getStoredEndUserId();
  localStorage.setItem(SESSION_KEY, token);
  localStorage.setItem(SESSION_EXP_KEY, expiresAt);
  localStorage.removeItem('eshop_api_key');
  if (opts?.phoneMasked) localStorage.setItem(PHONE_MASK_KEY, opts.phoneMasked);
  if (opts?.loginMethod) localStorage.setItem(LOGIN_METHOD_KEY, opts.loginMethod);
  if (opts?.endUserId) localStorage.setItem(END_USER_KEY, opts.endUserId);
  if (opts?.endUserId && prevEndUser && prevEndUser !== opts.endUserId) {
    localStorage.removeItem('eshop_sync_at');
  }
}

export function clearPartnerSession(): void {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_EXP_KEY);
  localStorage.removeItem(PHONE_MASK_KEY);
  localStorage.removeItem(LOGIN_METHOD_KEY);
  localStorage.removeItem(END_USER_KEY);
  localStorage.removeItem('eshop_sync_at');
}

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id || id.length < 8) {
    id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function getStoredPartnerSession(): string | null {
  if (typeof window === 'undefined') return null;
  if (getStoredLoginMethod() !== 'sms') return null;
  const token = localStorage.getItem(SESSION_KEY)?.trim();
  const exp = localStorage.getItem(SESSION_EXP_KEY);
  if (!token) return null;
  if (exp && Date.now() > new Date(exp).getTime() - 60_000) {
    clearPartnerSession();
    return null;
  }
  return token;
}

/** 短信验证码登录（合并当前 deviceId 对应匿名用户的历史任务） */
export async function loginWithSms(phone: string, code: string): Promise<void> {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const deviceId = getOrCreateDeviceId();
  const inviteToken = getStoredPartnerInviteToken();
  const res = await fetch(`${origin}/api/h5/partner/auth/sms/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code, deviceId, inviteToken: inviteToken || undefined }),
  });
  const json = (await res.json()) as {
    success?: boolean;
    error?: string;
    sessionToken?: string;
    expiresAt?: string;
    phoneMasked?: string;
    endUserId?: string;
  };
  if (!res.ok || !json.sessionToken) {
    throw new Error(json.error ?? `登录失败 (${res.status})`);
  }
  storePartnerSession(json.sessionToken, json.expiresAt ?? '', {
    phoneMasked: json.phoneMasked,
    loginMethod: 'sms',
    endUserId: json.endUserId,
  });
  clearPartnerInviteToken();
  const { syncProjectsFromCloud } = await import('@/lib/project/project-sync');
  await syncProjectsFromCloud({ force: true });
}

export async function sendSmsCode(phone: string): Promise<{ phoneMasked?: string; debugCode?: string }> {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const inviteToken = getStoredPartnerInviteToken();
  const res = await fetch(`${origin}/api/h5/partner/auth/sms/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, inviteToken: inviteToken || undefined }),
  });
  const json = (await res.json()) as {
    success?: boolean;
    error?: string;
    phoneMasked?: string;
    debugCode?: string;
  };
  if (!res.ok) throw new Error(json.error ?? '发送失败');
  return { phoneMasked: json.phoneMasked, debugCode: json.debugCode };
}

/** 已禁用匿名会话；仅返回已短信登录的有效 token */
export async function ensurePartnerSession(_baseOrigin?: string): Promise<string> {
  if (isSmsLoggedIn()) {
    const existing = getStoredPartnerSession();
    if (existing) return existing;
  }
  throw new Error('请先手机号登录');
}

/** 退出登录（不再建立匿名会话） */
export async function logoutPartnerSession(): Promise<void> {
  clearPartnerSession();
}

/** @deprecated 使用 logoutPartnerSession */
export async function logoutAndReanonymous(_baseOrigin?: string): Promise<void> {
  await logoutPartnerSession();
}
