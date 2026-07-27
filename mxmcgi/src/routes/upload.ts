import { Router, Request, Response } from 'express';
import multer from 'multer';
import { RepositoryFactory } from '@mxmai/mxmdata';
import {
  uploadUserBlob,
  deleteUserStorageObject,
  UserStorageObjectNotFoundError,
  FolderPathNotFoundError,
  FolderPathForbiddenError,
} from '../storage/user-upload-service';
import { parseUploadOptions } from '../storage/parse-upload-options';
import { analyzeGridLayout } from '../core/utils/grid-layout-analyzer';
import { resolveStorageObjectAccessUrls } from '../storage/user-upload-url';
import { getPartnerContext } from '../open-api/authz';
import { decodePossiblyMojibakeFilename } from '../utils/filename-encoding';

function partnerUploadParams(req: Request): {
  metadata?: Record<string, unknown>;
  partnerAppId?: string;
  partnerEndUserId?: string;
} {
  const partner = getPartnerContext(req);
  if (!partner) return {};
  return {
    metadata: {
      partner_app_id: partner.partnerAppId,
      end_user_id: partner.endUserId,
    },
    partnerAppId: partner.partnerAppId,
    partnerEndUserId: partner.endUserId,
  };
}

/** 客户端 FormData `metadata` JSON，或 body.metadata 对象；与 partner 字段合并（partner 优先） */
function parseClientUploadMetadata(req: Request): Record<string, unknown> | undefined {
  const b = (req.body || {}) as Record<string, unknown>;
  const raw = b.metadata;
  let parsed: unknown = raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (k === 'partner_app_id' || k === 'end_user_id') continue;
    if (v === undefined) continue;
    out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function mergeUploadMetadata(req: Request): Record<string, unknown> | undefined {
  const client = parseClientUploadMetadata(req);
  const partner = partnerUploadParams(req).metadata;
  if (!client && !partner) return undefined;
  return { ...(client ?? {}), ...(partner ?? {}) };
}

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

function formatUploadError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes('bucket name is not valid') || msg.includes('InvalidBucketName')) {
    const bucket = process.env.STORAGE_USER_UPLOAD_BUCKET || process.env.R2_BUCKET || '(未设置)';
    return (
      `${msg}。当前 user_upload 桶配置为「${bucket}」。` +
      `R2 桶名禁止下划线（请用 user-assets）。修改 .env 后必须重启 dev:all / mxmcgi。`
    );
  }
  return msg;
}

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

interface MulterRequest extends Request {
  file?: MulterFile;
}

function parseBase64Image(base64: string, contentType?: string): { buffer: Buffer; contentType: string } {
  if (base64.startsWith('data:')) {
    const matches = base64.match(/^data:([^;]+)(?:;base64)?,(.+)$/);
    if (!matches) throw new Error('Invalid data URI format');
    return {
      buffer: Buffer.from(matches[2], 'base64'),
      contentType: contentType || matches[1],
    };
  }
  return {
    buffer: Buffer.from(base64, 'base64'),
    contentType: contentType || 'image/jpeg',
  };
}

router.post('/temp', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Missing x-user-id header' });
    }

    const multerReq = req as MulterRequest;
    if (!multerReq.file) {
      return res.status(400).json({ success: false, error: 'Missing file field "file"' });
    }

    const file = multerReq.file;
    const originalName = decodePossiblyMojibakeFilename(file.originalname) || file.originalname;
    const opts = parseUploadOptions(req);
    const partnerCtx = partnerUploadParams(req);
    const result = await uploadUserBlob({
      userId,
      purpose: opts.purpose,
      storageMode: 'temp',
      folderId: opts.folderId,
      taskId: opts.taskId,
      buffer: file.buffer,
      contentType: file.mimetype || 'application/octet-stream',
      originalName,
      metadata: mergeUploadMetadata(req),
      partnerAppId: partnerCtx.partnerAppId,
      partnerEndUserId: partnerCtx.partnerEndUserId,
    });

    return res.json({
      success: true,
      data: {
        objectId: result.objectId,
        url: result.url,
        key: result.key,
        bucket: result.bucket,
        storageMode: result.storageMode,
        folderId: result.folderId,
      },
    });
  } catch (error) {
    console.error('[Upload Route] temp upload failed:', error);
    return res.status(500).json({
      success: false,
      error: formatUploadError(error),
    });
  }
});

