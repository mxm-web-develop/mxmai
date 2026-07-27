import fs from 'fs';
import path from 'path';

/** 解析 mxmcgi 包根目录（dist/ 或 src/core/writing/ 运行时均可用） */
function resolveMxmcgiPackageRoot(): string {
  const base = path.basename(__dirname);
  if (base === 'dist') return path.join(__dirname, '..');
  if (__dirname.includes(`${path.sep}src${path.sep}`)) {
    return path.resolve(__dirname, '../../..');
  }
  return path.join(__dirname, '..');
}

const MXMCGI_ROOT = resolveMxmcgiPackageRoot();

const CANDIDATE_FONT_PATHS: string[] = [
  process.env.WRITING_PDF_FONT_PATH,
  path.join(MXMCGI_ROOT, 'assets/fonts/NotoSansSC-Regular.otf'),
  path.join(MXMCGI_ROOT, 'assets/fonts/NotoSansSC-Regular.ttf'),
  path.join(MXMCGI_ROOT, 'assets/fonts/NotoSansCJKsc-Regular.otf'),
  path.join(process.cwd(), 'mxmcgi/assets/fonts/NotoSansSC-Regular.otf'),
  path.join(process.cwd(), 'mxmcgi/assets/fonts/NotoSansSC-Regular.ttf'),
  path.join(process.cwd(), 'mxmcgi/assets/fonts/NotoSansCJKsc-Regular.otf'),
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
  '/Library/Fonts/Arial Unicode.ttf',
].filter((p): p is string => typeof p === 'string' && p.length > 0);

let cachedFontPath: string | undefined | null = null;

/** 解析可用于 pdfkit 的中文字体路径（支持 WRITING_PDF_FONT_PATH 与常见系统字体） */
export function resolveWritingPdfFontPath(): string | undefined {
  if (cachedFontPath !== null) {
    return cachedFontPath;
  }
  for (const candidate of CANDIDATE_FONT_PATHS) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        cachedFontPath = candidate;
        return candidate;
      }
    } catch {
      /* try next */
    }
  }
  cachedFontPath = undefined;
  return undefined;
}
