/**
 * 从 run-graph-*-clean.txt 中解析「--- [OUTPUT] image result ---」后的 JSON，
 * 将 image_urls 里的 data:image/...;base64,... 写入 runlogs/decoded_<basename>/ 目录。
 *
 * 用法: pnpm exec tsx src/scripts/decode-runlog-graph-image-result.ts [runlog路径]
 */
import fs from 'node:fs';
import path from 'node:path';

const MARKER = '--- [OUTPUT] image result ---\n';

function extractFirstJsonObject(s: string, from: number): string | null {
  let i = from;
  while (i < s.length && s[i] !== '{') i++;
  if (i >= s.length) return null;
  let depth = 0;
  const start = i;
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function extFromMime(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'jpg';
}

function main() {
  const cwd = process.cwd();
  const argPath = process.argv[2];
  const logPath = argPath
    ? path.resolve(argPath)
    : path.join(cwd, 'runlogs', '2026-05-07_182651_taobaonvzhuang-2_clean.txt');

  if (!fs.existsSync(logPath)) {
    console.error('文件不存在:', logPath);
    process.exit(1);
  }

  const text = fs.readFileSync(logPath, 'utf8');
  const mi = text.indexOf(MARKER);
  if (mi === -1) {
    console.error('未找到标记:', MARKER.trim());
    process.exit(1);
  }

  const jsonStr = extractFirstJsonObject(text, mi + MARKER.length);
  if (!jsonStr) {
    console.error('未解析到 JSON 对象');
    process.exit(1);
  }

  let obj: { image_urls?: string[]; error?: unknown };
  try {
    obj = JSON.parse(jsonStr) as { image_urls?: string[]; error?: unknown };
  } catch (e) {
    console.error('JSON.parse 失败:', e);
    process.exit(1);
  }

  if (obj.error) {
    console.error('runlog 中为错误结果:', JSON.stringify(obj.error).slice(0, 500));
    process.exit(1);
  }

  const urls = obj.image_urls || [];
  if (urls.length === 0) {
    console.error('image_urls 为空');
    process.exit(1);
  }

  const base = path.basename(logPath, path.extname(logPath));
  const outDir = path.join(path.dirname(logPath), `decoded_${base}`);
  fs.mkdirSync(outDir, { recursive: true });

  let n = 0;
  for (const u of urls) {
    n++;
    if (typeof u !== 'string') continue;
    if (u.startsWith('http://') || u.startsWith('https://')) {
      const ext = u.includes('.png') ? 'png' : u.includes('.webp') ? 'webp' : 'jpg';
      fs.writeFileSync(path.join(outDir, `${n}_url.${ext}`), `URL（未下载）:\n${u}\n`, 'utf8');
      continue;
    }
    const m = /^data:([^;]+);base64,(.+)$/s.exec(u);
    if (!m) {
      fs.writeFileSync(path.join(outDir, `${n}_raw.txt`), u.slice(0, 2000), 'utf8');
      continue;
    }
    const mime = m[1];
    const b64 = m[2].replace(/\s/g, '');
    const buf = Buffer.from(b64, 'base64');
    const ext = extFromMime(mime);
    const fp = path.join(outDir, `${n}.${ext}`);
    fs.writeFileSync(fp, buf);
    console.log('写入', fp, `(${buf.length} bytes, ${mime})`);
  }

  console.log('\n完成，目录:', outDir);
}

main();
