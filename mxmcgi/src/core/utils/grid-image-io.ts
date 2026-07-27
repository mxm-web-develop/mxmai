/**
 * 宫格图像 I/O 工具
 */

import { isSanitizedReferencePlaceholder } from '../../task/reference-image';

export async function loadImageBuffer(imageInput: string | Buffer): Promise<Buffer> {
  if (Buffer.isBuffer(imageInput)) return imageInput;

  if (typeof imageInput === 'string' && isSanitizedReferencePlaceholder(imageInput)) {
    throw new Error('宫格源图不可用（任务参数中的图片数据已被过滤），请重新上传后提交');
  }

  if (imageInput.startsWith('data:')) {
    const base64Match = imageInput.match(/^data:image\/\w+;base64,(.+)$/);
    if (!base64Match) {
      throw new Error('Invalid base64 format. Expected data:image/xxx;base64,...');
    }
    return Buffer.from(base64Match[1], 'base64');
  }

  if (imageInput.startsWith('file://')) {
    const fs = await import('node:fs/promises');
    return fs.readFile(imageInput.slice('file://'.length));
  }

  if (imageInput.startsWith('/') || imageInput.startsWith('./')) {
    const fs = await import('node:fs/promises');
    return fs.readFile(imageInput);
  }

  const response = await fetch(imageInput);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}
