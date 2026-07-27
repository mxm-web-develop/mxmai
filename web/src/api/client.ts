/**
 * 后台接口调试用 API 客户端
 * Base URL 默认指向 Gateway（如 http://localhost:3000）
 */

import { compressImageForUpload } from '../utils/imageCompress';
import i18n from '../i18n/config';
import { normalizeAppLocale } from '../i18n/appLocale';
import {
  getCachedMediaBlobUrl,
  invalidateAuthenticatedMediaStreamCache,
  mediaBlobCacheKey,
  mediaPreviewCacheKey,
  removeCachedMediaBlobByObjectId,
  setCachedMediaBlobUrl,
  storageObjectPreviewCacheKey,
} from '../lib/mediaBlobCache';
import {
  DEFAULT_SESSION_CACHE_TTL_MS,
  getSessionCache,
  invalidateSessionCachePrefix,
  setSessionCache,
  STORAGE_LIST_CACHE_TTL_MS,
} from '../lib/sessionApiCache';

const getBaseUrl = (): string => {
  const stored = localStorage.getItem('api_base_url');
  // 开发时留空则走当前域名，配合 Vite proxy 代理到 Gateway
  return stored !== null && stored !== '' ? stored : '';
};

const getToken = (): string => {
  return localStorage.getItem('api_token') || '';
};

export function setBaseUrl(url: string) {
  localStorage.setItem('api_base_url', url);
}

export function setToken(token: string) {
  if (token) localStorage.setItem('api_token', token);
  else {
    localStorage.removeItem('api_token');
    setStoredUser(null);
  }
  invalidateAuthenticatedMediaStreamCache();
}

export function getStoredToken(): string {
  return getToken();
}

/** 合并进行中的相同请求（Strict Mode 双 mount、多组件同时预览） */
function dedupeInflight<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const g = dedupeInflight as unknown as { _m?: Map<string, Promise<T>> };
  if (!g._m) g._m = new Map();
  const existing = g._m.get(key);
  if (existing) return existing;
  const p = factory().finally(() => {
    g._m?.delete(key);
  });
  g._m.set(key, p);
  return p;
}

type SessionCacheOptions = { force?: boolean; ttlMs?: number };

function shouldCacheSessionResult(data: unknown): boolean {
  if (data == null || typeof data !== 'object') return true;
  const err = (data as { error?: unknown }).error;
  return !(typeof err === 'string' && err.trim().length > 0);
}

async function withSessionCache<T>(
  cacheKey: string,
  factory: () => Promise<T>,
  options?: SessionCacheOptions
): Promise<T> {
  const ttlMs = options?.ttlMs ?? DEFAULT_SESSION_CACHE_TTL_MS;
  if (!options?.force) {
    const cached = getSessionCache<T>(cacheKey, ttlMs);
    if (cached !== undefined) return cached;
  }
  return dedupeInflight(`sessionCache:${cacheKey}`, async () => {
    if (!options?.force) {
      const cached = getSessionCache<T>(cacheKey, ttlMs);
      if (cached !== undefined) return cached;
    }
    const data = await factory();
    if (shouldCacheSessionResult(data)) {
      setSessionCache(cacheKey, data);
    }
    return data;
  });
}

export function invalidateStorageObjectsListCache(): void {
  invalidateSessionCachePrefix('listStorageObjects:');
}

export function invalidateAssetFoldersCache(): void {
  invalidateSessionCachePrefix('getFolders');
}

export function invalidateTaskListCache(): void {
  invalidateSessionCachePrefix('listWritingTasks:');
  invalidateSessionCachePrefix('listOutlineTasks:');
  invalidateSessionCachePrefix('listCgiTasks:');
}

function extractErrorMessage(data: unknown, fallback: string): string {
  if (data == null) return fallback;
  if (typeof data === 'string') return data || fallback;
  if (typeof data !== 'object') return String(data);
  const obj = data as Record<string, unknown>;
  if (typeof obj.message === 'string' && obj.message.trim()) return obj.message;
  if (typeof obj.error === 'string' && obj.error.trim()) return obj.error;
  if (obj.error && typeof obj.error === 'object') {
    const nested = obj.error as Record<string, unknown>;
    if (typeof nested.message === 'string' && nested.message.trim()) return nested.message;
  }
  if (typeof obj.data === 'object' && obj.data) {
    const nested = obj.data as Record<string, unknown>;
    if (typeof nested.message === 'string' && nested.message.trim()) return nested.message;
  }
  try {
    return JSON.stringify(data);
  } catch {
    return fallback;
  }
}

export async function request<T = unknown>(
  path: string,
  options: Omit<RequestInit, 'body' | 'headers' | 'method'> & {
    method?: string;
    headers?: Record<string, string>;
    body?: object | FormData | string | null;
  } = {}
): Promise<{ data?: T; error?: string; status: number; code?: string; extras?: Record<string, unknown> }> {
  const base = getBaseUrl().replace(/\/$/, '');
  const url = path.startsWith('http') ? path : base ? `${base}${path.startsWith('/') ? '' : '/'}${path}` : path.startsWith('/') ? path : `/${path}`;
  const token = getToken();

  const { body, headers: customHeaders, method, ...rest } = options;
  const isFormData = body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(customHeaders ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // 用户 UI 语言：后端 VF / 生成内容按此输出（zh | zh-TW | en | ja）
  headers['x-user-lang'] = normalizeAppLocale(i18n.language);

  const init: RequestInit = { ...rest, method, headers };
  if (body !== undefined) {
    if (isFormData) init.body = body;
    else if (typeof body === 'string') init.body = body;
    else if (body === null) init.body = null;
    else init.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let data: T | undefined;
    try {
      data = text ? (JSON.parse(text) as T) : undefined;
    } catch {
      data = text as unknown as T;
    }
    if (!res.ok) {
      if (res.status === 401) {
        setToken('');
        try {
          sessionStorage.setItem('auth_401', '1');
          window.dispatchEvent(new CustomEvent('auth:401'));
    } catch {
      // ignore
    }
        const errMsg = extractErrorMessage(data, res.statusText);
        return { error: errMsg, status: res.status };
      }
      const errMsg = extractErrorMessage(data, res.statusText);
      const bodyObj = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
      const errCode =
        typeof bodyObj.error === 'string' && /^[A-Z][A-Z0-9_]+$/.test(bodyObj.error)
          ? bodyObj.error
          : undefined;
      const code = errCode ?? (typeof bodyObj.code === 'string' ? bodyObj.code : undefined);
      const extras: Record<string, unknown> = {};
      if (bodyObj.estimatedTokens != null) extras.estimatedTokens = bodyObj.estimatedTokens;
      if (bodyObj.currentBalance != null) extras.currentBalance = bodyObj.currentBalance;
      if (bodyObj.data != null && typeof bodyObj.data === 'object') {
        Object.assign(extras, bodyObj.data as object);
      }
      return { error: errMsg, status: res.status, code, extras };
    }
    return { data, status: res.status };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), status: 0 };
  }
}

export interface LoginUser {
  id: string;
  username: string;
  role?: 'user' | 'admin';
  primaryBalance?: { assetCode: string; availableBalance: string };
  [key: string]: unknown;
}

export async function getCaptcha(): Promise<
  { captchaId: string; bgUrl: string; puzzleUrl: string } | { error: string }
> {
  const res = await request<{
    data?: { captchaId: string; bgUrl: string; puzzleUrl: string };
  }>('/api/v1/account/captcha', { method: 'GET' });
  if (res.error) return { error: res.error };
  const body = res.data as {
    data?: { captchaId: string; bgUrl: string; puzzleUrl: string };
  };
  const data =
    body?.data ??
    (body as unknown as { captchaId?: string; bgUrl?: string; puzzleUrl?: string });
  if (data?.captchaId && data?.bgUrl && data?.puzzleUrl) {
    return { captchaId: data.captchaId, bgUrl: data.bgUrl, puzzleUrl: data.puzzleUrl };
  }
  return { error: '获取验证码失败' };
}

export async function verifyCaptchaSlide(
  captchaId: string,
  payload: { x: number; duration?: number; trail?: [number, number][] }
): Promise<{ success: boolean; error?: string }> {
  const res = await request<{ data?: { verified?: boolean } }>(
    '/api/v1/account/captcha/verify',
    {
      method: 'POST',
      body: {
        captchaId,
        x: payload.x,
        duration: payload.duration,
        trail: payload.trail,
      },
    }
  );
  if (res.error) return { success: false, error: res.error };
  return { success: true };
}

export async function getCaptchaConfig(): Promise<{ enabled: boolean } | { error: string }> {
  const res = await request<{ data?: { enabled?: boolean } }>('/api/v1/account/captcha/config', {
    method: 'GET',
  });
  if (res.error) return { error: res.error };
  const body = res.data as { data?: { enabled?: boolean } };
  const enabled = body?.data?.enabled ?? (body as unknown as { enabled?: boolean }).enabled;
  return { enabled: Boolean(enabled) };
}

// 登录（mxmauth 返回 { code, data: { user, tokens: { accessToken, refreshToken } } }）
export async function login(
  usernameOrEmail: string,
  password: string,
  captcha?: { captchaId: string; captchaAnswer: string }
) {
  const id = usernameOrEmail.trim();
  const isEmail = id.includes('@');
  const res = await request<{ data?: { tokens?: { accessToken: string }; user?: LoginUser } }>(
    '/api/v1/account/login',
    {
      method: 'POST',
      body: {
        ...(isEmail ? { email: id.toLowerCase() } : { username: id }),
        password,
        ...(captcha?.captchaId && captcha.captchaAnswer
          ? { captchaId: captcha.captchaId, captchaAnswer: captcha.captchaAnswer }
          : {}),
      },
    }
  );
  if (res.error) return { error: res.error, code: res.code, status: res.status };
  const body = res.data as {
    data?: {
      tokens?: { accessToken: string };
      user?: LoginUser;
      mfaRequired?: boolean;
      mfaToken?: string;
      expiresIn?: number;
    };
  };
  const data = body?.data ?? (body as unknown as {
    tokens?: { accessToken: string };
    user?: LoginUser;
    mfaRequired?: boolean;
    mfaToken?: string;
    expiresIn?: number;
  });
  if (data?.mfaRequired && data.mfaToken) {
    return {
      mfaRequired: true,
      mfaToken: data.mfaToken,
      expiresIn: data.expiresIn ?? 300,
    };
  }
  const tokens = data?.tokens;
  const user = data?.user;
  if (tokens?.accessToken) {
    setToken(tokens.accessToken);
    if (user) setStoredUser(user);
    return { ok: true, accessToken: tokens.accessToken, user };
  }
  return { error: '响应中无 accessToken' };
}

export async function verifyMfaLogin(mfaToken: string, code: string) {
  const res = await request<{ data?: { tokens?: { accessToken: string }; user?: LoginUser } }>(
    '/api/v1/account/auth/mfa/verify',
    {
      method: 'POST',
      body: { mfaToken, code: code.replace(/\s/g, '') },
    }
  );
  if (res.error) return { error: res.error, code: res.code, status: res.status };
  const body = res.data as { data?: { tokens?: { accessToken: string }; user?: LoginUser } };
  const data = body?.data;
  const tokens = data?.tokens;
  const user = data?.user;
  if (tokens?.accessToken) {
    setToken(tokens.accessToken);
    if (user) setStoredUser(user);
    return { ok: true, accessToken: tokens.accessToken, user };
  }
  return { error: '响应中无 accessToken' };
}

export type MfaStatus = {
  totpEnabled: boolean;
  hasPassword: boolean;
  oauthOnly: boolean;
  pendingSetup: boolean;
};

export async function getMfaStatus() {
  return request<{ data?: MfaStatus }>('/api/v1/account/mfa/status');
}

export async function setupMfaTotp(password: string) {
  return request<{ data?: { secret: string; otpauthUrl: string } }>('/api/v1/account/mfa/totp/setup', {
    method: 'POST',
    body: { password },
  });
}

export async function enableMfaTotp(password: string, code: string) {
  return request<{ code?: number; message?: string }>('/api/v1/account/mfa/totp/enable', {
    method: 'POST',
    body: { password, code: code.replace(/\s/g, '') },
  });
}

export async function disableMfaTotp(password: string, code: string) {
  return request<{ code?: number; message?: string }>('/api/v1/account/mfa/totp/disable', {
    method: 'POST',
    body: { password, code: code.replace(/\s/g, '') },
  });
}

export type AuthProviders = { google: boolean; github: boolean; smtp: boolean };

export async function getAuthProviders(): Promise<AuthProviders | { error: string }> {
  const res = await request<{ data?: AuthProviders }>('/api/v1/account/auth/providers');
  if (res.error) return { error: res.error };
  const body = res.data as { data?: AuthProviders };
  const data = body?.data;
  if (!data) return { error: 'no providers' };
  return {
    google: Boolean(data.google),
    github: Boolean(data.github),
    smtp: Boolean(data.smtp),
  };
}

export function getOAuthStartUrl(provider: 'google' | 'github'): string {
  const base = getBaseUrl().replace(/\/$/, '');
  const path = `/api/v1/account/oauth/${provider}/start`;
  return base ? `${base}${path}` : path;
}

export async function registerAccount(
  email: string,
  password: string,
  captcha?: { captchaId: string; captchaAnswer: string }
) {
  const res = await request<{
    data?: { needVerification?: boolean; user?: LoginUser };
    message?: string;
  }>('/api/v1/account/register', {
    method: 'POST',
    body: {
      email: email.trim().toLowerCase(),
      password,
      ...(captcha?.captchaId && captcha.captchaAnswer
        ? { captchaId: captcha.captchaId, captchaAnswer: captcha.captchaAnswer }
        : {}),
    },
  });
  if (res.error) return { error: res.error, code: res.code, status: res.status };
  const body = res.data as { data?: { needVerification?: boolean }; message?: string };
  return {
    ok: true as const,
    needVerification: Boolean(body?.data?.needVerification ?? true),
    message: body?.message,
  };
}

export async function resendVerification(
  email: string,
  captcha?: { captchaId: string; captchaAnswer: string }
) {
  const res = await request('/api/v1/account/resend-verification', {
    method: 'POST',
    body: {
      email: email.trim().toLowerCase(),
      ...(captcha?.captchaId && captcha.captchaAnswer
        ? { captchaId: captcha.captchaId, captchaAnswer: captcha.captchaAnswer }
        : {}),
    },
  });
  if (res.error) return { error: res.error, code: res.code };
  return { ok: true as const };
}

export async function forgotPassword(
  email: string,
  captcha?: { captchaId: string; captchaAnswer: string }
) {
  const res = await request('/api/v1/account/forgot-password', {
    method: 'POST',
    body: {
      email: email.trim().toLowerCase(),
      ...(captcha?.captchaId && captcha.captchaAnswer
        ? { captchaId: captcha.captchaId, captchaAnswer: captcha.captchaAnswer }
        : {}),
    },
  });
  if (res.error) return { error: res.error, code: res.code };
  return { ok: true as const };
}

export async function resetPassword(token: string, newPassword: string) {
  const res = await request('/api/v1/account/reset-password', {
    method: 'POST',
    body: { token, newPassword },
  });
  if (res.error) return { error: res.error, code: res.code };
  return { ok: true as const };
}

