import { RepositoryFactory } from '../factories/RepositoryFactory';

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export class FolderPathNotFoundError extends Error {
  constructor(message = 'Folder not found') {
    super(message);
    this.name = 'FolderPathNotFoundError';
  }
}

export class FolderPathForbiddenError extends Error {
  constructor(message = 'Folder access denied') {
    super(message);
    this.name = 'FolderPathForbiddenError';
  }
}

/**
 * Resolve asset-center folder slug path for object keys (root = "_").
 */
export async function resolveFolderPathSegmentForUser(
  userId: string,
  folderId?: string | null
): Promise<string> {
  if (!folderId) {
    return '_';
  }

  const folderRepo = RepositoryFactory.createFolderRepository();
  const folder = await folderRepo.getFolderById(folderId);
  if (!folder) {
    throw new FolderPathNotFoundError();
  }
  if (folder.user_id !== userId) {
    throw new FolderPathForbiddenError();
  }
  if (folder.folder_kind && folder.folder_kind !== 'upload') {
    throw new FolderPathForbiddenError('Only upload folders can be used for storage paths');
  }

  const path = await folderRepo.getFolderPath(folderId);
  if (path.length === 0) {
    throw new FolderPathNotFoundError();
  }

  return path.map((f) => sanitizeSegment(f.name)).join('/');
}
