import {
  fetchMediaBlobUrl,
  getAuthenticatedMediaStreamUrl,
  getTask,
  type VirtualFolderLinkItem,
} from '../../api/client';
import { extractFullCgiTaskFromApiResponse } from '../../notifications/task-snapshot';
import {
  resolveVirtualFolderLinkCardKind,
  storageObjectPublicUrl,
  virtualFolderLinkTaskId,
} from '../virtual-folder/virtualFolderLinkModel';

export async function resolveVirtualFolderVisualMedia(
  link: VirtualFolderLinkItem
): Promise<{ url: string; mediaKind: 'image' | 'video' } | null> {
  if (link.broken) return null;
  const kind = resolveVirtualFolderLinkCardKind(link);

  if (kind === 'upload') {
    const objectId = link.object_id ?? link.id;
    const ct = (link.content_type ?? '').toLowerCase();
    return {
      url: storageObjectPublicUrl(objectId),
      mediaKind: ct.startsWith('video/') ? 'video' : 'image',
    };
  }

  if (kind === 'graph' || kind === 'video') {
    const taskId = virtualFolderLinkTaskId(link);
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

export function isVisualVirtualFolderLink(link: VirtualFolderLinkItem): boolean {
  const kind = resolveVirtualFolderLinkCardKind(link);
  return kind === 'upload' || kind === 'graph' || kind === 'video';
}
