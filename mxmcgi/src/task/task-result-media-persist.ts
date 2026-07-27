/**
 * 将任务 result.mediaUrls 中的 data URI / 纯 base64 转存对象存储，避免大段 base64 写入 cgi_tasks JSON。
 * 与 graph-task / TaskExecutor.processResult 的默认 bucket、path 约定对齐。
 */

import { storeMedia, type StorageConfig } from './data-store';
import { isBase64, sanitizeBase64InObject } from './reference-image';
import type { Task, TaskResult, TaskType } from './types';
import { getGeneratedBucket } from '../storage/generated-temp';

const MEDIA_PROXY_TYPES = new Set(['graph', 'video', 'audio', 'music']);

function mediaProxyTypeForTask(taskType: TaskType): string {
  if (taskType === 'music') return 'music';
  if (MEDIA_PROXY_TYPES.has(taskType)) return taskType;
  return 'graph';
}

/** API 响应：内联 base64 替换为媒体代理路径，避免巨型 JSON */
export function sanitizeTaskResultForApiResponse(task: Task): Task {
  if (!task.result) return task;

  const mediaUrls = task.result.mediaUrls;
  let nextUrls = mediaUrls;
  if (Array.isArray(mediaUrls) && mediaUrls.length > 0) {
    const proxyType = mediaProxyTypeForTask(task.type);
    nextUrls = mediaUrls.map((u) => {
      if (typeof u === 'string' && mediaUrlNeedsObjectStorage(u)) {
        return `/api/v1/media/${proxyType}/${encodeURIComponent(task.id)}`;
      }
      return u;
    });
  }

  const metadata = task.result.metadata
    ? (sanitizeBase64InObject(task.result.metadata) as Record<string, unknown>)
    : task.result.metadata;

  return {
    ...task,
    result: {
      ...task.result,
      mediaUrls: nextUrls,
      metadata,
    },
  };
}

/** 是否需要转存（非可直接长期引用的 http(s) URL） */
export function mediaUrlNeedsObjectStorage(url: string): boolean {
  const s = typeof url === 'string' ? url.trim() : '';
  if (!s) return false;
  if (s.startsWith('data:')) return true;
  if (s.startsWith('http://') || s.startsWith('https://')) return false;
  return isBase64(s);
}

function normalizeUrlColons(url: string): string {
  let u = url;
  u = u.replace(/http:+\/\//g, 'http://');
  u = u.replace(/https:+\/\//g, 'https://');
  return u;
}

/** 仅当 bucket + pathTemplate 均为非空字符串时才视为可用（避免 {} 或半截配置阻断默认路径） */
export function isCompleteStorageConfig(c: unknown): c is StorageConfig {
  if (!c || typeof c !== 'object') return false;
  const o = c as Record<string, unknown>;
  return (
    typeof o.bucket === 'string' &&
    o.bucket.trim().length > 0 &&
    typeof o.pathTemplate === 'string' &&
    o.pathTemplate.trim().length > 0
  );
}

function resolveStorageConfig(task: Task): StorageConfig | undefined {
  const m = task.metadata?.storageConfig;
  if (isCompleteStorageConfig(m)) {
    return { bucket: m.bucket, pathTemplate: m.pathTemplate };
  }
  const tt = task.type;
  const pathTemplateMap: Record<string, string> = {
    graph: '{userId}/graph/{timestamp}-{randomId}-{index}.{ext}',
    image: '{userId}/graph/{timestamp}-{randomId}-{index}.{ext}',
    video: '{userId}/video/{timestamp}-{randomId}-{index}.{ext}',
    audio: '{userId}/audio/{timestamp}-{randomId}-{index}.{ext}',
    music: '{userId}/music/{timestamp}-{randomId}-{index}.{ext}',
    'graph-grid9-parent': '{userId}/graph/{timestamp}-{randomId}-{index}.{ext}',
    other: '{userId}/other/{timestamp}-{randomId}-{index}.{ext}',
  };
  return {
    bucket: getGeneratedBucket(),
    pathTemplate: pathTemplateMap[tt] || pathTemplateMap.other,
  };
}

/**
 * 将内联图片/媒体转存后写回 result（仅改写需要转存的槽位；已 http(s) 的保留）。
 * @throws 上传失败时抛出，由调用方决定是否标记任务失败
 */
export async function persistTaskResultInlineMedia(task: Task, result: TaskResult): Promise<TaskResult> {
  const mediaUrls = result.mediaUrls;
  if (!Array.isArray(mediaUrls) || mediaUrls.length === 0) return result;

  const needIdx = mediaUrls
    .map((u, i) => (typeof u === 'string' && mediaUrlNeedsObjectStorage(u) ? i : -1))
    .filter((i) => i >= 0);
  if (needIdx.length === 0) return result;

  /** 存在 data:/纯 base64 等内联媒体时一律转对象存储，避免巨型 JSON 落库与列表接口爆掉 */
  const cfg = resolveStorageConfig(task);
  if (!cfg?.bucket || !cfg.pathTemplate) {
    throw new Error(
      `[persistTaskResultInlineMedia] 无法解析 storageConfig，拒绝将内联媒体写入 DB（taskId=${task.id}）`
    );
  }

  const userId = task.metadata?.userId || 'anonymous';
  const modelName =
    (typeof task.metadata?.model === 'string' && task.metadata.model) ||
    (typeof (task.requestParams as Record<string, unknown>)?.model === 'string'
      ? String((task.requestParams as Record<string, unknown>).model)
      : '') ||
    'unknown';

  const nextUrls = mediaUrls.map((u) => (typeof u === 'string' ? u : String(u)));
  const n = nextUrls.length;
  const keysOut: string[] =
    result.storageInfo?.keys && result.storageInfo.keys.length === n ? [...result.storageInfo.keys] : Array(n).fill('');
  let bucket = result.storageInfo?.bucket || cfg.bucket;

  for (const i of needIdx) {
    const raw = nextUrls[i];
    const configWithIndex: StorageConfig = {
      ...cfg,
      pathTemplate: cfg.pathTemplate.replace(/\{index\}/g, String(i)),
    };
    const sr = await storeMedia({ url: raw }, configWithIndex, userId, modelName);
    nextUrls[i] = normalizeUrlColons(sr.url);
    keysOut[i] = sr.key;
    bucket = sr.bucket;
  }

  for (const i of needIdx) {
    if (mediaUrlNeedsObjectStorage(nextUrls[i])) {
      throw new Error(
        `[persistTaskResultInlineMedia] 转存后 index=${i} 仍为内联媒体，拒绝返回 taskId=${task.id}`
      );
    }
  }

  return {
    ...result,
    mediaUrls: nextUrls,
    storageInfo: {
      keys: keysOut,
      bucket,
      urls: nextUrls,
    },
  };
}
