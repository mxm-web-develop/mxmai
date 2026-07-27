import sharp from 'sharp';
import { GRID_PIXEL_DHASH_HAMMING_MIN_DISTINCT } from './grid-config';
import type { GridPixelQaResult } from './types';

/** 8x8 dHash（64 bit） */
export async function computeDHash(imageBuffer: Buffer): Promise<bigint> {
  const size = 9;
  const gray = await sharp(imageBuffer)
    .resize(size, size, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer();

  let hash = 0n;
  let bit = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = gray[y * size + x];
      const right = gray[y * size + x + 1];
      if (left > right) {
        hash |= 1n << bit;
      }
      bit++;
    }
  }
  return hash;
}

export function hammingDistance(a: bigint, b: bigint): number {
  let x = a ^ b;
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

async function loadImageBuffer(input: string | Buffer): Promise<Buffer> {
  if (Buffer.isBuffer(input)) return input;
  if (input.startsWith('data:')) {
    const m = input.match(/^data:image\/\w+;base64,(.+)$/);
    if (!m) throw new Error('Invalid data URL');
    return Buffer.from(m[1], 'base64');
  }
  const res = await fetch(input);
  if (!res.ok) throw new Error(`fetch image failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function evaluatePixelSimilarity(
  cellImages: Array<string | Buffer>
): Promise<GridPixelQaResult> {
  const hashes: bigint[] = [];
  for (const img of cellImages) {
    const buf = await loadImageBuffer(img);
    hashes.push(await computeDHash(buf));
  }

  const conflicts: GridPixelQaResult['conflicts'] = [];
  const minDistinct = GRID_PIXEL_DHASH_HAMMING_MIN_DISTINCT;

  for (let i = 0; i < hashes.length; i++) {
    for (let j = i + 1; j < hashes.length; j++) {
      const hamming = hammingDistance(hashes[i], hashes[j]);
      if (hamming < minDistinct) {
        conflicts.push({ i, j, hamming });
      }
    }
  }

  return {
    passed: conflicts.length === 0,
    conflicts,
    delivery: conflicts.length === 0 ? 'ok' : 'warning',
  };
}
