/**
 * HTTP Range 解析 + 对象存储流式响应（支持 206 Partial Content）
 */
import type { Request, Response } from 'express';
import type { IStorageRepository } from '@mxmai/mxmdata';
import { NotFoundError } from '@mxmai/mxmdata';

export interface ByteRange {
  start: number;
  end: number;
}

export type ParsedRange = ByteRange | null | 'unsatisfiable';

/** 解析首个 bytes= 范围；null 表示全量 */
export function parseRangeHeader(rangeHeader: string | undefined, totalSize: number): ParsedRange {
  if (!rangeHeader?.startsWith('bytes=')) return null;
  const spec = rangeHeader.slice(6).trim().split(',')[0]?.trim() ?? '';
  const m = spec.match(/^(\d*)-(\d*)$/);
  if (!m || totalSize <= 0) return 'unsatisfiable';

  const rawStart = m[1];
  const rawEnd = m[2];
  let start: number;
  let end: number;

  if (rawStart === '' && rawEnd !== '') {
    const suffixLen = parseInt(rawEnd, 10);
    if (!Number.isFinite(suffixLen) || suffixLen <= 0) return 'unsatisfiable';
    start = Math.max(0, totalSize - suffixLen);
    end = totalSize - 1;
  } else {
    start = rawStart === '' ? 0 : parseInt(rawStart, 10);
    end = rawEnd === '' ? totalSize - 1 : parseInt(rawEnd, 10);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= totalSize) {
    return 'unsatisfiable';
  }
  end = Math.min(end, totalSize - 1);
  return { start, end };
}

export function inferMediaContentType(key: string, fallbackContentType?: string): string {
  if (fallbackContentType && fallbackContentType !== 'application/octet-stream') {
    return fallbackContentType;
  }
  const lower = key.toLowerCase();
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.flac')) return 'audio/flac';
  if (lower.endsWith('.pcm')) return 'audio/pcm';
  if (lower.endsWith('.m4a') || lower.endsWith('.aac')) return 'audio/mp4';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.avi')) return 'video/x-msvideo';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return fallbackContentType || 'application/octet-stream';
}

function pipeStreamToResponse(res: Response, stream: NodeJS.ReadableStream): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.on('error', reject);
    res.on('close', () => {
      if (!res.writableEnded) {
        if ('destroy' in stream && typeof stream.destroy === 'function') {
          stream.destroy();
        }
      }
    });
    stream.pipe(res);
    stream.on('end', resolve);
  });
}

/** 从 MinIO/S3 按 Range 流式输出 */
export async function streamStorageObjectToResponse(
  req: Request,
  res: Response,
  storageRepo: IStorageRepository,
  bucket: string,
  key: string,
  contentTypeHint?: string,
  options?: { contentDisposition?: string }
): Promise<void> {
  const meta = await storageRepo.getFileMetadata(bucket, key);
  if (!meta) {
    throw new NotFoundError('File', key);
  }

  const total = meta.size;
  const parsed = parseRangeHeader(typeof req.headers.range === 'string' ? req.headers.range : undefined, total);
  const contentType = inferMediaContentType(key, contentTypeHint || meta.contentType);

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  if (options?.contentDisposition) {
    res.setHeader('Content-Disposition', options.contentDisposition);
  }

  if (parsed === 'unsatisfiable') {
    res.status(416);
    res.setHeader('Content-Range', `bytes */${total}`);
    res.end();
    return;
  }

  if (!parsed) {
    res.status(200);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(total));
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = await storageRepo.openReadStream(bucket, key);
    await pipeStreamToResponse(res, stream);
    return;
  }

  const { start, end } = parsed;
  const chunkSize = end - start + 1;
  res.status(206);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', String(chunkSize));
  res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = await storageRepo.openReadStream(bucket, key, { start, end });
  await pipeStreamToResponse(res, stream);
}

/** 上游 http(s) 媒体：转发 Range，流式 pipe（避免整文件 buffer） */
export async function streamHttpMediaToResponse(
  req: Request,
  res: Response,
  url: string,
  ctx: { taskId: string; reason: string },
  options?: { defaultContentType?: string; timeoutMs?: number }
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 120_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : undefined;
    const upstream = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: rangeHeader ? { Range: rangeHeader } : undefined,
    });

    if (!upstream.ok && upstream.status !== 206) {
      throw new Error(`upstream HTTP ${upstream.status}`);
    }

    const contentType =
      upstream.headers.get('content-type') ||
      options?.defaultContentType ||
      inferMediaContentType(url);

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Type', contentType);

    const contentRange = upstream.headers.get('content-range');
    const contentLength = upstream.headers.get('content-length');
    if (contentRange) res.setHeader('Content-Range', contentRange);
    if (contentLength) res.setHeader('Content-Length', contentLength);

    res.status(upstream.status === 206 ? 206 : 200);

    if (!upstream.body) {
      res.end();
      return;
    }

    const { Readable } = await import('stream');
    const nodeStream = Readable.fromWeb(upstream.body as import('stream/web').ReadableStream);
    await pipeStreamToResponse(res, nodeStream);
  } catch (error) {
    console.error('[Media Route] streamHttpMediaToResponse failed', {
      taskId: ctx.taskId,
      reason: ctx.reason,
      url: url.slice(0, 120),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
