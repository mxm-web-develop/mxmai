/**
 * ffmpeg drawtext 中文字体解析（优先包内 Noto，避免拉丁字体把汉字烧成 □□□）
 */
import { accessSync, existsSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

/** 解析 mxmcgi 包根目录（dist/ 或 src/core/video-edit/ 运行时均可用） */
function resolveMxmcgiPackageRoot(): string {
  if (__dirname.endsWith(`${sep}dist`) || __dirname.includes(`${sep}dist${sep}`)) {
    return join(__dirname, '..');
  }
  if (__dirname.includes(`${sep}src${sep}`)) {
    return join(__dirname, '..', '..', '..');
  }
  return join(__dirname, '..', '..', '..');
}

const MXMCGI_ROOT = resolveMxmcgiPackageRoot();

/** 明确不含中文字形 — 不可静默用于烧录中文 */
const LATIN_ONLY_FONTS = new Set([
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
]);

function collectCandidates(): string[] {
  return [
    process.env.VIDEO_EDIT_FONT_PATH,
    join(MXMCGI_ROOT, 'assets/fonts/NotoSansCJKsc-Regular.otf'),
    join(MXMCGI_ROOT, 'assets/fonts/NotoSansSC-Regular.otf'),
    join(MXMCGI_ROOT, 'assets/fonts/NotoSansSC-Regular.ttf'),
    join(process.cwd(), 'mxmcgi/assets/fonts/NotoSansCJKsc-Regular.otf'),
    join(process.cwd(), 'mxmcgi/assets/fonts/NotoSansSC-Regular.otf'),
    join(process.cwd(), 'mxmcgi/assets/fonts/NotoSansSC-Regular.ttf'),
    join(process.cwd(), 'assets/fonts/NotoSansCJKsc-Regular.otf'),
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansSC-Bold.otf',
    '/usr/share/fonts/truetype/noto/NotoSansSC-Bold.otf',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    '/Library/Fonts/Arial Unicode.ttf',
    '/System/Library/Fonts/Hiragino Sans GB.ttc',
    '/System/Library/Fonts/STHeiti Medium.ttc',
    '/System/Library/Fonts/Supplemental/Songti.ttc',
    'C:/Windows/Fonts/msyhbd.ttc',
    'C:/Windows/Fonts/msyh.ttc',
    'C:/Windows/Fonts/simhei.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  ].filter((p): p is string => typeof p === 'string' && p.length > 0);
}

function isUsableFontFile(p: string): boolean {
  try {
    accessSync(p);
    return existsSync(p) && statSync(p).isFile();
  } catch {
    return false;
  }
}

let cached: string | undefined;

/**
 * 解析可用于 ffmpeg drawtext 的中文字体。
 * 找不到可用字体时抛错，避免默默用 DejaVu 烧出 □□□ 乱码。
 */
export function resolveOverlayFontFile(): string {
  if (cached) return cached;

  const found: string[] = [];
  for (const p of collectCandidates()) {
    if (isUsableFontFile(p)) found.push(p);
  }

  const cjk = found.find((p) => !LATIN_ONLY_FONTS.has(p));
  if (cjk) {
    cached = cjk;
    return cjk;
  }

  if (found[0]) {
    console.warn(
      `[overlay-font] 未找到中文字体，将使用拉丁字体 ${found[0]} —— 汉字会显示为 □□□。` +
        `请设置 VIDEO_EDIT_FONT_PATH 或部署 mxmcgi/assets/fonts/NotoSansCJKsc-Regular.otf`
    );
    cached = found[0];
    return found[0];
  }

  throw new Error(
    '未找到可用于字幕/overlay 烧录的字体。请设置 VIDEO_EDIT_FONT_PATH，' +
      '或部署 mxmcgi/assets/fonts/NotoSansCJKsc-Regular.otf'
  );
}

/** 测试用：清空缓存 */
export function resetOverlayFontCache(): void {
  cached = undefined;
}
