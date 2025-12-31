import { Router, Request, Response } from 'express';
import multer from 'multer';
import { RepositoryFactory } from '@mxmai/mxmdata';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Multer 文件类型定义
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

// 扩展 Express Request 类型以包含 multer 的 file
interface MulterRequest extends Request {
  file?: MulterFile;
}

// 上传临时文件到 MinIO
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
    const storageRepo = RepositoryFactory.createStorageRepository();

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate()
    ).padStart(2, '0')}`;
    const ext = (file.originalname.match(/\.(\w+)$/)?.[1] || 'bin').toLowerCase();
    const randomId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const key = `temp/${userId}/${dateStr}/${randomId}.${ext}`;
    const bucket = process.env.CGI_STORAGE_BUCKET || 'user-media';

    const uploadResult = await storageRepo.uploadFile(bucket, key, file.buffer, {
      contentType: file.mimetype || 'application/octet-stream',
      metadata: {
        userId,
        mediaType: 'temp',
        originalName: file.originalname,
      },
    });

    return res.json({
      success: true,
      data: {
        url: uploadResult.url,
        key: uploadResult.key,
        bucket: uploadResult.bucket,
      },
    });
  } catch (error) {
    console.error('[Upload Route] temp upload failed:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
