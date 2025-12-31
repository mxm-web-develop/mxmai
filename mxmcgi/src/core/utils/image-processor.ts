/**
 * 图片处理工具
 * 用于调整图片尺寸和压缩，确保与视频分辨率匹配
 */

/**
 * 处理参考图片：调整尺寸以匹配视频分辨率，并压缩
 * @param inputReference base64 格式的图片字符串
 * @param targetSize 目标视频分辨率，如 "720x1280"
 * @returns 处理后的 base64 图片字符串和处理信息
 */
export async function processReferenceImage(
  inputReference: string,
  targetSize: string
): Promise<{
  base64: string;
  originalSize?: string;
  targetSize: string;
  resized: boolean;
  compressed: boolean;
  originalSizeKB: number;
  finalSizeKB: number;
}> {
  if (!inputReference || typeof inputReference !== 'string') {
    throw new Error('input_reference 必须是 base64 字符串');
  }

  // 解析 base64 数据
  const base64Match = inputReference.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!base64Match) {
    throw new Error('input_reference 格式错误，必须是 data:image/xxx;base64,... 格式');
  }

  const mimeType = base64Match[1]; // png, jpeg, etc.
  const base64Data = base64Match[2];
  const imageBuffer = Buffer.from(base64Data, 'base64');
  const originalSizeKB = imageBuffer.length / 1024;

  // 解析目标尺寸
  const [targetWidth, targetHeight] = targetSize.split('x').map(Number);
  if (!targetWidth || !targetHeight) {
    throw new Error(`targetSize 格式错误，应为 "WIDTHxHEIGHT"，如 "720x1280"`);
  }

  // 尝试使用 sharp 处理图片
  let sharp: any;
  try {
    sharp = require('sharp');
  } catch (error) {
    console.warn('[ImageProcessor] sharp 未安装，无法调整图片尺寸和压缩');
    console.warn('   建议安装: npm install sharp 或 pnpm add sharp');
    // 如果 sharp 未安装，返回原图
    return {
      base64: inputReference,
      targetSize,
      resized: false,
      compressed: false,
      originalSizeKB,
      finalSizeKB: originalSizeKB,
    };
  }

  try {
    // 获取原始图片尺寸
    const metadata = await sharp(imageBuffer).metadata();
    const originalSize = `${metadata.width}x${metadata.height}`;

    // 根据原始格式选择压缩方式
    let sharpInstance = sharp(imageBuffer);
    const isPng = mimeType === 'png';
    const isJpeg = mimeType === 'jpeg' || mimeType === 'jpg';

    // 检查尺寸是否匹配
    if (metadata.width === targetWidth && metadata.height === targetHeight) {
      // 尺寸已匹配，只进行压缩
      if (isPng) {
        sharpInstance = sharpInstance.png({ quality: 85, compressionLevel: 9 });
      } else if (isJpeg) {
        sharpInstance = sharpInstance.jpeg({ quality: 85, mozjpeg: true });
      } else {
        // 其他格式，转换为 JPEG（更小的文件大小）
        sharpInstance = sharpInstance.jpeg({ quality: 85, mozjpeg: true });
      }

      const compressedBuffer = await sharpInstance.toBuffer();
      const finalSizeKB = compressedBuffer.length / 1024;
      const compressedBase64 = compressedBuffer.toString('base64');
      const finalMimeType = isPng ? 'png' : 'jpeg';
      const finalBase64 = `data:image/${finalMimeType};base64,${compressedBase64}`;

      console.log(
        `[ImageProcessor] 图片尺寸已匹配 (${originalSize})，仅压缩: ${originalSizeKB.toFixed(2)} KB → ${finalSizeKB.toFixed(2)} KB`
      );

      return {
        base64: finalBase64,
        originalSize,
        targetSize,
        resized: false,
        compressed: true,
        originalSizeKB,
        finalSizeKB,
      };
    }

    // 尺寸不匹配，需要调整尺寸并压缩
    console.log(
      `[ImageProcessor] 图片尺寸不匹配: ${originalSize} ≠ ${targetSize}，正在调整并压缩...`
    );

    sharpInstance = sharp(imageBuffer).resize(targetWidth, targetHeight, {
      fit: 'cover', // 保持宽高比，裁剪多余部分
      position: 'center', // 居中裁剪
    });

    // 根据原始格式选择压缩方式
    if (isPng) {
      sharpInstance = sharpInstance.png({ quality: 85, compressionLevel: 9 });
    } else if (isJpeg) {
      sharpInstance = sharpInstance.jpeg({ quality: 85, mozjpeg: true });
    } else {
      // 其他格式，转换为 JPEG（更小的文件大小）
      sharpInstance = sharpInstance.jpeg({ quality: 85, mozjpeg: true });
    }

    const resizedBuffer = await sharpInstance.toBuffer();

    const finalSizeKB = resizedBuffer.length / 1024;
    const resizedBase64 = resizedBuffer.toString('base64');
    const finalMimeType = isPng ? 'png' : 'jpeg';
    const finalBase64 = `data:image/${finalMimeType};base64,${resizedBase64}`;

    console.log(
      `[ImageProcessor] 图片已调整并压缩: ${originalSize} → ${targetSize}, ${originalSizeKB.toFixed(2)} KB → ${finalSizeKB.toFixed(2)} KB`
    );

    return {
      base64: finalBase64,
      originalSize,
      targetSize,
      resized: true,
      compressed: true,
      originalSizeKB,
      finalSizeKB,
    };
  } catch (error) {
    console.error(`[ImageProcessor] 处理图片失败:`, error);
    console.warn('[ImageProcessor] 将使用原图，但参考图可能不会生效（尺寸不匹配）');
    
    // 处理失败，返回原图
    return {
      base64: inputReference,
      targetSize,
      resized: false,
      compressed: false,
      originalSizeKB,
      finalSizeKB: originalSizeKB,
    };
  }
}