router.post('/assets', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Missing x-user-id header' });
    }

    const multerReq = req as MulterRequest;
    if (!multerReq.file) {
      return res.status(400).json({ success: false, error: 'Missing file field "file"' });
    }

    const file = multerReq.file;
    const originalName = decodePossiblyMojibakeFilename(file.originalname) || file.originalname;
    const ext = (originalName.match(/\.(\w+)$/)?.[1] || '').toLowerCase();
    const imageExts = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
    const isImage =
      imageExts.has(ext) ||
      (typeof file.mimetype === 'string' && file.mimetype.startsWith('image/'));

    let contentType = file.mimetype || 'application/octet-stream';
    if (!file.mimetype) {
      if (ext === 'png') contentType = 'image/png';
      else if (ext === 'webp') contentType = 'image/webp';
      else if (ext === 'gif') contentType = 'image/gif';
      else if (isImage) contentType = 'image/jpeg';
      else if (ext === 'md' || ext === 'markdown') contentType = 'text/markdown; charset=utf-8';
      else if (ext === 'txt') contentType = 'text/plain; charset=utf-8';
    }

    const opts = parseUploadOptions(req);
    const partnerCtx = partnerUploadParams(req);
    const result = await uploadUserBlob({
      userId,
      purpose: opts.purpose,
      storageMode: opts.storageMode,
      folderId: opts.folderId,
      taskId: opts.taskId,
      buffer: file.buffer,
      contentType,
      originalName,
      metadata: mergeUploadMetadata(req),
      partnerAppId: partnerCtx.partnerAppId,
      partnerEndUserId: partnerCtx.partnerEndUserId,
    });

    const gatewayOrigin = process.env.PUBLIC_GATEWAY_ORIGIN || '';
    const base = gatewayOrigin.replace(/\/+$/, '');
    const accessUrl = result.url;
    const absoluteUrl =
      accessUrl.startsWith('http') || !base
        ? accessUrl
        : accessUrl.startsWith('/')
          ? `${base}${accessUrl}`
          : `${base}/${accessUrl}`;

    return res.json({
      success: true,
      data: {
        objectId: result.objectId,
        url: accessUrl,
        key: result.key,
        bucket: result.bucket,
        storageMode: result.storageMode,
        folderId: result.folderId,
        proxyPath: absoluteUrl,
      },
    });
  } catch (error) {
    if (error instanceof FolderPathNotFoundError) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error instanceof FolderPathForbiddenError) {
      return res.status(403).json({ success: false, error: error.message });
    }
    console.error('[Upload Route] assets upload failed:', error);
    return res.status(500).json({
      success: false,
      error: formatUploadError(error),
    });
  }
});

/** @deprecated alias — use POST /upload/assets; kept for backward compatibility */
router.post('/r2-reference', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Missing x-user-id header' });
    }

    const { base64, contentType, originalName, tag } = req.body as {
      base64?: string;
      contentType?: string;
      originalName?: string;
      tag?: string;
    };

    if (!base64 || typeof base64 !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing or invalid base64 field' });
    }

    const parsed = parseBase64Image(base64, contentType);
    const opts = parseUploadOptions(req);
    const result = await uploadUserBlob({
      userId,
      purpose: opts.purpose,
      storageMode: opts.storageMode,
      folderId: opts.folderId,
      taskId: opts.taskId,
      buffer: parsed.buffer,
      contentType: parsed.contentType,
      originalName: originalName,
      tag,
    });

    return res.json({
      success: true,
      data: {
        objectId: result.objectId,
        url: result.url,
        key: result.key,
        storageMode: result.storageMode,
        folderId: result.folderId,
        r2_url: result.url,
      },
    });
  } catch (error) {
    if (error instanceof FolderPathNotFoundError) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error instanceof FolderPathForbiddenError) {
      return res.status(403).json({ success: false, error: error.message });
    }
    console.error('[Upload Route] r2-reference upload failed:', error);
    return res.status(500).json({
      success: false,
      error: formatUploadError(error),
    });
  }
});

