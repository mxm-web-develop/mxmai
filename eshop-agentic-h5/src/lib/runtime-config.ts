'use client';

/** 从 .env（经 next.config env）解析 Open API 运行时配置；Gateway 地址由打包/部署决定，用户不可改 */

export type ApiRuntimeMode = 'mock' | 'http';

export function getApiMode(): ApiRuntimeMode {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('eshop_api_mode');
    if (stored === 'http' || stored === 'mock') return stored;
  }
  const env = process.env.NEXT_PUBLIC_API_MODE ?? 'mock';
  return env === 'http' ? 'http' : 'mock';
}

function shouldUseSameOriginProxy(): boolean {
  if (process.env.NEXT_PUBLIC_OPEN_API_USE_PROXY === 'false') return false;
  if (typeof window === 'undefined') return false;
  const envBase = (process.env.NEXT_PUBLIC_OPEN_API_BASE ?? '').trim();
  if (!envBase) return true;
  try {
    const envUrl = new URL(envBase);
    const pageUrl = new URL(window.location.href);
    return envUrl.origin !== pageUrl.origin;
  } catch {
    return false;
  }
}

/** 浏览器请求 Open API 的 base（不含 /api/v1/open 路径前缀） */
export function getOpenApiBaseUrl(): string {
  if (typeof window !== 'undefined' && shouldUseSameOriginProxy()) {
    return window.location.origin;
  }
  return (process.env.NEXT_PUBLIC_OPEN_API_BASE ?? '').replace(/\/$/, '');
}

export function getApiKey(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('eshop_api_key');
    if (stored?.trim()) return stored.trim();
  }
  return (process.env.NEXT_PUBLIC_MXM_API_KEY ?? '').trim();
}

/** @deprecated 仅内部调试；设置页不再展示 Gateway 地址 */
export function getOpenApiEndpointLabel(): string {
  const envBase = (process.env.NEXT_PUBLIC_OPEN_API_BASE ?? '').trim();
  const useProxy = process.env.NEXT_PUBLIC_OPEN_API_USE_PROXY !== 'false';

  if (typeof window !== 'undefined') {
    if (useProxy && (!envBase || shouldUseSameOriginProxy())) {
      return `${window.location.origin}/api → Gateway（部署配置）`;
    }
  }

  if (envBase) return envBase;
  if (useProxy) return '同源 /api 代理 → Gateway（部署配置）';
  return '未配置 Gateway';
}

/** Gateway WebSocket：/api/v1/ws/notifications?token= */
export function getNotificationsWsUrl(): string | null {
  const base = getOpenApiBaseUrl();
  const key = getApiKey();
  if (!base || !key || getApiMode() !== 'http') return null;
  const wsBase = base.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
  return `${wsBase}/api/v1/ws/notifications?token=${encodeURIComponent(key)}`;
}

/** 首次启动：用 .env 写入 localStorage（仅 mode / key；Gateway 不再存 localStorage） */
export function seedOpenApiRuntimeFromEnv(): void {
  if (typeof window === 'undefined') return;

  const envMode = process.env.NEXT_PUBLIC_API_MODE;
  if (!localStorage.getItem('eshop_api_mode') && (envMode === 'http' || envMode === 'mock')) {
    localStorage.setItem('eshop_api_mode', envMode);
  }

  // 旧版用户填写的 Gateway 地址已废弃，统一走打包/同源代理
  localStorage.removeItem('eshop_api_base');

  const envKey = process.env.NEXT_PUBLIC_MXM_API_KEY?.trim();
  if (!localStorage.getItem('eshop_api_key') && envKey) {
    localStorage.setItem('eshop_api_key', envKey);
  }
}
