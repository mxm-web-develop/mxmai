import { RepositoryFactory, UploadOptions } from '@mxmai/mxmdata';

export interface StorageConfig {
  /** 存储桶名称 */
  bucket: string;
  /** 文件路径模板，支持以下变量：
   * - {userId} - 用户ID
   * - {date} - 日期 (YYYYMMDD)
   * - {timestamp} - 时间戳
   * - {randomId} - 随机ID
   * - {index} - 文件索引（多文件时）
   * - {ext} - 文件扩展名
   * 示例: "generated/{userId}/{date}/{timestamp}-{randomId}.{ext}"
   */
  pathTemplate: string;
  /** 默认文件扩展名（如果无法从数据推断） */
  defaultExt?: string;
  /** 是否生成预签名URL */
  generatePresignedUrl?: boolean;
  /** 预签名URL过期时间（秒），默认7天 */
  presignedUrlExpiresIn?: number;
}

export interface MediaData {
  /** 媒体URL（可能是完整URL或Base64数据） */
  url: string;
  /** 媒体类型（image/video），如果未指定则自动检测 */
  mediaType?: 'image' | 'video';
  /** 文件扩展名（如果已知） */
  ext?: string;
}

export interface StorageResult {
  /** 原始URL */
  originalUrl: string;
  /** MinIO存储路径 */
  key: string;
  /** 存储桶名称 */
  bucket: string;
  /** MinIO访问URL */
  url: string;
  /** 预签名URL（如果配置了） */
  presignedUrl?: string;
  /** 文件大小（字节） */
  size: number;
  /** 媒体类型 */
  contentType: string;
}

/**
 * 从URL或Base64数据下载/转换文件为Buffer
 */
async function downloadOrConvertToBuffer(
  data: string,
): Promise<{ buffer: Buffer; contentType: string; ext: string }> {
  // 检查是否是Base64数据
  if (data.startsWith('data:')) {
    // Data URI格式: data:image/png;base64,...
    const matches = data.match(/^data:([^;]+)(?:;base64)?,(.+)$/);
    if (!matches) {
      throw new Error('Invalid data URI format');
    }

    const contentType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // 从contentType推断扩展名
    const ext = getExtensionFromContentType(contentType) || 'bin';

    return { buffer, contentType, ext };
  } else if (data.match(/^[A-Za-z0-9+/=]+$/)) {
    // 纯Base64字符串（没有data URI前缀）
    // 尝试检测是否为图片
    const buffer = Buffer.from(data, 'base64');
    const contentType = detectContentTypeFromBuffer(buffer);
    const ext = getExtensionFromContentType(contentType) || 'png';

    return { buffer, contentType, ext };
  }

  // URL：支持 /api/v1/media/* 相对路径、MinIO 直链与绝对 HTTP
  // Worker 内相对路径不能直接 fetch，需走媒体解析（asset/object → MinIO）
  const { fetchMediaBuffer } = await import('../core/video-edit/media-fetch');
  const buffer = await fetchMediaBuffer(data);
  const contentType = detectContentTypeFromBuffer(buffer) || 'application/octet-stream';
  const ext =
    getExtensionFromContentType(contentType) || getExtensionFromUrl(data) || 'bin';

  return { buffer, contentType, ext };
}

/**
 * 从Content-Type推断文件扩展名
 */
function getExtensionFromContentType(contentType: string): string | null {
  const mimeMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/ogg': 'ogg',
    'video/quicktime': 'mov',
    'video/x-msvideo': 'avi',
    // audio
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/wave': 'wav',
    'audio/flac': 'flac',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
    'audio/aac': 'aac',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/pcm': 'pcm',
    'audio/l16': 'pcm',
  };

  return mimeMap[contentType.toLowerCase()] || null;
}

/**
 * 从URL推断文件扩展名
 */
