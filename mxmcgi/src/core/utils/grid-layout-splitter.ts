/**
 * 将一张大图按 N×N 网格切割（支持均匀切分或按 seam 边界切分）
 */

import sharp from 'sharp';
import { loadImageBuffer } from './grid-image-io';
import type { GridSeamBounds } from './grid-layout-analyzer';

export interface GridLayoutSplitResult {
  images: string[];
  metadata: {
    gridN: number;
    originalSize: { width: number; height: number };
    cellSize: { width: number; height: number };
    format: string;
    splitMode: 'equal' | 'seams';
  };
}

export interface SplitGridLayoutOptions {
  /** 按分析得到的行列边界裁切；未提供则均匀切分 */
  seamBounds?: GridSeamBounds | null;
  /** 裁切后内缩比例，减少白缝残留 */
  trimInsetRatio?: number;
  trimInsetMinPx?: number;
}

async function trimCellBuffer(
  cellBuffer: Buffer,
  format: string | undefined,
  insetRatio: number,
  insetMinPx: number,
): Promise<Buffer> {
  const meta = await sharp(cellBuffer).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w < 8 || h < 8) return cellBuffer;

  const insetX = Math.max(insetMinPx, Math.floor(w * insetRatio));
  const insetY = Math.max(insetMinPx, Math.floor(h * insetRatio));
  const left = Math.min(insetX, Math.floor(w / 4));
  const top = Math.min(insetY, Math.floor(h / 4));
  const width = w - left * 2;
  const height = h - top * 2;
  if (width < 4 || height < 4) return cellBuffer;

  return sharp(cellBuffer)
    .extract({ left, top, width, height })
    .toFormat(format === 'png' ? 'png' : 'jpeg', {
      quality: format === 'png' ? undefined : 95,
      mozjpeg: format === 'jpeg',
    })
    .toBuffer();
}

function getBounds(n: number, total: number): number[] {
  const bounds: number[] = [];
  for (let i = 0; i <= n; i++) {
    bounds.push(Math.round((total * i) / n));
  }
  return bounds;
}

/**
 * @param gridN 每边格数（1=不切分，2=四宫格，3=九宫格，4=十六宫格）
 */
export async function splitGridLayoutImage(
  imageInput: string | Buffer,
  gridN: number,
  options?: SplitGridLayoutOptions,
): Promise<GridLayoutSplitResult> {
  const n = Math.max(1, Math.min(16, Math.floor(Number(gridN)) || 1));
  const trimRatio = options?.trimInsetRatio ?? 0.012;
  const trimMinPx = options?.trimInsetMinPx ?? 2;

  const imageBuffer = await loadImageBuffer(imageInput);

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(imageBuffer).metadata();
  } catch (error) {
    throw new Error(
      `Failed to read image metadata: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const { width, height, format } = metadata;
  if (!width || !height) {
    throw new Error('无法获取图片尺寸');
  }

  if (n === 1) {
    const outBuf = await sharp(imageBuffer)
      .toFormat(format === 'png' ? 'png' : 'jpeg', {
        quality: format === 'png' ? undefined : 95,
        mozjpeg: format === 'jpeg',
      })
      .toBuffer();
    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
    return {
      images: [`data:${mimeType};base64,${outBuf.toString('base64')}`],
      metadata: {
        gridN: 1,
        originalSize: { width, height },
        cellSize: { width, height },
        format: format || 'unknown',
        splitMode: 'equal',
      },
    };
  }

  const seamBounds = options?.seamBounds;
  const useSeams =
    seamBounds &&
    seamBounds.columns.starts.length === n &&
    seamBounds.rows.starts.length === n;

  const colStarts = useSeams ? seamBounds!.columns.starts : getBounds(n, width).slice(0, n);
  const colSizes = useSeams
    ? seamBounds!.columns.sizes
    : colStarts.map((left, i) => {
        const right = getBounds(n, width)[i + 1];
        return Math.max(1, right - left);
      });
  const rowStarts = useSeams ? seamBounds!.rows.starts : getBounds(n, height).slice(0, n);
  const rowSizes = useSeams
    ? seamBounds!.rows.sizes
    : rowStarts.map((top, i) => {
        const bottom = getBounds(n, height)[i + 1];
        return Math.max(1, bottom - top);
      });
  const splitMode = useSeams ? 'seams' : 'equal';

  const images: string[] = [];
  let sampleCellW = 0;
  let sampleCellH = 0;

  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const left = colStarts[col];
      const top = rowStarts[row];
      const extractWidth = Math.max(1, colSizes[col]);
      const extractHeight = Math.max(1, rowSizes[row]);

      const finalLeft = Math.max(0, Math.min(left, width - 1));
      const finalTop = Math.max(0, Math.min(top, height - 1));
      const finalWidth = Math.min(extractWidth, width - finalLeft);
      const finalHeight = Math.min(extractHeight, height - finalTop);

      if (row === 0 && col === 0) {
        sampleCellW = finalWidth;
        sampleCellH = finalHeight;
      }

      let cellBuffer = await sharp(imageBuffer)
        .extract({
          left: finalLeft,
          top: finalTop,
          width: finalWidth,
          height: finalHeight,
        })
        .toBuffer();

      if (splitMode === 'seams' || trimRatio > 0) {
        cellBuffer = await trimCellBuffer(cellBuffer, format, trimRatio, trimMinPx);
      }

      cellBuffer = await sharp(cellBuffer)
        .toFormat(format === 'png' ? 'png' : 'jpeg', {
          quality: format === 'png' ? undefined : 95,
          mozjpeg: format === 'jpeg',
        })
        .toBuffer();

      const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
      images.push(`data:${mimeType};base64,${cellBuffer.toString('base64')}`);
    }
  }

  return {
    images,
    metadata: {
      gridN: n,
      originalSize: { width, height },
      cellSize: { width: sampleCellW, height: sampleCellH },
      format: format || 'unknown',
      splitMode,
    },
  };
}
