/**
 * URL 规范化（与 mobile 的 normalizeUrl 保持一致）
 */
export function normalizeUrl(url?: string): string | undefined {
  if (!url) return url;
  let fixed = url;
  fixed = fixed.replace(/http:+\/\//g, 'http://');
  fixed = fixed.replace(/https:+\/\//g, 'https://');
  return fixed;
}

/**
 * 将可能带 gateway 完整域名的媒体 URL 转为相对路径，
 * 使开发环境下通过 Vite 代理加载，避免跨域
 */
export function toRelativeMediaUrl(url: string): string {
  if (!url || !url.startsWith('http')) return url;
  const m = url.match(/^(https?:\/\/[^/]+)(\/api\/v1\/media\/.+)/);
  if (m) {
    const path = m[2];
    // 开发时（任意 Vite dev 端口，非写死 5173）使用相对路径，走 Vite proxy
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      return path;
    }
  }
  return url;
}
