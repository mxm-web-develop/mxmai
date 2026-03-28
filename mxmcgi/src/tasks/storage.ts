import crypto from 'crypto';
import { RepositoryFactory } from '@mxmai/mxmdata';
import type { BaseStorageConfig } from './types';

function formatDateYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_all, k: string) => vars[k] ?? '');
}

export async function saveTaskOutput(params: {
  storage: BaseStorageConfig;
  scope: string;
  taskKey: string;
  userId?: string;
  taskId: string;
  content: unknown;
}): Promise<{ bucket: string; key: string; url: string; presignedUrl?: string; contentType?: string }> {
  const { storage, scope, taskKey, userId, taskId, content } = params;
  const repo = RepositoryFactory.createStorageRepository();

  const now = new Date();
  const date = formatDateYYYYMMDD(now);
  const uuid = crypto.randomUUID();
  const timestamp = String(Date.now());

  const ext = storage.extension.startsWith('.') ? storage.extension.slice(1) : storage.extension;
  const vars: Record<string, string> = {
    scope,
    taskKey,
    userId: userId ?? 'anonymous',
    taskId,
    date,
    uuid,
    timestamp,
    ext,
  };

  const bucket = storage.bucket || `${scope}-tasks`;
  const pathPrefix = storage.pathTemplate ? renderTemplate(storage.pathTemplate, vars) : `${scope}/${taskKey}/${date}/`;
  const filename = storage.filenameTemplate ? renderTemplate(storage.filenameTemplate, vars) : `${taskId}.${ext}`;
  const key = `${pathPrefix}${filename}`.replace(/\/+/g, '/');

  let buf: Buffer;
  if (Buffer.isBuffer(content)) {
    buf = content;
  } else if (typeof content === 'string') {
    buf = Buffer.from(content, 'utf8');
  } else {
    buf = Buffer.from(JSON.stringify(content, null, 2), 'utf8');
  }

  const contentType = storage.mime || (ext === 'json' ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8');

  const result = await repo.uploadFile(bucket, key, buf, {
    contentType,
    metadata: {
      scope,
      taskKey,
      taskId,
      userId: userId ?? '',
    },
    expiresIn: 7 * 24 * 60 * 60,
  });

  return {
    bucket: result.bucket,
    key: result.key,
    url: result.url,
    presignedUrl: result.presignedUrl,
    contentType,
  };
}