export async function verifyEmailToken(token: string) {
  const res = await request<{ data?: { verified?: boolean } }>(
    `/api/v1/account/verify-email?token=${encodeURIComponent(token)}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
    }
  );
  if (res.error) return { error: res.error, code: res.code };
  return { ok: true as const };
}

/** 解析 OAuth 回跳 hash：#oauth=<base64url json> */
export function consumeOAuthHashPayload(): {
  accessToken: string;
  user?: LoginUser;
} | null {
  try {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash.startsWith('oauth=')) return null;
    const raw = decodeURIComponent(hash.slice('oauth='.length));
    const pad = raw.length % 4 === 0 ? '' : '='.repeat(4 - (raw.length % 4));
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    const json = JSON.parse(text) as { accessToken?: string; user?: LoginUser };
    history.replaceState(null, '', window.location.pathname + window.location.search);
    if (!json.accessToken) return null;
    setToken(json.accessToken);
    if (json.user) setStoredUser(json.user);
    return { accessToken: json.accessToken, user: json.user };
  } catch {
    return null;
  }
}

function setStoredUser(user: LoginUser | null) {
  if (user) localStorage.setItem('api_user', JSON.stringify(user));
  else localStorage.removeItem('api_user');
}

export function getStoredUser(): LoginUser | null {
  try {
    const s = localStorage.getItem('api_user');
    return s ? (JSON.parse(s) as LoginUser) : null;
  } catch {
    return null;
  }
}

/** 与登录态一致的 user id（勿用已废弃的 localStorage user_id） */
export function getStoredUserId(): string {
  return getStoredUser()?.id ?? '';
}

// 获取当前用户信息（需已登录）
export async function getProfile() {
  return request<{ data?: LoginUser }>('/api/v1/account/profile');
}

/** 客户端环境推断（国家/地区，供默认语言） */
export async function fetchClientHints(): Promise<{ countryCode: string | null }> {
  try {
    const res = await fetch(`${getBaseUrl()}/client-hints`, {
      credentials: 'include',
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { countryCode: null };
    const data = (await res.json()) as { countryCode?: string | null };
    const code = typeof data.countryCode === 'string' ? data.countryCode.trim().toUpperCase() : null;
    return { countryCode: code || null };
  } catch {
    return { countryCode: null };
  }
}

// 修改密码（需已登录）
export async function changeMyPassword(params: { currentPassword: string; newPassword: string }) {
  return request<{ code?: number; message?: string }>('/api/v1/account/password', {
    method: 'PUT',
    body: {
      current_password: params.currentPassword,
      new_password: params.newPassword,
    },
  });
}

// ---------- 用户设置（需已登录）----------
export interface UserSettings {
  theme?: string;
  language?: string;
  notifications_enabled?: boolean;
}

export async function getSettings() {
  return request<{ data?: UserSettings }>('/api/v1/account/settings');
}

export async function updateSettings(params: { theme?: string; language?: string; notifications_enabled?: boolean }) {
  return request<{ code?: number; message?: string; data?: UserSettings }>('/api/v1/account/settings', {
    method: 'PUT',
    body: params,
  });
}

// ---------- 会员信息（需已登录）----------
export interface MembershipInfo {
  membership_type?: string;
  membership_expires_at?: string;
  level?: number;
}

export async function getMembership() {
  return request<{ data?: MembershipInfo }>('/api/v1/account/membership');
}

// ---------- 文件夹管理（需已登录）----------
export type FolderCardTag = 'style' | 'character' | 'knowledge' | 'writing';
export type FolderCardStatus = 'idle' | 'parsing' | 'ready' | 'stale' | 'failed';
export type FolderAssetRole =
  | 'style_ref'
  | 'palette'
  | 'appearance'
  | 'description'
  | 'voice'
  | 'doc'
  | 'unknown';

export interface FolderItem {
  id: string;
  name: string;
  user_id: string;
  parent_id?: string | null;
  folder_kind?: 'upload' | 'virtual';
  index_status?: 'none' | 'indexing' | 'indexed' | 'stale' | null;
  indexed_at?: string | null;
  knowledge_base_id?: string | null;
  card_tag?: FolderCardTag | null;
  card_status?: FolderCardStatus;
  card_summary?: Record<string, unknown> | null;
  is_system?: boolean;
  created_at: string;
  updated_at: string;
}

export type KnowledgeFolderLinkItem = {
  type: 'link';
  ref_type: 'task' | 'storage_object';
  id: string;
  task_id?: string;
  object_id?: string;
  /** folder_items 行 id，用于 PATCH 资产角色 / 特征标签 */
  folder_item_id?: string;
  name: string;
  broken?: boolean;
  task_type?: string;
  status?: string;
  content_type?: string;
  /** 视觉风格 / 语感文风：该素材特征标签（最多 3） */
  feature_tags?: string[];
  metadata?: {
    asset_type?: string;
    voice_id?: string;
    label?: string;
    mode?: string;
    model?: string;
    demo_audio?: string;
    contentPreview?: string;
    text?: string;
    source_task_id?: string;
    piece_id?: string;
    /** 业务大类展示名（如「写作」「音频」「视频」），由后端从 admin 配置透传 */
    taskLabel?: string;
    /** 业务子类展示名（如「AI 科技情报报道」「营销方案」），由后端从 admin 配置透传 */
    subtypeLabel?: string;
    /** Task V2 身份（scope/taskKey/subtype），用于前端按字段差异化展示 */
    taskV2?: {
      scope: string;
      taskKey: string;
      subtype: string | null;
    };
  };
  index_entry_status?: string;
  link_created_at?: string;
  created_at: string;
};

export type KnowledgeFolderDirItem = {
  type: 'dir';
  id: string;
  name: string;
  parent_id?: string | null;
  folder_kind?: string;
  index_status?: string;
  indexed_at?: string | null;
  knowledge_base_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type KnowledgeFolderContentItem = KnowledgeFolderLinkItem | KnowledgeFolderDirItem;

export interface FolderContentItem {
  id: string;
  task_id?: string;
  folder_id?: string;
  task_type?: string;
  created_at: string;
}

function parseFoldersPayload(data: unknown): FolderItem[] {
  if (!data || typeof data !== 'object') return [];
  const root = data as Record<string, unknown>;
  const payload = root.data ?? root;
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const folders = (payload as { folders?: unknown }).folders;
    if (Array.isArray(folders)) return folders as FolderItem[];
  }
  if (Array.isArray(payload)) return payload as FolderItem[];
  return [];
}

export async function getFolders(options?: SessionCacheOptions): Promise<FolderItem[]> {
  return withSessionCache(
    'getFolders',
    async () => {
      const res = await request<{ data?: { folders?: FolderItem[] } }>(
        '/api/v1/assets/folders?folder_kind=upload'
      );
      if (res.error) return [];
      return parseFoldersPayload(res.data);
    },
    options
  );
}

export async function getKnowledgeFolders(options?: SessionCacheOptions): Promise<FolderItem[]> {
  return withSessionCache(
    'getKnowledgeFolders',
    async () => {
      const res = await request<{ data?: { folders?: FolderItem[] } }>(
        '/api/v1/assets/folders?folder_kind=virtual'
      );
      if (res.error) return [];
      return parseFoldersPayload(res.data);
    },
    options
  );
}

export async function createKnowledgeFolder(name: string, parentId?: string | null) {
  const res = await request<{ code?: number; data?: FolderItem }>('/api/v1/assets/folders', {
    method: 'POST',
    body: { name, parent_id: parentId ?? null, folder_kind: 'virtual' },
  });
  if (!res.error) {
    invalidateSessionCachePrefix('getKnowledgeFolders');
  }
  return res;
}

export async function deleteKnowledgeFolder(id: string) {
  const res = await request(`/api/v1/assets/folders/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.error) invalidateSessionCachePrefix('getKnowledgeFolders');
  return res;
}

export async function getKnowledgeFolderItems(folderId: string, options?: SessionCacheOptions) {
  return withSessionCache(
    `getKnowledgeFolderItems:${folderId}`,
    async () => {
      const res = await request<{
        data?: {
          folder?: FolderItem;
          items?: KnowledgeFolderContentItem[];
          total?: number;
          folders_count?: number;
          links_count?: number;
        };
      }>(`/api/v1/assets/folders/${encodeURIComponent(folderId)}/items`);
      if (res.error) throw new Error(res.error);
      return res.data?.data ?? { items: [], links_count: 0, folder: undefined };
    },
    { ttlMs: STORAGE_LIST_CACHE_TTL_MS, ...options }
  );
}

export function peekKnowledgeFolderItems(folderId: string) {
  return getSessionCache<{
    folder?: FolderItem;
    items?: KnowledgeFolderContentItem[];
    links_count?: number;
  }>(`getKnowledgeFolderItems:${folderId}`, STORAGE_LIST_CACHE_TTL_MS);
}

export function invalidateKnowledgeFolderItemsCache(): void {
  invalidateSessionCachePrefix('getKnowledgeFolderItems:');
}

export async function addKnowledgeFolderTaskLink(folderId: string, taskId: string) {
  const res = await request<{ code?: number }>(`/api/v1/assets/folders/${encodeURIComponent(folderId)}/items`, {
    method: 'POST',
    body: { task_id: taskId },
  });
  if (!res.error) {
    invalidateSessionCachePrefix('getKnowledgeFolders');
    invalidateKnowledgeFolderItemsCache();
  }
  return res;
}

export async function addKnowledgeFolderStorageLink(folderId: string, storageObjectId: string) {
  const res = await request<{ code?: number }>(`/api/v1/assets/folders/${encodeURIComponent(folderId)}/items`, {
    method: 'POST',
    body: { storage_object_id: storageObjectId },
  });
  if (!res.error) {
    invalidateSessionCachePrefix('getKnowledgeFolders');
    invalidateKnowledgeFolderItemsCache();
  }
  return res;
}

export async function removeKnowledgeFolderLink(
  folderId: string,
  refId: string,
  refType: 'task' | 'storage_object'
) {
  const q = refType === 'storage_object' ? '?ref_type=storage_object' : '';
  const res = await request(
    `/api/v1/assets/folders/${encodeURIComponent(folderId)}/items/${encodeURIComponent(refId)}${q}`,
    { method: 'DELETE' }
  );
  if (!res.error) {
    invalidateSessionCachePrefix('getKnowledgeFolders');
    invalidateKnowledgeFolderItemsCache();
  }
  return res;
}

export async function getKnowledgeFolderPath(folderId: string) {
  return request<{ data?: { path?: FolderItem[] } }>(
    `/api/v1/assets/folders/${encodeURIComponent(folderId)}/path`
  );
}

export async function createFolder(name: string, parentId?: string) {
  const res = await request<{ code?: number; data?: FolderItem }>('/api/v1/assets/folders', {
    method: 'POST',
    body: { name, parent_id: parentId, folder_kind: 'upload' },
  });
  if (!res.error) invalidateAssetFoldersCache();
  return res;
}

export async function updateFolder(id: string, name: string) {
  return request<{ code?: number; data?: FolderItem }>(`/api/v1/assets/folders/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: { name },
  });
}

export async function deleteFolder(id: string) {
  const res = await request(`/api/v1/assets/folders/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.error) invalidateAssetFoldersCache();
  return res;
}

export async function getFolderItems(folderId: string) {
  return request<{ data?: FolderContentItem[] }>(`/api/v1/assets/folders/${encodeURIComponent(folderId)}/items`);
}

export async function addItemToFolder(folderId: string, taskId: string, taskType: string) {
  return request<{ code?: number }>(`/api/v1/assets/folders/${encodeURIComponent(folderId)}/items`, {
    method: 'POST',
    body: { task_id: taskId, task_type: taskType },
  });
}

