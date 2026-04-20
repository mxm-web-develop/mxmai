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
   * 可选：业务侧标记（GraphService 内部可能写入 subject/background），不影响提示词构建。
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
    if (isUrl(ref.content)) {
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
  return referenceImages.map(ref => {
    const sanitized: any = {
      type: ref.type,
    };

    if (isUrl(ref.content)) {
      // URL 可以保留
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
      if (key === 'referenceImage' && Array.isArray(obj[key])) {
        // 特殊处理 referenceImage 数组
        sanitized[key] = sanitizeReferenceImagesForStorage(obj[key] as ReferenceImage[]);
      } else {
        sanitized[key] = sanitizeBase64InObject(obj[key]);
      }
    }
    return sanitized;
  }

  return obj;
}
