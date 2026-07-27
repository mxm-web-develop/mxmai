'use client';

import { getApiKey, getOpenApiBaseUrl } from '@/lib/runtime-config';
import { getStoredPartnerSession, isSmsLoggedIn } from '@/lib/partner-session';

/**
 * Gateway 媒体代理路径（docs/API.md）。
 * 仅用于将 Open API 返回的 MinIO/相对地址改写为可加载 URL，勿在无 job 响应时单独拼路径展示结果。
 */
export function graphTaskMediaPath(taskId: string): string {
  return `/api/v1/media/graph/${encodeURIComponent(taskId)}`;
}

const MINIO_HOST_RE =
  /^(https?:\/\/)(localhost|127\.0\.0\.1|minio)(:\d+)?\//i;

export function isDirectMinioUrl(url: string): boolean {
  return MINIO_HOST_RE.test(url.trim());
}

/** 绝对 Gateway URL → 相对 /api/...（与 web client 一致，便于走 H5 同源代理） */
export function toSameOriginApiPath(urlOrPath: string): string {
  try {
    if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
      const u = new URL(urlOrPath);
      if (u.pathname.startsWith('/api/')) {
        u.searchParams.delete('token');
        const qs = u.searchParams.toString();
        return qs ? `${u.pathname}?${qs}` : u.pathname;
      }
    }
  } catch {
    // ignore
  }
  return urlOrPath;
}

export function isGatewayMediaPath(url: string): boolean {
  return url.includes('/api/v1/media/');
}

function stripTokenFromApiPath(path: string): string {
  if (!path.startsWith('/api/')) return path;
  try {
    const u = new URL(path, 'http://localhost');
    u.searchParams.delete('token');
    const qs = u.searchParams.toString();
    return qs ? `${u.pathname}?${qs}` : u.pathname;
  } catch {
    return path.split('?')[0] ?? path;
  }
}

function isInaccessibleObjectStorageUrl(url: string): boolean {
  if (isDirectMinioUrl(url)) return true;
  if (!/^https?:\/\//i.test(url) || isGatewayMediaPath(url)) return false;
  try {
    const u = new URL(url);
    if (u.port === '9000' || u.hostname === 'minio') return true;
  } catch {
    // ignore
  }
  return false;
}

/** img / fetch 鉴权：优先 Partner session（短信登录），否则 integration Key */
function getMediaAuthToken(): string | null {
  if (isSmsLoggedIn()) {
    const session = getStoredPartnerSession();
    if (session?.trim()) return session.trim();
  }
  const key = getApiKey();
  return key?.trim() || null;
}

/** IndexedDB 中缓存的 remoteUrl 是否需重新同步（旧 MinIO 直连或跨域 Gateway 无 token） */
export function isStaleTaskFolderRemoteUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('blob:') || trimmed.startsWith('data:')) return false;
  if (isInaccessibleObjectStorageUrl(trimmed)) return true;
  const apiPath = toSameOriginApiPath(trimmed);
  if (apiPath.startsWith('/api/v1/media/')) {
    const normalized = absolutizeApiPath(apiPath);
    return normalized !== trimmed;
  }
  return /^https?:\/\//i.test(trimmed) && !isGatewayMediaPath(trimmed);
}

/** 从 extract-media 的 child:taskId 解析子任务 ID */
export function childTaskIdFromSource(source?: string): string | undefined {
  if (!source?.startsWith('child:')) return undefined;
  const id = source.slice('child:'.length).trim();
  return id || undefined;
}

/**
 * 将平台返回的 remoteUrl 转为 H5 可加载地址：
 * - 批量子任务 → /api/v1/media/graph/:childTaskId
 * - 相对 /api → 拼同源或配置的 Gateway
 */
export function resolveDisplayMediaUrl(
  remoteUrl: string,
  opts?: { taskId?: string; source?: string }
): string {
  const trimmed = remoteUrl.trim();
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  const childId = childTaskIdFromSource(opts?.source);
  const mediaTaskId = childId ?? opts?.taskId;

  const apiPath = toSameOriginApiPath(trimmed);
  if (apiPath.startsWith('/api/')) {
    return absolutizeApiPath(stripTokenFromApiPath(apiPath));
  }
  if (trimmed.startsWith('/api/')) {
    return absolutizeApiPath(stripTokenFromApiPath(trimmed));
  }

  if (mediaTaskId && (isInaccessibleObjectStorageUrl(trimmed) || !trimmed)) {
    return absolutizeApiPath(graphTaskMediaPath(mediaTaskId));
  }
  if (
    mediaTaskId &&
    /^https?:\/\//i.test(trimmed) &&
    !isGatewayMediaPath(trimmed)
  ) {
    return absolutizeApiPath(graphTaskMediaPath(mediaTaskId));
  }

  return trimmed;
}

export function absolutizeApiPath(path: string): string {
  if (!path.startsWith('/api/')) return path;
  const base = getOpenApiBaseUrl();
  const abs = base
    ? `${base.replace(/\/$/, '')}${path}`
    : typeof window !== 'undefined'
      ? `${window.location.origin}${path}`
      : path;
  return appendMediaTokenQuery(abs);
}

/** img 无法带 Authorization，对 /api/v1/media/* 追加 ?token=（Gateway 已支持） */
export function appendMediaTokenQuery(url: string): string {
  if (!url.includes('/api/v1/media/')) return url;
  const key = getMediaAuthToken();
  if (!key) return url;
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    if (u.searchParams.has('token')) return u.toString();
    u.searchParams.set('token', key.trim());
    return u.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}token=${encodeURIComponent(key.trim())}`;
  }
}

/** 下载成片时附带 Open API Token（img 标签无法带 Header） */
export function authHeadersForMediaFetch(url: string): HeadersInit | undefined {
  const key = getMediaAuthToken();
  if (!key) return undefined;
  const apiPath = toSameOriginApiPath(url);
  const abs = apiPath.startsWith('/api/') ? absolutizeApiPath(apiPath) : url;
  if (abs.includes('/api/v1/media/') || abs.includes('/api/v1/open/')) {
    return { Authorization: `Bearer ${key}` };
  }
  return undefined;
}
