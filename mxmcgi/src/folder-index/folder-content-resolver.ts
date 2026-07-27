import crypto from 'crypto';
import { RepositoryFactory, getSupabaseClient } from '@mxmai/mxmdata';
import type { Folder } from '@mxmai/mxmdata';
import { decodePossiblyMojibakeFilename } from '../utils/filename-encoding';

export type ResolvedRef = {
  ref_type: 'task' | 'storage_object';
  ref_id: string;
  title: string;
  textContent?: string;
  imageBuffers?: Array<{ buffer: Buffer; mimeType: string; name: string }>;
  skipReason?: string;
};

function hashContent(parts: string[]): string {
  return crypto.createHash('sha256').update(parts.join('\n---\n')).digest('hex').slice(0, 64);
}

function collectStrings(obj: unknown, out: string[], depth = 0): void {
  if (depth > 8 || obj == null) return;
  if (typeof obj === 'string') {
    if (obj.length > 20 && !obj.startsWith('data:')) out.push(obj);
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) collectStrings(item, out, depth + 1);
    return;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (['text', 'content', 'output', 'body', 'article', 'title', 'description', 'prompt'].includes(k)) {
        collectStrings(v, out, depth + 1);
      } else if (k === 'url' || k === 'image_url' || k.endsWith('_url')) {
        collectStrings(v, out, depth + 1);
      }
    }
  }
}

function extractImageUrls(obj: unknown): string[] {
  const urls: string[] = [];
  const walk = (v: unknown, depth = 0) => {
    if (depth > 10 || v == null) return;
    if (typeof v === 'string' && /^https?:\/\//.test(v) && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(v)) {
      urls.push(v);
      return;
    }
    if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
    else if (typeof v === 'object') Object.values(v as object).forEach((x) => walk(x, depth + 1));
  };
  walk(obj);
  return [...new Set(urls)];
}

async function fetchImageBuffer(url: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    const mimeType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, mimeType };
  } catch {
    return null;
  }
}

export async function resolveTaskRef(taskId: string, userId: string): Promise<ResolvedRef | null> {
  const supabase = getSupabaseClient();
  const { data: task } = await supabase
    .from('cgi_tasks')
    .select('id, user_id, task_type, status, prompt, metadata, result')
    .eq('id', taskId)
    .eq('user_id', userId)
    .single();

  if (!task) return null;

  const title =
    (task.metadata as Record<string, unknown>)?.title?.toString() ||
    task.prompt?.substring(0, 80) ||
    `任务 ${taskId}`;

  const textParts: string[] = [];
  if (task.prompt) textParts.push(`Prompt: ${task.prompt}`);
  collectStrings(task.metadata, textParts);
  collectStrings(task.result, textParts);

  const imageUrls = extractImageUrls(task.result);
  const imageBuffers: ResolvedRef['imageBuffers'] = [];

  for (const url of imageUrls.slice(0, 5)) {
    const img = await fetchImageBuffer(url);
    if (img) imageBuffers.push({ ...img, name: `${taskId}-image` });
  }

  const taskType = String(task.task_type || '');
  if (textParts.length === 0 && imageBuffers.length === 0) {
    return {
      ref_type: 'task',
      ref_id: taskId,
      title,
      skipReason: `任务类型 ${taskType} 暂无可索引文本或图片`,
    };
  }

  return {
    ref_type: 'task',
    ref_id: taskId,
    title,
    textContent: textParts.join('\n\n'),
    imageBuffers,
  };
}

export async function resolveStorageObjectRef(objectId: string, userId: string): Promise<ResolvedRef | null> {
  const supabase = getSupabaseClient();
  const { data: obj } = await supabase
    .from('storage_objects')
    .select('id, user_id, original_name, content_type, bucket, object_key, metadata')
    .eq('id', objectId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single();

  if (!obj) return null;

  const title = decodePossiblyMojibakeFilename(obj.original_name) || `文件 ${objectId}`;
  const ct = (obj.content_type || '').toLowerCase();
  const name = title.toLowerCase();

  if (ct.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.markdown')) {
    const storageRepo = RepositoryFactory.createStorageRepository();
    const buffer = await storageRepo.downloadFile(obj.bucket, obj.object_key);
    return {
      ref_type: 'storage_object',
      ref_id: objectId,
      title,
      textContent: buffer.toString('utf-8'),
    };
  }

  if (ct.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/.test(name)) {
    const storageRepo = RepositoryFactory.createStorageRepository();
    const buffer = await storageRepo.downloadFile(obj.bucket, obj.object_key);
    return {
      ref_type: 'storage_object',
      ref_id: objectId,
      title,
      imageBuffers: [{ buffer, mimeType: ct || 'image/jpeg', name: title }],
    };
  }

  return {
    ref_type: 'storage_object',
    ref_id: objectId,
    title,
    skipReason: `不支持的文件类型: ${ct || 'unknown'}`,
  };
}

export function contentHashForResolved(ref: ResolvedRef, captionTexts: string[]): string {
  return hashContent([
    ref.textContent || '',
    ...captionTexts,
    ref.skipReason || '',
  ]);
}

export async function resolveFolderItemRefs(
  folderId: string,
  userId: string
): Promise<ResolvedRef[]> {
  const folderRepo = RepositoryFactory.createFolderRepository();
  const items = await folderRepo.getFolderItems(folderId);
  const resolved: ResolvedRef[] = [];

  for (const item of items) {
    if (item.task_id) {
      const r = await resolveTaskRef(item.task_id, userId);
      if (r) resolved.push(r);
    } else if (item.storage_object_id) {
      const r = await resolveStorageObjectRef(item.storage_object_id, userId);
      if (r) resolved.push(r);
    }
  }

  return resolved;
}

export async function assertVirtualFolder(folderId: string, userId: string): Promise<Folder> {
  const folderRepo = RepositoryFactory.createFolderRepository();
  const folder = await folderRepo.getFolderById(folderId);
  if (!folder) {
    throw new Error('文件夹不存在或无权限');
  }
  if (folder.user_id !== userId && !folder.is_system) {
    throw new Error('文件夹不存在或无权限');
  }
  if (folder.folder_kind !== 'virtual') {
    throw new Error('仅虚拟文件夹支持向量化索引');
  }
  return folder;
}
