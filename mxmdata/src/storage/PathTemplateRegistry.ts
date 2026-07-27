import type { StorageDomain } from './StorageDomain';

export interface PathTemplateVars {
  userId?: string;
  purpose?: string;
  /** Sanitized folder path segment for asset keys; root = "_" */
  folderPath?: string;
  yyyy?: string;
  uuid?: string;
  ext?: string;
  scope?: string;
  taskId?: string;
  index?: string | number;
  name?: string;
  category?: string;
  version?: string;
  filename?: string;
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function buildObjectKey(
  domain: StorageDomain,
  purpose: string,
  vars: PathTemplateVars
): string {
  const ext = sanitizeSegment(vars.ext || 'bin');
  const purposeSeg = sanitizeSegment(purpose);

  if (domain === 'user_upload') {
    if (purpose === 'temp') {
      const userId = sanitizeSegment(vars.userId || 'anonymous');
      const yyyy = sanitizeSegment(vars.yyyy || '00000000');
      const uuid = sanitizeSegment(vars.uuid || 'unknown');
      return `upload/temp/${userId}/${yyyy}/${uuid}.${ext}`;
    }
    const userId = sanitizeSegment(vars.userId || 'anonymous');
    const yyyy = sanitizeSegment(vars.yyyy || '00000000');
    const uuid = sanitizeSegment(vars.uuid || 'unknown');
    const folderPath = sanitizeSegment(vars.folderPath || '_');
    return `upload/${userId}/assets/${folderPath}/${yyyy}/${uuid}.${ext}`;
  }

  if (domain === 'generated') {
    if (purpose.startsWith('temp_')) {
      const scope = sanitizeSegment(vars.scope || 'unknown');
      const taskId = sanitizeSegment(vars.taskId || 'unknown');
      const name = sanitizeSegment(vars.name || 'file');
      return `gen/temp/${scope}/${taskId}/${name}.${ext}`;
    }
    const scope = sanitizeSegment(vars.scope || 'unknown');
    const userId = sanitizeSegment(vars.userId || 'anonymous');
    const taskId = sanitizeSegment(vars.taskId || 'unknown');
    const index = String(vars.index ?? 0);
    return `gen/${scope}/${userId}/${taskId}/${index}.${ext}`;
  }

  // system_static
  const category = sanitizeSegment(vars.category || purposeSeg);
  const version = sanitizeSegment(vars.version || 'v1');
  const filename = sanitizeSegment(vars.filename || `file.${ext}`);
  return `sys/${category}/${version}/${filename}`;
}

/** Legacy keys still readable in P2 dual-read */
export function isLegacyUserUploadKey(key: string): boolean {
  return (
    /^[^/]+\/upload\/graph\//.test(key) ||
    /^temp\/[^/]+\/\d{8}\//.test(key) ||
    /^\d+-[a-z0-9]+\.(jpg|jpeg|png|webp|gif)$/i.test(key)
  );
}
