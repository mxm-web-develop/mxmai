/**
 * 九宫格图片切割工具
 * 将一张大图按 3x3 网格切割成 9 张独立图片
 */

import sharp from 'sharp';

export interface Grid9SplitResult {
  images: string[]; // base64 数组，9 张图片
  metadata: {
    originalSize: { width: number; height: number };
    cellSize: { width: number; height: number };
    format: string;
  };
}

/**
 * 将九宫格图片切割成 9 张独立图片
 * @param imageInput 图片 URL 或 base64 或 Buffer
 * @returns 切割后的 9 张图片（base64 格式）
 */
export async function splitGrid9Image(
  imageInput: string | Buffer
): Promise<Grid9SplitResult> {
  // 1. 加载图片
  let imageBuffer: Buffer;
  if (typeof imageInput === 'string') {
    if (imageInput.startsWith('data:')) {
      // Base64
      const base64Match = imageInput.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!base64Match) {
        throw new Error('Invalid base64 format. Expected data:image/xxx;base64,...');
      }
      const base64Data = base64Match[2];
      imageBuffer = Buffer.from(base64Data, 'base64');
    } else {
      // URL - 需要下载
      try {
        const response = await fetch(imageInput);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuffer);
      } catch (error) {
        throw new Error(`Failed to download image from URL: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } else {
    imageBuffer = imageInput;
  }

  // 2. 获取图片元数据
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(imageBuffer).metadata();
  } catch (error) {
    throw new Error(`Failed to read image metadata: ${error instanceof Error ? error.message : String(error)}`);
  }

  const { width, height, format } = metadata;
  
  if (!width || !height) {
    throw new Error('无法获取图片尺寸');
  }

  // 3. 计算每个格子的尺寸（优化：使用精确算法，确保无间隙无重叠）
  // 策略：均匀分配像素，余数分配给前面的格子
  const baseCellWidth = Math.floor(width / 3);
  const baseCellHeight = Math.floor(height / 3);
  const widthRemainder = width % 3;
  const heightRemainder = height % 3;
  
  // 计算每个格子的实际宽度和高度（余数分配给前面的格子）
  const getCellWidth = (col: number): number => {
    return baseCellWidth + (col < widthRemainder ? 1 : 0);
  };
  
  const getCellHeight = (row: number): number => {
    return baseCellHeight + (row < heightRemainder ? 1 : 0);
  };
  
  // 计算每个格子的起始位置
  const getCellLeft = (col: number): number => {
    let left = 0;
    for (let i = 0; i < col; i++) {
      left += getCellWidth(i);
    }
    return left;
  };
  
  const getCellTop = (row: number): number => {
    let top = 0;
    for (let i = 0; i < row; i++) {
      top += getCellHeight(i);
    }
    return top;
  };

  // 4. 切割 9 个格子
  const images: string[] = [];
  
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const left = getCellLeft(col);
      const top = getCellTop(row);
      const extractWidth = getCellWidth(col);
      const extractHeight = getCellHeight(row);
      
      // 验证：确保不超出边界
      if (left + extractWidth > width || top + extractHeight > height) {
        console.warn(`[Grid9Splitter] 警告：格子 (${row}, ${col}) 超出边界，调整尺寸`);
      }
      
      // 确保不超出图片边界
      const finalLeft = Math.max(0, Math.min(left, width - 1));
      const finalTop = Math.max(0, Math.min(top, height - 1));
      const finalWidth = Math.min(extractWidth, width - finalLeft);
      const finalHeight = Math.min(extractHeight, height - finalTop);
      
      try {
        // 使用 sharp 裁剪
        // 优化：确保精确裁剪，避免插值导致的边界模糊
        const cellBuffer = await sharp(imageBuffer)
          .extract({
            left: finalLeft,
            top: finalTop,
            width: finalWidth,
            height: finalHeight,
          })
          // 确保输出格式和质量（避免压缩导致的边界问题）
          .toFormat(format === 'png' ? 'png' : 'jpeg', {
            quality: format === 'png' ? undefined : 95,
            mozjpeg: format === 'jpeg',
          })
          .toBuffer();
        
        // 转换为 base64
        const base64 = cellBuffer.toString('base64');
        const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
        images.push(`data:${mimeType};base64,${base64}`);
      } catch (error) {
        throw new Error(`Failed to extract cell at row ${row + 1}, col ${col + 1}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return {
    images,
    metadata: {
      originalSize: { width, height },
      cellSize: { width: baseCellWidth, height: baseCellHeight },
      format: format || 'unknown',
    },
  };
}
