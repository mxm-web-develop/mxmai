/**
 * 修复 Multer / 浏览器上传时 UTF-8 文件名被按 latin1 误存导致的乱码
 */
export function decodePossiblyMojibakeFilename(name: string | null | undefined): string {
  const raw = String(name ?? '').trim();
  if (!raw) return '';

  const hasCjk = (s: string) => /[\u4e00-\u9fff]/.test(s);
  if (hasCjk(raw) && !/Ã.|Â.|æ.|å.|è./.test(raw)) return raw;

  try {
    const decoded = Buffer.from(raw, 'latin1').toString('utf8');
    if (!decoded.includes('\uFFFD') && (hasCjk(decoded) || /\.(txt|md|markdown|pdf|docx?|csv|json)$/i.test(decoded))) {
      return decoded;
    }
  } catch {
    /* ignore */
  }
  return raw;
}
