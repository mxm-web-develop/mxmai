/**
 * integration 类型 API Key 仅允许访问开放 API 路径
 */
import { Response, NextFunction } from 'express';
import type { AuthRequest } from './auth';

const OPEN_API_PREFIX = '/api/v1/open';
/** integration Key 额外允许：参考图上传、任务/资产媒体读取 */
const INTEGRATION_UPLOAD_PREFIX = '/api/v1/cgi/upload';
const INTEGRATION_MEDIA_PREFIX = '/api/v1/media';

function isIntegrationAllowedPath(path: string, method: string): boolean {
  if (path.startsWith(OPEN_API_PREFIX)) return true;
  const m = method.toUpperCase();
  if (path.startsWith(INTEGRATION_UPLOAD_PREFIX) && (m === 'POST' || m === 'PUT')) {
    return true;
  }
  if (path.startsWith(INTEGRATION_MEDIA_PREFIX) && (m === 'GET' || m === 'HEAD')) {
    return true;
  }
  return false;
}

export function apiKeyScopeMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (req.user?.apiKeyType !== 'integration') {
    return next();
  }

  const path = String(req.originalUrl || req.url || '').split('?')[0];
  if (isIntegrationAllowedPath(path, req.method)) {
    return next();
  }

  res.status(403).json({
    success: false,
    error: {
      code: 'API_KEY_SCOPE_FORBIDDEN',
      message:
        '此密钥为「开放 API 客户端」类型，仅可访问 /api/v1/open/*。平台自动化请使用「个人访问凭证」类型密钥。',
    },
  });
}
