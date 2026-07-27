/**
 * 启航 API 根地址（不含 /v1）。
 * DeerAPIClient 会在路径前自行加 /v1/...；若 base 已是 .../v1 会变成 /v1/v1/... 导致 403/404。
 */
export function normalizeQhaiApiRoot(baseUrl?: string | null): string {
  const raw = (baseUrl || process.env.QHAI_BASE_URL || 'https://api.qhaigc.net').trim();
  let u = raw.replace(/\/+$/, '');
  if (/\/v1$/i.test(u)) {
    u = u.replace(/\/v1$/i, '');
  }
  return u;
}

export function qhaiV1Url(path: string, baseUrl?: string | null): string {
  const root = normalizeQhaiApiRoot(baseUrl);
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${root}/v1${p}`;
}
