/** 中国大陆手机号规范化 → 11 位 */
export function normalizeCnPhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('86') && digits.length === 13) digits = digits.slice(2);
  if (digits.length === 11 && /^1[3-9]\d{9}$/.test(digits)) return digits;
  return null;
}

export function phoneExternalId(phone: string): string {
  return `phone:${phone}`;
}

export function maskPhone(phone: string): string {
  if (phone.length !== 11) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(7)}`;
}