export async function removeItemFromFolder(folderId: string, taskId: string) {
  return request(`/api/v1/assets/folders/${encodeURIComponent(folderId)}/items/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
  });
}

/** HTTP 路径仍为 /virtual-folder-index（兼容）；产品名：知识库 */
export async function triggerKnowledgeFolderIndex(folderId: string, force = false) {
  return request<{ data?: unknown }>(`/api/v1/virtual-folder-index/${encodeURIComponent(folderId)}`, {
    method: 'POST',
    body: { force },
  });
}

export async function triggerKnowledgeFolderParse(folderId: string, force = false) {
  return request<{ data?: unknown }>(
    `/api/v1/virtual-folder-index/${encodeURIComponent(folderId)}/parse`,
    { method: 'POST', body: { force } }
  );
}

export async function getKnowledgeFolderCard(folderId: string) {
  return request<{ data?: unknown }>(
    `/api/v1/virtual-folder-index/${encodeURIComponent(folderId)}/card`
  );
}

export async function updateKnowledgeFolderCardTag(
  folderId: string,
  cardTag: FolderCardTag | null,
  name?: string
) {
  const body: Record<string, unknown> = { card_tag: cardTag };
  if (name != null) body.name = name;
  const res = await request<{ data?: FolderItem }>(
    `/api/v1/assets/folders/${encodeURIComponent(folderId)}`,
    { method: 'PUT', body }
  );
  if (!res.error) invalidateSessionCachePrefix('getKnowledgeFolders');
  return res;
}

export async function updateKnowledgeFolderItemAssetRole(
  folderId: string,
  itemId: string,
  assetRole: FolderAssetRole
) {
  return request<{ data?: unknown }>(
    `/api/v1/virtual-folder-index/${encodeURIComponent(folderId)}/items/${encodeURIComponent(itemId)}/asset-role`,
    { method: 'PATCH', body: { asset_role: assetRole } }
  );
}

export async function updateKnowledgeFolderItemFeatureTags(
  folderId: string,
  itemId: string,
  featureTags: string[]
) {
  return request<{ data?: { feature_tags?: string[]; ref_key?: string } }>(
    `/api/v1/virtual-folder-index/${encodeURIComponent(folderId)}/items/${encodeURIComponent(itemId)}/feature-tags`,
    { method: 'PATCH', body: { feature_tags: featureTags } }
  );
}

export async function updateKnowledgeFolderCharacterFields(
  folderId: string,
  patch: Record<string, unknown>
) {
  return request<{ data?: { character?: Record<string, unknown> } }>(
    `/api/v1/virtual-folder-index/${encodeURIComponent(folderId)}/character`,
    { method: 'PATCH', body: patch }
  );
}

export async function getSystemKnowledgeFolders(cardTag?: FolderCardTag) {
  const q = cardTag ? `?card_tag=${encodeURIComponent(cardTag)}` : '';
  const res = await request<{ data?: { folders?: FolderItem[] } }>(
    `/api/v1/assets/folders/system${q}`
  );
  if (res.error) return [];
  const body = res.data as { data?: { folders?: FolderItem[] }; folders?: FolderItem[] } | undefined;
  return body?.data?.folders ?? body?.folders ?? [];
}

/** 写作 webSearch 字段：当前可用搜索引擎（已启用且已配置） */
export async function getEnabledSearchProviders(): Promise<string[]> {
  const res = await request<{ providers?: string[] }>('/api/v1/search/providers/enabled');
  if (res.error) return [];
  const raw = res.data as { providers?: string[] } | undefined;
  return Array.isArray(raw?.providers) ? raw.providers.map(String) : [];
}

/** pre 预览检索（不建任务）：返回可写入 sources.websource 的载荷 + 话题 chips */
export type PreTrendSearchResult = {
  websource: {
    query: string;
    depth: string;
    providers: string[];
    hitCount: number;
    truncated: boolean;
    text: string;
    items: Array<{ title: string; url: string; snippet: string; domain: string }>;
  };
  topicChips: string[];
  topicExtractTaskId?: string | null;
  search_track?: string;
  track_source?: string;
};

export async function previewWritingTrendSearch(opts: {
  industry: string;
  industryCustom?: string;
  /** today | yesterday | custom | 今日 | 昨日 | 指定日期 */
  dateMode?: string;
  reportDate?: string;
  /** global | cn | tw | jp | na | eu；默认 global */
  searchRegion?: string;
  maxResults?: number;
  /** 热点提炼返回条数；与 maxResults 解耦 */
  topicCount?: number;
  language?: string;
  searchTrack?: string;
  /** writing 业务，用于读取 pipeline.pre.webSearch.topicExtractTextKey */
  writingTaskKey?: string;
  writingSubtype?: string | null;
  /** 也可直接指定 text 业务 */
  topicExtractTextKey?: string;
}): Promise<{ data?: PreTrendSearchResult; error?: string }> {
  const res = await request<{
    topicChips?: string[];
    websource?: PreTrendSearchResult['websource'];
    topicExtractTaskId?: string | null;
    search_track?: string;
    track_source?: string;
    error?: string;
  }>('/api/v1/search/industry-daily-topics', {
    method: 'POST',
    body: {
      industry: opts.industry,
      industryCustom: opts.industryCustom,
      dateMode: opts.dateMode ?? 'today',
      reportDate: opts.reportDate,
      searchRegion: opts.searchRegion ?? 'global',
      maxResults: opts.maxResults ?? 8,
      topicCount: opts.topicCount,
      language: opts.language,
      searchTrack: opts.searchTrack,
      writingTaskKey: opts.writingTaskKey,
      writingSubtype: opts.writingSubtype,
      topicExtractTextKey: opts.topicExtractTextKey,
    },
  });
  if (res.error) return { error: res.error };
  const body = res.data as {
    topicChips?: string[];
    websource?: PreTrendSearchResult['websource'];
    topicExtractTaskId?: string | null;
    search_track?: string;
    track_source?: string;
    error?: string;
  };
  if (body?.error) return { error: body.error };
  const websource = body?.websource;
  if (!websource) return { error: '检索未返回结果' };
  const topicChips = Array.isArray(body.topicChips) ? body.topicChips : [];
  if (topicChips.length === 0) {
    return { error: '话题提炼未返回可用话题' };
  }
  return {
    data: {
      websource,
      topicChips,
      topicExtractTaskId: body.topicExtractTaskId ?? null,
      search_track: body.search_track,
      track_source: body.track_source,
    },
  };
}

export async function getKnowledgeFolderIndexStatus(folderId: string) {
  return request<{ data?: unknown }>(`/api/v1/virtual-folder-index/${encodeURIComponent(folderId)}/status`);
}

// ---------- API 密钥（需已登录）----------
export type UserApiKeyType = 'personal' | 'integration';

export interface AccountApiKeyItem {
  id: string;
  key_prefix: string;
  key_type: UserApiKeyType;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

export async function getAccountApiKeys() {
  return request<{ code?: number; data?: AccountApiKeyItem[] }>('/api/v1/account/api-keys');
}

export type ApiKeyExpiresInDays = 0 | 7 | 30 | 90 | 180 | 365;

export interface CreateAccountApiKeyResult {
  id: string;
  name: string | null;
  key_type: UserApiKeyType;
  key_prefix: string;
  created_at: string;
  expires_at: string | null;
  key: string;
  usage_hint?: string;
}

export async function createAccountApiKey(options: {
  name?: string;
  keyType: UserApiKeyType;
  expiresInDays?: ApiKeyExpiresInDays;
}) {
  return request<{ code?: number; message?: string; data?: CreateAccountApiKeyResult }>('/api/v1/account/api-keys', {
    method: 'POST',
    body: {
      ...(options.name != null ? { name: String(options.name).trim() || undefined } : {}),
      keyType: options.keyType,
      ...(options.expiresInDays !== undefined ? { expiresInDays: options.expiresInDays } : {}),
    },
  });
}

export async function deleteAccountApiKey(id: string) {
  return request(`/api/v1/account/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ---------- 已发布开放 API ----------
export interface PublishedApiItem {
  id: string;
  slug: string;
  kind: 'task_v2' | 'smartflow';
  owner_user_id: string;
  title: string;
  description: string | null;
  task_v2_scope: string | null;
  task_v2_task_key: string | null;
  task_v2_subtype: string | null;
  smartflow_id: string | null;
  schema_version: number;
  is_enabled: boolean;
  published_at: string;
  updated_at: string;
}

export interface PublishedApiManifest {
  slug: string;
  title: string;
  description: string | null;
  kind: 'task_v2' | 'smartflow';
  schemaVersion: number;
  inputSchema: Record<string, unknown>;
  inputDoc: Record<string, unknown>;
  curlExamples: { getManifest: string; run: string; pollJob: string };
}

export async function listPublishedApis(params?: { limit?: number; offset?: number }) {
  const q = new URLSearchParams();
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.offset != null) q.set('offset', String(params.offset));
  const query = q.toString();
  return request<{ success?: boolean; data?: PublishedApiItem[] }>(
    `/api/v1/account/published-apis${query ? `?${query}` : ''}`
  );
}

export async function createPublishedApi(body: {
  slug: string;
  kind: 'task_v2' | 'smartflow';
  title: string;
  description?: string;
  taskV2Scope?: string;
  taskV2TaskKey?: string;
  taskV2Subtype?: string;
  smartflowId?: string;
}) {
  return request<{ success?: boolean; data?: PublishedApiItem }>('/api/v1/account/published-apis', {
    method: 'POST',
    body,
  });
}

export async function updatePublishedApi(
  id: string,
  body: { title?: string; description?: string; isEnabled?: boolean; republish?: boolean }
) {
  return request<{ success?: boolean; data?: PublishedApiItem }>(
    `/api/v1/account/published-apis/${encodeURIComponent(id)}`,
    { method: 'PUT', body }
  );
}

export async function republishPublishedApi(id: string) {
  return request<{ success?: boolean; data?: PublishedApiItem }>(
    `/api/v1/account/published-apis/${encodeURIComponent(id)}/republish`,
    { method: 'POST', body: {} }
  );
}

export async function disablePublishedApi(id: string) {
  return request<{ success?: boolean; data?: PublishedApiItem }>(
    `/api/v1/account/published-apis/${encodeURIComponent(id)}/disable`,
    { method: 'POST', body: {} }
  );
}

export async function enablePublishedApi(id: string) {
  return request<{ success?: boolean; data?: PublishedApiItem }>(
    `/api/v1/account/published-apis/${encodeURIComponent(id)}/enable`,
    { method: 'POST', body: {} }
  );
}

export async function deletePublishedApi(id: string) {
  return request<{ success?: boolean; message?: string }>(
    `/api/v1/account/published-apis/${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
}

export async function getOpenApiManifest(slug: string) {
  return request<{ success?: boolean; data?: PublishedApiManifest }>(
    `/api/v1/open/${encodeURIComponent(slug)}`
  );
}

export interface PublishedApiUsageByCallerRow {
  caller_user_id: string;
  username?: string;
  call_count: number;
  tokens_charged: number;
  last_called_at: string | null;
}

export interface PublishedApiUsageRecentEvent {
  job_id: string;
  slug: string;
  published_api_id: string;
  caller_user_id: string | null;
  owner_user_id: string;
  end_user_id?: string | null;
  end_user_phone?: string | null;
  status: string;
  tokens_charged: number;
  created_at: string;
  kind: string;
  task_v2_scope?: string | null;
  title?: string;
}

export interface PublishedApiUsageStats {
  days: number;
  totalCalls: number;
  completedCalls: number;
  failedCalls: number;
  pendingCalls: number;
  totalTokensCharged: number;
  daily: Array<{ date: string; call_count: number; tokens_charged: number }>;
  byApi: Array<{
    published_api_id: string;
    slug: string;
    title?: string;
    call_count: number;
    tokens_charged: number;
    last_called_at: string | null;
  }>;
  byCaller?: PublishedApiUsageByCallerRow[];
  byEndUser?: PublishedApiUsageByEndUserRow[];
  recentEvents?: PublishedApiUsageRecentEvent[];
}

export interface PublishedApiUsageByEndUserRow {
  end_user_id: string;
  call_count: number;
  tokens_charged: number;
  last_called_at: string | null;
  phone?: string | null;
  phone_masked?: string | null;
  display_name?: string | null;
  user_kind?: string | null;
}

export interface AdminOpenApiUsageStats extends PublishedApiUsageStats {
  byOwner?: Array<{
    owner_user_id: string;
    username?: string;
    call_count: number;
    tokens_charged: number;
    last_called_at: string | null;
  }>;
}

export async function getAdminOpenApiStats(days = 30) {
  return request<{ success?: boolean; data?: AdminOpenApiUsageStats }>(
    `/api/v1/system/admin/open-api-stats?days=${days}`
  );
}

export async function getPublishedApiStats(days = 30) {
  return request<{ success?: boolean; data?: PublishedApiUsageStats }>(
    `/api/v1/account/published-apis/stats?days=${days}`
  );
}

export async function getPublishedApiStatsById(id: string, days = 30) {
  return request<{ success?: boolean; data?: { api?: PublishedApiItem; stats?: PublishedApiUsageStats } }>(
    `/api/v1/account/published-apis/${encodeURIComponent(id)}/stats?days=${days}`
  );
}

export type AccountUsageSourceFilter = 'all' | 'web' | 'open_api';

export interface AccountUsageTotals {
  mxmTokenCharged: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  imageCount: number;
  videoRequests: number;
  audioRequests: number;
  musicRequests: number;
  providerCallCount: number;
}

export interface AccountUsageByScopeRow {
  scope: 'text' | 'writing' | 'graph' | 'video' | 'audio' | 'music';
  metricKind: 'token' | 'count';
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  imageCount: number;
  requestCount: number;
  videoSeconds: number;
  audioSeconds: number;
  mxmTokenCharged: number;
  providerCallCount: number;
}

export interface AccountUsageSummary {
  days: number;
  source: AccountUsageSourceFilter;
  totals: AccountUsageTotals;
  byScope: AccountUsageByScopeRow[];
  bySource: { web: AccountUsageTotals; open_api: AccountUsageTotals };
  daily: Array<{
    date: string;
    mxmTokenCharged: number;
    inputTokens: number;
    outputTokens: number;
    imageCount: number;
    videoRequests: number;
    audioRequests: number;
    musicRequests: number;
    providerCallCount: number;
  }>;
  openApi: {
    bySlug: Array<{
      slug: string;
      callCount: number;
      mxmTokenCharged: number;
      imageCount: number;
      inputTokens: number;
    }>;
    byCaller: Array<{
      callerUserId: string;
      username?: string;
      callCount: number;
      mxmTokenCharged: number;
    }>;
    byEndUser: Array<{
      endUserId: string;
      callCount: number;
      mxmTokenCharged: number;
    }>;
  };
  recent: Array<{
    id: string;
    taskId: string | null;
    scope: string;
    displayScope: string;
    usageSource: 'web' | 'open_api';
    createdAt: string;
    mxmTokenCharged: number;
    inputTokens: number;
    outputTokens: number;
    imageCount: number;
    requestCount: number;
    publishedSlug: string | null;
    callerUserId: string | null;
    modelKey: string;
    provider: string;
  }>;
}

export async function getAccountUsageSummary(params?: {
  days?: number;
  source?: AccountUsageSourceFilter;
}) {
  const q = new URLSearchParams();
  if (params?.days != null) q.set('days', String(params.days));
  if (params?.source && params.source !== 'all') q.set('source', params.source);
  const query = q.toString();
  return request<{ success?: boolean; data?: AccountUsageSummary }>(
    `/api/v1/account/usage/summary${query ? `?${query}` : ''}`
  );
}

export interface AccountUsageEventsPage {
  days: number;
  source: AccountUsageSourceFilter;
  scope?: string;
  slug?: string;
  taskId?: string;
  page: number;
  limit: number;
  total: number;
  items: AccountUsageSummary['recent'];
}

export async function getAccountUsageEvents(params?: {
  days?: number;
  source?: AccountUsageSourceFilter;
  scope?: string;
  slug?: string;
  taskId?: string;
  page?: number;
  limit?: number;
}) {
  const q = new URLSearchParams();
  if (params?.days != null) q.set('days', String(params.days));
  if (params?.source && params.source !== 'all') q.set('source', params.source);
  if (params?.scope) q.set('scope', params.scope);
  if (params?.slug) q.set('slug', params.slug);
  if (params?.taskId) q.set('taskId', params.taskId);
  if (params?.page != null) q.set('page', String(params.page));
  if (params?.limit != null) q.set('limit', String(params.limit));
  const query = q.toString();
  return request<{ success?: boolean; data?: AccountUsageEventsPage }>(
    `/api/v1/account/usage/events${query ? `?${query}` : ''}`
  );
}

export type StorageObjectMode = 'asset' | 'temp';

export interface UploadStorageOptions {
  storageMode?: StorageObjectMode;
  folderId?: string;
  taskId?: string;
  purpose?: string;
  /** 写入 storage_objects.metadata（如 writing_manuscript） */
  metadata?: Record<string, unknown>;
}

function appendUploadQuery(url: string, opts?: UploadStorageOptions): string {
  if (!opts) return url;
  const q = new URLSearchParams();
  if (opts.storageMode) q.set('storageMode', opts.storageMode);
  if (opts.folderId) q.set('folderId', opts.folderId);
  if (opts.taskId) q.set('taskId', opts.taskId);
  if (opts.purpose) q.set('purpose', opts.purpose);
  const s = q.toString();
  return s ? `${url}${url.includes('?') ? '&' : '?'}${s}` : url;
}

// 上传用户资源（multipart），默认存入资产中心；图片会先压缩再上传
export async function uploadAssets(file: File, options?: UploadStorageOptions) {
  const prepared = await compressImageForUpload(file);
  const form = new FormData();
  form.append('file', prepared);
  if (options?.storageMode) form.append('storageMode', options.storageMode);
  if (options?.folderId) form.append('folderId', options.folderId);
  if (options?.taskId) form.append('taskId', options.taskId);
  if (options?.purpose) form.append('purpose', options.purpose);
  if (options?.metadata && Object.keys(options.metadata).length > 0) {
    form.append('metadata', JSON.stringify(options.metadata));
  }
  const res = await request<{
    data?: {
      url: string;
      key: string;
      bucket: string;
      objectId?: string;
      storageMode?: StorageObjectMode;
      folderId?: string | null;
      proxyPath?: string;
    };
  }>(appendUploadQuery('/api/v1/cgi/upload/assets', options), { method: 'POST', body: form });
  if (!res.error) invalidateStorageObjectsListCache();
  return res;
}

type UploadAssetsResponseBody = {
  success?: boolean;
  data?: { url?: string; key?: string; objectId?: string };
  error?: string;
  message?: string;
};

function parseUploadAssetsResponse(res: {
  data?: UploadAssetsResponseBody;
  error?: string;
  status: number;
}): { url: string; key: string; objectId?: string } {
  if (res.error) {
    if (res.status === 401) {
      throw new Error('登录已过期，请重新登录后再上传');
    }
    throw new Error(res.error);
  }
  const payload = res.data?.data;
  if (!payload?.url) {
    throw new Error(res.data?.error || res.data?.message || '上传失败');
  }
  return {
    url: normalizeUploadedMediaUrl(String(payload.url)),
    key: String(payload.key ?? ''),
    objectId: payload.objectId,
  };
}

/** 上传参考图（multipart 直传 /upload/assets），用于 graph/video 等参考图槽位 */
export async function uploadReferenceImageToR2(
  file: File,
  options?: UploadStorageOptions
): Promise<{ url: string; key: string; objectId?: string }> {
  const res = await uploadAssets(file, {
    purpose: options?.purpose ?? 'reference',
    storageMode: options?.storageMode,
    folderId: options?.folderId,
    taskId: options?.taskId,
  });
  return parseUploadAssetsResponse(res);
}

export interface GridLayoutAnalyzeResult {
  width: number;
  height: number;
  orientation: string;
  aspect_label: string;
  layout: '2x2' | '3x3' | '4x4' | '1x1' | null;
  grid_n: number;
  confidence: 'high' | 'medium' | 'low';
  layout_source: string;
}

/** 宫格源图布局分析（白缝 + 画幅推断）；原图可用 base64，无需先上传 R2 */
export async function analyzeGridLayout(input: {
  url?: string;
  base64?: string;
  grid_n?: number;
}): Promise<GridLayoutAnalyzeResult> {
  const storedBase = localStorage.getItem('api_base_url');
  const hasExplicitBase = storedBase !== null && storedBase !== '';
  const apiUrl = hasExplicitBase
    ? `${storedBase.replace(/\/$/, '')}/api/v1/cgi/upload/grid-analyze`
    : `${window.location.origin}/api/v1/cgi/upload/grid-analyze`;

  const token = getToken();
  const userId = getStoredUserId();

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(userId ? { 'x-user-id': userId } : {}),
    },
    body: JSON.stringify(input),
  });

  const json = await response.json();
  if (!json.success || !json.data) {
    throw new Error(json.error || '宫格分析失败');
  }
  return json.data as GridLayoutAnalyzeResult;
}

/** @deprecated 使用 analyzeGridLayout({ url }) */
export async function analyzeGridLayoutFromUrl(url: string): Promise<GridLayoutAnalyzeResult> {
  return analyzeGridLayout({ url });
}

// 关联图片任务到角色
export interface UserReferenceImageItem {
  id: string;
  r2_url: string;
  url?: string;
  original_name: string | null;
  content_type: string | null;
  storage_mode?: StorageObjectMode;
  folder_id?: string | null;
  expires_at?: string | null;
  tag: string | null;
  created_at: string;
}

export interface StorageObjectListItem {
  id: string;
  purpose: string;
  storageMode: StorageObjectMode;
  folderId: string | null;
  partnerAppId?: string | null;
  partnerEndUserId?: string | null;
  endUserLabel?: string | null;
  url: string;
  contentType: string | null;
  sizeBytes: number | null;
  originalName: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export type StorageUploadSource = 'self' | 'partner' | 'all';

function buildStorageObjectsListQuery(options?: {
  storageMode?: StorageObjectMode;
  folderId?: string | null;
  purpose?: string;
  uploadSource?: StorageUploadSource;
  partnerAppId?: string;
  partnerEndUserId?: string;
  limit?: number;
  offset?: number;
}): string {
  const q = new URLSearchParams();
  if (options?.limit != null) q.set('limit', String(options.limit));
  if (options?.offset != null) q.set('offset', String(options.offset));
  if (options?.storageMode) q.set('storageMode', options.storageMode);
  if (options?.purpose) q.set('purpose', options.purpose);
  if (options?.uploadSource) q.set('uploadSource', options.uploadSource);
  if (options?.partnerAppId) q.set('partnerAppId', options.partnerAppId);
  if (options?.partnerEndUserId) q.set('partnerEndUserId', options.partnerEndUserId);
  if (options && 'folderId' in options) {
    q.set('folderId', options.folderId == null ? 'root' : options.folderId);
  }
  return q.toString();
}

/** 同步读取已缓存的上传列表（切换路由时立即展示，不发网络请求） */
export function peekStorageObjectsList(
  options?: {
    storageMode?: StorageObjectMode;
    folderId?: string | null;
    purpose?: string;
    uploadSource?: StorageUploadSource;
    partnerAppId?: string;
    partnerEndUserId?: string;
    limit?: number;
    offset?: number;
  },
  ttlMs = STORAGE_LIST_CACHE_TTL_MS
): { items: StorageObjectListItem[]; total: number } | undefined {
  const query = buildStorageObjectsListQuery(options);
  return getSessionCache<{ items: StorageObjectListItem[]; total: number }>(
    `listStorageObjects:${query}`,
    ttlMs
  );
}

/** 用户上传对象列表（资产中心「我的上传」） */
export async function listStorageObjects(
  options?: {
    storageMode?: StorageObjectMode;
    folderId?: string | null;
    purpose?: string;
    uploadSource?: StorageUploadSource;
    partnerAppId?: string;
    partnerEndUserId?: string;
    limit?: number;
    offset?: number;
  },
  cacheOptions?: SessionCacheOptions
): Promise<{ items: StorageObjectListItem[]; total: number }> {
  const query = buildStorageObjectsListQuery(options);
  const cacheKey = `listStorageObjects:${query}`;
  return withSessionCache(
    cacheKey,
    async () => {
      const res = await request<{
        success?: boolean;
        data?: { items: StorageObjectListItem[]; total: number };
      }>(`/api/v1/storage/objects${query ? `?${query}` : ''}`);
      if (res.error || !res.data?.data) {
        return { items: [], total: 0 };
      }
      return res.data.data;
    },
    { ...cacheOptions, ttlMs: cacheOptions?.ttlMs ?? STORAGE_LIST_CACHE_TTL_MS }
  );
}

/** 移动资产到逻辑文件夹（仅更新 folder_id，不搬迁 R2） */
export async function moveStorageObjectsToFolder(
  objectIds: string[],
  folderId: string | null
): Promise<{ error?: string; moved?: number }> {
  const res = await request<{ success?: boolean; data?: { moved: number } }>(
    '/api/v1/storage/objects/move',
    {
      method: 'POST',
      body: JSON.stringify({ objectIds, folderId }),
    }
  );
  if (res.error) return { error: res.error };
  invalidateStorageObjectsListCache();
  return { moved: res.data?.data?.moved ?? 0 };
}

/** 删除用户上传对象（storage_objects + R2） */
export async function deleteStorageObject(objectId: string): Promise<{ error?: string }> {
  const res = await request<{ success?: boolean }>(
    `/api/v1/storage/objects/${encodeURIComponent(objectId)}`,
    { method: 'DELETE' }
  );
  if (res.error) return { error: res.error };
  invalidateStorageObjectsListCache();
  removeCachedMediaBlobByObjectId(objectId);
  return {};
}

/** 获取当前用户的最近参考图列表 */
export async function listUserReferenceImages(options?: {
  limit?: number;
  offset?: number;
  storageMode?: StorageObjectMode;
}): Promise<{ items: UserReferenceImageItem[]; total: number }> {
  const q = new URLSearchParams();
  if (options?.limit != null) q.set('limit', String(options.limit));
  if (options?.offset != null) q.set('offset', String(options.offset));
  if (options?.storageMode) q.set('storageMode', options.storageMode);
  const query = q.toString();
  const cacheKey = `listUserReferenceImages:${query}`;
  return dedupeInflight(cacheKey, async () => {
    const res = await request<{ success?: boolean; data?: { items: UserReferenceImageItem[]; total: number } }>(
      `/api/v1/cgi/upload/r2-reference${query ? `?${query}` : ''}`
    );
    if (res.error || !res.data?.data) {
      return { items: [], total: 0 };
    }
    return res.data.data;
  });
}

/** 删除用户的一条参考图（同步删除 R2 与数据库记录） */
export async function deleteUserReferenceImage(id: string): Promise<void> {
  await request(`/api/v1/cgi/upload/r2-reference/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export type StockImageItem = {
  id: string;
  title: string;
  thumbnailUrl: string;
  imageUrl: string;
  sourcePageUrl: string;
  creator: string | null;
  license: string;
  width: number | null;
  height: number | null;
  provider?: 'pexels' | 'unsplash' | 'pixabay' | 'openverse';
};

export type StockImageProvider = 'pexels' | 'unsplash' | 'pixabay' | 'openverse' | 'mixed';

/** 搜索免费图库（多源混合：Pexels / Unsplash / Pixabay / Openverse） */
export async function searchStockImages(params: {
  q: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  items: StockImageItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  provider?: StockImageProvider;
  sources?: StockImageProvider[];
  attribution?: string;
}> {
  const q = new URLSearchParams();
  q.set('q', params.q);
  if (params.page != null) q.set('page', String(params.page));
  if (params.pageSize != null) q.set('pageSize', String(params.pageSize));
  const res = await request<{
    success?: boolean;
    data?: { items: StockImageItem[]; total: number; page: number; pageSize: number; pageCount: number };
    provider?: StockImageProvider;
    sources?: StockImageProvider[];
    attribution?: string;
    error?: string;
  }>(`/api/v1/search/stock-images?${q.toString()}`);
  if (res.error) throw new Error(res.error);
  const data = res.data?.data;
  if (!data) throw new Error('图库搜索响应异常');
  return {
    ...data,
    provider: res.data?.provider,
    sources: res.data?.sources,
    attribution: res.data?.attribution,
  };
}

export type StockVideoItem = {
  id: string;
  title: string;
  thumbnailUrl: string;
  videoUrl: string;
  sourcePageUrl: string;
  creator: string | null;
  license: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
};

/** 搜索免费视频素材库（Pexels，需服务端 PEXELS_API_KEY） */
export async function searchStockVideos(params: {
  q: string;
  page?: number;
  pageSize?: number;
  preferWidth?: number;
}): Promise<{
  items: StockVideoItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  provider?: string | null;
  attribution?: string;
}> {
  const q = new URLSearchParams();
  q.set('q', params.q);
  if (params.page != null) q.set('page', String(params.page));
  if (params.pageSize != null) q.set('pageSize', String(params.pageSize));
  if (params.preferWidth != null) q.set('preferWidth', String(params.preferWidth));
  const res = await request<{
    success?: boolean;
    data?: { items: StockVideoItem[]; total: number; page: number; pageSize: number; pageCount: number };
    provider?: string | null;
    attribution?: string;
    error?: string;
  }>(`/api/v1/search/stock-videos?${q.toString()}`);
  if (res.error) throw new Error(res.error);
  const data = res.data?.data;
  if (!data) throw new Error('视频素材搜索响应异常');
  return {
    ...data,
    provider: res.data?.provider,
    attribution: res.data?.attribution,
  };
}

/** POST /api/v2/tasks/run 响应体（Gateway 可能再包一层 data） */
export type TaskRunV2ParallelChildBody = {
  taskId: string;
  parallelIndex: number;
  status: string;
};

export type TaskRunV2ResponseBody = {
  success?: boolean;
  taskId?: string;
  status?: string;
  scope?: string;
  taskKey?: string;
  subtype?: string | null;
  parallel?: {
    parentTaskId: string;
    total: number;
    tasks: TaskRunV2ParallelChildBody[];
  };
  /** scope=text 时同步返回；options.ephemeral 时异步业务也会直接带结果 */
  syncResult?: { text?: string; metadata?: Record<string, unknown>; mediaUrls?: string[] };
  error?: string;
};

export async function runTaskV2(params: {
  scope: string;
  taskKey: string;
  subtype?: string | null;
  params: Record<string, unknown>;
  /** Admin 调试：不落任务列表，响应内直接带 syncResult */
  ephemeral?: boolean;
}) {
  const res = await request<TaskRunV2ResponseBody>(
    '/api/v2/tasks/run',
    {
      method: 'POST',
      body: {
        scope: params.scope,
        taskKey: params.taskKey,
        subtype: params.subtype ?? null,
        params: params.params,
        ...(params.ephemeral ? { options: { ephemeral: true } } : {}),
      },
    }
  );
  if (!res.error && !params.ephemeral) invalidateTaskListCache();
  return res;
}

export type TaskEstimateResult = {
  estimatedTokens: number;
  currentBalance: number;
  allowed: boolean;
  hasPricing: boolean;
  isAdmin: boolean;
  code?: string;
  message?: string;
  breakdown?: Array<{
    label: string;
    provider: string;
    modelKey: string;
    scope: string;
    estimatedTokens: number;
  }>;
  provider?: string;
  modelKey?: string;
  scope?: string;
  /** 开局估价仅含审核前费用，后续在人工审核时再估 */
  deferredUntilManualReview?: boolean;
  estimatePhase?: 'create' | 'after_review' | 'full';
};

export async function estimateTaskV2(params: {
  scope: string;
  taskKey: string;
  subtype?: string | null;
  params?: Record<string, unknown>;
  /** create=开局（审核前，默认）；after_review=审核后后续费用 */
  estimatePhase?: 'create' | 'after_review' | 'full';
}) {
  return request<{ success?: boolean; data?: TaskEstimateResult } | TaskEstimateResult>(
    '/api/v2/tasks/estimate',
    {
      method: 'POST',
      body: {
        scope: params.scope,
        taskKey: params.taskKey,
        subtype: params.subtype ?? null,
        params: params.params ?? {},
        estimatePhase: params.estimatePhase ?? 'create',
      },
    }
  );
}

// 查询任务（mxmcgi /api/v2/tasks/:taskId）
export async function getTask(taskId: string) {
  return request<{ data?: unknown }>(`/api/v2/tasks/${encodeURIComponent(taskId)}`);
}

// 删除任务（软删除）
export async function deleteTask(taskId: string) {
  const res = await request(`/api/v2/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
  if (!res.error) invalidateTaskListCache();
  return res;
}

/** 批量删除任务（软删除） */
export async function deleteTasksBulk(taskIds: string[]): Promise<{
  deleted: string[];
  errors: Array<{ id: string; error: string }>;
}> {
  const deleted: string[] = [];
  const errors: Array<{ id: string; error: string }> = [];
  for (const id of taskIds) {
    const res = await request(`/api/v2/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.error) errors.push({ id, error: res.error });
    else deleted.push(id);
  }
  if (deleted.length > 0) invalidateTaskListCache();
  return { deleted, errors };
}

// 写作任务列表（含大纲，当前用户）
export interface WritingTaskItem {
  id: string;
  type: string;
  status: string;
  progress?: {
    status: string;
    progress?: number;
    error?: string;
    /** 管道阶段人话，如「检索资讯中…」 */
    message?: string;
    phase?: string;
    phaseIndex?: number;
    phaseTotal?: number;
  };
  result?: {
    metadata?: Record<string, unknown>;
    hasMedia?: boolean;
    mediaCount?: number;
    contentPreview?: string;
    outputFormat?: 'pdf' | 'markdown' | 'json' | 'txt' | 'csv';
  };
  metadata?: Record<string, unknown>;
  requestParams?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface WritingTaskListResponse {
  success?: boolean;
  data?: {
    tasks: WritingTaskItem[];
    total: number;
    count: number;
    limit: number;
    offset: number;
  };
}

export type TaskCreationSourceFilter = 'web' | 'open_api';

export async function listWritingTasks(params?: {
  status?: string;
  model?: string;
  limit?: number;
  offset?: number;
  creationSource?: TaskCreationSourceFilter;
}) {
  const q = new URLSearchParams();
  q.set('type', 'writing');
  if (params?.status) q.set('status', params.status);
  if (params?.model) q.set('model', params.model);
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.offset != null) q.set('offset', String(params.offset));
  if (params?.creationSource) q.set('creationSource', params.creationSource);
  const cacheKey = `listWritingTasks:${q.toString()}`;
  return withSessionCache(cacheKey, () =>
    request<WritingTaskListResponse>(`/api/v2/tasks?${q.toString()}`)
  );
}

// 大纲任务列表（type=outline）— 功能已下架，保留供历史页面兼容
/** @deprecated 大纲功能已下架 */
export async function listOutlineTasks(params?: {
  status?: string;
  model?: string;
  limit?: number;
  offset?: number;
  creationSource?: TaskCreationSourceFilter;
}) {
  const q = new URLSearchParams();
  q.set('type', 'outline');
  if (params?.status) q.set('status', params.status);
  if (params?.model) q.set('model', params.model);
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.offset != null) q.set('offset', String(params.offset));
  if (params?.creationSource) q.set('creationSource', params.creationSource);
  const cacheKey = `listOutlineTasks:${q.toString()}`;
  return withSessionCache(cacheKey, () =>
    request<WritingTaskListResponse>(`/api/v2/tasks?${q.toString()}`)
  );
}

// 通用 CGI 任务列表（图片 type=image、音频 type=audio、视频 type=video）
export async function listCgiTasks(
  params: {
  type: 'image' | 'audio' | 'music' | 'video' | 'graph';
  status?: string;
  model?: string;
  limit?: number;
  offset?: number;
  creationSource?: TaskCreationSourceFilter;
  },
  options?: SessionCacheOptions
) {
  const q = new URLSearchParams();
  q.set('type', params.type);
  if (params?.status) q.set('status', params.status);
  if (params?.model) q.set('model', params.model);
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.offset != null) q.set('offset', String(params.offset));
  if (params?.creationSource) q.set('creationSource', params.creationSource);
  const cacheKey = `listCgiTasks:${q.toString()}`;
  return withSessionCache(
    cacheKey,
    () => request<WritingTaskListResponse>(`/api/v2/tasks?${q.toString()}`),
    options
  );
}

/** 知识库等场景：并行拉取各 scope 已完成任务并去重合并 */
export async function listCompletedGenerationTasks(params?: {
  limit?: number;
  creationSource?: TaskCreationSourceFilter;
}): Promise<WritingTaskItem[]> {
  const limit = params?.limit ?? 100;
  const base = {
    limit,
    status: 'completed' as const,
    creationSource: params?.creationSource,
  };

  const [writingRes, graphRes, audioRes, musicRes, videoRes] = await Promise.all([
    listWritingTasks(base),
    // 大纲功能已下架，不再拉取 type=outline
    // listOutlineTasks(base),
    listCgiTasks({ ...base, type: 'graph' }),
    listCgiTasks({ ...base, type: 'audio' }),
    listCgiTasks({ ...base, type: 'music' }),
    listCgiTasks({ ...base, type: 'video' }),
  ]);

  const tasks: WritingTaskItem[] = [];
  const seen = new Set<string>();
  for (const res of [writingRes, graphRes, audioRes, musicRes, videoRes]) {
    const list = (res.data as WritingTaskListResponse | undefined)?.data?.tasks ?? [];
    for (const t of list) {
      if (t.status !== 'completed' || seen.has(t.id)) continue;
      seen.add(t.id);
      tasks.push(t);
    }
  }

  tasks.sort((a, b) => {
    const ta = a.updatedAt ?? a.createdAt ?? '';
    const tb = b.updatedAt ?? b.createdAt ?? '';
    return tb.localeCompare(ta);
  });

  return tasks;
}

export type GenerationPickerScope = 'writing' | 'graph' | 'video' | 'audio' | 'music';

/** 按业务类型拉取已完成任务（知识库软链选择器，单 Tab 懒加载） */
export async function listCompletedTasksForPickerScope(
  scope: GenerationPickerScope,
  params?: { limit?: number; creationSource?: TaskCreationSourceFilter }
): Promise<WritingTaskItem[]> {
  const base = {
    limit: params?.limit ?? 100,
    status: 'completed' as const,
    creationSource: params?.creationSource,
  };
  const res =
    scope === 'writing'
      ? await listWritingTasks(base)
      : await listCgiTasks({ ...base, type: scope });
  const tasks = (res.data as WritingTaskListResponse | undefined)?.data?.tasks ?? [];
  return tasks.filter((t) => t.status === 'completed');
}

export async function createVideo(body: Record<string, unknown>) {
  return request<{ data?: unknown }>('/api/v1/cgi/video/generate', { method: 'POST', body });
}

// ---------- 图文（Task V2；旧 /api/v1/cgi/graph 已由后端返回 410）----------
/** 兼容旧名：等价于 `getTaskFormConfig({ scope: 'graph', taskKey, subtype })` */
export async function getGraphFormOptions(params?: { graphType?: 'photograph' | 'design' | 'painting'; type?: string; lang?: string }) {
  const taskKey = params?.graphType;
  if (!taskKey) {
    throw new Error('getGraphFormOptions: graphType（即 taskKey）为必填，例如 photograph');
  }
  return getTaskFormConfig({
    scope: 'graph',
    taskKey,
    subtype: params?.type,
  });
}

/** 兼容旧名：转发到 `runTaskV2`（subtype 取自 body.type） */
export async function postGraph(path: 'photograph' | 'design' | 'painting', body: Record<string, unknown>) {
  const subtypeRaw = body?.type;
  const subtype = typeof subtypeRaw === 'string' && subtypeRaw.trim() ? subtypeRaw.trim() : null;
  return runTaskV2({
    scope: 'graph',
    taskKey: path,
    subtype,
    params: body,
  });
}

/** 已废弃：旧「任意 modelName」直 POST 不再支持，请用 Admin 配置 graph 路由 + `runTaskV2` */
export async function postGraphModel(_modelName: string, _body: Record<string, unknown>) {
  throw new Error(
    'postGraphModel 已废弃。请使用 runTaskV2({ scope: "graph", taskKey, subtype, params })，物理模型由 graph_scope_config 解析。'
  );
}

// ---------- 音频 ----------
export async function getAudioModels() {
  return request<{ data?: unknown }>('/api/v1/cgi/audio/models');
}

export async function postAudioModel(modelName: string, body: Record<string, unknown>) {
  return request<{ data?: unknown }>(`/api/v1/cgi/audio/${encodeURIComponent(modelName)}`, { method: 'POST', body });
}

export type MinimaxVoiceItem = {
  voice_id: string;
  voice_name: string;
  description?: string[];
  created_time?: string;
  source: 'system' | 'voice_cloning' | 'voice_generation';
  gender?: 'male' | 'female' | 'other';
  language?: 'zh' | 'en' | 'other';
};

export async function listMinimaxVoices(
  voiceType: 'system' | 'voice_cloning' | 'voice_generation' | 'all' = 'system'
): Promise<MinimaxVoiceItem[]> {
  const res = await request<{
    success?: boolean;
    voices?: MinimaxVoiceItem[];
    message?: string;
    error?: string;
  }>(`/api/v1/cgi/audio/voices?voice_type=${encodeURIComponent(voiceType)}`);
  if (res.error) throw new Error(res.error);
  const voices = res.data?.voices;
  return Array.isArray(voices) ? voices : [];
}

/** 从知识库软链读取用户登记的克隆音色 */
export async function listMinimaxVoicesFromFolder(folderId: string): Promise<MinimaxVoiceItem[]> {
  const res = await request<{
    success?: boolean;
    voices?: MinimaxVoiceItem[];
    message?: string;
    error?: string;
  }>(`/api/v1/cgi/audio/voices/from-folder/${encodeURIComponent(folderId)}`);
  if (res.error) throw new Error(res.error);
  const voices = res.data?.voices;
  return Array.isArray(voices) ? voices : [];
}

export async function cloneMinimaxVoice(
  file: File,
  options?: {
    voiceName?: string;
    previewText?: string;
    model?: string;
    voiceId?: string;
    knowledgeFolderId?: string;
  }
): Promise<{
  voice_id: string;
  label?: string;
  demo_audio?: string;
  storage_object_id?: string;
  virtual_folder_id?: string;
}> {
  const form = new FormData();
  form.append('file', file);
  if (options?.voiceName) form.append('voice_name', options.voiceName);
  if (options?.previewText) form.append('preview_text', options.previewText);
  if (options?.model) form.append('model', options.model);
  if (options?.voiceId) form.append('voice_id', options.voiceId);
  if (options?.knowledgeFolderId) form.append('virtual_folder_id', options.knowledgeFolderId);

  const res = await request<{
    success?: boolean;
    data?: {
      voice_id?: string;
      label?: string;
      demo_audio?: string;
      storage_object_id?: string;
      virtual_folder_id?: string;
    };
    message?: string;
    error?: string;
  }>('/api/v1/cgi/audio/voice-clone', { method: 'POST', body: form });

  if (res.error) throw new Error(res.error);
  const data = res.data?.data;
  const voiceId = data?.voice_id;
  if (!voiceId) {
    throw new Error(res.data?.message || res.data?.error || '音色克隆失败');
  }
  return {
    voice_id: voiceId,
    label: data?.label,
    demo_audio: data?.demo_audio,
    storage_object_id: data?.storage_object_id,
    virtual_folder_id: data?.virtual_folder_id,
  };
}

// ---------- 媒体（按任务取结果） ----------
export async function getMediaGraph(taskId: string) {
  return request<{ data?: unknown }>(`/api/v1/media/graph/${encodeURIComponent(taskId)}`);
}

export async function getMediaVideo(taskId: string) {
  return request<{ data?: unknown }>(`/api/v1/media/video/${encodeURIComponent(taskId)}`);
}

export async function getMediaWriting(taskId: string) {
  return request<{ data?: unknown }>(`/api/v1/media/writing/${encodeURIComponent(taskId)}`);
}

export type WritingMediaContent =
  | { kind: 'text'; text: string }
  | { kind: 'pdf'; blobUrl: string; revoke: () => void };

async function isPdfBlob(blob: Blob, contentType: string): Promise<boolean> {
  if (contentType.toLowerCase().includes('pdf')) return true;
  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
}

/** 获取写作媒体内容（PDF 走 blob URL，文本/Markdown 走 string） */
export async function fetchWritingMediaContent(
  taskId: string,
  options?: { timeoutMs?: number }
): Promise<WritingMediaContent> {
  const base = getBaseUrl().replace(/\/$/, '');
  const path = `/api/v1/media/writing/${encodeURIComponent(taskId)}`;
  const url = base ? `${base}${path.startsWith('/') ? '' : '/'}${path}` : path.startsWith('/') ? path : `/${path}`;
  const token = getToken();
  const controller = new AbortController();
  const timeout = options?.timeoutMs ?? 30000;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      headers: authMediaHeaders(token),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text();
      let msg = res.statusText;
      try {
        const j = JSON.parse(text) as { error?: string; message?: string };
        msg = j.error ?? j.message ?? msg;
      } catch {
        if (text) msg = text.slice(0, 200);
      }
      throw new Error(msg);
    }
    const contentType = res.headers.get('Content-Type') ?? '';
    const blob = await res.blob();
    if (await isPdfBlob(blob, contentType)) {
      const blobUrl = URL.createObjectURL(blob);
      return { kind: 'pdf', blobUrl, revoke: () => URL.revokeObjectURL(blobUrl) };
    }
    const text = await blob.text();
    return { kind: 'text', text };
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('请求超时，获取写作内容失败');
    }
    throw e;
  }
}

