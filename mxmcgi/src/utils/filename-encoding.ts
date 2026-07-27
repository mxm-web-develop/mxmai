/**
 * Multer / 浏览器上传时，部分环境把 UTF-8 文件名按 latin1 解读，导致中文乱码。
 * 读侧与写侧均可调用本函数做修复。
 */
export function decodePossiblyMojibakeFilename(name: string | null | undefined): string {
  const raw = String(name ?? '').trim();
  if (!raw) return '';

  const hasCjk = (s: string) => /[\u4e00-\u9fff]/.test(s);
  const hasReplacement = (s: string) => s.includes('\uFFFD');

  // 已是正常中文文件名
  if (hasCjk(raw) && !/Ã.|Â.|æ.|å.|è./.test(raw)) {
    return raw;
  }

  try {
    const decoded = Buffer.from(raw, 'latin1').toString('utf8');
    if (!hasReplacement(decoded) && (hasCjk(decoded) || decoded !== raw)) {
      // 解码后更像合法文件名（含中文，或至少去掉了典型乱码）
      if (hasCjk(decoded) || /\.(txt|md|markdown|pdf|docx?|csv|json)$/i.test(decoded)) {
        return decoded;
      }
    }
  } catch {
    /* ignore */
  }

  return raw;
}
