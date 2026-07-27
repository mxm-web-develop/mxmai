import { Router, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { RepositoryFactory, loadStorageConfig } from '@mxmai/mxmdata';

const router = Router();

function resolveMxmcgiAssetsRoot(): string {
  const base = path.basename(__dirname);
  if (base === 'dist') return path.join(__dirname, '..', 'assets');
  if (__dirname.includes(`${path.sep}src${path.sep}`)) {
    return path.resolve(__dirname, '../../assets');
  }
  return path.join(__dirname, 'assets');
}

const LOCAL_ASSETS_ROOT = resolveMxmcgiAssetsRoot();

/** 仅当公网 URL 可被浏览器直接访问时才 302，内网 MinIO 地址改由 Gateway 代理 */
function isBrowserReachablePublicUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.local') ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

router.get(/.*/, async (req: Request, res: Response) => {
  try {
    const relPath = req.path.replace(/^\/+/, '');
    if (!relPath) {
      return res.status(400).json({ success: false, error: 'Missing path' });
    }

    const cfg = loadStorageConfig().domains.system_static;
    if (
      cfg.accessMode === 'public' &&
      cfg.publicBaseUrl &&
      isBrowserReachablePublicUrl(cfg.publicBaseUrl)
    ) {
      const target = `${cfg.publicBaseUrl.replace(/\/+$/, '')}/sys/${relPath}`;
      return res.redirect(302, target);
    }

    const objectKey = relPath.startsWith('sys/') ? relPath : `sys/${relPath}`;
    const storage = RepositoryFactory.getStorageService();
    const adapter = storage.forDomain('system_static');

    try {
      const fileBuffer = await adapter.downloadFile(cfg.bucket, objectKey);
      const metadata = await adapter.getFileMetadata(cfg.bucket, objectKey);
      const contentType = metadata?.contentType || 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(fileBuffer);
    } catch (storageError) {
      const localCandidates = [
        path.join(LOCAL_ASSETS_ROOT, relPath),
        // 兼容旧路径：assets/minimax/voice-previews/{file}.mp3
        path.join(
          LOCAL_ASSETS_ROOT,
          'minimax',
          'voice-previews',
          path.basename(relPath),
        ),
      ];
      for (const localPath of localCandidates) {
        if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
        const ext = path.extname(localPath).toLowerCase();
        const contentType =
          ext === '.mp3'
            ? 'audio/mpeg'
            : ext === '.wav'
              ? 'audio/wav'
              : ext === '.json'
                ? 'application/json'
                : 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(fs.readFileSync(localPath));
        }
      }
      throw storageError;
    }
  } catch (error) {
    console.error('[Static Route] failed:', error);
    return res.status(404).json({ success: false, error: 'Not found' });
  }
});

export default router;
