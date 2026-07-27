import imageCompression from 'browser-image-compression';

/** 上传前图片体积上限（约 800KB） */
const MAX_BYTES = 800 * 1024;

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif|bmp|heic|avif)$/i.test(file.name);
}

/**
 * 将用户选择的图片压缩到适合上传的体积（目标 ≤800KB，避免大图直传）。
 * 非图片文件原样返回。
 */
export async function compressImageForUpload(file: File): Promise<File> {
  if (!isImageFile(file)) return file;
  if (file.size > 0 && file.size <= MAX_BYTES) return file;

  let compressed = await imageCompression(file, {
    maxSizeMB: MAX_BYTES / (1024 * 1024),
    maxWidthOrHeight: 2048,
    useWebWorker: true,
    initialQuality: 0.85,
  });

  if (compressed.size > MAX_BYTES) {
    compressed = await imageCompression(file, {
      maxSizeMB: (MAX_BYTES * 0.85) / (1024 * 1024),
      maxWidthOrHeight: 1600,
      useWebWorker: true,
      initialQuality: 0.7,
    });
  }

  return compressed;
}