function getExtensionFromUrl(url: string): string | null {
  try {
    // 相对路径（如 /api/v1/media/asset?key=.../clip.mp4）也要能推断扩展名
    const pathname = url.startsWith('http://') || url.startsWith('https://')
      ? new URL(url).pathname
      : url.split('?')[0] || url;
    // key 常在 query 里：...&key=user%2Fpath%2Ffile.mp4
    const keyMatch = url.match(/[?&]key=([^&]+)/i);
    const keyDecoded = keyMatch?.[1] ? decodeURIComponent(keyMatch[1]) : '';
    const candidates = [pathname, keyDecoded];
    for (const c of candidates) {
      const match = c.match(/\.([a-zA-Z0-9]+)(?:\/|$)/);
      if (match) return match[1].toLowerCase();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 从Buffer检测Content-Type（简单的文件头检测）
 */
function detectContentTypeFromBuffer(buffer: Buffer): string {
  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  // GIF
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return 'image/gif';
  }
  // WebP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }
  // MP4
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    return 'video/mp4';
  }
  // WebM
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return 'video/webm';
  }

  return 'application/octet-stream';
}

/**
 * 替换路径模板中的变量
 */
function replacePathTemplate(
  template: string,
  variables: Record<string, string | number>,
): string {
  let path = template;
  for (const [key, value] of Object.entries(variables)) {
    path = path.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }
  return path;
}

/**
 * 存储单个媒体文件到MinIO
 */
export async function storeMedia(
  mediaData: MediaData,
  config: StorageConfig,
  userId?: string,
  modelName?: string,
): Promise<StorageResult> {
  const storageRepo = RepositoryFactory.createStorageRepository('generated');

  // 下载或转换数据为Buffer
  const { buffer, contentType, ext: detectedExt } = await downloadOrConvertToBuffer(
    mediaData.url,
  );

  // 确定文件扩展名
  const fileExt = mediaData.ext || detectedExt || config.defaultExt || 'bin';

  // 准备路径变量
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(
    2,
    '0',
  )}${String(now.getDate()).padStart(2, '0')}`;
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).slice(2, 8);

  const pathVariables: Record<string, string | number> = {
    userId: userId || 'anonymous',
    modelName: modelName || 'unknown',
    date: dateStr,
    timestamp,
    randomId,
    ext: fileExt,
  };

  // 替换路径模板
  const key = replacePathTemplate(config.pathTemplate, pathVariables);

  // 上传选项
  const uploadOptions: UploadOptions = {
    contentType,
    metadata: {
      userId: userId || 'anonymous',
      originalUrl: mediaData.url.substring(0, 200), // 限制长度
      mediaType:
        mediaData.mediaType ||
        (contentType.startsWith('image/')
          ? 'image'
          : contentType.startsWith('video/')
          ? 'video'
          : 'unknown'),
    },
  };

  if (config.generatePresignedUrl) {
    uploadOptions.expiresIn = config.presignedUrlExpiresIn || 7 * 24 * 3600; // 默认7天
  }

  // 上传到MinIO
  const uploadResult = await storageRepo.uploadFile(config.bucket, key, buffer, uploadOptions);

  return {
    originalUrl: mediaData.url,
    key: uploadResult.key,
    bucket: uploadResult.bucket,
    url: uploadResult.url,
    presignedUrl: uploadResult.presignedUrl,
    size: buffer.length,
    contentType,
  };
}

/**
 * 批量存储媒体文件到MinIO
 */
export async function storeMediaBatch(
  mediaDataList: MediaData[],
  config: StorageConfig,
  userId?: string,
  modelName?: string,
): Promise<StorageResult[]> {
  const results: StorageResult[] = [];

  for (let i = 0; i < mediaDataList.length; i++) {
    const mediaData = mediaDataList[i];

    // 为每个文件添加索引变量
    const configWithIndex = {
      ...config,
      pathTemplate: config.pathTemplate.replace(/\{index\}/g, String(i)),
    };

    const result = await storeMedia(mediaData, configWithIndex, userId, modelName);
    results.push(result);
  }

  return results;
}

/**
 * 从GenerateResult存储媒体文件
 * 这是最常用的方法，直接从生图生视频接口的返回结果中提取并存储
 */
export async function storeFromGenerateResult(
  generateResult: { mediaUrls: string[]; metadata?: Record<string, any> },
  config: StorageConfig,
  userId?: string,
  modelName?: string,
): Promise<StorageResult[]> {
  // 如果没有传递 modelName，尝试从 metadata 中获取
  const finalModelName = modelName || generateResult.metadata?.model;

  const mediaDataList: MediaData[] = generateResult.mediaUrls.map((url) => ({
    url,
  }));

  return storeMediaBatch(mediaDataList, config, userId, finalModelName);
}