export type WritingExportFormat = 'pdf' | 'markdown';

/** 下载写作导出文件（服务端按需转换，不改变存储） */
export async function downloadWritingExport(
  taskId: string,
  format: WritingExportFormat
): Promise<void> {
  const base = getBaseUrl().replace(/\/$/, '');
  const q = format === 'markdown' ? 'markdown' : 'pdf';
  const path = `/api/v1/media/writing/${encodeURIComponent(taskId)}/export?format=${encodeURIComponent(q)}`;
  const url = base ? `${base}${path.startsWith('/') ? '' : '/'}${path}` : path.startsWith('/') ? path : `/${path}`;
  const token = getToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = res.statusText;
    try {
      const j = JSON.parse(text) as { error?: string; message?: string };
      msg = j.error ?? j.message ?? msg;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  let filename = `writing-${taskId}.${format === 'pdf' ? 'pdf' : 'md'}`;
  const disposition = res.headers.get('Content-Disposition');
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quoted = disposition?.match(/filename="([^"]+)"/i)?.[1];
  const raw = encoded ?? quoted;
  if (raw) {
    try {
      filename = decodeURIComponent(raw);
    } catch {
      filename = raw;
    }
  }
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objUrl);
}

/** 获取写作导出纯文本（服务端从 metadata / 存储解析，无需客户端 PDF.js） */
export async function fetchWritingExportText(
  taskId: string,
  format: 'markdown' | 'txt' = 'markdown',
  options?: { timeoutMs?: number }
): Promise<string> {
  const base = getBaseUrl().replace(/\/$/, '');
  const q = format === 'txt' ? 'txt' : 'markdown';
  const path = `/api/v1/media/writing/${encodeURIComponent(taskId)}/export?format=${encodeURIComponent(q)}`;
  const url = base ? `${base}${path.startsWith('/') ? '' : '/'}${path}` : path.startsWith('/') ? path : `/${path}`;
  const token = getToken();
  const controller = new AbortController();
  const timeout = options?.timeoutMs ?? 60_000;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      headers: authMediaHeaders(token),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text();
      let msg = res.statusText;
      try {
        const j = JSON.parse(text) as { error?: string; message?: string };
        msg = j.error ?? j.message ?? msg;
      } catch {
        if (text) msg = text.slice(0, 200);
      }
      throw new Error(msg);
    }
    const text = (await res.text()).trim();
    if (!text) throw new Error('该写作任务导出内容为空');
    return text;
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('请求超时，获取写作内容失败');
    }
    throw e;
  }
}

