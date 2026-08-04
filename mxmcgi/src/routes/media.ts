import type { Request, Response } from 'express';
import { Router } from 'express';
import { taskManager } from '../task/task-manager';
import { RepositoryFactory, isUserUploadPublicAccessEnabled, loadStorageConfig, type StorageDomain } from '@mxmai/mxmdata';
import { canUserAccessTask, canPartnerAccessStorageMetadata } from '../open-api/task-access';
import { getPartnerContext } from '../open-api/authz';
import type { StorageObjectRecord } from '@mxmai/mxmdata';
import { createImagePreviewBuffer, parsePreviewMaxEdge } from '../core/media/image-preview';
import {
  streamHttpMediaToResponse,
  streamStorageObjectToResponse,
} from '../core/media/http-range-stream';

import {
  fetchSubtitleJsonFromUrl,
  loadPersistedSubtitlePayload,
  persistTtsSubtitleInResult,
  pickSubtitleFileUrl,
} from '../task/tts-subtitle-persist';
import { parseReferenceImageLocator } from '../task/reference-image';

const router = Router();

function taskAccessOpts(req: Request): { partnerEndUserId?: string } | undefined {
  const partner = getPartnerContext(req);
  return partner ? { partnerEndUserId: partner.endUserId } : undefined;
}

const REMOTE_IMAGE_FETCH_MAX_BYTES = 48 * 1024 * 1024;
const REMOTE_IMAGE_FETCH_TIMEOUT_MS = 45_000;
const REMOTE_AUDIO_FETCH_TIMEOUT_MS = 120_000;

function resolveStorageDomainForBucket(bucket: string): StorageDomain {
  const domains = loadStorageConfig().domains;
  const order: StorageDomain[] = ['generated', 'user_upload', 'system_static'];
  for (const domain of order) {
    if (domains[domain].bucket === bucket) return domain;
  }
  return 'generated';
}

/** ?download=1 → 触发浏览器另存为，避免前端整文件进内存 */
function wantsAttachmentDownload(req: Request): boolean {
  const q = req.query.download ?? req.query.attachment;
  return q === '1' || q === 'true' || q === 'yes';
}

