/**
 * 图集单项删除：从 albumResult 移除，重排 storage，可选软删子任务
 */
import { getGeneratedBucket } from '../../../storage/generated-temp';
import type { Task } from '../../../task/types';
import { taskExecutor } from '../../../task/task-executor';
import type { AlbumResult, AlbumResultItem } from './album-types';

function readAlbumResult(task: Task): AlbumResult | null {
  const meta = (task.result?.metadata ?? {}) as Record<string, unknown>;
  const raw = meta.albumResult;
  if (!raw || typeof raw !== 'object') return null;
  const items = (raw as AlbumResult).items;
  if (!Array.isArray(items)) return null;
  return raw as AlbumResult;
}

export type RemoveAlbumItemResult = {
  itemId: string;
  albumResult: AlbumResult;
  mediaUrls: string[];
};

export async function removeAlbumItem(args: {
  task: Task;
  itemId: string;
}): Promise<RemoveAlbumItemResult> {
  const { task, itemId } = args;
  const parentTaskId = task.id;
  const albumResult = readAlbumResult(task);
  if (!albumResult) {
    throw new Error('任务不是图集结果（缺少 albumResult）');
  }

  const itemIndex = albumResult.items.findIndex((it) => it.id === itemId);
  if (itemIndex < 0) {
    throw new Error(`图集中找不到条目：${itemId}`);
  }
  const target = albumResult.items[itemIndex]!;

  const prevStorage = task.result?.storageInfo;
  const prevKeys = Array.isArray(prevStorage?.keys) ? [...prevStorage!.keys!] : [];
  const prevUrls = Array.isArray(prevStorage?.urls) ? [...prevStorage!.urls!] : [];
  const bucket = prevStorage?.bucket || getGeneratedBucket();

  const prevReadyOrdered = albumResult.items
    .filter((it) => it.status === 'ready' && it.imageUrl)
    .sort((a, b) => a.order - b.order);

  const storageByItemId = new Map<string, { key: string; url: string }>();
  prevReadyOrdered.forEach((it, i) => {
    const key = prevKeys[i];
    if (!key) return;
    storageByItemId.set(it.id, {
      key,
      url: typeof prevUrls[i] === 'string' ? prevUrls[i]! : '',
    });
  });
  storageByItemId.delete(itemId);

  const remaining = albumResult.items
    .filter((it) => it.id !== itemId)
    .map((it, idx) => ({ ...it, order: idx + 1 }))
    .sort((a, b) => a.order - b.order);

  const nextKeys: string[] = [];
  const nextUrls: string[] = [];
  const proxyUrls: string[] = [];
  let readyIdx = 0;
  const mergedItems: AlbumResultItem[] = remaining.map((it) => {
    if (it.status !== 'ready') return it;
    const slot = storageByItemId.get(it.id);
    if (!slot?.key) {
      console.warn(`[removeAlbumItem] ready item ${it.id} missing storage key`);
      return it;
    }
    const proxy = `/api/v1/media/graph/${parentTaskId}?index=${readyIdx}`;
    nextKeys.push(slot.key);
    nextUrls.push(slot.url);
    proxyUrls.push(proxy);
    readyIdx += 1;
    return { ...it, imageUrl: proxy, status: 'ready' as const, error: undefined };
  });

  const failedCount = mergedItems.filter((it) => it.status === 'failed').length;
  const readyCount = mergedItems.filter((it) => it.status === 'ready').length;
  const nextAlbum: AlbumResult = {
    ...albumResult,
    itemCount: mergedItems.length,
    coverUrl: proxyUrls[0] ?? undefined,
    items: mergedItems,
  };

  const prevMeta = (task.result?.metadata ?? {}) as Record<string, unknown>;
  const taskManager = taskExecutor.getTaskManager();
  await taskManager.setTaskResult(parentTaskId, {
    mediaUrls: proxyUrls,
    storageInfo: {
      keys: nextKeys,
      bucket,
      urls: nextUrls,
      proxyUrls,
    },
    metadata: {
      ...prevMeta,
      resultKind: 'image-album',
      albumResult: nextAlbum,
      albumReadyCount: readyCount,
      albumFailedCount: failedCount,
      albumItemCount: mergedItems.length,
    },
  });

  const childId =
    typeof target.childTaskId === 'string' && target.childTaskId.trim()
      ? target.childTaskId.trim()
      : '';
  if (childId) {
    try {
      await taskManager.softDeleteTask(childId);
    } catch (err) {
      console.warn(`[removeAlbumItem] softDelete child ${childId} failed:`, err);
    }
  }

  return {
    itemId,
    albumResult: nextAlbum,
    mediaUrls: proxyUrls,
  };
}
