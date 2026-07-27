'use client';

import { previewUrlToJpegBlob } from '@/lib/image-compress';
import { getAuthBearerTokenSync } from '@/lib/auth-token';
import { getApiKey, getApiMode, getOpenApiBaseUrl } from '@/lib/runtime-config';
import type { StartDraftImage } from '@/lib/start-draft';

function resolveUploadBaseUrl(): string {
  const base = getOpenApiBaseUrl();
  if (base) return base.replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  throw new Error('未配置 API 地址');
}

function resolveUploadAuthToken(): string {
  const session = getAuthBearerTokenSync();
  if (session?.trim()) return session.trim();
  const key = getApiKey();
  if (key?.trim()) return key.trim();
  throw new Error('未登录或未配置 API Key，无法上传参考图');
}

function absolutizeAssetUrl(url: string, proxyPath?: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const path = (proxyPath?.trim() || trimmed).trim();
  if (!path) throw new Error('上传响应缺少可访问 URL');
  const base = resolveUploadBaseUrl();
  return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
}

async function blobFromContent(content: string): Promise<Blob> {
  const trimmed = content.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    const res = await fetch(trimmed);
    if (!res.ok) throw new Error('读取参考图失败');
    const blob = await res.blob();
    if (blob.type === 'image/jpeg' || blob.type === 'image/jpg') return blob;
    return previewUrlToJpegBlob(trimmed);
  }
  return previewUrlToJpegBlob(trimmed);
}

/**
 * 将 blob:/data: 本地预览地址上传为 Gateway 可访问的 http URL，供 graph 参考图槽位使用。
 */
export async function uploadReferenceImageFromContent(content: string): Promise<string> {
  const trimmed = content.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  if (getApiMode() !== 'http') {
    throw new Error('Mock 模式下无法上传参考图，请切换到 HTTP 并配置 API Key');
  }

  const token = resolveUploadAuthToken();

  const blob = await blobFromContent(trimmed);
  const file = new File([blob], 'garment-ref.jpg', {
    type: 'image/jpeg',
  });

  const form = new FormData();
  form.append('file', file);
  form.append('storageMode', 'temp');

  const res = await fetch(`${resolveUploadBaseUrl()}/api/v1/cgi/upload/assets?storageMode=temp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (res.status === 401) {
    throw new Error('登录已失效，无法上传参考图');
  }
  if (res.status === 403) {
    throw new Error('当前凭证无上传权限，请使用短信登录或有效的开放 API 客户端密钥');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      String((err as { error?: string; message?: string }).error ?? `上传参考图失败：${res.status}`)
    );
  }

  const json = (await res.json()) as {
    success?: boolean;
    data?: { url?: string; proxyPath?: string };
  };
  const data = json.data;
  if (!data?.url && !data?.proxyPath) {
    throw new Error('上传参考图响应格式异常');
  }
  return absolutizeAssetUrl(data.url ?? data.proxyPath ?? '', data.proxyPath);
}

export async function uploadReferenceImagesForSubmit(
  images: StartDraftImage[]
): Promise<StartDraftImage[]> {
  const out: StartDraftImage[] = [];
  for (const img of images) {
    const content = await uploadReferenceImageFromContent(img.content);
    out.push({ ...img, content });
  }
  return out;
}
