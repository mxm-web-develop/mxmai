import {
  getKnowledgeFolderItems,
  getKnowledgeFolders,
  peekKnowledgeFolderItems,
  fetchStorageObjectBlobUrl,
  type FolderItem,
  type KnowledgeFolderContentItem,
  type KnowledgeFolderLinkItem,
} from '../../api/client';
import { buildFolderBreadcrumb } from '../../lib/folderTree';
import { extractTextFromFile } from '../../lib/extractTextFromFile';
import { fetchWritingTaskPlainText } from '../../lib/writingTaskText';
import { storageObjectPublicUrl } from '../knowledge-base/knowledgeFolderLinkModel';

export function isTextKnowledgeFolderLink(link: KnowledgeFolderLinkItem): boolean {
  if (link.broken) return false;
  if (link.ref_type === 'storage_object') {
    const ct = (link.content_type ?? '').toLowerCase();
    if (ct.startsWith('text/')) return true;
    return /\.(txt|md|markdown|pdf|csv|json|log)$/i.test(link.name);
  }
  if (link.ref_type === 'task') {
    const t = link.task_type ?? '';
    return t === 'writing' || t === 'text';
  }
  return false;
}

export async function resolveKnowledgeFolderText(link: KnowledgeFolderLinkItem): Promise<string> {
  if (link.broken) throw new Error('软链已失效');
  if (link.ref_type === 'storage_object') {
    const objectId = link.object_id ?? link.id;
    if (!objectId) throw new Error('缺少 storage object id');
    const contentUrl = storageObjectPublicUrl(objectId);
    // blob URL 由 mediaBlobCache 统一管理，不得 revoke（否则缓存命中后 ERR_FILE_NOT_FOUND）
    const blobUrl = await fetchStorageObjectBlobUrl(contentUrl, objectId);
    const res = await fetch(blobUrl);
    if (!res.ok) throw new Error(`读取文件失败 (${res.status})`);
    const blob = await res.blob();
    const file = new File([blob], link.name, {
      type: blob.type || link.content_type || 'application/octet-stream',
    });
    const text = (await extractTextFromFile(file)).trim();
    if (!text) throw new Error('文件内容为空');
    return text;
  }
  const taskId = link.task_id ?? link.id;
  if (!taskId) throw new Error('缺少任务 id');
  return fetchWritingTaskPlainText(taskId);
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
  search: string,
  textOnly = false
): KnowledgeFolderContentItem[] {
  const q = search.trim().toLowerCase();
  return items.filter((it) => {
    if (it.type === 'dir') {
      return !q || it.name.toLowerCase().includes(q);
    }
    if (textOnly && !isTextKnowledgeFolderLink(it)) return false;
    if (!q) return true;
    return it.name.toLowerCase().includes(q) || it.id.toLowerCase().includes(q);
  });
}

export function buildKnowledgeFolderBreadcrumb(folders: FolderItem[], selectedFolderId: string | null) {
  return buildFolderBreadcrumb(folders, selectedFolderId);
}
