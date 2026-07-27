import { Router, Request, Response } from 'express';
import multer from 'multer';
import { RepositoryFactory, loadStorageConfig } from '@mxmai/mxmdata';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

async function requireAdmin(req: Request, res: Response, next: () => void): Promise<void> {
  try {
    const userRole = req.headers['x-user-role'] as string | undefined;
    if (userRole === 'admin') {
      next();
      return;
    }
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }
    const userRepo = RepositoryFactory.createUserRepository();
    const user = await userRepo.findById(userId);
    if (user && user.role === 'admin') {
      next();
      return;
    }
    res.status(403).json({ success: false, error: 'Admin access required' });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to check admin' });
  }
}

router.get('/objects', requireAdmin, async (req: Request, res: Response) => {
  try {
    const purpose = typeof req.query.category === 'string' ? req.query.category : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;
    const repo = RepositoryFactory.createStorageObjectRepository();
    const result = await repo.listSystem({ purpose, limit, offset });
    const cfg = loadStorageConfig().domains.system_static;
    return res.json({
      success: true,
      data: {
        items: result.items.map((item) => ({
          id: item.id,
          purpose: item.purpose,
          url:
            cfg.accessMode === 'public' && cfg.publicBaseUrl
              ? `${cfg.publicBaseUrl.replace(/\/+$/, '')}/${item.object_key}`
              : `/api/v1/static/${item.object_key.replace(/^sys\//, '')}`,
          objectKey: item.object_key,
          createdAt: item.created_at,
        })),
        total: result.total,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

router.post('/objects', requireAdmin, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const multerReq = req as MulterRequest;
    if (!multerReq.file) {
      return res.status(400).json({ success: false, error: 'Missing file' });
    }
    const category = String(req.body.category || 'brand');
    const version = String(req.body.version || 'v1');
    const filename = String(req.body.filename || multerReq.file.originalname);

    const storage = RepositoryFactory.getStorageService();
    const stored = await storage.upload({
      domain: 'system_static',
      purpose: category,
      buffer: multerReq.file.buffer,
      contentType: multerReq.file.mimetype || 'application/octet-stream',
      pathVars: { category, version, filename, ext: filename.split('.').pop() || 'bin' },
    });

    const record = await RepositoryFactory.createStorageObjectRepository().create({
      user_id: null,
      domain: 'system_static',
      provider: stored.provider,
      bucket: stored.bucket,
      object_key: stored.key,
      purpose: category,
      content_type: multerReq.file.mimetype,
      size_bytes: stored.size,
      original_name: multerReq.file.originalname,
      metadata: { version, filename },
    });

    return res.json({
      success: true,
      data: {
        id: record.id,
        url: stored.url,
        objectKey: stored.key,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

router.delete('/objects/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const repo = RepositoryFactory.createStorageObjectRepository();
    const record = await repo.findById(req.params.id);
    if (!record || record.domain !== 'system_static') {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    await RepositoryFactory.getStorageService().delete({
      domain: 'system_static',
      provider: record.provider,
      bucket: record.bucket,
      key: record.object_key,
    });
    await repo.softDelete(record.id);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

router.get('/config', requireAdmin, (_req: Request, res: Response) => {
  return res.json({ success: true, data: loadStorageConfig() });
});

export default router;
