/**
 * 对外可访问的媒体 URL（经 Gateway /api/v1/media，避免内网 MinIO 直连）
 */
export function graphTaskMediaProxyPath(taskId: string): string {
  const gatewayOrigin = (process.env.PUBLIC_GATEWAY_ORIGIN || '').replace(/\/+$/, '');
  const path = `/api/v1/media/graph/${encodeURIComponent(taskId)}`;
  return gatewayOrigin ? `${gatewayOrigin}${path}` : path;
}
