/**
 * 参考图处理工具
 * 处理参考图的上传、类型识别、提示词补充等功能
 */

/**
 * 压缩图片（用于减少 Base64 数据大小，避免 API 请求失败）
 * @param imageData Base64 图片数据（支持 data URI 格式）
 * @param maxSizeMB 最大文件大小（MB），超过此大小将进行压缩，默认 2MB
 * @param maxWidth 最大宽度（像素），默认 2048
 * @param maxHeight 最大高度（像素），默认 2048
 * @param quality 压缩质量（1-100），默认 85
 * @returns 压缩后的 Base64 图片数据和处理信息
 */
export async function compressImage(
    imageData: string,
    maxSizeMB: number = 2,
    maxWidth: number = 2048,
    maxHeight: number = 2048,
    quality: number = 85
  ): Promise<{
    compressed: string;
    originalSizeKB: number;
    compressedSizeKB: number;
    wasCompressed: boolean;
    error?: string;
  }> {
    // 如果不是 Base64 数据，直接返回
    if (!isBase64(imageData)) {
      return {
        compressed: imageData,
        originalSizeKB: 0,
        compressedSizeKB: 0,
        wasCompressed: false,
      };
    }
  
    // 提取 Base64 数据
    const base64Data = extractBase64FromDataUri(imageData);
    const imageBuffer = Buffer.from(base64Data, 'base64');
    const originalSizeKB = imageBuffer.length / 1024;
    const originalSizeMB = originalSizeKB / 1024;
  
    // 如果图片已经小于最大大小，不需要压缩
    if (originalSizeMB <= maxSizeMB) {
      return {
        compressed: imageData,
        originalSizeKB,
        compressedSizeKB: originalSizeKB,
        wasCompressed: false,
      };
    }
  
    // 尝试使用 sharp 压缩图片
    let sharp: any;
    try {
      sharp = require('sharp');
    } catch (error) {
      console.warn('[ReferenceImage] sharp 未安装，无法压缩图片');
      console.warn('   建议安装: npm install sharp 或 pnpm add sharp');
      return {
        compressed: imageData,
        originalSizeKB,
        compressedSizeKB: originalSizeKB,
        wasCompressed: false,
        error: 'sharp 未安装',
      };
    }
  
    try {
      // 获取图片元数据
      const metadata = await sharp(imageBuffer).metadata();
      const { width, height, format } = metadata;
  
      // 计算目标尺寸（保持宽高比）
      let targetWidth = width;
      let targetHeight = height;
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        targetWidth = Math.round(width * ratio);
        targetHeight = Math.round(height * ratio);
      }
  
      // 创建 sharp 实例
      let sharpInstance = sharp(imageBuffer);
  
      // 如果需要调整尺寸
      if (targetWidth !== width || targetHeight !== height) {
        sharpInstance = sharpInstance.resize(targetWidth, targetHeight, {
          fit: 'inside', // 保持宽高比，不裁剪
          withoutEnlargement: true, // 不放大
        });
        console.log(`[ReferenceImage] 调整图片尺寸: ${width}x${height} → ${targetWidth}x${targetHeight}`);
      }
  
      // 根据格式选择压缩方式
      const isPng = format === 'png';
      const isJpeg = format === 'jpeg' || format === 'jpg';
  
      if (isPng) {
        // PNG 压缩
        sharpInstance = sharpInstance.png({
          quality: quality,
          compressionLevel: 9, // 最高压缩级别
        });
      } else if (isJpeg) {
        // JPEG 压缩
        sharpInstance = sharpInstance.jpeg({
          quality: quality,
          mozjpeg: true, // 使用 mozjpeg 编码器（更好的压缩率）
        });
      } else {
        // 其他格式转换为 JPEG
        sharpInstance = sharpInstance.jpeg({
          quality: quality,
          mozjpeg: true,
        });
      }
  
      // 执行压缩
      const compressedBuffer = await sharpInstance.toBuffer();
      const compressedSizeKB = compressedBuffer.length / 1024;
      const compressedSizeMB = compressedSizeKB / 1024;
      const compressedBase64 = compressedBuffer.toString('base64');
      const finalMimeType = isPng ? 'png' : 'jpeg';
      const compressedDataUri = `data:image/${finalMimeType};base64,${compressedBase64}`;
  
      console.log(
        `[ReferenceImage] 图片压缩完成: ${originalSizeMB.toFixed(2)} MB → ${compressedSizeMB.toFixed(2)} MB (${((1 - compressedSizeMB / originalSizeMB) * 100).toFixed(1)}% 减少)`
      );
  
      return {
        compressed: compressedDataUri,
        originalSizeKB,
        compressedSizeKB,
        wasCompressed: true,
      };
    } catch (error) {
      console.error('[ReferenceImage] 图片压缩失败:', error);
      return {
        compressed: imageData,
        originalSizeKB,
        compressedSizeKB: originalSizeKB,
        wasCompressed: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  
  /**
   * 参考图类型
   */
  export type ReferenceImageType = 
    | 'main-subject'    // 主体（人物、物体等，保持完全一致）
    | 'background'      // 背景场景和光线
    | 'outfits'         // 服装、道具、次要角色
    | 'color-reference' // 风格和色彩参考
    | 'style-reference'; // UI / 全局风格参考（布局、色彩、字体、组件风格等）
  
  /**
   * 参考图对象
   */
  export interface ReferenceImage {
    content: string; // URL 或 base64 数据（支持 data URI 格式）
    type: ReferenceImageType;
  /**
   * 可选：这张参考图的用途说明（给人类看的语义标签）。
   * 例如：`主图模特脸+发型一致`、`衣服面料/版型细节`、`场景光线氛围`。
   */
  purpose?: string;
  /**
   * 可选：业务侧标记（部分链路会写入 subject/background），不影响提示词构建。
   */
  role?: string;
  }
  
  /**
   * 参考图类型到提示词描述的映射（英文）
   */
  const REFERENCE_TYPE_DESCRIPTIONS_EN: Record<ReferenceImageType, string> = {
    'main-subject': 'Main character (face, details, hairstyle, body – keep exact identity)',
    'background': 'Background scene and lighting',
    'outfits': 'Additional props or secondary character',
    'color-reference': 'Style and color grading reference',
    'style-reference': 'UI style reference (layout, colors, typography, components and overall design language)',
  };
  
  /**
   * 参考图类型到提示词描述的映射（中文）
   */
  const REFERENCE_TYPE_DESCRIPTIONS_ZH: Record<ReferenceImageType, string> = {
    'main-subject': '主体人物（脸部、五官细节、发型、身材 – 保持完全一致）',
    'background': '背景场景和光线',
    'outfits': '服装、道具或次要角色',
    'color-reference': '风格和色彩参考',
    'style-reference': 'UI 风格参考（布局、配色、字体、组件与整体设计语言）',
  };
  
  /**
   * 根据参考图类型生成提示词补充
   * @param referenceImages 参考图数组
   * @param language 输出语言 'zh' | 'en'
   * @returns 提示词补充文本
   */
  export function buildReferenceImagePrompt(
    referenceImages: ReferenceImage[],
    language: 'zh' | 'en' = 'en'
  ): string {
    if (!referenceImages || referenceImages.length === 0) {
      return '';
    }
  
    const descriptions = language === 'zh' 
      ? REFERENCE_TYPE_DESCRIPTIONS_ZH 
      : REFERENCE_TYPE_DESCRIPTIONS_EN;
  
    const lines: string[] = [];
    
    if (language === 'en') {
      lines.push('Use the uploaded reference images as follows:');
    } else {
      lines.push('使用上传的参考图如下：');
    }
  
    referenceImages.forEach((ref, index) => {
      const imageNum = index + 1;
    const description = descriptions[ref.type];
    const purpose = typeof ref.purpose === 'string' ? ref.purpose.trim() : '';
      if (language === 'en') {
      lines.push(`- Image ${imageNum}: ${description}${purpose ? ` (Purpose: ${purpose})` : ''}`);
      } else {
      lines.push(`- 图片 ${imageNum}：${description}${purpose ? `（用途：${purpose}）` : ''}`);
      }
    });
  
    return lines.join('\n');
  }
  
  /**
   * 检查字符串是否为 base64 数据
   */
  export function isBase64(content: string): boolean {
    // 检查是否为 data URI
    if (content.startsWith('data:image/')) {
      return true;
    }
    
    // 检查是否为纯 base64 字符串（长度较长且符合 base64 字符集）
    const base64Pattern = /^[A-Za-z0-9+/=]+$/;
    return content.length > 100 && base64Pattern.test(content);
  }
  
  /**
   * 检查字符串是否为 URL
   */
  export function isUrl(content: string): boolean {
    try {
      const url = new URL(content);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  export type ReferenceImageLocator =
    | { kind: 'http'; url: string }
    | { kind: 'media-object'; objectId: string }
    | { kind: 'media-asset'; bucket: string; key: string };

  function guessContentTypeFromKey(key: string): string {
    if (key.endsWith('.png')) return 'image/png';
    if (key.endsWith('.webp')) return 'image/webp';
    if (key.endsWith('.gif')) return 'image/gif';
    return 'image/jpeg';
  }

  /** 解析 Gateway 代理路径或绝对 URL（Web/H5 上传常落库为 /api/v1/media/object/:id） */
  export function parseReferenceImageLocator(content: string): ReferenceImageLocator | null {
    const c = content.trim();
    if (!c || isBase64(c)) return null;

    const fromPathname = (pathname: string, searchParams: URLSearchParams): ReferenceImageLocator | null => {
      const publicObjectMatch = pathname.match(/\/api\/v1\/media\/public\/object\/([^/?#]+)/);
      if (publicObjectMatch?.[1]) {
        return { kind: 'media-object', objectId: decodeURIComponent(publicObjectMatch[1]) };
      }
      const objectMatch = pathname.match(/\/api\/v1\/media\/object\/([^/?#]+)/);
      if (objectMatch?.[1]) {
        return { kind: 'media-object', objectId: decodeURIComponent(objectMatch[1]) };
      }
      if (pathname.endsWith('/api/v1/media/asset') || pathname.endsWith('/media/asset')) {
        const bucket = searchParams.get('bucket') || '';
        const key = searchParams.get('key') || '';
        if (bucket && key) return { kind: 'media-asset', bucket, key };
      }
      return null;
    };

    if (c.startsWith('/api/v1/media/') || c.startsWith('/media/')) {
      try {
        const parsed = new URL(c, 'http://local');
        return fromPathname(parsed.pathname, parsed.searchParams);
      } catch {
        return null;
      }
    }

    try {
      const parsed = new URL(c);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        const media = fromPathname(parsed.pathname, parsed.searchParams);
        if (media) return media;
        return { kind: 'http', url: c };
      }
    } catch {
      // ignore
    }

    return null;
  }

  /** 可作为参考图定位符：http(s)、Gateway 代理路径或 base64 */
  export function isReferenceImageLocator(content: string): boolean {
    return isBase64(content) || parseReferenceImageLocator(content) !== null;
  }

  /** 落库 sanitize 后的占位文案，不可参与 merge / 生图 */
  export function isSanitizedReferencePlaceholder(content: string): boolean {
    const s = content.trim();
    return s.startsWith('[Base64数据已过滤') || s === '[base64 filtered]' || s === '[filtered]';
  }

  /** 可作为参考图传入生图链路（URL、Gateway 代理路径或有效 base64，排除 sanitize 占位） */
  export function isUsableReferenceImageContent(content: unknown): boolean {
    if (typeof content !== 'string' || !content.trim()) return false;
    const c = content.trim();
    if (isSanitizedReferencePlaceholder(c)) return false;
    return isReferenceImageLocator(c);
  }

  /**
   * 将参考图定位符解析为二进制（Worker 内直连 MinIO，无需 HTTP 鉴权头）
   */
  export async function downloadReferenceImageBuffer(
    content: string,
    userId?: string
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const c = content.trim();
    if (isBase64(c)) {
      const b64 = extractBase64FromDataUri(c);
      const buffer = Buffer.from(b64, 'base64');
      const contentType = c.startsWith('data:image/')
        ? c.substring(5, c.indexOf(';'))
        : 'image/jpeg';
      return { buffer, contentType, filename: 'reference.jpg' };
    }

    const loc = parseReferenceImageLocator(c);
    if (!loc) {
      throw new Error(`无法识别的参考图格式: ${c.substring(0, 80)}`);
    }

    const { RepositoryFactory } = await import('@mxmai/mxmdata');

    if (loc.kind === 'media-object') {
      const repo = RepositoryFactory.createStorageObjectRepository();
      const record = userId
        ? await repo.findByIdForUser(loc.objectId, userId)
        : await repo.findById(loc.objectId);
      if (!record) {
        throw new Error(
          `参考图不可用（storage object 不存在或已清理: ${loc.objectId}）。` +
            `临时文件约 7 天有效，且在其他任务结束后可能被清理；请重新上传或从资产库选择。`
        );
      }
      if (record.domain !== 'user_upload') {
        throw new Error(`storage object 无权作为用户参考图: ${loc.objectId}`);
      }
      const storageRepo = RepositoryFactory.createStorageRepository('user_upload');
      const bufAny = await storageRepo.downloadFile(record.bucket, record.object_key);
      const meta = await storageRepo.getFileMetadata(record.bucket, record.object_key);
      const key = record.object_key;
      const contentType =
        meta?.contentType || record.content_type || guessContentTypeFromKey(key);
      const buffer = Buffer.isBuffer(bufAny) ? bufAny : Buffer.from(bufAny as ArrayBuffer);
      return {
        buffer,
        contentType,
        filename: key.split('/').pop() || 'reference.jpg',
      };
    }

    if (loc.kind === 'media-asset') {
      if (!userId) {
        throw new Error('解析 media asset 参考图需要 userId');
      }
      const allowed =
        loc.key.startsWith(`${userId}/upload/`) ||
        loc.key.startsWith(`upload/${userId}/`) ||
        loc.key.startsWith(`upload/temp/${userId}/`) ||
        loc.key.startsWith(`temp/${userId}/`) ||
        loc.key.startsWith(`knowledge/${userId}/`);
      if (!allowed) {
        throw new Error(`media asset key 不属于当前用户: ${loc.key}`);
      }
      const storageRepo = RepositoryFactory.createStorageRepository('user_upload');
      const bufAny = await storageRepo.downloadFile(loc.bucket, loc.key);
      const meta = await storageRepo.getFileMetadata(loc.bucket, loc.key);
      const contentType = meta?.contentType || guessContentTypeFromKey(loc.key);
      const buffer = Buffer.isBuffer(bufAny) ? bufAny : Buffer.from(bufAny as ArrayBuffer);
      return {
        buffer,
        contentType,
        filename: loc.key.split('/').pop() || 'reference.jpg',
      };
    }

    const hit = parseReferenceImageLocator(loc.url);
    if (hit && hit.kind !== 'http') {
      return downloadReferenceImageBuffer(loc.url, userId);
    }

    const resp = await fetch(loc.url);
    if (!resp.ok) {
      throw new Error(`下载参考图失败: ${resp.status} ${resp.statusText}`);
    }
    const contentType = resp.headers.get('content-type') || 'image/jpeg';
    const ab = await resp.arrayBuffer();
    return {
      buffer: Buffer.from(ab),
      contentType,
      filename: 'reference.jpg',
    };
  }

  /** 将任意可用参考图定位符转为 data URI（供 Deer/OpenRouter 等 provider） */
  export async function referenceImageContentToDataUri(
    content: string,
    userId?: string
  ): Promise<string> {
    if (isBase64(content)) {
      return content.startsWith('data:') ? content : `data:image/jpeg;base64,${extractBase64FromDataUri(content)}`;
    }
    const { buffer, contentType } = await downloadReferenceImageBuffer(content, userId);
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  }

  /**
   * Worker 生图前：将 storage object / 内网代理路径参考图下载为 data URI，
   * 避免 deferred 前置管线耗时期间临时文件过期或被清理。
   */
  export async function hydrateReferenceImageParamsInPlace(
    params: Record<string, unknown>,
    userId: string,
    formSchema?: { properties?: Record<string, unknown> }
  ): Promise<void> {
    const fieldKeys = new Set<string>();
    if (Array.isArray(params.referenceImage)) fieldKeys.add('referenceImage');

    const props = formSchema?.properties ?? {};
    for (const [key, sch] of Object.entries(props)) {
      if (sch && typeof sch === 'object' && !Array.isArray(sch) && (sch as Record<string, unknown>)['x-ui-type'] === 'referenceImages') {
        fieldKeys.add(key);
      }
    }

    if (fieldKeys.size <= (params.referenceImage ? 1 : 0)) {
      for (const [key, val] of Object.entries(params)) {
        if (!Array.isArray(val) || val.length === 0) continue;
        const first = val[0];
        if (first && typeof first === 'object' && 'content' in (first as object)) {
          fieldKeys.add(key);
        }
      }
    }

    for (const key of fieldKeys) {
      const arr = params[key];
      if (!Array.isArray(arr)) continue;
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        if (!item || typeof item !== 'object') continue;
        const content = (item as { content?: unknown }).content;
        if (!isUsableReferenceImageContent(content)) continue;
        const str = String(content).trim();
        if (isBase64(str)) continue;
        const loc = parseReferenceImageLocator(str);
        if (!loc) continue;
        if (loc.kind === 'http') continue;
        (item as { content: string }).content = await referenceImageContentToDataUri(str, userId);
      }
    }
  }
  
  /**
   * 从 data URI 中提取 base64 数据
   */
  export function extractBase64FromDataUri(dataUri: string): string {
    if (dataUri.startsWith('data:image/')) {
      const base64Index = dataUri.indexOf('base64,');
      if (base64Index !== -1) {
        return dataUri.substring(base64Index + 7);
      }
    }
    return dataUri;
  }
  
  /**
   * 处理参考图数组，转换为模型可接受的格式
   * @param referenceImages 参考图数组
   * @param modelName 模型名称 ('nano-banana' | 'nano-banana-pro' | 'nano-banana-2' | 'nano-banana-2-pro' | 'seedream-4' | 'seedream-5')
   * @returns 处理后的图片数组（URL 或 base64）
   */
  export function processReferenceImages(
    referenceImages: ReferenceImage[],
    modelName: 'nano-banana' | 'nano-banana-pro' | 'nano-banana-2' | 'nano-banana-2-pro' | 'seedream-4' | 'seedream-5'
  ): { urls: string[]; base64s: string[] } {
    const urls: string[] = [];
    const base64s: string[] = [];
  
    for (const ref of referenceImages) {
      if (isUrl(ref.content) || parseReferenceImageLocator(ref.content)) {
        urls.push(ref.content);
      } else if (isBase64(ref.content)) {
        // 提取纯 base64 数据（去除 data URI 前缀）
        const base64Data = extractBase64FromDataUri(ref.content);
        base64s.push(base64Data);
      } else {
        console.warn(`[ReferenceImage] 无法识别的图片格式: ${ref.content.substring(0, 50)}...`);
      }
    }
  
    return { urls, base64s };
  }
  
  /**
   * 将旧的参考图格式（string | string[]）转换为新的格式（ReferenceImage[]）
   * @param oldFormat 旧的参考图格式
   * @param defaultType 默认类型（如果无法确定类型）
   * @returns 新的参考图数组格式
   */
  export function convertLegacyReferenceImage(
    oldFormat: string | string[] | undefined,
    defaultType: ReferenceImageType = 'main-subject'
  ): ReferenceImage[] {
    if (!oldFormat) {
      return [];
    }
  
    const images = Array.isArray(oldFormat) ? oldFormat : [oldFormat];
    return images.map(content => ({
      content,
      type: defaultType,
    }));
  }
  
  /**
   * 清理参考图中的 base64 数据，只保留元信息
   * 用于在保存到 task 或返回给用户时减少数据大小
   * @param referenceImages 参考图数组
   * @returns 清理后的参考图数组（只包含元信息）
   */
  export function sanitizeReferenceImagesForStorage(
    referenceImages: ReferenceImage[]
  ): Array<{ type: ReferenceImageType; content?: string; metadata?: { size?: number; format?: string; isBase64?: boolean; isUrl?: boolean } }> {
    return referenceImages.map((ref: any) => {
      const sanitized: any = {
        type: ref.type,
      };

      // 落库/返回前须保留槽位语义，否则「查看数据」里 referenceImage 只剩 type+URL，丢失 groupKey 与服饰/模特区分
      const copyStr = (k: string) => {
        const v = ref[k];
        if (typeof v === 'string' && v.trim()) sanitized[k] = v.trim();
      };
      copyStr('groupKey');
      copyStr('groupTitle');
      copyStr('groupDesc');
      copyStr('purpose');
  
      if (isUrl(ref.content) || parseReferenceImageLocator(ref.content)) {
        // URL / Gateway 代理路径可以保留
        sanitized.content = ref.content;
        sanitized.metadata = {
          isUrl: true,
        };
      } else if (isBase64(ref.content)) {
        // Base64 只保留元信息
        sanitized.metadata = {
          isBase64: true,
          size: ref.content.length,
          format: ref.content.startsWith('data:image/') 
            ? ref.content.substring(5, ref.content.indexOf(';')) 
            : 'unknown',
        };
        // 不包含 content，只显示占位符
        sanitized.content = '[Base64数据已过滤，大小: ' + (ref.content.length / 1024).toFixed(2) + ' KB]';
      } else {
        // 其他格式保留原样
        sanitized.content = ref.content;
      }
  
      return sanitized;
    });
  }
  
  /**
   * 清理任意对象中的 base64 数据（递归处理）
   * 用于清理 requestParams 中的 base64 数据
   */
  function isReferenceImagesSlotArray(value: unknown): boolean {
    if (!Array.isArray(value) || value.length === 0) return false;
    const first = value[0];
    return !!first && typeof first === 'object' && 'content' in (first as object);
  }

  export function sanitizeBase64InObject(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
  
    if (typeof obj === 'string') {
      // 如果是 base64 字符串，替换为占位符
      if (isBase64(obj)) {
        return '[Base64数据已过滤，大小: ' + (obj.length / 1024).toFixed(2) + ' KB]';
      }
      return obj;
    }
  
    if (Array.isArray(obj)) {
      return obj.map(item => sanitizeBase64InObject(item));
    }
  
    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        if (
          (key === 'referenceImage' || isReferenceImagesSlotArray(obj[key])) &&
          Array.isArray(obj[key])
        ) {
          sanitized[key] = sanitizeReferenceImagesForStorage(obj[key] as ReferenceImage[]);
        } else {
          sanitized[key] = sanitizeBase64InObject(obj[key]);
        }
      }
      return sanitized;
    }
  
    return obj;
  }
  