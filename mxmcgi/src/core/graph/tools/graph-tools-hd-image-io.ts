import { RepositoryFactory } from '@mxmai/mxmdata';
import { taskManager } from '../../../task/task-manager';
import { loadImageBuffer } from '../../utils/grid-image-io';

const GRAPH_MEDIA_TASK_ID_RE =
  /\/(?:api\/v1\/)?media\/graph\/([^/?#]+)/i;

/** 从 Gateway 媒体代理 URL 解析 Graph 任务 ID */
export function parseGraphMediaProxyTaskId(url: string): string | null {
  const m = String(url).trim().match(GRAPH_MEDIA_TASK_ID_RE);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/** Worker 内直接读任务成片，避免 HTTP 回环 Gateway / Token */
export async function loadGraphTaskImageBuffer(taskId: string): Promise<Buffer> {
  const { task } = await taskManager.getTask(taskId);
  const storageInfo = task.result?.storageInfo;
  const bucket = storageInfo?.bucket;
  const key = storageInfo?.keys?.[0];
  const fallbackUrl =
    (Array.isArray(storageInfo?.urls) && typeof storageInfo.urls[0] === 'string'
      ? storageInfo.urls[0]
      : undefined) ||
    (task.result?.mediaUrls && typeof task.result.mediaUrls[0] === 'string'
      ? task.result.mediaUrls[0]
      : undefined);

  if (bucket && key && String(key).trim()) {
    try {
      const storageRepo = RepositoryFactory.createStorageRepository();
      return await storageRepo.downloadFile(bucket, key);
    } catch (e) {
      if (fallbackUrl && /^https?:\/\//i.test(fallbackUrl)) {
        return loadImageBuffer(fallbackUrl);
      }
      throw e;
    }
  }
  if (fallbackUrl && /^https?:\/\//i.test(fallbackUrl)) {
    return loadImageBuffer(fallbackUrl);
  }
  throw new Error(`任务 ${taskId} 无可用成片存储，无法读取宫格源图`);
}

export async function loadImageContentForHd(imageContent: string): Promise<Buffer> {
  const taskId = parseGraphMediaProxyTaskId(imageContent);
  if (taskId) {
    return loadGraphTaskImageBuffer(taskId);
  }
  return loadImageBuffer(imageContent);
}
