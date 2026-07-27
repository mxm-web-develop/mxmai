import {
  fetchMediaBlobUrl,
  getAuthenticatedMediaStreamUrl,
  getTask,
  type KnowledgeFolderLinkItem,
} from '../../api/client';
import { extractFullCgiTaskFromApiResponse } from '../../notifications/task-snapshot';
import {
  resolveKnowledgeFolderLinkCardKind,
  storageObjectPublicUrl,
  knowledgeFolderLinkTaskId,
} from '../knowledge-base/knowledgeFolderLinkModel';

export async function resolveKnowledgeFolderVisualMedia(
  link: KnowledgeFolderLinkItem
): Promise<{ url: string; mediaKind: 'image' | 'video' } | null> {
  if (link.broken) return null;
  const kind = resolveKnowledgeFolderLinkCardKind(link);

  if (kind === 'upload') {
    const objectId = link.object_id ?? link.id;
    const ct = (link.content_type ?? '').toLowerCase();
    return {
      url: storageObjectPublicUrl(objectId),
      mediaKind: ct.startsWith('video/') ? 'video' : 'image',
    };
  }

  if (kind === 'graph' || kind === 'video') {
    const taskId = knowledgeFolderLinkTaskId(link);
    const scope = kind === 'video' ? 'video' : 'graph';
    try {
      const res = await getTask(taskId);
      const task = extractFullCgiTaskFromApiResponse(res);
      const urls = (task?.result as { mediaUrls?: string[] } | undefined)?.mediaUrls;
      if (urls?.[0]) {
        return { url: urls[0], mediaKind: kind === 'video' ? 'video' : 'image' };
      }
    } catch {
      /* fall through */
    }
    if (kind === 'video') {
      return { url: getAuthenticatedMediaStreamUrl(taskId, 'video'), mediaKind: 'video' };
    }
    try {
      const blobUrl = await fetchMediaBlobUrl(taskId, 'graph');
      return { url: blobUrl, mediaKind: 'image' };
    } catch {
      return null;
    }
  }

  return null;
}

export function isVisualKnowledgeFolderLink(link: KnowledgeFolderLinkItem): boolean {
  if (link.broken) return false;
  const kind = resolveKnowledgeFolderLinkCardKind(link);
  if (kind === 'graph' || kind === 'video') return true;
  if (kind !== 'upload') return false;
  const ct = (link.content_type ?? '').toLowerCase();
  // 明确排除非视觉类型
  if (ct.startsWith('audio/') || ct.startsWith('text/') || ct === 'application/pdf') return false;
  if (ct.startsWith('image/') || ct.startsWith('video/')) return true;
  // 无 MIME / 扩展名不全时仍视为可选图（历史上传常无 content_type）
  if (!ct || ct === 'application/octet-stream') return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif|mp4|webm|mov|m4v)$/i.test(link.name);
}
