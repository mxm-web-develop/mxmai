import type { Request } from 'express';
import type { StorageObjectMode } from '@mxmai/mxmdata';
import type { UserUploadPurpose } from './user-upload-service';

export interface ParsedUploadOptions {
  storageMode: StorageObjectMode;
  folderId?: string;
  taskId?: string;
  purpose: UserUploadPurpose;
}

const PURPOSES = new Set<UserUploadPurpose>(['reference', 'character', 'knowledge', 'temp', 'custom']);

export function parseUploadOptions(req: Request): ParsedUploadOptions {
  const q = req.query;
  const b = (req.body || {}) as Record<string, unknown>;

  const rawMode = String(q.storageMode ?? b.storageMode ?? 'asset').toLowerCase();
  const storageMode: StorageObjectMode = rawMode === 'temp' ? 'temp' : 'asset';

  const folderIdRaw = q.folderId ?? b.folderId;
  const folderId =
    folderIdRaw != null && String(folderIdRaw).trim() !== '' ? String(folderIdRaw) : undefined;

  const taskIdRaw = q.taskId ?? b.taskId ?? b.tempForTaskId;
  const taskId =
    taskIdRaw != null && String(taskIdRaw).trim() !== '' ? String(taskIdRaw) : undefined;

  const purposeRaw = String(q.purpose ?? b.purpose ?? 'reference').toLowerCase();
  const purpose: UserUploadPurpose = PURPOSES.has(purposeRaw as UserUploadPurpose)
    ? (purposeRaw as UserUploadPurpose)
    : 'reference';

  return { storageMode, folderId, taskId, purpose };
}
