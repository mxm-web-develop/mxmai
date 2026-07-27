/**
 * 浏览器展示：修复历史上 latin1 误存的 UTF-8 文件名
 */
export function decodePossiblyMojibakeFilename(name: string | null | undefined): string {
  const raw = String(name ?? '').trim();
  if (!raw) return '';

  const hasCjk = (s: string) => /[\u4e00-\u9fff]/.test(s);
  if (hasCjk(raw) && !/Ã.|Â.|æ.|å.|è./.test(raw)) return raw;

  try {
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) & 0xff;
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (decoded.includes('\uFFFD')) return raw;
    if (hasCjk(decoded) || /\.(txt|md|markdown|pdf|docx?|csv|json)$/i.test(decoded)) {
      return decoded;
    }
  } catch {
    /* ignore */
  }
  return raw;
}
