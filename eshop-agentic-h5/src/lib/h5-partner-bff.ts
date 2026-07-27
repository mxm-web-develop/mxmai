/** H5 服务端 BFF：Partner Key 与 Gateway 地址（勿暴露给浏览器 bundle） */

export function getH5PartnerGateway(): string {
  return (
    process.env.OPEN_API_PROXY_TARGET?.trim() ||
    process.env.NEXT_PUBLIC_OPEN_API_BASE?.trim() ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

export function getH5PartnerKey(): string | null {
  const key =
    process.env.MXM_PARTNER_KEY?.trim() ||
    process.env.MXMTOKEN?.trim() ||
    process.env.NEXT_PUBLIC_MXM_API_KEY?.trim();
  return key || null;
}

export function partnerKeyHeaders(): Record<string, string> {
  const key = getH5PartnerKey();
  if (!key) throw new Error('MXM_PARTNER_KEY 未配置');
  return { 'X-Partner-Key': key, 'Content-Type': 'application/json' };
}