function buildAttachmentDisposition(filename: string): string {
  const safe = filename.replace(/[^\w.\u4e00-\u9fff-]+/g, '_');
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function attachmentOptsForKey(req: Request, taskId: string, key: string): { contentDisposition?: string } {
  if (!wantsAttachmentDownload(req)) return {};
  const base = key.split('/').pop() || `${taskId}.bin`;
  const filename = base.includes('.') ? base : `${taskId}-${base}`;
  return { contentDisposition: buildAttachmentDisposition(filename) };
}

function canUserAccessMediaAssetKey(userId: string, key: string): boolean {
  return (
    key.startsWith(`${userId}/upload/`) ||
    key.startsWith(`upload/${userId}/`) ||
    key.startsWith(`upload/temp/${userId}/`) ||
    key.startsWith(`temp/${userId}/`) ||
    key.startsWith(`knowledge/${userId}/`) ||
    key.startsWith(`${userId}/audio/`) ||
    key.startsWith(`${userId}/video-edit/`) ||
    (key.startsWith('gen/') && key.includes(`/${userId}/`))
  );
}

function guessAssetContentType(key: string, metadataType?: string | null): string {
  if (metadataType) return metadataType.split(';')[0].trim();
  const lower = key.toLowerCase();
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.flac')) return 'audio/flac';
  if (lower.endsWith('.aac')) return 'audio/aac';
  if (lower.endsWith('.mp4') || lower.endsWith('.m4v') || lower.endsWith('.webm')) {
    return lower.endsWith('.webm') ? 'video/webm' : 'video/mp4';
  }
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'application/octet-stream';
}

function pickFirstHttpMediaUrl(task: {
  result?: { mediaUrls?: unknown; storageInfo?: { urls?: unknown } };
}): string | null {
  const storageUrls = task.result?.storageInfo?.urls;
  if (Array.isArray(storageUrls)) {
    const u = storageUrls.find((x) => typeof x === 'string' && /^https?:\/\//i.test(x.trim()));
    if (typeof u === 'string') return u.trim();
  }
  const mediaUrls = task.result?.mediaUrls;
  if (Array.isArray(mediaUrls)) {
    const u = mediaUrls.find((x) => typeof x === 'string' && /^https?:\/\//i.test(x.trim()));
    if (typeof u === 'string') return u.trim();
  }
  return null;
}

/** 相对 Gateway asset 路径 → MinIO bucket/key（多人语音成片等） */
function pickMediaAssetBucketKey(task: {
  result?: { mediaUrls?: unknown; storageInfo?: { urls?: unknown } };
}): { bucket: string; key: string } | null {
  const candidates: unknown[] = [];
  const storageUrls = task.result?.storageInfo?.urls;
  if (Array.isArray(storageUrls)) candidates.push(...storageUrls);
  const mediaUrls = task.result?.mediaUrls;
  if (Array.isArray(mediaUrls)) candidates.push(...mediaUrls);
  for (const raw of candidates) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const loc = parseReferenceImageLocator(raw.trim());
    if (loc?.kind === 'media-asset' && loc.bucket && loc.key) {
      return { bucket: loc.bucket, key: loc.key };
    }
  }
  return null;
}

async function streamHttpAudioToResponse(
  req: Request,
  res: Response,
  url: string,
  ctx: { taskId: string; reason: string }
): Promise<void> {
  await streamHttpMediaToResponse(req, res, url, ctx, {
    timeoutMs: REMOTE_AUDIO_FETCH_TIMEOUT_MS,
    defaultContentType: url.includes('.wav')
      ? 'audio/wav'
      : url.includes('.flac')
        ? 'audio/flac'
        : 'audio/mpeg',
  });
}

async function sendUserUploadObjectBytes(
  res: Response,
  record: StorageObjectRecord,
  cacheControl = 'public, max-age=86400'
): Promise<void> {
  const storageRepo = RepositoryFactory.createStorageRepository('user_upload');
  const fileBuffer = await storageRepo.downloadFile(record.bucket, record.object_key);
  const metadata = await storageRepo.getFileMetadata(record.bucket, record.object_key);
  const key = record.object_key;
  const contentType =
    metadata?.contentType ||
    record.content_type ||
    (key.endsWith('.png')
      ? 'image/png'
      : key.endsWith('.webp')
        ? 'image/webp'
        : key.endsWith('.gif')
          ? 'image/gif'
          : 'image/jpeg');

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', String(fileBuffer.length));
  res.setHeader('Cache-Control', cacheControl);
  res.send(fileBuffer);
}

/**
 * 前端通过 Gateway 使用 fetch(blob) 拉缩略图时不能 302 到内网 MinIO（HTTPS 页混合内容 / 浏览器不可达）。
 * 在 mxmcgi 内拉取 http(s) 图片再原样返回。
 */
function graphContentTypeFromKey(key: string, metadataType?: string | null): string {
  if (metadataType) return metadataType;
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.jpg') || key.endsWith('.jpeg')) return 'image/jpeg';
  if (key.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

async function sendGraphImageBytes(
  res: Response,
  fileBuffer: Buffer,
  req: Request,
  keyForType: string,
  metadataContentType?: string | null
): Promise<void> {
  const previewEdge = parsePreviewMaxEdge(req.query.preview ?? req.query.w);
  if (previewEdge) {
    try {
      const { buffer, contentType } = await createImagePreviewBuffer(fileBuffer, previewEdge);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', String(buffer.length));
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.send(buffer);
      return;
    } catch (previewError) {
      console.warn('[Media Route] graph preview resize failed, fallback to original', {
        previewEdge,
        error: previewError instanceof Error ? previewError.message : String(previewError),
      });
    }
  }

  const contentType = graphContentTypeFromKey(keyForType, metadataContentType);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', String(fileBuffer.length));
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(fileBuffer);
}

async function streamHttpImageToResponse(
  res: Response,
  imageUrl: string,
  logContext: Record<string, unknown>
): Promise<void> {
  let u: URL;
  try {
    u = new URL(imageUrl);
  } catch {
    throw new Error('invalid image URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('unsupported URL protocol');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_IMAGE_FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(imageUrl, { redirect: 'follow', signal: controller.signal });
    if (!r.ok) {
      throw new Error(`upstream HTTP ${r.status}`);
    }
    const ab = await r.arrayBuffer();
    if (ab.byteLength > REMOTE_IMAGE_FETCH_MAX_BYTES) {
      throw new Error('remote image exceeds size limit');
    }
    const buf = Buffer.from(ab);
    const rawCt = r.headers.get('content-type')?.split(';')[0]?.trim();
    const ct =
      rawCt && rawCt.startsWith('image/')
        ? rawCt
        : /\.png(\?|$)/i.test(imageUrl)
          ? 'image/png'
          : /\.webp(\?|$)/i.test(imageUrl)
            ? 'image/webp'
            : /\.(jpe?g|jpeg)(\?|$)/i.test(imageUrl)
              ? 'image/jpeg'
              : 'application/octet-stream';
    res.setHeader('Content-Type', ct);
    res.setHeader('Content-Length', String(buf.length));
    res.send(buf);
  } catch (e) {
    console.error('[Media Route] streamHttpImageToResponse failed', {
      ...logContext,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 通过 CGI Task ID 访问图片内容
 *
 * 路径示例：
 *   GET /media/graph/:taskId
 *
 * 访问约定：
 *   - Gateway 会在请求头中注入 x-user-id（已通过 JWT 认证）
 *   - 这里只做简单的“只能访问自己的任务”校验
 *   - 文件真实位置由 Task.result.storageInfo 中的 bucket + key 决定
 */
router.get('/graph/:taskId', async (req: Request, res: Response) => {
  try {
    const userId = (req.headers['x-user-id'] as string | undefined) || undefined;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
      });
    }

    const { taskId } = req.params;
    if (!taskId) {
      return res.status(400).json({
        success: false,
        error: 'Missing taskId',
      });
    }

    // 查询任务
    const { task } = await taskManager.getTask(taskId);

    // 权限：任务所有者或 Open API 第三方调用方（metadata.userId 为扣费账户）
    if (!canUserAccessTask(task, userId, taskAccessOpts(req))) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You can only access your own media',
      });
    }

    const storageInfo = task.result?.storageInfo;
    const mediaUrls = Array.isArray(task.result?.mediaUrls) ? task.result!.mediaUrls! : [];
    const albumItems = (() => {
      const meta = (task.result?.metadata ?? {}) as Record<string, unknown>;
      const raw = meta.albumResult as { items?: Array<{ imageUrl?: string; status?: string }> } | undefined;
      return Array.isArray(raw?.items) ? raw!.items! : [];
    })();

    const parseIndex = (): number => {
      const raw = req.query.index ?? req.query.i;
      const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : Array.isArray(raw) ? Number.parseInt(String(raw[0]), 10) : 0;
      return Number.isFinite(n) && n >= 0 ? n : 0;
    };
    const index = parseIndex();

    const pickHttpFallback = (): string | undefined => {
      const fromStorage =
        Array.isArray(storageInfo?.urls) && typeof storageInfo!.urls![index] === 'string'
          ? storageInfo!.urls![index]
          : undefined;
      if (fromStorage && /^https?:\/\//.test(fromStorage)) return fromStorage;
      const fromMedia = typeof mediaUrls[index] === 'string' ? mediaUrls[index] : undefined;
      if (fromMedia && /^https?:\/\//.test(fromMedia)) return fromMedia;
      const readyAlbum = albumItems.filter((it) => it?.status === 'ready' || !!it?.imageUrl);
      const fromAlbum = readyAlbum[index]?.imageUrl;
      if (typeof fromAlbum === 'string' && /^https?:\/\//.test(fromAlbum)) return fromAlbum;
      return undefined;
    };

    if (!storageInfo || !storageInfo.bucket || !storageInfo.keys || storageInfo.keys.length === 0) {
      const fallbackUrlEarly = pickHttpFallback();
      if (fallbackUrlEarly) {
        const previewEdge = parsePreviewMaxEdge(req.query.preview ?? req.query.w);
        if (previewEdge) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), REMOTE_IMAGE_FETCH_TIMEOUT_MS);
          try {
            const r = await fetch(fallbackUrlEarly, { redirect: 'follow', signal: controller.signal });
            if (!r.ok) throw new Error(`upstream HTTP ${r.status}`);
            const ab = await r.arrayBuffer();
            await sendGraphImageBytes(res, Buffer.from(ab), req, fallbackUrlEarly);
            return;
          } finally {
            clearTimeout(timer);
          }
        }
        await streamHttpImageToResponse(res, fallbackUrlEarly, { taskId, reason: 'no_storage_info_http_fallback' });
        return;
      }
      return res.status(404).json({
        success: false,
        error: 'No storage info for this task',
      });
    }

    const bucket = storageInfo.bucket;
    const key =
      (typeof storageInfo.keys[index] === 'string' && storageInfo.keys[index].trim()
        ? storageInfo.keys[index]
        : storageInfo.keys[0]) || '';

    const fallbackUrlEarly = pickHttpFallback();
    const previewEdge = parsePreviewMaxEdge(req.query.preview ?? req.query.w);

    if (!key || !String(key).trim()) {
      if (fallbackUrlEarly && /^https?:\/\//.test(fallbackUrlEarly)) {
        if (previewEdge) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), REMOTE_IMAGE_FETCH_TIMEOUT_MS);
          try {
            const r = await fetch(fallbackUrlEarly, { redirect: 'follow', signal: controller.signal });
            if (!r.ok) throw new Error(`upstream HTTP ${r.status}`);
            const ab = await r.arrayBuffer();
            await sendGraphImageBytes(res, Buffer.from(ab), req, fallbackUrlEarly);
            return;
          } finally {
            clearTimeout(timer);
          }
        }
        await streamHttpImageToResponse(res, fallbackUrlEarly, { taskId, reason: 'empty_storage_key' });
        return;
      }
      return res.status(404).json({
        success: false,
        error: 'No storage key for this task',
      });
    }

    const storageRepo = RepositoryFactory.createStorageRepository();

    try {
      // 下载文件内容（Buffer）
      const fileBuffer = await storageRepo.downloadFile(bucket, key);
      const metadata = await storageRepo.getFileMetadata(bucket, key);
      await sendGraphImageBytes(res, fileBuffer, req, key, metadata?.contentType);
      return;
    } catch (downloadError: any) {
      const fallbackUrl = pickHttpFallback();

      if (fallbackUrl && /^https?:\/\//.test(fallbackUrl)) {
        console.warn('[Media Route] graph MinIO download failed, streaming fallback URL', { taskId, bucket, key, fallbackUrl, index });
        if (previewEdge) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), REMOTE_IMAGE_FETCH_TIMEOUT_MS);
          try {
            const r = await fetch(fallbackUrl, { redirect: 'follow', signal: controller.signal });
            if (!r.ok) throw new Error(`upstream HTTP ${r.status}`);
            const ab = await r.arrayBuffer();
            await sendGraphImageBytes(res, Buffer.from(ab), req, fallbackUrl);
            return;
          } finally {
            clearTimeout(timer);
          }
        }
        await streamHttpImageToResponse(res, fallbackUrl, { taskId, reason: 'minio_download_fallback' });
        return;
      }

      throw downloadError;
    }
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    // 检查是否是 MinIO 连接错误
    const isConnectionError = 
      error?.code === 'CONNECTION_ERROR' ||
      error?.originalError?.code === 'ECONNREFUSED' ||
      error?.message?.includes('connection') ||
      error?.message?.includes('ECONNREFUSED') ||
      error?.message?.includes('MinIO connection failed');

    if (isConnectionError) {
      console.error('[Media Route] 获取图片失败: MinIO 连接错误', error);
      return res.status(503).json({
        success: false,
        error: 'Storage service unavailable. Please check if MinIO is running.',
        details: 'MinIO connection failed. The storage service may be down or misconfigured.',
      });
    }

    console.error('[Media Route] 获取图片失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 公网读用户上传参考图（无 JWT），仅当 STORAGE_USER_UPLOAD_ACCESS=public 时启用。
 * GET /media/public/object/:objectId
 */
router.get('/public/object/:objectId', async (req: Request, res: Response) => {
  try {
    if (!isUserUploadPublicAccessEnabled()) {
      return res.status(404).json({ success: false, error: 'Public user upload access is disabled' });
    }

    const { objectId } = req.params;
    const repo = RepositoryFactory.createStorageObjectRepository();
    const record = await repo.findById(objectId);
    if (!record || record.domain !== 'user_upload') {
      return res.status(404).json({ success: false, error: 'Not found' });
    }

    await sendUserUploadObjectBytes(res, record);
  } catch (error) {
    console.error('[Media Route] public object download failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 通过 storage_objects.id 访问用户上传资源
 * GET /media/object/:objectId
 */
router.get('/object/:objectId', async (req: Request, res: Response) => {
  try {
    const userId = (req.headers['x-user-id'] as string | undefined) || undefined;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Missing x-user-id header' });
    }

    const { objectId } = req.params;
    const repo = RepositoryFactory.createStorageObjectRepository();
    const record = await repo.findByIdForUser(objectId, userId);
    if (!record || record.domain !== 'user_upload') {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    if (!canPartnerAccessStorageMetadata(record.metadata as Record<string, unknown>, getPartnerContext(req))) {
      return res.status(403).json({ success: false, error: 'Forbidden: partner end user mismatch' });
    }

    res.setHeader('Cache-Control', 'private, max-age=3600');
    const storageRepo = RepositoryFactory.createStorageRepository('user_upload');
    const meta = await storageRepo.getFileMetadata(record.bucket, record.object_key).catch(() => null);
    await streamStorageObjectToResponse(
      req,
      res,
      storageRepo,
      record.bucket,
      record.object_key,
      meta?.contentType ?? record.content_type ?? undefined
    );
  } catch (error) {
    console.error('[Media Route] object download failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 通过 bucket + key 访问用户上传的资源
 * 用于 uploadAssets 上传的文件，路径格式：userId/upload/graph/xxx.jpg
 *
 * 路径示例：
 *   GET /media/asset?bucket=user-media&key=userId/upload/graph/xxx.jpg
 *
 * 权限：key 须属于当前用户（含 user_upload 与 generated 口播 `{userId}/audio/...`）
 */
router.get('/asset', async (req: Request, res: Response) => {
  try {
    const userId = (req.headers['x-user-id'] as string | undefined) || undefined;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
      });
    }

    const bucket = (req.query.bucket as string) || '';
    const key = (req.query.key as string) || '';

    if (!bucket || !key) {
      return res.status(400).json({
        success: false,
        error: 'Missing bucket or key query parameter',
      });
    }

    if (!canUserAccessMediaAssetKey(userId, key)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You can only access your own uploads',
      });
    }

    const domain = resolveStorageDomainForBucket(bucket);
    const storageRepo = RepositoryFactory.createStorageRepository(domain);

    const meta = await storageRepo.getFileMetadata(bucket, key);
    const contentType = guessAssetContentType(key, meta?.contentType);

    await streamStorageObjectToResponse(req, res, storageRepo, bucket, key, contentType);
    return;
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    const isConnectionError =
      error?.code === 'CONNECTION_ERROR' ||
      error?.originalError?.code === 'ECONNREFUSED' ||
      error?.message?.includes('connection') ||
      error?.message?.includes('ECONNREFUSED') ||
      error?.message?.includes('MinIO connection failed');

    if (isConnectionError) {
      console.error('[Media Route] 获取资源失败: MinIO 连接错误', error);
      return res.status(503).json({
        success: false,
        error: 'Storage service unavailable.',
      });
    }

    console.error('[Media Route] 获取资源失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 通过 CGI Task ID 访问视频内容
 *
 * 路径示例：
 *   GET /media/video/:taskId
 *
 * 访问约定：
 *   - Gateway 会在请求头中注入 x-user-id（已通过 JWT 认证）
 *   - 这里只做简单的"只能访问自己的任务"校验
 *   - 文件真实位置由 Task.result.storageInfo 中的 bucket + key 决定
 */
router.get('/video/:taskId', async (req: Request, res: Response) => {
  try {
    const userId = (req.headers['x-user-id'] as string | undefined) || undefined;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
      });
    }

    const { taskId } = req.params;
    if (!taskId) {
      return res.status(400).json({
        success: false,
        error: 'Missing taskId',
      });
    }

    const { task } = await taskManager.getTask(taskId);

    if (!canUserAccessTask(task, userId, taskAccessOpts(req))) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You can only access your own media',
      });
    }

    const storageInfo = task.result?.storageInfo;
    const remoteFallback = pickFirstHttpMediaUrl(task);

    if (!storageInfo || !storageInfo.bucket || !storageInfo.keys || storageInfo.keys.length === 0) {
      if (remoteFallback) {
        if (wantsAttachmentDownload(req)) {
          res.setHeader('Content-Disposition', buildAttachmentDisposition(`${taskId}.mp4`));
        }
        await streamHttpMediaToResponse(req, res, remoteFallback, {
          taskId,
          reason: 'no_storage_info',
        });
        return;
      }
      return res.status(404).json({
        success: false,
        error: 'No storage info for this task',
      });
    }

    const bucket = storageInfo.bucket;
    const key = storageInfo.keys[0];
    const storageRepo = RepositoryFactory.createStorageRepository();

    try {
      const meta = await storageRepo.getFileMetadata(bucket, key);
      await streamStorageObjectToResponse(
        req,
        res,
        storageRepo,
        bucket,
        key,
        meta?.contentType,
        attachmentOptsForKey(req, taskId, key)
      );
      return;
    } catch (downloadError: unknown) {
      if (remoteFallback) {
        console.warn('[Media Route] video MinIO stream failed, fallback URL', {
          taskId,
          bucket,
          key,
          fallback: remoteFallback.slice(0, 120),
        });
        if (wantsAttachmentDownload(req)) {
          res.setHeader(
            'Content-Disposition',
            buildAttachmentDisposition(`${taskId}.mp4`)
          );
        }
        await streamHttpMediaToResponse(req, res, remoteFallback, {
          taskId,
          reason: 'minio_download_fallback',
        });
        return;
      }
      throw downloadError;
    }
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    // 检查是否是 MinIO 连接错误
    const isConnectionError = 
      error?.code === 'CONNECTION_ERROR' ||
      error?.originalError?.code === 'ECONNREFUSED' ||
      error?.message?.includes('connection') ||
      error?.message?.includes('ECONNREFUSED') ||
      error?.message?.includes('MinIO connection failed');

    if (isConnectionError) {
      console.error('[Media Route] 获取视频失败: MinIO 连接错误', error);
      return res.status(503).json({
        success: false,
        error: 'Storage service unavailable. Please check if MinIO is running.',
        details: 'MinIO connection failed. The storage service may be down or misconfigured.',
      });
    }

    console.error('[Media Route] 获取视频失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 写作内容导出（按需转换，不改变存储）
 *
 *   GET /media/writing/:taskId/export?format=pdf|markdown|md|txt|pptx
 */
router.get('/writing/:taskId/export', async (req: Request, res: Response) => {
  try {
    const userId = (req.headers['x-user-id'] as string | undefined) || undefined;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Missing x-user-id header' });
    }

    const { taskId } = req.params;
    if (!taskId) {
      return res.status(400).json({ success: false, error: 'Missing taskId' });
    }

    const rawFormat = String(req.query.format || 'markdown').toLowerCase();
    const exportFormat =
      rawFormat === 'pdf'
        ? 'pdf'
        : rawFormat === 'pptx'
          ? 'pptx'
          : rawFormat === 'txt'
            ? 'txt'
            : rawFormat === 'md' || rawFormat === 'markdown'
              ? 'markdown'
              : null;

    if (!exportFormat) {
      return res.status(400).json({
        success: false,
        error: 'Invalid format. Use pdf, pptx, markdown, md, or txt',
      });
    }

    const { resolveWritingTaskContent } = await import('../core/writing/writing-content-resolver');
    const { buildWritingExport } = await import('../core/writing/writing-export');

    const resolved = await resolveWritingTaskContent(taskId, userId);
    const { task } = await taskManager.getTask(taskId);
    const resultMeta = (task.result?.metadata ?? {}) as Record<string, unknown>;
    const taskMeta = (task.metadata ?? {}) as Record<string, unknown>;
    const title =
      (task.metadata?.requestLabel as string | undefined) ||
      (task.metadata?.title as string | undefined) ||
      undefined;

    const { buffer, contentType, filename } = await buildWritingExport(resolved, exportFormat, {
      title,
      taskId,
      documentRenderSpec: (resultMeta.documentRenderSpec ??
        taskMeta.documentRenderSpec) as import('../core/document-render/types').DocumentRenderSpecV1 | undefined,
      pdfRenderer: (resultMeta.pdf_renderer ?? taskMeta.pdf_renderer) as
        | 'markdown'
        | 'styled'
        | 'html'
        | undefined,
      designStyle: String(resultMeta.designStyle ?? taskMeta.designStyle ?? ''),
    });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buffer.length.toString());
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    return res.send(buffer);
  } catch (error: unknown) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 403) {
      return res.status(403).json({
        success: false,
        error: error instanceof Error ? error.message : 'Forbidden',
      });
    }
    if (statusCode === 404 || (error instanceof Error && error.message.includes('not found'))) {
      return res.status(404).json({
        success: false,
        error: error instanceof Error ? error.message : 'Not found',
      });
    }
    console.error('[Media Route] 写作导出失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 通过 CGI Task ID 访问写作内容
 *
 * 路径示例：
 *   GET /media/writing/:taskId
 *
 * 访问约定：
 *   - Gateway 会在请求头中注入 x-user-id（已通过 JWT 认证）
 *   - 这里只做简单的"只能访问自己的任务"校验
 *   - 有 pdfStorage / 主存 PDF 时走对象存储 Range/stream（不整包进 Node）
 *   - 否则有 presentationStorage PPTX 时流式返回 PPTX
 *   - 否则返回 Markdown/文本正文
 */
router.get('/writing/:taskId', async (req: Request, res: Response) => {
  try {
    const userId = (req.headers['x-user-id'] as string | undefined) || undefined;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
      });
    }

    const { taskId } = req.params;
    if (!taskId) {
      return res.status(400).json({
        success: false,
        error: 'Missing taskId',
      });
    }

    const {
      locateWritingCachedPdf,
      locateWritingCachedPptx,
      resolveWritingTaskContent,
    } = await import('../core/writing/writing-content-resolver');

    const pdfTarget = await locateWritingCachedPdf(taskId, userId);
    if (pdfTarget) {
      const storageRepo = RepositoryFactory.createStorageRepository();
      const safeName = encodeURIComponent(pdfTarget.filename);
      try {
        await streamStorageObjectToResponse(
          req,
          res,
          storageRepo,
          pdfTarget.bucket,
          pdfTarget.key,
          'application/pdf',
          { contentDisposition: `inline; filename="${safeName}"` }
        );
        return;
      } catch (streamErr: unknown) {
        const msg = streamErr instanceof Error ? streamErr.message : String(streamErr);
        console.warn('[Media Route] writing PDF stream failed, fallback to text resolve:', {
          taskId,
          error: msg,
        });
        // 流失败时继续走正文解析（可能降级 MD）
      }
    }

    const pptxTarget = await locateWritingCachedPptx(taskId, userId);
    if (pptxTarget) {
      const storageRepo = RepositoryFactory.createStorageRepository();
      const safeName = encodeURIComponent(pptxTarget.filename);
      const pptxType =
        'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      try {
        await streamStorageObjectToResponse(
          req,
          res,
          storageRepo,
          pptxTarget.bucket,
          pptxTarget.key,
          pptxType,
          { contentDisposition: `inline; filename="${safeName}"` }
        );
        return;
      } catch (streamErr: unknown) {
        const msg = streamErr instanceof Error ? streamErr.message : String(streamErr);
        console.warn('[Media Route] writing PPTX stream failed, fallback to text resolve:', {
          taskId,
          error: msg,
        });
      }
    }

    const resolved = await resolveWritingTaskContent(taskId, userId);

    if (resolved.rawPdfBuffer) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', resolved.rawPdfBuffer.length.toString());
      res.setHeader('Content-Disposition', `inline; filename="${resolved.suggestedFilename}"`);
      if (req.method === 'HEAD') {
        return res.end();
      }
      return res.send(resolved.rawPdfBuffer);
    }

    if (resolved.rawPptxBuffer) {
      const pptxType =
        'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      res.setHeader('Content-Type', pptxType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', resolved.rawPptxBuffer.length.toString());
      res.setHeader('Content-Disposition', `inline; filename="${resolved.suggestedFilename}"`);
      if (req.method === 'HEAD') {
        return res.end();
      }
      return res.send(resolved.rawPptxBuffer);
    }

    const format = resolved.sourceFormat || 'markdown';
    const contentType =
      format === 'markdown' || format === 'md'
        ? 'text/markdown; charset=utf-8'
        : format === 'txt'
          ? 'text/plain; charset=utf-8'
          : 'text/plain; charset=utf-8';
    const contentBuffer = Buffer.from(resolved.text, 'utf-8');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', contentBuffer.length.toString());
    res.setHeader('Content-Disposition', `inline; filename="${resolved.suggestedFilename}"`);
    if (req.method === 'HEAD') {
      return res.end();
    }

    return res.send(contentBuffer);
  } catch (error: unknown) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 403) {
      return res.status(403).json({
        success: false,
        error: error instanceof Error ? error.message : 'Forbidden',
      });
    }
    if (statusCode === 404 || (error instanceof Error && error.message.includes('not found'))) {
      return res.status(404).json({
        success: false,
        error: error instanceof Error ? error.message : 'Not found',
      });
    }

    console.error('[Media Route] 获取写作内容失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * 更新写作内容
 *
 * 路径示例：
 *   PUT /media/writing/:taskId
 *
 * 请求体：
 *   {
 *     "content": "新的 Markdown 文本" | [] (JSON 数组，当 format 为 json 时),
 *     "format": "markdown" | "txt" | "pdf" | "json" (可选，默认 markdown)
 *   }
 *
 * 说明：
 *   - 支持三种存储方式：
 *     1. 大纲 JSON（format: "json"）：更新 task.result.metadata.outline
 *     2. MinIO 存储（task.result.storageInfo）：覆盖 MinIO 文件
 *     3. 直接存储文本（task.result.metadata.formattedContent/text）：更新 metadata 中的文本内容
 *   - 不会修改任务状态，仅更新内容
 */
router.put('/writing/:taskId', async (req: Request, res: Response) => {
  try {
    const userId = (req.headers['x-user-id'] as string | undefined) || undefined;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
      });
    }

    const { taskId } = req.params;
    if (!taskId) {
      return res.status(400).json({
        success: false,
        error: 'Missing taskId',
      });
    }

    const { content, format, characters } = req.body as {
      content?: string | any[]; // 可以是字符串或 JSON 数组（大纲）
      format?: 'markdown' | 'txt' | 'pdf' | 'json';
      characters?: any[]; // 角色画像（可选，仅对 format === 'json' 有效）
    };

    if (content === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing field: content',
      });
    }

    // 查询任务
    const { task } = await taskManager.getTask(taskId);

    // 权限：任务所有者或 Open API 第三方调用方
    if (!canUserAccessTask(task, userId, taskAccessOpts(req))) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You can only update your own media',
      });
    }

    const existingResult = task.result || {
      mediaUrls: [],
      metadata: {},
    };
    const storageInfo = existingResult.storageInfo as any;

    // 情况 1：大纲 JSON 更新（format === 'json'）
    if (format === 'json') {
      // content 应该是 JSON 数组或对象
      if (!Array.isArray(content) && (typeof content !== 'object' || content === null)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid field: content must be a JSON array or object when format is "json"',
        });
      }

      // 分镜脚本：根据当前字段重新拼接每个 chunk 的 prompt，使编辑后最终 prompt 跟随变化
      if (typeof content === 'object' && content !== null && Array.isArray((content as any).chunks)) {
        const { fillChunkPrompts } = await import('../core/writing/storyboard-chunk-utils');
        fillChunkPrompts((content as any).chunks);
      }

      // 更新大纲到 metadata
      // 如果 content 是数组，取第一个元素作为根大纲；如果是对象，直接使用
      const outline = Array.isArray(content) && content.length > 0 ? content[0] : content;

      const updatedMetadata = {
        ...existingResult.metadata,
        outline: outline,
        ...(Array.isArray(characters) ? { characters } : {}),
        updatedAt: new Date().toISOString(),
      };

      await taskManager.setTaskResult(taskId, {
        ...existingResult,
        metadata: updatedMetadata,
      });

      return res.json({
        success: true,
        data: {
          storageType: 'outline',
          outline: outline,
          ...(Array.isArray(characters) ? { characters } : {}),
        },
      });
    }

    // 情况 2：文本内容更新
    if (typeof content !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid field: content must be a string when format is not "json"',
      });
    }

    const normalizedFormat: 'markdown' | 'txt' | 'pdf' =
      format === 'txt' || format === 'pdf' ? format : 'markdown';

    // 情况 2.1：有 MinIO 存储，覆盖 MinIO 文件
    if (storageInfo && storageInfo.bucket) {
      let key: string | undefined;

      // 检查是否有 keys 数组（新格式）
      if (storageInfo.keys && Array.isArray(storageInfo.keys) && storageInfo.keys.length > 0) {
        key = storageInfo.keys[0];
      }
      // 检查是否有 key 字符串（旧格式）
      else if (storageInfo.key && typeof storageInfo.key === 'string') {
        key = storageInfo.key;
      }

      if (!key) {
        return res.status(400).json({
          success: false,
          error: 'This writing task has no storage key, cannot update content',
        });
      }

      const bucket = storageInfo.bucket as string;
      const storageRepo = RepositoryFactory.createStorageRepository();

      const contentType =
        normalizedFormat === 'markdown'
          ? 'text/markdown; charset=utf-8'
          : normalizedFormat === 'txt'
          ? 'text/plain; charset=utf-8'
          : 'application/pdf';

      const buffer =
        normalizedFormat === 'pdf'
          ? await (async () => {
              const { formatToPdf } = await import('../core/writing/document-formatter');
              return formatToPdf(content, undefined);
            })()
          : Buffer.from(content, 'utf-8');

      await storageRepo.uploadFile(bucket, key, buffer, {
        contentType,
      });

      return res.json({
        success: true,
        data: {
          bucket,
          key,
          size: buffer.length,
          contentType,
          storageType: 'minio',
        },
      });
    }

    // 情况 2.2：没有 MinIO 存储，更新任务 metadata 中的文本内容
    // 计算内容大小
    const contentSize = Buffer.byteLength(content, 'utf-8');
    const wordCount = content.length; // 简单统计字符数

    // 更新 metadata
    const updatedMetadata = {
      ...existingResult.metadata,
      formattedContent: content,
      text: content, // 同时更新 text 字段以保持兼容
      format: normalizedFormat,
      wordCount,
      fileSize: contentSize,
      updatedAt: new Date().toISOString(),
    };

    // 使用 setTaskResult 更新任务结果（保留原有的 storageInfo 和 mediaUrls）
    await taskManager.setTaskResult(taskId, {
      ...existingResult,
      metadata: updatedMetadata,
    });

    return res.json({
      success: true,
      data: {
        size: contentSize,
        contentType:
          normalizedFormat === 'markdown'
            ? 'text/markdown; charset=utf-8'
            : normalizedFormat === 'txt'
            ? 'text/plain; charset=utf-8'
            : 'application/pdf',
        storageType: 'metadata',
        wordCount,
      },
    });
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    console.error('[Media Route] 更新写作内容失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

async function serveAudioLike(req: Request, res: Response) {
  try {
    const userId = (req.headers['x-user-id'] as string | undefined) || undefined;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
      });
    }

    const { taskId } = req.params;
    if (!taskId) {
      return res.status(400).json({
        success: false,
        error: 'Missing taskId',
      });
    }

    // 含 lazy 转存：历史任务内联 base64 首次播放时写入 MinIO
    const { task } = await taskManager.getTaskForApi(taskId);

    // 权限：任务所有者或 Open API 第三方调用方（metadata.userId 为扣费账户）
    if (!canUserAccessTask(task, userId, taskAccessOpts(req))) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You can only access your own media',
      });
    }

    const storageInfo = task.result?.storageInfo;
    const remoteFallback = pickFirstHttpMediaUrl(task);
    const assetFallback = pickMediaAssetBucketKey(task);

    if (!storageInfo || !storageInfo.bucket || !storageInfo.keys || storageInfo.keys.length === 0) {
      if (assetFallback) {
        const storageRepo = RepositoryFactory.createStorageRepository();
        try {
          const meta = await storageRepo.getFileMetadata(assetFallback.bucket, assetFallback.key);
          await streamStorageObjectToResponse(
            req,
            res,
            storageRepo,
            assetFallback.bucket,
            assetFallback.key,
            meta?.contentType,
            attachmentOptsForKey(req, taskId, assetFallback.key)
          );
          return;
        } catch (assetErr) {
          console.warn('[Media Route] audio asset fallback failed', {
            taskId,
            bucket: assetFallback.bucket,
            key: assetFallback.key,
            error: assetErr instanceof Error ? assetErr.message : String(assetErr),
          });
        }
      }
      if (remoteFallback) {
        await streamHttpAudioToResponse(req, res, remoteFallback, {
          taskId,
          reason: 'no_storage_info',
        });
        return;
      }
      return res.status(404).json({
        success: false,
        error: 'No storage info for this task',
      });
    }

    const bucket = storageInfo.bucket;
    const key = storageInfo.keys[0];

    const storageRepo = RepositoryFactory.createStorageRepository();

    try {
      const meta = await storageRepo.getFileMetadata(bucket, key);
      await streamStorageObjectToResponse(
        req,
        res,
        storageRepo,
        bucket,
        key,
        meta?.contentType,
        attachmentOptsForKey(req, taskId, key)
      );
      return;
    } catch (downloadError: unknown) {
      if (remoteFallback) {
        console.warn('[Media Route] audio MinIO stream failed, streaming fallback URL', {
          taskId,
          bucket,
          key,
          fallback: remoteFallback.slice(0, 120),
        });
        if (wantsAttachmentDownload(req)) {
          res.setHeader(
            'Content-Disposition',
            buildAttachmentDisposition(`${taskId}.mp3`)
          );
        }
        await streamHttpAudioToResponse(req, res, remoteFallback, {
          taskId,
          reason: 'minio_download_fallback',
        });
        return;
      }
      throw downloadError;
    }
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    // 检查是否是 MinIO 连接错误
    const isConnectionError =
      error?.code === 'CONNECTION_ERROR' ||
      error?.originalError?.code === 'ECONNREFUSED' ||
      error?.message?.includes('connection') ||
      error?.message?.includes('ECONNREFUSED') ||
      error?.message?.includes('MinIO connection failed');

    if (isConnectionError) {
      console.error('[Media Route] 获取音频失败: MinIO 连接错误', error);
      return res.status(503).json({
        success: false,
        error: 'Storage service unavailable. Please check if MinIO is running.',
        details: 'MinIO connection failed. The storage service may be down or misconfigured.',
      });
    }

    console.error('[Media Route] 获取音频失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function serveAudioSubtitles(req: Request, res: Response) {
  try {
    const userId = (req.headers['x-user-id'] as string | undefined) || undefined;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Missing x-user-id header' });
    }

    const { taskId } = req.params;
    if (!taskId) {
      return res.status(400).json({ success: false, error: 'Missing taskId' });
    }

    const { task } = await taskManager.getTask(taskId);
    if (!canUserAccessTask(task, userId, taskAccessOpts(req))) {
      return res.status(403).json({ success: false, error: 'Forbidden: You can only access your own media' });
    }

    const meta = (task.result?.metadata ?? {}) as Record<string, unknown>;
    let payload = await loadPersistedSubtitlePayload(meta);
    let shouldLazyPersistEstimate = false;

    if (payload == null) {
      const subtitleUrl = pickSubtitleFileUrl(meta);
      if (subtitleUrl) {
        try {
          payload = await fetchSubtitleJsonFromUrl(subtitleUrl);
        } catch (error) {
          return res.status(502).json({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        if (task.result && (task.type === 'audio' || task.type === 'music')) {
          void persistTtsSubtitleInResult(task, task.result)
            .then(async (nextResult) => {
              if (nextResult.metadata === task.result?.metadata) return;
              await taskManager.update(taskId, { result: nextResult });
            })
            .catch((err) => {
              console.warn('[Media Route] lazy subtitle persist failed', {
                taskId,
                error: err instanceof Error ? err.message : String(err),
              });
            });
        }
      }
    }

    // 上游无字幕时：用口播文稿 + 时长估算（兼容旧任务 / 偶发未返回 subtitle_file）
    if (payload == null && (task.type === 'audio' || task.type === 'music')) {
      const { estimateSubtitlePayloadForTask } = await import('../task/tts-subtitle-persist');
      const estimated = estimateSubtitlePayloadForTask(task, meta);
      if (estimated) {
        payload = estimated;
        shouldLazyPersistEstimate = true;
      }
    }

    if (payload == null) {
      return res.status(404).json({ success: false, error: 'No subtitles for this task' });
    }

    if (shouldLazyPersistEstimate && task.result) {
      void persistTtsSubtitleInResult(task, task.result)
        .then(async (nextResult) => {
          if (nextResult.metadata === task.result?.metadata) return;
          await taskManager.update(taskId, { result: nextResult });
        })
        .catch((err) => {
          console.warn('[Media Route] lazy script_only subtitle persist failed', {
            taskId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }

    return res.json({ success: true, data: payload });
  } catch (error) {
    console.error('[Media Route] 获取字幕失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 通过 CGI Task ID 访问音频内容
 *
 * 路径示例：
 *   GET /media/audio/:taskId
 */
router.get('/audio/:taskId/subtitles', serveAudioSubtitles);

router.get('/audio/:taskId', serveAudioLike);

/**
 * 通过 CGI Task ID 访问音乐内容（与音频相同的媒体形态，独立路由便于业务区分）
 *
 * 路径示例：
 *   GET /media/music/:taskId
 */
router.get('/music/:taskId/subtitles', serveAudioSubtitles);

router.get('/music/:taskId', serveAudioLike);

export default router;

