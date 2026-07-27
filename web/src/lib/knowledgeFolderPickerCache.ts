import type { StorageObjectListItem, WritingTaskItem } from '../api/client';
import type { TaskCreationSourceTab } from './taskCreationSource';

/** 知识库软链选择器：按 Tab 缓存列表，避免重复请求 */
export type KnowledgeFolderPickerScope = 'writing' | 'graph' | 'video' | 'audio' | 'music' | 'upload';

const TTL_MS = 5 * 60 * 1000;

type TaskCacheEntry = { tasks: WritingTaskItem[]; at: number };
type UploadCacheEntry = { items: StorageObjectListItem[]; at: number };

const taskCache = new Map<string, TaskCacheEntry>();
const uploadCache = new Map<string, UploadCacheEntry>();

function taskCacheKey(scope: Exclude<KnowledgeFolderPickerScope, 'upload'>, source: TaskCreationSourceTab) {
  return `${scope}:${source}`;
}

function uploadCacheKey(folderId: string | null) {
  return folderId ?? 'root';
}

export function getCachedPickerTasks(
  scope: Exclude<KnowledgeFolderPickerScope, 'upload'>,
  source: TaskCreationSourceTab
): WritingTaskItem[] | undefined {
  const hit = taskCache.get(taskCacheKey(scope, source));
  if (!hit || Date.now() - hit.at > TTL_MS) return undefined;
  return hit.tasks;
}

export function setCachedPickerTasks(
  scope: Exclude<KnowledgeFolderPickerScope, 'upload'>,
  source: TaskCreationSourceTab,
  tasks: WritingTaskItem[]
) {
  taskCache.set(taskCacheKey(scope, source), { tasks, at: Date.now() });
}

export function getCachedPickerUploads(folderId: string | null): StorageObjectListItem[] | undefined {
  const hit = uploadCache.get(uploadCacheKey(folderId));
  if (!hit || Date.now() - hit.at > TTL_MS) return undefined;
  return hit.items;
}

export function setCachedPickerUploads(folderId: string | null, items: StorageObjectListItem[]) {
  uploadCache.set(uploadCacheKey(folderId), { items, at: Date.now() });
}

export function invalidateKnowledgeFolderPickerCache(scope?: KnowledgeFolderPickerScope) {
  if (!scope) {
    taskCache.clear();
    uploadCache.clear();
    return;
  }
  if (scope === 'upload') {
    uploadCache.clear();
    return;
  }
  for (const key of [...taskCache.keys()]) {
    if (key.startsWith(`${scope}:`)) taskCache.delete(key);
  }
}