router.get('/r2-reference', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Missing x-user-id header' });
    }

    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);
    const storageModeRaw = req.query.storageMode;
    const storageMode =
      storageModeRaw === 'temp' ? 'temp' : storageModeRaw === 'asset' ? 'asset' : undefined;
    const purpose = typeof req.query.purpose === 'string' ? req.query.purpose : undefined;
    const folderIdRaw = req.query.folderId;
    let folderId: string | null | undefined;
    if (folderIdRaw === 'root' || folderIdRaw === '') {
      folderId = null;
    } else if (typeof folderIdRaw === 'string' && folderIdRaw) {
      folderId = folderIdRaw;
    }

    const repo = RepositoryFactory.createStorageObjectRepository();
    const listOpts: Parameters<typeof repo.listByUser>[1] = {
      domain: 'user_upload',
      limit,
      offset,
      uploadSource: 'self',
    };
    if (purpose) listOpts.purpose = purpose;
    if (storageMode) listOpts.storageMode = storageMode;
    if (folderIdRaw !== undefined) listOpts.folderId = folderId;

    const { items, total } = await repo.listByUser(userId, listOpts);

    const urls = await resolveStorageObjectAccessUrls(items);
    const mapped = items.map((item, i) => ({
      id: item.id,
      r2_url: urls[i] ?? '',
      url: urls[i] ?? '',
      original_name: item.original_name,
      content_type: item.content_type,
      storage_mode: item.storage_mode,
      folder_id: item.folder_id,
      expires_at: item.expires_at,
      tag: (item.metadata?.tag as string) ?? null,
      created_at: item.created_at,
    }));

    return res.json({
      success: true,
      data: {
        items: mapped,
        total,
      },
    });
  } catch (error) {
    console.error('[Upload Route] list r2-reference failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

router.delete('/r2-reference/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Missing x-user-id header' });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Missing id param' });
    }

    await deleteUserStorageObject(userId, id);
    return res.json({ success: true });
  } catch (error) {
    if (error instanceof UserStorageObjectNotFoundError) {
      return res.status(404).json({ success: false, error: error.message });
    }
    console.error('[Upload Route] delete r2-reference failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

router.post('/grid-analyze', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Missing x-user-id header' });
    }

    const { url, base64, grid_n: gridNRaw } = req.body as {
      url?: string;
      base64?: string;
      grid_n?: number;
    };
    const source = typeof base64 === 'string' && base64.trim() ? base64.trim() : url?.trim();
    if (!source) {
      return res.status(400).json({ success: false, error: 'Missing url or base64' });
    }

    const gridNHint =
      typeof gridNRaw === 'number' && gridNRaw >= 2 && gridNRaw <= 4
        ? Math.floor(gridNRaw)
        : undefined;

    const analysis = await analyzeGridLayout(source, { gridNHint });

    return res.json({
      success: true,
      data: {
        width: analysis.width,
        height: analysis.height,
        orientation: analysis.orientation,
        aspect_label: analysis.aspectLabel,
        layout: analysis.layout,
        grid_n: analysis.gridN,
        confidence: analysis.confidence,
        layout_source: analysis.layoutSource,
        vertical_gutters: analysis.verticalGutters,
        horizontal_gutters: analysis.horizontalGutters,
      },
    });
  } catch (error) {
    console.error('[Upload Route] grid-analyze failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
