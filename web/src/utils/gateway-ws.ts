/**
 * Gateway HTTP 源：与登录页 api_base_url 对齐。
 * 留空时 HTTP 走相对路径 /api；WS 在生产同域部署时用 window.location.origin。
 */

function trimTrailingSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

export function getGatewayHttpOrigin(): string {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('api_base_url');
    if (stored !== null && stored.trim() !== '') {
      return trimTrailingSlash(stored.trim());
    }
  }
  const env =
    typeof import.meta !== 'undefined' && typeof import.meta.env?.VITE_GATEWAY_URL === 'string'
      ? import.meta.env.VITE_GATEWAY_URL.trim()
      : '';
  if (env) return trimTrailingSlash(env);
  if (typeof window !== 'undefined' && window.location?.origin) {
    return trimTrailingSlash(window.location.origin);
  }
  return 'http://localhost:3000';
}

export function buildNotificationsWebSocketUrl(token: string): string {
  const http = getGatewayHttpOrigin();
  const u = new URL(http);
  const wsScheme = u.protocol === 'https:' ? 'wss:' : 'ws:';
  const path = '/api/v1/ws/notifications';
  const out = new URL(`${wsScheme}//${u.host}${path}`);
  out.searchParams.set('token', token);
  return out.toString();
}
