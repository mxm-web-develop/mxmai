'use client';

import { getAuthBearerTokenSync } from '@/lib/auth-token';
import { getOpenApiBaseUrl } from '@/lib/runtime-config';
import { appendMediaTokenQuery } from '@/lib/media-url';

export interface PartnerUploadListItem {
  id: string;
  url: string;
  contentType: string | null;
  originalName: string | null;
  createdAt: string;
  expiresAt: string | null;
}

function resolveBaseUrl(): string {
  const base = getOpenApiBaseUrl();
  if (base) return base.replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  throw new Error('未配置 API 地址');
}

function authHeaders(): HeadersInit {
  const token = getAuthBearerTokenSync();
  if (!token) throw new Error('请先短信登录');
  return { Authorization: `Bearer ${token}` };
}

export async function listMyPartnerUploads(options?: {
  limit?: number;
  offset?: number;
}): Promise<{ items: PartnerUploadListItem[]; total: number }> {
  const q = new URLSearchParams();
  if (options?.limit != null) q.set('limit', String(options.limit));
  if (options?.offset != null) q.set('offset', String(options.offset));
  const query = q.toString();
  const res = await fetch(
    `${resolveBaseUrl()}/api/v1/partner/me/uploads${query ? `?${query}` : ''}`,
    { headers: authHeaders() }
  );
  if (res.status === 401 || res.status === 403) {
    throw new Error('登录已失效，请重新登录');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(String((err as { error?: string }).error ?? `加载失败：${res.status}`));
  }
  const json = (await res.json()) as {
    success?: boolean;
    data?: {
      items: Array<{
        id: string;
        url: string;
        contentType?: string | null;
        originalName?: string | null;
        createdAt: string;
        expiresAt?: string | null;
      }>;
      total: number;
    };
  };
  const items = (json.data?.items ?? []).map((item) => ({
    id: item.id,
    url: item.url,
    contentType: item.contentType ?? null,
    originalName: item.originalName ?? null,
    createdAt: item.createdAt,
    expiresAt: item.expiresAt ?? null,
  }));
  return { items, total: json.data?.total ?? items.length };
}

export async function deleteMyPartnerUpload(objectId: string): Promise<void> {
  const res = await fetch(
    `${resolveBaseUrl()}/api/v1/partner/me/uploads/${encodeURIComponent(objectId)}`,
    { method: 'DELETE', headers: authHeaders() }
  );
  if (res.status === 404) throw new Error('文件不存在或已删除');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(String((err as { error?: string }).error ?? `删除失败：${res.status}`));
  }
}

export function resolvePartnerUploadPreviewUrl(url: string): string {
  if (url.startsWith('http')) return appendMediaTokenQuery(url);
  const base = resolveBaseUrl();
  const path = url.startsWith('/') ? url : `/${url}`;
  return appendMediaTokenQuery(`${base}${path}`);
}
