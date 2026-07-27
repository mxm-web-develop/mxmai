'use client';

import imageCompression from 'browser-image-compression';

/** 用户从相册/相机选取的原图体积上限（压缩前） */
export const MAX_INPUT_IMAGE_BYTES = 50 * 1024 * 1024;
export const MAX_INPUT_IMAGE_MB = 50;

/** 压缩后交给后端的目标体积与边长 */
const COMPRESS_MAX_SIZE_MB = 2;
const COMPRESS_MAX_DIMENSION = 2048;
const COMPRESS_QUALITY = 0.85;

const COMPRESS_OPTIONS = {
  maxSizeMB: COMPRESS_MAX_SIZE_MB,
  maxWidthOrHeight: COMPRESS_MAX_DIMENSION,
  useWebWorker: false,
  fileType: 'image/jpeg' as const,
  initialQuality: COMPRESS_QUALITY,
};

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(file.name);
}

function isHeicLike(file: File): boolean {
  const t = file.type.toLowerCase();
  if (t.includes('heic') || t.includes('heif')) return true;
  return /\.heic$/i.test(file.name) || /\.heif$/i.test(file.name);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(blob);
  });
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode failed'));
    img.src = url;
  });
}

/** canvas / ImageBitmap 编码为 JPEG（Safari 可解码 HEIC） */
async function canvasEncodeJpeg(file: File, quality = COMPRESS_QUALITY): Promise<Blob> {
  if (typeof createImageBitmap !== 'undefined') {
    const bitmap = await createImageBitmap(file);
    try {
      const max = COMPRESS_MAX_DIMENSION;
      let { width, height } = bitmap;
      if (width > max || height > max) {
        const scale = max / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas unavailable');
      ctx.drawImage(bitmap, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const res = await fetch(dataUrl);
      return await res.blob();
    } finally {
      bitmap.close?.();
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadHtmlImage(objectUrl);
    const max = COMPRESS_MAX_DIMENSION;
    let { width, height } = img;
    if (width > max || height > max) {
      const scale = max / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas unavailable');
    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const res = await fetch(dataUrl);
    return await res.blob();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function convertHeicToJpeg(file: File): Promise<Blob> {
  const mod = await import('heic2any');
  const heic2any = mod.default;
  const result = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: COMPRESS_QUALITY,
  });
  const blob = Array.isArray(result) ? result[0] : result;
  if (!blob) throw new Error('HEIC 转换失败');
  return blob;
}

/** 任意手机相册格式 → 可预览的 JPEG Blob */
async function toDisplayableJpegBlob(file: File): Promise<Blob> {
  try {
    return await imageCompression(file, COMPRESS_OPTIONS);
  } catch {
    /* 继续 fallback */
  }

  if (isHeicLike(file)) {
    try {
      const jpeg = await convertHeicToJpeg(file);
      return await imageCompression(
        new File([jpeg], 'converted.jpg', { type: 'image/jpeg' }),
        COMPRESS_OPTIONS
      );
    } catch {
      /* 继续 fallback */
    }
  }

  try {
    return await canvasEncodeJpeg(file);
  } catch {
    /* 继续 fallback */
  }

  if (isHeicLike(file)) {
    return convertHeicToJpeg(file);
  }

  throw new Error('图片无法识别，请换 JPG/PNG，或在 iPhone 设置中关闭「高效格式」后重拍');
}

/**
 * 生成可在 <img> 中稳定预览的 data URL（统一 JPEG，兼容 HEIC / 微信 WebView）。
 * 勿对小图跳过压缩——iPhone HEIC 常小于 512KB 但浏览器无法直接预览 blob。
 */
export async function compressImageFile(file: File): Promise<string> {
  if (!isImageFile(file)) {
    throw new Error('请选择图片文件');
  }
  if (file.size > MAX_INPUT_IMAGE_BYTES) {
    throw new Error(`图片过大，请选择 ${MAX_INPUT_IMAGE_MB}MB 以内的原图（会自动压缩后再上传）`);
  }
  const jpeg = await toDisplayableJpegBlob(file);
  return blobToDataUrl(jpeg);
}

/** 供上传使用：从预览 data/blob URL 取 JPEG Blob（必要时二次压缩） */
export async function previewUrlToJpegBlob(content: string): Promise<Blob> {
  const res = await fetch(content);
  if (!res.ok) throw new Error('读取参考图失败');
  const blob = await res.blob();
  const maxUploadBytes = COMPRESS_MAX_SIZE_MB * 1024 * 1024;
  const isJpeg = blob.type === 'image/jpeg' || blob.type === 'image/jpg';
  if (isJpeg && blob.size <= maxUploadBytes) return blob;
  return toDisplayableJpegBlob(
    new File([blob], 'ref.jpg', { type: blob.type || 'application/octet-stream' })
  );
}
