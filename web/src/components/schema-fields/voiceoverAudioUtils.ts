import {
  getTask,
  getKnowledgeFolderItems,
  getKnowledgeFolders,
  normalizeUploadedMediaUrl,
  peekKnowledgeFolderItems,
  uploadAssets,
  type FolderItem,
  type KnowledgeFolderContentItem,
  type KnowledgeFolderLinkItem,
} from '../../api/client';
import { buildFolderBreadcrumb } from '../../lib/folderTree';

export { knowledgeFolderLinkTypeLabel, formatKnowledgeFolderLinkId } from '../knowledge-base/knowledgeFolderLinkDisplay';

export function isAudioKnowledgeFolderLink(link: KnowledgeFolderLinkItem): boolean {
  if (link.broken) return false;
  if (link.ref_type === 'storage_object') {
    const ct = (link.content_type ?? '').toLowerCase();
    if (ct.startsWith('audio/')) return true;
    return /\.(mp3|m4a|wav|aac|ogg|flac|webm)$/i.test(link.name);
  }
  if (link.ref_type === 'task') {
    return link.task_type === 'audio' || link.task_type === 'music';
  }
  return false;
}

function storageObjectMediaPath(objectId: string): string {
  return normalizeUploadedMediaUrl(`/api/v1/media/public/object/${encodeURIComponent(objectId)}`);
}

function extractTaskMediaUrl(taskPayload: unknown): string | null {
  if (!taskPayload || typeof taskPayload !== 'object') return null;
  const root = taskPayload as Record<string, unknown>;
  const inner = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>;
  const task = (inner.task && typeof inner.task === 'object' ? inner.task : inner) as Record<string, unknown>;
  const result = (task.result && typeof task.result === 'object' ? task.result : null) as
    | { mediaUrls?: unknown[] }
    | null;
  const urls = Array.isArray(result?.mediaUrls) ? result!.mediaUrls! : [];
  const raw = urls.find((u) => typeof u === 'string' && u.trim().length > 0);
  return typeof raw === 'string' ? normalizeUploadedMediaUrl(raw.trim()) : null;
}

export async function resolveKnowledgeFolderAudioUrl(
  link: KnowledgeFolderLinkItem
): Promise<{ url: string; sourceTaskId?: string }> {
  if (link.broken) throw new Error('软链已失效');
  if (link.ref_type === 'storage_object') {
    const objectId = link.object_id ?? link.id;
    if (!objectId) throw new Error('缺少 storage object id');
    const sourceTaskId =
      (typeof link.task_id === 'string' && link.task_id.trim()) || undefined;
    return { url: storageObjectMediaPath(objectId), sourceTaskId };
  }
  const taskId = link.task_id ?? link.id;
  if (!taskId) throw new Error('缺少任务 id');
  const res = await getTask(taskId);
  if (res.error) throw new Error(res.error);
  const url = extractTaskMediaUrl(res.data);
  if (!url) throw new Error('该音频任务暂无可用 mediaUrls');
  return { url, sourceTaskId: taskId };
}

export function displayNameFromAudioUrl(url: string): string {
  if (!url.trim()) return '未选择音频';
  try {
    const path = url.includes('://') ? new URL(url).pathname : url;
    const base = path.split('/').pop() ?? path;
    return decodeURIComponent(base.split('?')[0] || '口播音频');
  } catch {
    return '口播音频';
  }
}

export async function loadKnowledgeFolderTree(): Promise<FolderItem[]> {
  return getKnowledgeFolders();
}

export async function loadKnowledgeFolderBrowse(
  folderId: string,
  options?: { force?: boolean }
): Promise<{ items: KnowledgeFolderContentItem[]; linksCount: number; folder: FolderItem | null }> {
  const data = await getKnowledgeFolderItems(folderId, options);
  return {
    items: data.items ?? [],
    linksCount: data.links_count ?? 0,
    folder: (data.folder as FolderItem | undefined) ?? null,
  };
}

export function peekKnowledgeFolderBrowse(folderId: string) {
  return peekKnowledgeFolderItems(folderId);
}

export function filterBrowsableKnowledgeFolderItems(
  items: KnowledgeFolderContentItem[],
  search: string
): KnowledgeFolderContentItem[] {
  const q = search.trim().toLowerCase();
  return items.filter((it) => {
    if (it.type === 'dir') {
      return !q || it.name.toLowerCase().includes(q);
    }
    if (!isAudioKnowledgeFolderLink(it)) return false;
    if (!q) return true;
    return it.name.toLowerCase().includes(q) || it.id.toLowerCase().includes(q);
  });
}

export function buildKnowledgeFolderBreadcrumb(folders: FolderItem[], selectedFolderId: string | null) {
  return buildFolderBreadcrumb(folders, selectedFolderId);
}

export async function uploadVoiceoverAudio(file: File): Promise<string> {
  const res = await uploadAssets(file, { storageMode: 'asset', purpose: 'voiceover' });
  const url = res.data?.data?.url;
  if (!url) throw new Error(res.error ?? '上传失败');
  return normalizeUploadedMediaUrl(url);
}