export async function getMediaAudio(taskId: string) {
  return request<{ data?: unknown }>(`/api/v1/media/audio/${encodeURIComponent(taskId)}`);
}

/** 获取音频任务句级字幕（优先读任务内持久化数据，旧任务回退 MiniMax URL） */
export async function fetchAudioSubtitles(taskId: string): Promise<unknown> {
  const base = getBaseUrl().replace(/\/$/, '');
  const path = `/api/v1/media/audio/${encodeURIComponent(taskId)}/subtitles`;
  const url = base ? `${base}${path}` : path;
  const token = getToken();
  const res = await fetch(url, {
    headers: authMediaHeaders(token),
  });
  if (res.status === 404) return [];
  if (!res.ok) {
    const text = await res.text();
    let msg = res.statusText;
    try {
      const j = JSON.parse(text) as { error?: string; message?: string };
      msg = j.error || j.message || msg;
    } catch {
      // ignore
    }
    throw new Error(msg || `字幕 HTTP ${res.status}`);
  }
  const json = (await res.json()) as { success?: boolean; data?: unknown };
  return json.data ?? json;
}

/** 获取媒体文件的 Blob URL（用于 img 展示，需带认证） */
export async function fetchMediaBlobUrl(
  taskId: string,
  type: 'graph' | 'audio' | 'music' | 'video',
  options?: {
    timeoutMs?: number;
    preview?: boolean;
    previewWidth?: number;
    useCache?: boolean;
    /** 图集等多图任务的第几张（0-based） */
    index?: number;
    /** 默认 stream；video 播放器可传 blob 整文件拉取 */
    delivery?: 'stream' | 'blob';
  }
): Promise<string> {
  const delivery = options?.delivery ?? 'stream';
  if (
    delivery === 'stream' &&
    (type === 'audio' || type === 'music' || type === 'video')
  ) {
    return getAuthenticatedMediaStreamUrl(taskId, type, options);
  }

  const index = options?.index ?? 0;
  const variant = options?.preview ? 'preview' : 'full';
  const cacheKey = mediaBlobCacheKey(type, taskId, variant, index);
  if (options?.useCache !== false) {
    const hit = getCachedMediaBlobUrl(cacheKey);
    if (hit?.startsWith('blob:')) return hit;
  }

  const base = getBaseUrl().replace(/\/$/, '');
  let path = `/api/v1/media/${type}/${encodeURIComponent(taskId)}`;
  const qs = new URLSearchParams();
  if (index > 0) qs.set('index', String(index));
  if (options?.preview && type === 'graph') {
    qs.set('preview', '1');
    qs.set('w', String(options.previewWidth ?? 240));
  }
  const q = qs.toString();
  if (q) path += `?${q}`;
  const url = base ? `${base}${path.startsWith('/') ? '' : '/'}${path}` : path.startsWith('/') ? path : `/${path}`;
  const token = getToken();
  const controller = new AbortController();
  const timeout = options?.timeoutMs ?? (type === 'video' ? 120_000 : 15_000);
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    if (options?.useCache !== false) {
      setCachedMediaBlobUrl(cacheKey, blobUrl);
    }
    return blobUrl;
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('请求超时，媒体服务暂时不可用');
    }
    throw e;
  }
}

/**
 * 鉴权媒体直链（?token=），供 audio/video 原生 Range 分段拉流，无需整文件 blob
 * Gateway GET 支持 ?token= JWT（每次现拼 token，不缓存直链）
 */
export function getAuthenticatedMediaStreamUrl(
  taskId: string,
  type: 'audio' | 'music' | 'video' | 'graph',
  options?: { preview?: boolean; previewWidth?: number; useCache?: boolean }
): string {
  const base = getBaseUrl().replace(/\/$/, '');
  let path = `/api/v1/media/${type}/${encodeURIComponent(taskId)}`;
  if (options?.preview && type === 'graph') {
    const w = options.previewWidth ?? 240;
    path += `?preview=1&w=${encodeURIComponent(String(w))}`;
  }

  const token = getToken();
  const sep = path.includes('?') ? '&' : '?';
  const needsToken = type === 'audio' || type === 'music' || type === 'video';
  const pathUrl = base
    ? `${base}${path.startsWith('/') ? '' : '/'}${path}`
    : path.startsWith('/')
      ? path
      : `/${path}`;

  if (needsToken && token) {
    return `${pathUrl}${sep}token=${encodeURIComponent(token)}`;
  }
  return pathUrl;
}

/** 获取用户上传资源（/media/asset）的 Blob URL（用于 img 展示，需带认证） */
export async function fetchAssetBlobUrl(bucket: string, key: string): Promise<string> {
  const cacheKey = mediaPreviewCacheKey(`/api/v1/media/asset?bucket=${bucket}&key=${key}`);
  const cached = getCachedMediaBlobUrl(cacheKey);
  if (cached) return cached;

  const base = getBaseUrl().replace(/\/$/, '');
  const path = `/api/v1/media/asset?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}`;
  const url = base ? `${base}${path.startsWith('/') ? '' : '/'}${path}` : path.startsWith('/') ? path : `/${path}`;
  const token = getToken();
  const res = await fetch(url, {
    headers: authMediaHeaders(token),
  });
  if (!res.ok) throw new Error(res.statusText || 'Failed to fetch asset');
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  return setCachedMediaBlobUrl(cacheKey, blobUrl);
}

function authMediaHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const user = getStoredUser();
  if (user?.id) headers['x-user-id'] = String(user.id);
  return headers;
}

/** 从 storage object 代理 URL 解析 objectId（含公网 /media/public/object） */
export function parseStorageObjectIdFromUrl(url: string): string | null {
  const m = url.match(/\/media\/(?:public\/)?object\/([^?/#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * 将 API 返回的绝对地址（如 http://localhost:3000/api/...）转为当前页同源路径，
 * 开发时走 Vite proxy，避免 5173 → 3000 跨域导致预览 fetch 失败。
 */
export function toSameOriginApiPath(urlOrPath: string): string {
  try {
    if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
      const u = new URL(urlOrPath);
      if (u.pathname.startsWith('/api/')) {
        return `${u.pathname}${u.search}`;
      }
      // 外部 CDN（Pexels、Openverse 等）保持原 URL，避免拼成 /https://...
      return urlOrPath;
    }
  } catch {
    // ignore
  }
  const base = getBaseUrl().replace(/\/$/, '');
  if (urlOrPath.startsWith('/')) {
    return base ? `${base}${urlOrPath}` : urlOrPath;
  }
  return base ? `${base}/${urlOrPath}` : `/${urlOrPath}`;
}

/** 上传接口返回的 url 规范化（表单存相对路径，换环境仍可用） */
export function normalizeUploadedMediaUrl(url: string): string {
  const relative = toSameOriginApiPath(url);
  if (relative.startsWith('/api/v1/media/')) return relative;
  return url;
}

/**
 * 鉴权媒体直链（?token=），供 audio/video 原生 Range 分段拉流，无需整文件 blob。
 * Gateway GET 支持 ?token= JWT（img/video/audio 无法带 Authorization Header）。
 */
export function resolveAuthenticatedMediaStreamUrl(contentUrl: string): string {
  const trimmed = contentUrl.trim();
  if (!trimmed || trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
    return trimmed;
  }

  const normalized = toSameOriginApiPath(normalizeUploadedMediaUrl(trimmed));
  if (!needsAuthenticatedMediaFetch(normalized)) {
    return normalized;
  }

  const taskMediaMatch = normalized.match(/\/api\/v1\/media\/(audio|music|video|graph)\/([^/?#]+)/);
  if (taskMediaMatch) {
    const [, type, taskId] = taskMediaMatch;
    return getAuthenticatedMediaStreamUrl(
      decodeURIComponent(taskId),
      type as 'audio' | 'music' | 'video' | 'graph'
    );
  }

  const token = getToken();
  if (!token) return normalized;

  try {
    const url = normalized.startsWith('http')
      ? new URL(normalized)
      : new URL(normalized, window.location.origin);
    if (!url.searchParams.has('token')) {
      url.searchParams.set('token', token);
    }
    if (normalized.startsWith('http')) {
      return url.toString();
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    const sep = normalized.includes('?') ? '&' : '?';
    return `${normalized}${sep}token=${encodeURIComponent(token)}`;
  }
}

/** 是否需带 Token 拉取（Gateway /media/* 鉴权，不能直接用 <img src>） */
export function needsAuthenticatedMediaFetch(url: string): boolean {
  if (!url || url.startsWith('blob:') || url.startsWith('data:')) return false;
  // STORAGE_USER_UPLOAD_ACCESS=public 时走 Gateway 公网读，无需 JWT
  if (url.includes('/media/public/')) return false;
  if (url.includes('/media/object/') || url.includes('/media/asset?')) return true;
  if (url.startsWith('/') && url.includes('/api/v1/media/')) return true;
  return false;
}

function resolveStoragePreviewCacheKey(contentUrl?: string, objectId?: string | null): string | null {
  if (objectId) return storageObjectPreviewCacheKey(objectId);
  if (!contentUrl) return null;
  const parsed = parseStorageObjectIdFromUrl(contentUrl);
  if (parsed) return storageObjectPreviewCacheKey(parsed);
  if (needsAuthenticatedMediaFetch(contentUrl)) return mediaPreviewCacheKey(contentUrl);
  return null;
}

/** 用户上传 / 鉴权媒体：统一走内存 blob 缓存（public 模式也不能靠浏览器 HTTP 缓存） */
export function shouldUseBlobMediaPreview(contentUrl?: string, objectId?: string | null): boolean {
  return !!resolveStoragePreviewCacheKey(contentUrl, objectId);
}

/** 获取 storage_objects 代理资源的 Blob URL（供预览组件使用） */
export async function fetchStorageObjectBlobUrl(
  contentUrl: string,
  objectIdHint?: string
): Promise<string> {
  const objectId = objectIdHint || parseStorageObjectIdFromUrl(contentUrl);
  if (!objectId) throw new Error('Invalid storage object URL');
  const cacheKey = storageObjectPreviewCacheKey(objectId);
  const cached = getCachedMediaBlobUrl(cacheKey);
  if (cached) return cached;

  const usePublicPath =
    contentUrl.includes('/media/public/') ||
    (!contentUrl.includes('/media/object/') && Boolean(objectIdHint));
  const path = usePublicPath
    ? `/api/v1/media/public/object/${encodeURIComponent(objectId)}`
    : `/api/v1/media/object/${encodeURIComponent(objectId)}`;
  const url = toSameOriginApiPath(path);
  const token = getToken();
  const res = await fetch(url, {
    headers: usePublicPath ? {} : authMediaHeaders(token),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const blobUrl = URL.createObjectURL(await res.blob());
  return setCachedMediaBlobUrl(cacheKey, blobUrl);
}

/** 读取 storage object 文本（文集单篇 .md / 纯文本预览） */
export async function fetchStorageObjectText(
  contentUrl: string,
  objectIdHint?: string
): Promise<string> {
  const blobUrl = await fetchStorageObjectBlobUrl(contentUrl, objectIdHint);
  const res = await fetch(blobUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.text();
}

/** 同步读取已缓存的媒体预览（切换路由时避免重复拉取） */
export function getCachedAuthenticatedMediaPreviewUrl(
  contentUrl?: string,
  objectId?: string | null
): string | undefined {
  const cacheKey = resolveStoragePreviewCacheKey(contentUrl, objectId);
  if (!cacheKey) return undefined;
  return getCachedMediaBlobUrl(cacheKey);
}

/** 统一解析可展示的预览 Blob URL */
export async function resolveAuthenticatedMediaPreviewUrl(
  contentUrl: string,
  objectId?: string | null
): Promise<string> {
  const cacheKey = resolveStoragePreviewCacheKey(contentUrl, objectId);
  if (cacheKey) {
    const cached = getCachedMediaBlobUrl(cacheKey);
    if (cached) return cached;

    return dedupeInflight(`mediaPreview:${cacheKey}`, async () => {
      const hit = getCachedMediaBlobUrl(cacheKey);
      if (hit) return hit;

      const parsedId = objectId || parseStorageObjectIdFromUrl(contentUrl);
      if (parsedId) {
        return fetchStorageObjectBlobUrl(contentUrl, parsedId);
      }

      if (contentUrl.includes('/media/asset?')) {
        try {
          const u = contentUrl.startsWith('http')
            ? new URL(contentUrl)
            : new URL(contentUrl, window.location.origin);
          const bucket = u.searchParams.get('bucket');
          const key = u.searchParams.get('key');
          if (bucket && key) {
            return fetchAssetBlobUrl(bucket, key);
          }
        } catch {
          // fall through
        }
      }
      return fetchStorageObjectBlobUrl(contentUrl);
    });
  }

  if (!needsAuthenticatedMediaFetch(contentUrl)) return contentUrl;
  const urlKey = mediaPreviewCacheKey(contentUrl);
  const cached = getCachedMediaBlobUrl(urlKey);
  if (cached) return cached;

  return dedupeInflight(`mediaPreview:${urlKey}`, async () => {
    const hit = getCachedMediaBlobUrl(urlKey);
    if (hit) return hit;
    if (contentUrl.includes('/media/asset?')) {
      const u = contentUrl.startsWith('http')
        ? new URL(contentUrl)
        : new URL(contentUrl, window.location.origin);
      const bucket = u.searchParams.get('bucket');
      const key = u.searchParams.get('key');
      if (bucket && key) {
        return fetchAssetBlobUrl(bucket, key);
      }
    }
    return fetchStorageObjectBlobUrl(contentUrl);
  });
}

/** 列表加载后预热缩略图 blob 缓存（切换路由再回来零网络） */
export function prefetchStorageObjectPreviews(
  items: Array<{ id: string; url: string; contentType?: string | null }>,
  options?: { concurrency?: number }
): void {
  const concurrency = options?.concurrency ?? 4;
  const queue = items.filter(
    (it) =>
      (it.contentType?.startsWith('image/') || it.contentType?.startsWith('video/')) &&
      !getCachedAuthenticatedMediaPreviewUrl(it.url, it.id)
  );
  if (queue.length === 0) return;

  let inFlight = 0;
  let index = 0;

  const pump = () => {
    while (inFlight < concurrency && index < queue.length) {
      const item = queue[index++];
      inFlight += 1;
      const mediaUrl = item.url.startsWith('http') ? item.url : normalizeUploadedMediaUrl(item.url);
      void resolveAuthenticatedMediaPreviewUrl(mediaUrl, item.id)
        .catch(() => undefined)
        .finally(() => {
          inFlight -= 1;
          pump();
        });
    }
  };

  pump();
}

// ---------- 提示词工程配置（Admin） ----------
export interface PromptConfigParams {
  scope?: string;
  type?: string;
  subtype?: string | null;
  lang?: string;
}

export interface PromptConfigBody {
  scope: string;
  type: string;
  subtype?: string | null;
  output_format_i18n?: Record<string, string>;
  form_options_i18n?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  is_active?: boolean;
}

export async function listPromptConfig(params?: PromptConfigParams) {
  const q = new URLSearchParams();
  if (params?.scope) q.set('scope', params.scope);
  if (params?.type) q.set('type', params.type);
  if (params?.subtype != null && params.subtype !== '') q.set('subtype', String(params.subtype));
  const query = q.toString();
  return request<{ data?: { items?: unknown[]; total?: number } }>(
    `/api/v1/system/prompt-config${query ? `?${query}` : ''}`
  );
}

export async function getPromptConfigByKey(params: { scope: string; type: string; subtype?: string | null; lang?: string }) {
  const q = new URLSearchParams({ scope: params.scope, type: params.type });
  if (params.subtype != null && params.subtype !== '') q.set('subtype', String(params.subtype));
  if (params.lang) q.set('lang', params.lang);
  return request<{ data?: unknown }>(`/api/v1/system/prompt-config/by-key?${q.toString()}`);
}

export async function upsertPromptConfig(body: PromptConfigBody) {
  return request<{ data?: unknown }>('/api/v1/system/prompt-config', { method: 'PUT', body });
}

export async function deletePromptConfig(id: string) {
  return request(`/api/v1/system/prompt-config/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

const BUSINESS_BUNDLE_BASE = '/api/v1/system/admin/business';

/** 单条导出：GET bundle JSON（默认不含 businessPricing；含 routing / linked text-format；定价需 includePricing: true） */
export async function exportBusinessBundleQuery(params: {
  scope: string;
  type: string;
  subtype?: string | null;
  includeRouting?: boolean;
  includePricing?: boolean;
  includeLinkedTextFormat?: boolean;
}) {
  const q = new URLSearchParams({ scope: params.scope, type: params.type });
  if (params.subtype != null && params.subtype !== '') q.set('subtype', String(params.subtype));
  if (params.includeRouting === false) q.set('includeRouting', '0');
  if (params.includePricing === true) q.set('includePricing', '1');
  if (params.includeLinkedTextFormat === false) q.set('includeLinkedTextFormat', '0');
  return request<{ data?: unknown; warnings?: string[] }>(`${BUSINESS_BUNDLE_BASE}/bundle?${q.toString()}`);
}

/** 批量导出：POST body.keys 或 body.filter.scope */
export async function exportBusinessBundlePost(body: {
  keys?: Array<{ scope: string; type: string; subtype?: string | null }>;
  filter?: { scope: string };
  includeRouting?: boolean;
  includePricing?: boolean;
  includeLinkedTextFormat?: boolean;
}) {
  return request<{ data?: unknown; warnings?: string[] }>(`${BUSINESS_BUNDLE_BASE}/bundle/export`, {
    method: 'POST',
    body,
  });
}

export type BusinessBundleImportPolicy = 'upsert' | 'skip' | 'dry-run';

/** 导入 bundle；conflictPolicy=dry-run 仅返回预览，不写库 */
export async function importBusinessBundle(body: {
  bundle: unknown;
  conflictPolicy?: BusinessBundleImportPolicy;
}) {
  return request<{
    data?: { created: string[]; updated: string[]; skipped: string[]; warnings: string[] };
  }>(`${BUSINESS_BUNDLE_BASE}/bundle/import`, {
    method: 'POST',
    body: { bundle: body.bundle, conflictPolicy: body.conflictPolicy ?? 'upsert' },
  });
}

// ---------- 管理员：敏感词管理（需 Admin 权限）----------
const SENSITIVE_BASE = '/api/v1/system/admin/sensitive-words';

export async function listSensitiveWordLists() {
  return request<{ data?: { items?: { id: string; name: string; description?: string | null; is_active: boolean }[] } }>(`${SENSITIVE_BASE}/lists`);
}

export async function getSensitiveWordList(listId: string) {
  return request<{ data?: { id: string; name: string; description?: string | null; is_active: boolean } }>(`${SENSITIVE_BASE}/lists/${encodeURIComponent(listId)}`);
}

export async function createSensitiveWordList(body: { name: string; description?: string | null; is_active?: boolean }) {
  return request<{ data?: { id: string; name: string } }>(`${SENSITIVE_BASE}/lists`, { method: 'POST', body });
}

export async function updateSensitiveWordList(listId: string, body: { name?: string; description?: string | null; is_active?: boolean }) {
  return request<{ data?: unknown }>(`${SENSITIVE_BASE}/lists/${encodeURIComponent(listId)}`, { method: 'PUT', body });
}

export async function deleteSensitiveWordList(listId: string) {
  return request(`${SENSITIVE_BASE}/lists/${encodeURIComponent(listId)}`, { method: 'DELETE' });
}

export async function listSensitiveWords(listId: string) {
  return request<{ data?: { items?: { id: string; list_id: string; word: string }[] } }>(`${SENSITIVE_BASE}/lists/${encodeURIComponent(listId)}/words`);
}

export async function addSensitiveWord(listId: string, word: string) {
  return request<{ data?: unknown }>(`${SENSITIVE_BASE}/lists/${encodeURIComponent(listId)}/words`, { method: 'POST', body: { word } });
}

export async function addSensitiveWordsBatch(listId: string, words: string[]) {
  return request<{ data?: { added: number } }>(`${SENSITIVE_BASE}/lists/${encodeURIComponent(listId)}/words/batch`, { method: 'POST', body: { words } });
}

export async function deleteSensitiveWord(wordId: string) {
  return request(`${SENSITIVE_BASE}/words/${encodeURIComponent(wordId)}`, { method: 'DELETE' });
}

export async function listSensitiveWordBindings(params?: { scope?: string; type?: string; subtype?: string }) {
  const q = new URLSearchParams();
  if (params?.scope != null) q.set('scope', params.scope);
  if (params?.type != null) q.set('type', params.type);
  if (params?.subtype != null) q.set('subtype', params.subtype);
  const query = q.toString();
  return request<{ data?: { items?: { id: string; scope: string; type: string; subtype: string | null; list_id: string; sort_order: number }[] } }>(
    `${SENSITIVE_BASE}/bindings${query ? `?${query}` : ''}`
  );
}

export async function setSensitiveWordBindingsForSlot(body: { scope: string; type: string; subtype?: string | null; list_ids: string[] }) {
  return request<{ data?: unknown }>(`${SENSITIVE_BASE}/bindings/slot`, { method: 'PUT', body });
}

export async function removeSensitiveWordBinding(bindingId: string) {
  return request(`${SENSITIVE_BASE}/bindings/${encodeURIComponent(bindingId)}`, { method: 'DELETE' });
}

// ---------- 管理员：用户列表（需 Admin 权限）----------
export interface AdminUsersParams {
  page?: number;
  limit?: number;
  status?: 'active' | 'suspended' | 'banned';
  role?: 'user' | 'admin';
  search?: string;
}

export interface AdminUserItem {
  id: string;
  username: string;
  email?: string;
  phone?: string;
  role?: 'user' | 'admin';
  status?: string;
  level?: number;
  balance?: number;
  membership_type?: string;
  isLoggedIn?: boolean;
  created_at?: string;
  updated_at?: string;
}

export async function getAdminUsers(params?: AdminUsersParams) {
  const q = new URLSearchParams();
  if (params?.page != null) q.set('page', String(params.page));
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.status) q.set('status', params.status);
  if (params?.role) q.set('role', params.role);
  if (params?.search) q.set('search', params.search);
  const query = q.toString();
  return request<{ code?: number; data?: { users?: AdminUserItem[]; pagination?: { total: number; page: number; limit: number; totalPages: number } } }>(
    `/api/v1/account/admin/users${query ? `?${query}` : ''}`
  );
}

/** Admin: 创建用户 */
export async function adminCreateUser(body: {
  username: string;
  password: string;
  email?: string;
  phone?: string;
  role?: 'user' | 'admin';
  membership_type?: 'free' | 'pro' | 'premium';
}) {
  return request<{ code?: number; message?: string; data?: AdminUserItem }>(
    `/api/v1/account/admin/users`,
    {
      method: 'POST',
      body,
    }
  );
}

export async function updateAdminUserStatus(userId: string, status: 'active' | 'suspended' | 'banned') {
  return request(`/api/v1/account/admin/users/${encodeURIComponent(userId)}/status`, {
    method: 'PUT',
    body: { status },
  });
}

export async function adminForceLogout(userId: string) {
  return request(`/api/v1/account/admin/users/${encodeURIComponent(userId)}/force-logout`, {
    method: 'POST',
  });
}

// ---------- 管理员：任务列表（需 Admin 权限）----------
export interface AdminTasksParams {
  type?: string;
  status?: string;
  model?: string;
  userId?: string;
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
  includeDeleted?: boolean;
}

export interface AdminTaskItem {
  id: string;
  type: string;
  status: string;
  progress?: {
    status: string;
    progress?: number;
    error?: string;
    /** 管道阶段人话，如「检索资讯中…」 */
    message?: string;
    phase?: string;
    phaseIndex?: number;
    phaseTotal?: number;
  };
  metadata?: { userId?: string; userName?: string; model?: string; provider?: string };
  /** 后端保存的原始请求参数（已做 base64 清理），用于展示 provider 传参 */
  requestParams?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export async function getAdminTasks(params?: AdminTasksParams) {
  const q = new URLSearchParams();
  if (params?.type) q.set('type', params.type);
  if (params?.status) q.set('status', params.status);
  if (params?.model) q.set('model', params.model);
  if (params?.userId) q.set('userId', params.userId);
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.offset != null) q.set('offset', String(params.offset));
  if (params?.startDate) q.set('startDate', params.startDate);
  if (params?.endDate) q.set('endDate', params.endDate);
  if (params?.includeDeleted) q.set('includeDeleted', 'true');
  const query = q.toString();
  return request<{ success?: boolean; data?: { tasks: AdminTaskItem[]; total: number; count: number; limit: number; offset: number } }>(
    `/api/v2/tasks/admin${query ? `?${query}` : ''}`
  );
}

export async function cancelTask(taskId: string) {
  return request(`/api/v2/tasks/${encodeURIComponent(taskId)}/cancel`, { method: 'POST' });
}

/** 人工审核通过，继续管线 */
export type ReviewDraftPayload = {
  version: 1;
  gateId: string;
  phase: 'pre' | 'post';
  kind:
    | 'text'
    | 'json'
    | 'image'
    | 'media'
    | 'composite'
    | 'video-timeline'
    | 'interactive-card'
    | 'basic-form'
    | 'writing-chat';
  text?: string;
  json?: unknown;
  mediaUrls?: string[];
  metadata?: Record<string, unknown>;
  editable: boolean;
  label?: string;
  hint?: string;
  /** writing-chat：LLM 整理的人话版 Markdown 摘要（默认渲染）。 */
  summary?: string;
  /** writing-chat：摘要里的可调字段清单（结构同 interactive-card.fields）。 */
  interactiveCardFields?: unknown;
};

export async function approveTaskReview(
  taskId: string,
  body: {
    gateId?: string;
    reviewText?: string;
    reviewJson?: unknown;
    approved?: boolean;
  }
) {
  return request<{ data?: { taskId?: string; status?: string; gateId?: string; phase?: string } }>(
    `/api/v2/tasks/${encodeURIComponent(taskId)}/approve-review`,
    {
      method: 'POST',
      body: JSON.stringify({ approved: true, ...body }),
    }
  );
}

/** 图集：重试失败单项配图 */
export async function retryAlbumItem(taskId: string, itemId: string) {
  return request<{
    data?: {
      taskId?: string;
      itemId?: string;
      status?: 'ready' | 'failed';
      error?: string;
      albumResult?: unknown;
      mediaUrls?: string[];
    };
  }>(`/api/v2/tasks/${encodeURIComponent(taskId)}/retry-album-item`, {
    method: 'POST',
    body: JSON.stringify({ itemId }),
  });
}

/** 图集：删除单项配图 */
export async function removeAlbumItem(taskId: string, itemId: string) {
  return request<{
    data?: {
      taskId?: string;
      itemId?: string;
      albumResult?: unknown;
      mediaUrls?: string[];
    };
  }>(`/api/v2/tasks/${encodeURIComponent(taskId)}/remove-album-item`, {
    method: 'POST',
    body: JSON.stringify({ itemId }),
  });
}

/** 写作文集：删除单篇 */
export async function removeCollectionItem(taskId: string, itemId: string) {
  return request<{
    data?: {
      taskId?: string;
      itemId?: string;
      collectionResult?: unknown;
    };
  }>(`/api/v2/tasks/${encodeURIComponent(taskId)}/remove-collection-item`, {
    method: 'POST',
    body: JSON.stringify({ itemId }),
  });
}

/** 成片审核阶段：重试失败/未就绪片段，父任务回到 processing */
export async function retryRenderedReviewClips(
  taskId: string,
  body: {
    gateId?: string;
    reviewJson: unknown;
    clipIds?: string[];
  }
) {
  return request<{
    data?: {
      taskId?: string;
      status?: string;
      renderTaskId?: string;
      retriedClipIds?: string[];
    };
  }>(`/api/v2/tasks/${encodeURIComponent(taskId)}/retry-rendered-review-clips`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getTaskReviewDraft(taskId: string, gateId?: string) {
  const q = gateId ? `?gateId=${encodeURIComponent(gateId)}` : '';
  return request<{
    data?: {
      text?: string;
      gateId?: string;
      draft?: ReviewDraftPayload | null;
      draftRecovered?: boolean;
      gate?: Record<string, unknown> | null;
    };
  }>(`/api/v2/tasks/${encodeURIComponent(taskId)}/review-draft${q}`);
}

export async function recoverTask(taskId: string) {
  return request(`/api/v2/tasks/${encodeURIComponent(taskId)}/recover`, { method: 'POST' });
}

export async function retryTask(taskId: string) {
  return request(`/api/v2/tasks/${encodeURIComponent(taskId)}/retry`, { method: 'POST' });
}

// ---------- 管理员：系统统计（需 Admin 权限）----------
export interface DailyUsageItem {
  date: string;
  count: number;
}

export interface TopUserByUsage {
  userId: string;
  username: string;
  taskCount: number;
}

export interface AdminStatsData {
  userCount: number;
  taskCount: number;
  taskCountByStatus: Record<string, number>;
  taskCountByType: Record<string, number>;
  dailyUsage?: DailyUsageItem[];
  topUsersByUsage?: TopUserByUsage[];
}

export async function getAdminStats(params?: { days?: number; topLimit?: number }) {
  const q = new URLSearchParams();
  if (params?.days != null) q.set('days', String(params.days));
  if (params?.topLimit != null) q.set('topLimit', String(params.topLimit));
  const query = q.toString();
  return request<{ success?: boolean; data?: AdminStatsData }>(
    `/api/v1/system/admin/stats${query ? `?${query}` : ''}`
  );
}

// ---------- Admin：模型配置（Agent Chat 全局配置）----------
export type AdminModelConfigData = {
  model_key: string;
  provider?: string | null;
  temperature: number;
  max_tokens: number | null;
  top_p: number | null;
  frequency_penalty: number | null;
  presence_penalty: number | null;
  max_loop_rounds?: number;
  run_timeout_ms?: number;
  system_prompt_extra?: string | null;
  welcome_message?: string | null;
  tools_enabled?: boolean;
  /** null = 全部业务；[] = 禁止；非空 = 白名单 */
  allowed_businesses?: Array<{ scope: string; taskKey: string; subtype?: string | null }> | null;
  smartflow_enabled?: boolean;
  updated_at?: string;
};

export async function getAdminModelConfig() {
  return request<{ success?: boolean; data?: AdminModelConfigData }>('/api/v1/system/admin/model-config');
}

export async function putAdminModelConfig(data: Partial<AdminModelConfigData> & { model_key: string }) {
  return request<{ success?: boolean; data?: AdminModelConfigData; error?: string }>('/api/v1/system/admin/model-config', {
    method: 'PUT',
    body: data,
  });
}

export type ModelOption = {
  provider: string;
  scope: string;
  model_key: string;
  display_name?: string;
  supports_tools?: boolean;
};
export async function getAdminModelOptions() {
  return request<{ success?: boolean; data?: ModelOption[] }>('/api/v1/system/admin/model-config/options');
}

// ---------- Agent Chat v2 ----------
export type AgentReference = {
  type: 'folder' | 'knowledge' | 'business' | 'file';
  id: string;
  label?: string;
  scope?: string;
  taskKey?: string;
  subtype?: string;
  /** file：所属知识库文件夹 */
  folderId?: string;
  /** file：task | storage_object */
  refType?: 'task' | 'storage_object';
  contentType?: string;
};

export type AgentPublicSettings = {
  welcome_message: string | null;
};

export async function getAgentSettings() {
  return request<{ success?: boolean; data?: AgentPublicSettings }>('/api/v2/agent/settings');
}

export type AgentConversation = {
  id: string;
  user_id: string;
  title: string | null;
  status: string;
  summary: string | null;
  /** 模块 Agent 硬绑定；主助手为 null/undefined */
  scope?: string | null;
  /** UI 语言 zh | en */
  locale?: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentMessagePart = {
  type: 'text' | 'image' | 'file';
  text?: string;
  url?: string;
  mimeType?: string;
  name?: string;
};

export type AgentMessage = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: AgentMessagePart[];
  references: AgentReference[];
  run_id: string | null;
  created_at: string;
};

export type AgentStreamEvent = {
  type: string;
  seq?: number;
  runId?: string;
  conversationId?: string;
  payload?: Record<string, unknown>;
  createdAt?: string;
  cursor?: number;
};

export async function listAgentConversations(params?: { limit?: number; offset?: number }) {
  const q = new URLSearchParams();
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.offset != null) q.set('offset', String(params.offset));
  const qs = q.toString();
  return request<{ success?: boolean; data?: AgentConversation[] }>(
    `/api/v2/agent/conversations${qs ? `?${qs}` : ''}`
  );
}

export async function createAgentConversation(
  title?: string,
  options?: { scope?: string | null; locale?: string | null }
) {
  return request<{ success?: boolean; data?: AgentConversation }>('/api/v2/agent/conversations', {
    method: 'POST',
    body: JSON.stringify({
      title: title || undefined,
      ...(options?.scope ? { scope: options.scope } : {}),
      ...(options?.locale ? { locale: options.locale } : {}),
    }),
  });
}

export async function updateAgentConversation(
  id: string,
  patch: { title?: string | null; status?: string }
) {
  return request<{ success?: boolean; data?: AgentConversation }>(`/api/v2/agent/conversations/${id}`, {
    method: 'PATCH',
    body: patch,
  });
}

export async function deleteAgentConversation(id: string) {
  return request<{ success?: boolean }>(`/api/v2/agent/conversations/${id}`, { method: 'DELETE' });
}

export async function listAgentMessages(conversationId: string, params?: { limit?: number; before?: string }) {
  const q = new URLSearchParams();
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.before) q.set('before', params.before);
  const qs = q.toString();
  return request<{ success?: boolean; data?: AgentMessage[] }>(
    `/api/v2/agent/conversations/${conversationId}/messages${qs ? `?${qs}` : ''}`
  );
}

export async function postAgentMessage(
  conversationId: string,
  body: { content: string | AgentMessagePart[]; references?: AgentReference[]; locale?: string }
) {
  return request<{
    success?: boolean;
    data?: { message: AgentMessage; runId: string; conversationId: string };
    error?: string;
  }>(`/api/v2/agent/conversations/${conversationId}/messages`, {
    method: 'POST',
    body,
  });
}

export async function cancelAgentRun(runId: string) {
  return request<{ success?: boolean }>(`/api/v2/agent/runs/${runId}/cancel`, { method: 'POST' });
}

export function agentConversationStreamUrl(conversationId: string, cursor = 0): string {
  const base = (typeof window !== 'undefined' && (window as any).__API_BASE__) || '';
  return `${base}/api/v2/agent/conversations/${conversationId}/stream?cursor=${cursor}`;
}

// ---------- Admin：Provider 路由与监控（仅 Admin 可访问）----------
export type ProviderRoutingEntry = {
  provider: string;
  model: string;
  overridden?: boolean;
  margin?: number;
  charge_metric?: string;
  price_in_tokens?: number;
  min_charge_tokens?: number;
  sensitive_word_list_ids?: string[];
};
export type ProvidersRoutingResponse = { success?: boolean; data?: Record<string, ProviderRoutingEntry> };
export async function getProvidersRouting() {
  return request<ProvidersRoutingResponse>('/api/v1/system/admin/providers/routing');
}
export type ProvidersOptionsResponse = {
  success?: boolean;
  data?: {
    modelsByProvider?: Record<string, string[]>;
    modelsByProviderByScope?: Record<string, Record<string, string[]>>;
    /** 按 provider → scope → modality → model_key 聚合（含 modality 维度） */
    modelsByScopeAndModality?: Record<string, Record<string, Record<string, string[]>>>;
  };
};
export async function getProvidersOptions() {
  return request<ProvidersOptionsResponse>('/api/v1/system/admin/providers/options');
}
export async function postProvidersRouting(body: {
  logicalModel: string;
  provider: string;
  model: string;
  margin?: number;
  charge_metric?: string;
  price_in_tokens?: number;
  min_charge_tokens?: number;
  sensitive_word_list_ids?: string[];
}) {
  return request<{ success?: boolean; data?: unknown }>('/api/v1/system/admin/providers/routing', {
    method: 'POST',
    body,
  });
}
export async function deleteProvidersRouting(logicalModel: string) {
  return request<{ success?: boolean }>(
    `/api/v1/system/admin/providers/routing?logicalModel=${encodeURIComponent(logicalModel)}`,
    { method: 'DELETE' }
  );
}
export interface ProviderStatsItem {
  provider: string;
  requestCount: number;
  successCount: number;
  errorRate: number;
  avgLatencyMs: number;
  p50LatencyMs?: number;
  p95LatencyMs?: number;
  window: string;
  errorDistribution?: Record<string, number>;
}
export async function getProvidersStats(params?: { provider?: string; window?: string }) {
  const q = new URLSearchParams();
  if (params?.provider) q.set('provider', params.provider);
  if (params?.window) q.set('window', params.window);
  const query = q.toString();
  return request<{ success?: boolean; data?: ProviderStatsItem[] }>(
    `/api/v1/system/admin/providers/stats${query ? `?${query}` : ''}`
  );
}
export interface ProviderBillingItem {
  provider: string;
  supported: boolean;
  totalLimit?: string | number;
  used?: string | number;
  resetAt?: string;
  manualBalance?: number;
  currency?: string;
  /** 计费模式：usage=按量计费，subscription=包月/订阅（不参与余额扣费） */
  billingMode?: 'usage' | 'subscription';
  /** 计费说明（用于展示） */
  billingNote?: string;
}
export async function getProvidersBilling() {
  return request<{ success?: boolean; data?: ProviderBillingItem[] }>(
    '/api/v1/system/admin/providers/billing'
  );
}
export async function putProviderBalance(body: {
  provider: string;
  balance: number;
  currency?: string;
}) {
  return request<{ success?: boolean; data?: unknown }>(
    '/api/v1/system/admin/providers/balances',
    { method: 'PUT', body }
  );
}

// ---------- Admin：Provider 成本统计 ----------

export interface ProviderCostByProvider {
  provider: string;
  requestCount: number;
  totalTokens: number;
  imageCount: number;
  audioSeconds: number;
  videoSeconds: number;
  estimatedCost: number;
}

export interface ProviderCostByModel extends ProviderCostByProvider {
  model_key: string;
  chargeMode: string;
}

export async function getProvidersCosts(params?: { window?: string; groupBy?: 'provider' | 'model' }) {
  const q = new URLSearchParams();
  if (params?.window) q.set('window', params.window);
  if (params?.groupBy) q.set('groupBy', params.groupBy);
  const query = q.toString();
  return request<{
    success?: boolean;
    data?: Array<ProviderCostByProvider | ProviderCostByModel>;
    window?: string;
    groupBy?: 'provider' | 'model';
  }>(`/api/v1/system/admin/providers/costs${query ? `?${query}` : ''}`);
}

// ---------- Admin：账单（PPIO 等）----------

export interface PpioBill {
  userId: string;
  startTime: string;
  endTime: string;
  billingMethod: string;
  productName: string;
  category: string;
  ownerID: string;
  amount: string;
  voucherAmount: string;
  payAmount: string;
  payAmountDisplay?: number;
}

export interface PpioBillSummary {
  totalBills: number;
  totalAmount: string;
  totalPayAmount: string;
  totalVoucherAmount: string;
}

export interface PpioBillAccount {
  credit_balance: number;
  allow_features?: string[];
  free_trial?: unknown;
}

export interface SystemBillsResponse {
  ppio?: {
    bills?: PpioBill[];
    summary?: PpioBillSummary;
    account?: PpioBillAccount;
    error?: string;
  };
}

export async function getSystemBills(params?: {
  cycleType?: 'Hour' | 'Day' | 'Week' | 'Month';
  productCategory?: string;
  startTime?: number;
  endTime?: number;
}) {
  const q = new URLSearchParams();
  if (params?.cycleType) q.set('cycleType', params.cycleType);
  if (params?.productCategory) q.set('productCategory', params.productCategory);
  if (params?.startTime != null) q.set('startTime', String(params.startTime));
  if (params?.endTime != null) q.set('endTime', String(params.endTime));
  const query = q.toString();
  return request<{ success?: boolean; data?: SystemBillsResponse }>(
    `/api/v1/system/bills${query ? `?${query}` : ''}`,
  );
}

// ---------- Task v2：表单配置与执行 ----------

export interface TaskFormConfig {
  scope: string;
  taskKey: string;
  subtype?: string | null;
  taskLabel?: string | null;
  subtypeLabel?: string | null;
  taskLabelI18n?: Record<string, string> | null;
  subtypeLabelI18n?: Record<string, string> | null;
  form_options_i18n?: Record<string, Record<string, string>> | null;
  /**
   * schema-form：抽屉内完整 Schema；
   * warp-gates：仅平台字段开任务，basic 在 interactiveCard 闸门中分步采集
   */
  createUx?: 'schema-form' | 'warp-gates';
  /** 管线 pre 引导：交互卡字段 + websource 检索参数（动态生效） */
  createGuide?: {
    interactiveCard: {
      label?: string;
      hint?: string;
      /** pre 结束后进 basic 前的提示（可选） */
      postPreHint?: string;
      fields: Array<Record<string, unknown> & { name: string }>;
    } | null;
    webSearch: {
      /** 显式：pre 后在 C 端跑话题预览检索 */
      clientPreview?: boolean;
      maxResults?: number;
      depth?: string;
      topicExtractTextKey?: string;
      topicCount?: number;
    } | null;
  };
  schema: {
    $schema?: string;
    type?: string;
    properties?: Record<string, Record<string, unknown>>;
    required?: string[];
    [key: string]: unknown;
  };
  uiSchema?: Record<string, unknown> | null;
}

export async function getTaskFormConfig(params: { scope: string; taskKey: string; subtype?: string }) {
  const q = new URLSearchParams();
  q.set('scope', params.scope);
  q.set('taskKey', params.taskKey);
  if (params.subtype) q.set('subtype', params.subtype);
  return request<{ success?: boolean; data?: TaskFormConfig }>(
    `/api/v2/tasks/form-config?${q.toString()}`
  );
}

export type TaskFormConfigListItem = {
  taskKey: string;
  subtype: string | null;
  /** Admin 可配置的显示名（避免用户看到业务 key） */
  taskLabel?: string | null;
  subtypeLabel?: string | null;
  /** 业务简介（列表选择器用） */
  description?: string | null;
  taskLabelI18n?: Record<string, string> | null;
  subtypeLabelI18n?: Record<string, string> | null;
  descriptionI18n?: Record<string, string> | null;
  updated_at?: string;
};

export async function getTaskFormConfigList(params: { scope: string }) {
  const q = new URLSearchParams();
  q.set('scope', params.scope);
  return request<{ success?: boolean; data?: { scope: string; items: TaskFormConfigListItem[] } }>(
    `/api/v2/tasks/form-config/list?${q.toString()}`
  );
}

// ---------- Admin：Provider / 业务定价 ----------

export interface ProviderPricingRow {
  id: string;
  provider: string;
  scope: string;
  model_key: string;
  charge_mode: string;
  unit_price: number;
  currency: string;
  input_unit_price?: number | null;
  output_unit_price?: number | null;
  /** 平台向用户收取的 MXM-TOKEN 单价（per_image / per_request / per_second_* 时使用） */
  platform_unit_price?: number | null;
  /** token_based 模式：每千输入 token 收取的 MXM-TOKEN */
  platform_input_unit_price?: number | null;
  /** token_based 模式：每千输出 token 收取的 MXM-TOKEN */
  platform_output_unit_price?: number | null;
  /** 本次调用最低收取的 MXM-TOKEN（0 或 null 表示不设下限） */
  platform_min_charge?: number | null;
  metadata?: Record<string, unknown> | null;
}

export async function getProviderPricing(params?: { provider?: string; scope?: string }) {
  const q = new URLSearchParams();
  if (params?.provider) q.set('provider', params.provider);
  if (params?.scope) q.set('scope', params.scope);
  const query = q.toString();
  return request<{ success?: boolean; data?: ProviderPricingRow[] }>(
    `/api/v1/system/admin/pricing/provider${query ? `?${query}` : ''}`,
  );
}

export type UpsertProviderPricingBody = Partial<ProviderPricingRow> & {
  provider: string;
  scope: string;
  model_key: string;
  charge_mode: string;
  unit_price: number;
};

export async function upsertProviderPricing(body: UpsertProviderPricingBody) {
  return request<{ success?: boolean; data?: ProviderPricingRow }>(
    '/api/v1/system/admin/pricing/provider',
    { method: 'PUT', body },
  );
}

export async function deleteProviderPricing(id: string) {
  return request<{ success?: boolean }>(
    `/api/v1/system/admin/pricing/provider/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}

export interface BusinessPricingRow {
  id: string;
  business_type: string;
  charge_metric: string;
  price_in_tokens: number;
  min_charge_tokens?: number | null;
  provider?: string | null;
  model_key?: string | null;
  subtype?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export async function getBusinessPricing(params?: { business_type?: string }) {
  const q = new URLSearchParams();
  if (params?.business_type) q.set('business_type', params.business_type);
  const query = q.toString();
  return request<{ success?: boolean; data?: BusinessPricingRow[] }>(
    `/api/v1/system/admin/pricing/business${query ? `?${query}` : ''}`,
  );
}

export type UpsertBusinessPricingBody = Partial<BusinessPricingRow> & {
  business_type: string;
  charge_metric: string;
  price_in_tokens: number;
};

export async function upsertBusinessPricing(body: UpsertBusinessPricingBody) {
  return request<{ success?: boolean; data?: BusinessPricingRow }>(
    '/api/v1/system/admin/pricing/business',
    { method: 'PUT', body },
  );
}

export async function deleteBusinessPricing(id: string) {
  return request<{ success?: boolean }>(
    `/api/v1/system/admin/pricing/business/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}

// ---------- Admin：Provider API Keys（增删改查）----------

// ---------- Admin：Provider API Keys（增删改查）----------
export type ProviderApiKeyMasked = {
  id: string;
  provider: string;
  service: string | null;
  key_masked: string;
  priority: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  updated_by?: string | null;
};

export async function getProviderKeys(params?: { provider?: string; service?: string | null }) {
  const q = new URLSearchParams();
  if (params?.provider) q.set('provider', params.provider);
  if (params?.service !== undefined && params?.service !== null) q.set('service', params.service);
  const query = q.toString();
  return request<{ success?: boolean; data?: ProviderApiKeyMasked[] }>(
    `/api/v1/system/admin/providers/keys${query ? `?${query}` : ''}`
  );
}

export async function postProviderKey(body: {
  provider: string;
  service?: string | null;
  key_value: string;
  priority?: number;
  /** 默认 true */
  is_active?: boolean;
}) {
  return request<{ success?: boolean; data?: ProviderApiKeyMasked }>(
    '/api/v1/system/admin/providers/keys',
    { method: 'POST', body }
  );
}

export async function putProviderKey(
  id: string,
  body: { priority?: number; is_active?: boolean }
) {
  return request<{ success?: boolean; data?: ProviderApiKeyMasked }>(
    `/api/v1/system/admin/providers/keys/${encodeURIComponent(id)}`,
    { method: 'PUT', body }
  );
}

export async function deleteProviderKey(id: string) {
  return request<{ success?: boolean }>(
    `/api/v1/system/admin/providers/keys/${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
}

// ---------- Admin：Provider 物理模型目录 (provider_models) ----------
export interface ProviderModelRow {
  id: string;
  provider: string;
  scope: string;
  model_key: string;
  upstream_model: string | null;
  protocol: string | null;
  modality: string | null;
  io_schema: string | null;
  display_name: string | null;
  description: string | null;
  capabilities: Record<string, unknown> | null;
  default_parameters: Record<string, unknown> | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  /** 后端可选拼接：最近一次连通性测试结果 */
  latest_test?: {
    success: boolean;
    latency_ms?: number | null;
    error_message?: string | null;
    created_at: string;
  } | null;
}

export async function getProviderModels(params?: {
  provider?: string;
  scope?: string;
  onlyEnabled?: boolean;
  page?: number;
  pageSize?: number;
}) {
  const q = new URLSearchParams();
  if (params?.provider) q.set('provider', params.provider);
  if (params?.scope) q.set('scope', params.scope);
  if (params?.onlyEnabled) q.set('onlyEnabled', 'true');
  if (params?.page) q.set('page', String(params.page));
  if (params?.pageSize) q.set('pageSize', String(params.pageSize));
  const query = q.toString();
  return request<{ success?: boolean; data?: ProviderModelRow[]; total?: number; page?: number; pageSize?: number }>(
    `/api/v1/system/admin/providers/models${query ? `?${query}` : ''}`
  );
}

export type ProviderModelTestRunRow = {
  id: string;
  provider_model_id: string;
  provider: string;
  scope: string;
  model_key: string;
  inferred_modality: string;
  success: boolean;
  latency_ms?: number | null;
  error_message?: string | null;
  created_at: string;
  request_payload?: Record<string, unknown> | null;
  response_meta?: Record<string, unknown> | null;
  steps?: unknown;
};

export async function getProviderModelTests(providerModelId: string, params?: { limit?: number }) {
  const q = new URLSearchParams();
  if (params?.limit) q.set('limit', String(params.limit));
  const query = q.toString();
  return request<{ success?: boolean; data?: ProviderModelTestRunRow[] }>(
    `/api/v1/system/admin/providers/models/${encodeURIComponent(providerModelId)}/tests${query ? `?${query}` : ''}`
  );
}

export async function postProviderModel(body: {
  provider: string;
  scope: string;
  model_key: string;
  upstream_model?: string | null;
  protocol?: string | null;
  modality?: string | null;
  io_schema?: string | null;
  display_name?: string | null;
  description?: string | null;
  capabilities?: Record<string, unknown> | null;
  default_parameters?: Record<string, unknown> | null;
  is_enabled?: boolean;
}) {
  return request<{ success?: boolean; data?: ProviderModelRow }>(
    '/api/v1/system/admin/providers/models',
    { method: 'POST', body }
  );
}

export async function putProviderModel(id: string, body: Partial<ProviderModelRow>) {
  return request<{
    success?: boolean;
    data?: ProviderModelRow;
    /** scope 变更命中已存在行时，后端合并并删除当前重复行 */
    merged?: boolean;
    message?: string;
  }>(`/api/v1/system/admin/providers/models/${encodeURIComponent(id)}`, { method: 'PUT', body });
}

export async function deleteProviderModel(id: string) {
  return request<{ success?: boolean; data?: ProviderModelRow }>(
    `/api/v1/system/admin/providers/models/${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
}

export async function testProviderModel(body: {
  provider_model_id?: string;
  provider?: string;
  model_key?: string;
  scope?: string;
}) {
  return request<{
    success?: boolean;
    data?: {
      success: boolean;
      latencyMs: number;
      error: string | null;
      provider: string;
      model_key: string;
      scope: string;
      modality?: string | null;
      requestPayload?: {
        prompt: string;
        outputFormat: 'json';
        parameters: Record<string, unknown>;
        inferredModality: string;
      } | null;
      responseMeta?: Record<string, unknown> | null;
      steps?: Array<{
        key: string;
        title: string;
        status: 'pending' | 'running' | 'success' | 'failed';
        detail?: string;
        at: string;
      }>;
    };
  }>('/api/v1/system/admin/providers/models/test', { method: 'POST', body });
}

export type KnowledgeEmbeddingDefaultConfig = {
  config?: { provider?: string; model?: string; enabled?: boolean } | null;
  resolved?: {
    modelKey: string;
    provider: string;
    upstreamModel: string;
    dimensions: number;
    protocol: string;
  };
  availableModelKeys?: string[];
};

export async function getKnowledgeEmbeddingDefault() {
  return request<{ success?: boolean; data?: KnowledgeEmbeddingDefaultConfig }>(
    '/api/v1/system/admin/providers/knowledge/embedding-default'
  );
}

export async function putKnowledgeEmbeddingDefault(body: {
  provider: string;
  model: string;
  enabled?: boolean;
}) {
  return request<{ success?: boolean; data?: unknown }>(
    '/api/v1/system/admin/providers/knowledge/embedding-default',
    { method: 'PUT', body }
  );
}

// ─────────────────────────────────────────────
// Wallet / Balance APIs  (mxmpay)
// ─────────────────────────────────────────────

export interface WalletItem {
  id: string;
  user_id: string;
  asset_code: string;
  available_balance: string;
  frozen_balance: string;
  created_at?: string;
  updated_at?: string;
}

export interface WalletTransaction {
  id: string;
  wallet_id: string;
  user_id: string;
  asset_code: string;
  type: 'deposit' | 'withdraw' | string;
  amount: string;
  balance_before: string;
  balance_after: string;
  reference_id?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
}

export async function getMyWallets() {
  return request<{ data: WalletItem[] }>('/api/v1/wallets/');
}

export async function getMyWallet(assetCode: string) {
  return request<{ data: WalletItem }>(`/api/v1/wallets/${encodeURIComponent(assetCode)}`);
}

export async function getMyWalletTransactions(assetCode: string, limit = 20) {
  return request<{ data: WalletTransaction[] }>(
    `/api/v1/wallets/${encodeURIComponent(assetCode)}/transactions?limit=${limit}`
  );
}

// ─────────────────────────────────────────────
// Admin wallet management
// ─────────────────────────────────────────────

export interface AdminWalletUser {
  userId: string;
  username?: string;
  wallets: WalletItem[];
}

/** Admin: list all user wallets (via system API) */
export async function adminListUserWallets(params?: { userId?: string; assetCode?: string }) {
  const qs = new URLSearchParams();
  if (params?.userId) qs.set('userId', params.userId);
  if (params?.assetCode) qs.set('assetCode', params.assetCode);
  const q = qs.toString();
  return request<{ data: WalletItem[] }>(`/api/v1/system/admin/wallets${q ? `?${q}` : ''}`);
}

/** Admin: get a specific user's wallet */
export async function adminGetUserWallet(targetUserId: string, assetCode: string) {
  return request<{ data: WalletItem }>(
    `/api/v1/wallets/admin/${encodeURIComponent(targetUserId)}/${encodeURIComponent(assetCode)}`
  );
}

/** Admin: deposit MXM-TOKEN to a user's wallet */
export async function adminDepositToWallet(params: {
  userId: string;
  assetCode: string;
  amount: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
}) {
  return request<{ data: WalletItem }>(
    `/api/v1/wallets/admin/${encodeURIComponent(params.userId)}/${encodeURIComponent(params.assetCode)}/deposit`,
    {
      method: 'POST',
      body: {
        amount: params.amount,
        referenceId: params.referenceId,
        metadata: params.metadata,
      },
    }
  );
}

// ─────────────────────────────────────────────
// Smartflow（mxmcgi / Gateway /api/v1/smartflows）
// ─────────────────────────────────────────────

/** 与后端 SmartflowSchema 对齐的宽松结构（测试页用 JSON 编辑） */
export interface SmartflowSchemaBody {
  version?: string;
  nodes: unknown[];
  edges: unknown[];
  variables?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

export interface SmartflowListItem {
  id: string;
  name: string;
  description?: string;
  category?: string;
  version?: string;
  status?: string;
  is_public?: boolean;
  schema?: SmartflowSchemaBody;
  author_id?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface CreateSmartflowBody {
  id?: string;
  name: string;
  schema: SmartflowSchemaBody;
  description?: string;
  category?: string;
  icon?: string;
  tags?: string[];
  status?: 'active' | 'inactive' | 'draft';
  version?: string;
  is_public?: boolean;
}

export type UpdateSmartflowBody = Partial<
  Pick<
    CreateSmartflowBody,
    'name' | 'schema' | 'description' | 'category' | 'icon' | 'tags' | 'status' | 'version' | 'is_public'
  >
> & { status?: 'active' | 'inactive' | 'draft' | 'deprecated' };

export interface SmartflowExecutionItem {
  id: string;
  smartflow_id: string;
  user_id: string;
  status: string;
  progress?: number;
  input_data?: Record<string, unknown>;
  output_data?: Record<string, unknown>;
  error_message?: string;
  flow_chain?: unknown[];
  started_at?: string;
  completed_at?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

type SmartflowEnvelope<T> = { success?: boolean; data?: T; count?: number; error?: { message?: string; code?: string } };

/** 列表：默认走网关，公开列表可加 ?public=true */
export async function listSmartflows(params?: { publicOnly?: boolean; limit?: number; offset?: number }) {
  const q = new URLSearchParams();
  if (params?.publicOnly) q.set('public', 'true');
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.offset != null) q.set('offset', String(params.offset));
  const qs = q.toString();
  return request<SmartflowEnvelope<SmartflowListItem[]>>(
    `/api/v1/smartflows${qs ? `?${qs}` : ''}`
  );
}

export async function getSmartflow(id: string) {
  return request<SmartflowEnvelope<SmartflowListItem>>(`/api/v1/smartflows/${encodeURIComponent(id)}`);
}

/** 需登录 */
export async function createSmartflow(body: CreateSmartflowBody) {
  return request<SmartflowEnvelope<SmartflowListItem>>('/api/v1/smartflows', {
    method: 'POST',
    body,
  });
}

/** 需登录 */
export async function updateSmartflow(id: string, body: UpdateSmartflowBody) {
  return request<SmartflowEnvelope<SmartflowListItem>>(`/api/v1/smartflows/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body,
  });
}

/** 需登录 */
export async function deleteSmartflow(id: string) {
  return request<SmartflowEnvelope<{ message?: string }>>(
    `/api/v1/smartflows/${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
}

export type SmartflowBundleImportPolicy = 'upsert' | 'skip' | 'dry-run';

/** 导出单个工作流 bundle JSON */
export async function exportSmartflowBundle(id: string) {
  const q = new URLSearchParams({ id });
  return request<SmartflowEnvelope<unknown> & { warnings?: string[] }>(
    `/api/v1/smartflows/bundle?${q.toString()}`
  );
}

/** 批量导出 */
export async function exportSmartflowBundlePost(body: { ids: string[] }) {
  return request<SmartflowEnvelope<unknown> & { warnings?: string[] }>(
    '/api/v1/smartflows/bundle/export',
    { method: 'POST', body }
  );
}

/** 导入 bundle */
export async function importSmartflowBundle(body: {
  bundle: unknown;
  conflictPolicy?: SmartflowBundleImportPolicy;
}) {
  return request<
    SmartflowEnvelope<{
      created: string[];
      updated: string[];
      skipped: string[];
      warnings: string[];
    }>
  >('/api/v1/smartflows/bundle/import', {
    method: 'POST',
    body: { bundle: body.bundle, conflictPolicy: body.conflictPolicy ?? 'upsert' },
  });
}

/** 需登录（网关对 POST …/execute 做 JWT 校验并注入 x-user-id） */
export async function executeSmartflow(
  id: string,
  body: { input_data: Record<string, unknown>; conversation_id?: string }
) {
  return request<SmartflowEnvelope<SmartflowExecutionItem>>(
    `/api/v1/smartflows/${encodeURIComponent(id)}/execute`,
    { method: 'POST', body }
  );
}

/** 需登录；可选按 smartflowId 过滤 */
export async function listSmartflowTasks(params?: { smartflowId?: string; limit?: number; offset?: number }) {
  const q = new URLSearchParams();
  if (params?.smartflowId) q.set('smartflowId', params.smartflowId);
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.offset != null) q.set('offset', String(params.offset));
  const qs = q.toString();
  return request<SmartflowEnvelope<SmartflowExecutionItem[]>>(
    `/api/v1/smartflow-tasks${qs ? `?${qs}` : ''}`
  );
}

export async function getSmartflowTask(id: string) {
  return request<SmartflowEnvelope<SmartflowExecutionItem>>(
    `/api/v1/smartflow-tasks/${encodeURIComponent(id)}`
  );
}

export async function pauseSmartflowTask(id: string) {
  return request<SmartflowEnvelope<SmartflowExecutionItem>>(
    `/api/v1/smartflow-tasks/${encodeURIComponent(id)}/pause`,
    { method: 'POST' }
  );
}

export async function cancelSmartflowTask(id: string) {
  return request<SmartflowEnvelope<SmartflowExecutionItem>>(
    `/api/v1/smartflow-tasks/${encodeURIComponent(id)}/cancel`,
    { method: 'POST' }
  );
}

export async function deleteSmartflowTask(id: string) {
  return request<SmartflowEnvelope<{ message?: string }>>(
    `/api/v1/smartflow-tasks/${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
}

// ---------- Admin 系统存储 ----------

export interface AdminStorageObjectItem {
  id: string;
  purpose: string;
  url: string;
  objectKey: string;
  createdAt: string;
}

export async function listAdminStorageObjects(options?: { category?: string; limit?: number; offset?: number }) {
  const q = new URLSearchParams();
  if (options?.category) q.set('category', options.category);
  if (options?.limit != null) q.set('limit', String(options.limit));
  if (options?.offset != null) q.set('offset', String(options.offset));
  const query = q.toString();
  return request<{ success?: boolean; data?: { items: AdminStorageObjectItem[]; total: number } }>(
    `/api/v1/admin/storage/objects${query ? `?${query}` : ''}`
  );
}

export async function getAdminStorageConfig() {
  return request<{ success?: boolean; data?: unknown }>('/api/v1/admin/storage/config');
}

// ---------- Partner 开放平台 ----------

export interface PartnerAppItem {
  id: string;
  name: string;
  apiKeyId: string;
  allowedSlugs: string[];
  status: string;
  secretPrefix: string;
  endUserAccessMode?: 'open' | 'whitelist';
  slugAccessMode?: 'all_owner' | 'restricted';
  h5LoginBaseUrl?: string | null;
  hasInviteToken?: boolean;
  dailyEndUserQuota?: number | null;
  qpsLimit?: number | null;
  createdAt?: string;
}

export interface PartnerAllowlistItem {
  id: string;
  provider: 'sms' | 'wechat' | 'external';
  subject: string;
  subjectMasked: string;
  source: 'manual' | 'invite';
  note?: string | null;
  createdAt?: string;
}

export interface PartnerEndUserItem {
  id: string;
  status: 'active' | 'blocked';
  kind: string;
  display_name?: string | null;
  phone?: string | null;
  phone_masked?: string | null;
  identities?: Array<{ provider: string; subject: string; subject_masked: string }>;
  call_count?: number;
  tokens_charged?: number;
  last_called_at?: string | null;
  created_at?: string;
}

export async function listPartnerApps() {
  return request<{ code?: number; data?: PartnerAppItem[] }>('/api/v1/partner/apps');
}

export async function getPartnerAppByApiKeyId(apiKeyId: string) {
  return request<{ code?: number; data?: PartnerAppItem }>(
    `/api/v1/partner/apps/by-key/${encodeURIComponent(apiKeyId)}`
  );
}

export async function updatePartnerAppSettings(
  appId: string,
  body: {
    endUserAccessMode?: 'open' | 'whitelist';
    slugAccessMode?: 'all_owner' | 'restricted';
    allowedSlugs?: string[];
    h5LoginBaseUrl?: string | null;
  }
) {
  return request<{ code?: number; data?: PartnerAppItem }>(
    `/api/v1/partner/apps/${encodeURIComponent(appId)}/settings`,
    { method: 'PUT', body: JSON.stringify(body) }
  );
}

export async function listPartnerAllowlist(appId: string, limit = 100) {
  const q = new URLSearchParams({ limit: String(limit) });
  return request<{ code?: number; data?: PartnerAllowlistItem[] }>(
    `/api/v1/partner/apps/${encodeURIComponent(appId)}/allowlist?${q}`
  );
}

export async function addPartnerAllowlist(
  appId: string,
  body: { provider: 'sms' | 'wechat' | 'external'; subject: string; note?: string }
) {
  return request<{ code?: number; data?: PartnerAllowlistItem }>(
    `/api/v1/partner/apps/${encodeURIComponent(appId)}/allowlist`,
    { method: 'POST', body: JSON.stringify(body) }
  );
}

export async function removePartnerAllowlist(appId: string, entryId: string) {
  return request<{ code?: number; data?: { removed: boolean } }>(
    `/api/v1/partner/apps/${encodeURIComponent(appId)}/allowlist/${encodeURIComponent(entryId)}`,
    { method: 'DELETE' }
  );
}

export async function getPartnerInviteLink(appId: string) {
  return request<{
    code?: number;
    data?: { url?: string | null; tokenPlain?: string; hasInviteToken?: boolean; hint?: string };
  }>(`/api/v1/partner/apps/${encodeURIComponent(appId)}/invite-link`);
}

export async function rotatePartnerInviteLink(appId: string) {
  return request<{
    code?: number;
    data?: { url?: string; tokenPlain?: string; hint?: string };
  }>(`/api/v1/partner/apps/${encodeURIComponent(appId)}/invite-link/rotate`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export interface PartnerInviteItem {
  id: string;
  status: 'pending' | 'used' | 'revoked';
  usedSubject: string | null;
  usedEndUserId: string | null;
  createdAt: string;
  usedAt: string | null;
}

export async function getPartnerShareLink(appId: string) {
  return request<{
    code?: number;
    data?: { url?: string; copyText?: string; mode?: string; hint?: string };
  }>(`/api/v1/partner/apps/${encodeURIComponent(appId)}/share-link`);
}

export async function createPartnerInvite(appId: string) {
  return request<{
    code?: number;
    data?: { inviteId?: string; url?: string; tokenPlain?: string; hint?: string };
  }>(`/api/v1/partner/apps/${encodeURIComponent(appId)}/invites`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function listPartnerInvites(appId: string, limit = 50) {
  const q = new URLSearchParams({ limit: String(limit) });
  return request<{ code?: number; data?: PartnerInviteItem[] }>(
    `/api/v1/partner/apps/${encodeURIComponent(appId)}/invites?${q}`
  );
}

export async function revokePartnerInvite(appId: string, inviteId: string) {
  return request<{ code?: number; data?: { revoked: boolean } }>(
    `/api/v1/partner/apps/${encodeURIComponent(appId)}/invites/${encodeURIComponent(inviteId)}`,
    { method: 'DELETE' }
  );
}

export async function blockPartnerEndUser(appId: string, endUserId: string) {
  return request<{ code?: number; data?: { blocked: boolean } }>(
    `/api/v1/partner/apps/${encodeURIComponent(appId)}/end-users/${encodeURIComponent(endUserId)}/block`,
    { method: 'POST', body: JSON.stringify({}) }
  );
}

export async function unblockPartnerEndUser(appId: string, endUserId: string) {
  return request<{ code?: number; data?: { unblocked: boolean } }>(
    `/api/v1/partner/apps/${encodeURIComponent(appId)}/end-users/${encodeURIComponent(endUserId)}/unblock`,
    { method: 'POST', body: JSON.stringify({}) }
  );
}

export async function getPartnerAppStats(appId: string, days = 30, groupBy?: 'end_user') {
  const q = new URLSearchParams({ days: String(days) });
  if (groupBy) q.set('groupBy', groupBy);
  return request<{ code?: number; data?: Record<string, unknown> }>(
    `/api/v1/partner/apps/${encodeURIComponent(appId)}/stats?${q}`
  );
}

export async function listPartnerAppEndUsers(appId: string, days = 30, limit = 50) {
  const q = new URLSearchParams({ days: String(days), limit: String(limit) });
  return request<{ code?: number; data?: Record<string, unknown>[] }>(
    `/api/v1/partner/apps/${encodeURIComponent(appId)}/end-users?${q}`
  );
}

export async function createPartnerApp(body: {
  apiKeyId: string;
  name: string;
  allowedSlugs?: string[];
}) {
  return request<{ code?: number; data?: Record<string, unknown> }>('/api/v1/partner/apps', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ---------- Admin：写作质量评估 ----------

export type QualityEvalDimension = {
  key: string;
  label: string;
  description: string;
  weight: number;
  failBelow: number;
};

export type QualityEvalRubric = {
  id: string;
  scope: string;
  task_key: string;
  subtype: string;
  dimensions: QualityEvalDimension[];
  business_brief: string;
  provider: string;
  model_key: string;
  auto_on_complete: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type QualityEvalDimensionScore = {
  key: string;
  label: string;
  score: number;
  failed: boolean;
  evidence: string[];
  comment: string;
};

export type QualityEvalScores = {
  overall: number;
  summary: string;
  articleTypeFit: string;
  dimensions: QualityEvalDimensionScore[];
};

export type QualityEvalAttributionFinding = {
  step: string;
  phase?: string;
  severity: 'high' | 'medium' | 'low';
  relatedDimensions: string[];
  reason: string;
  suggestion: string;
};

export type QualityEvalAttribution = {
  findings: QualityEvalAttributionFinding[];
  summary: string;
};

export type QualityEvalRun = {
  id: string;
  rubric_id: string | null;
  scope: string;
  task_key: string;
  subtype: string;
  source_kind: 'task' | 'folder_item' | 'paste';
  source_ref: { taskId?: string; folderId?: string; itemId?: string; storageObjectId?: string } | null;
  article_text: string | null;
  article_text_truncated: string | null;
  is_system_generated: boolean;
  scores: QualityEvalScores | null;
  attribution: QualityEvalAttribution | null;
  model_provider: string | null;
  model_key: string | null;
  status: string;
  error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function getQualityEvalDefaults() {
  return request<{ success?: boolean; data?: {
    provider: string;
    modelKey: string;
    modelOptions: Array<{ provider: string; modelKey: string; label: string }>;
  } }>('/api/v1/system/admin/quality-eval/defaults');
}

export async function listQualityEvalRubrics(scope = 'writing') {
  const q = new URLSearchParams({ scope });
  return request<{ success?: boolean; data?: QualityEvalRubric[] }>(
    `/api/v1/system/admin/quality-eval/rubrics?${q}`
  );
}

export async function upsertQualityEvalRubric(body: {
  scope?: string;
  task_key: string;
  subtype: string;
  dimensions: QualityEvalDimension[];
  business_brief?: string;
  provider?: string;
  model_key?: string;
  auto_on_complete?: boolean;
  is_active?: boolean;
}) {
  return request<{ success?: boolean; data?: QualityEvalRubric; error?: string }>(
    '/api/v1/system/admin/quality-eval/rubrics',
    { method: 'PUT', body }
  );
}

export async function listQualityEvalRuns(params?: {
  scope?: string;
  taskKey?: string;
  subtype?: string;
  limit?: number;
  offset?: number;
}) {
  const q = new URLSearchParams();
  if (params?.scope) q.set('scope', params.scope);
  if (params?.taskKey) q.set('taskKey', params.taskKey);
  if (params?.subtype) q.set('subtype', params.subtype);
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.offset != null) q.set('offset', String(params.offset));
  const qs = q.toString();
  return request<{ success?: boolean; data?: { runs: QualityEvalRun[]; total: number } }>(
    `/api/v1/system/admin/quality-eval/runs${qs ? `?${qs}` : ''}`
  );
}

export async function getQualityEvalRun(id: string) {
  return request<{ success?: boolean; data?: QualityEvalRun }>(
    `/api/v1/system/admin/quality-eval/runs/${encodeURIComponent(id)}`
  );
}

export async function createQualityEvalRun(body: {
  scope?: string;
  taskKey: string;
  subtype: string;
  sourceKind: 'task' | 'folder_item' | 'paste';
  sourceRef?: { taskId?: string; folderId?: string; itemId?: string; storageObjectId?: string } | null;
  text?: string;
  modelOverride?: { provider?: string; modelKey?: string };
}) {
  return request<{ success?: boolean; data?: QualityEvalRun; error?: string }>(
    '/api/v1/system/admin/quality-eval/runs',
    {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(300_000),
    }
  );
}

export async function reattributeQualityEvalRun(id: string) {
  return request<{ success?: boolean; data?: QualityEvalRun; error?: string }>(
    `/api/v1/system/admin/quality-eval/runs/${encodeURIComponent(id)}/reattribute`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(300_000),
    }
  );
}
