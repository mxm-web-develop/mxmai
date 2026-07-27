/**
 * 图集单项重试：对失败 albumResult.items[] 再跑一次 content-illustration，合并进父任务结果
 */
import { extractImageUrlFromTaskResult } from '../../video-edit/media-url-extract';
import { getGeneratedBucket } from '../../../storage/generated-temp';
import { storeFromGenerateResult } from '../../../task/data-store';
import type { Task } from '../../../task/types';
import { taskExecutor } from '../../../task/task-executor';
import { DEFAULT_AI_IMAGE_GENERATOR } from '../graph-image-business';
import { normalizeAlbumSpec } from './album-spec';
import type { AlbumResult, AlbumResultItem, AlbumSpec } from './album-types';

function mapUsageContext(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (s === 'web_content' || s === 'video_embed' || s === 'document_slide') return s;
  return 'document_slide';
}

function mapIllustrationStyle(raw: unknown): string {
  const s = String(raw ?? '').trim();
  const allowed = new Set([
    'realistic_illustration',
    'stylized_illustration',
    'documentary_portrait',
    'cinematic_keyframe',
    'explain_visual',
    'warm_narrative',
    'cover_pop',
    'ink_neo_chinese',
  ]);
  if (allowed.has(s)) return s;
  const legacy: Record<string, string> = {
    clean_minimal: 'explain_visual',
    corporate_professional: 'realistic_illustration',
    playful_friendly: 'warm_narrative',
    tech_modern: 'stylized_illustration',
    editorial_magazine: 'cinematic_keyframe',
    data_infographic: 'explain_visual',
  };
  return legacy[s] ?? 'stylized_illustration';
}

function readAlbumSpecFromTask(task: Task): AlbumSpec | null {
  const rp = (task.requestParams ?? {}) as Record<string, unknown>;
  const nested = (rp.params ?? {}) as Record<string, unknown>;
  const bps = (rp.businessPipelineState ?? nested.businessPipelineState ?? {}) as Record<
    string,
    unknown
  >;
  const raw =
    bps.albumSpec ??
    bps.albumSpecJson ??
    nested.album_spec ??
    rp.album_spec ??
    null;
  if (raw == null) return null;
  try {
    return normalizeAlbumSpec(raw);
  } catch {
    return null;
  }
}

function readAlbumResult(task: Task): AlbumResult | null {
  const meta = (task.result?.metadata ?? {}) as Record<string, unknown>;
  const raw = meta.albumResult;
  if (!raw || typeof raw !== 'object') return null;
  const items = (raw as AlbumResult).items;
  if (!Array.isArray(items)) return null;
  return raw as AlbumResult;
}

export type RetryAlbumItemResult = {
  itemId: string;
  status: 'ready' | 'failed';
  error?: string;
  albumResult: AlbumResult;
  mediaUrls: string[];
};

/**
 * 重试父图集任务中某一失败项（同步等待生图结果）
 */
export async function retryAlbumItem(args: {
  task: Task;
  itemId: string;
  userId: string;
}): Promise<RetryAlbumItemResult> {
  const { task, itemId, userId } = args;
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
  if (target.status === 'ready' && target.imageUrl) {
    throw new Error('该条目已成功，无需重试');
  }

  const spec = readAlbumSpecFromTask(task);
  const specItem = spec?.items.find((it) => it.id === itemId);
  const mxmImagePrompt =
    (typeof target.mxmImagePrompt === 'string' && target.mxmImagePrompt.trim()
      ? target.mxmImagePrompt.trim()
      : '') ||
    (typeof specItem?.mxmImagePrompt === 'string' ? specItem.mxmImagePrompt.trim() : '');
  if (!mxmImagePrompt) {
    throw new Error('缺少配图提示词（mxmImagePrompt），无法重试');
  }

  const title =
    (typeof target.title === 'string' && target.title.trim()
      ? target.title.trim()
      : '') ||
    (typeof specItem?.title === 'string' ? specItem.title.trim() : '') ||
    itemId;
  const aspect =
    specItem?.aspect_ratio ??
    (typeof albumResult.aspect_ratio === 'string' ? albumResult.aspect_ratio : '16:9') ??
    '16:9';

  const rp = (task.requestParams ?? {}) as Record<string, unknown>;
  const nested = (rp.params ?? {}) as Record<string, unknown>;
  const usageContext = mapUsageContext(nested.usage_context ?? rp.usage_context);
  const illustrationStyle = mapIllustrationStyle(
    nested.illustration_style ??
      rp.illustration_style ??
      nested.flat_visual_tone ??
      rp.flat_visual_tone
  );

  const { runTaskV2Single } = await import('../../../tasks/task-engine');

  let nextItem: AlbumResultItem;
  let newEphemeralUrl: string | undefined;

  try {
    const result = await runTaskV2Single(
      {
        scope: 'graph',
        taskKey: DEFAULT_AI_IMAGE_GENERATOR.taskKey,
        subtype: DEFAULT_AI_IMAGE_GENERATOR.subtype,
        params: {
          type: 'poster',
          core_content: mxmImagePrompt,
          usage_context: usageContext,
          aspect_ratio: aspect,
          illustration_style: illustrationStyle,
          flat_visual_tone: illustrationStyle,
          prompt: typeof specItem?.notes === 'string' ? specItem.notes.trim() : '',
          style_ref_images: [],
          source: 'graph-album-item-retry',
          album_item_id: itemId,
          label: `内容配图 · ${title}`,
          uid: `album-retry-${parentTaskId}-${itemId}-${Date.now()}`,
        },
        metadata: {
          label: `内容配图 · ${title}`,
          parentAlbumTaskId: parentTaskId,
          albumItemAsset: true,
          albumItemId: itemId,
        },
        options: { ephemeral: true, keepTask: false },
      },
      userId
    );

    const imageUrl = extractImageUrlFromTaskResult(result);
    if (!imageUrl) {
      throw new Error('子任务未返回图片 URL');
    }
    newEphemeralUrl = imageUrl;
    nextItem = {
      id: itemId,
      order: typeof target.order === 'number' ? target.order : itemIndex + 1,
      title,
      mxmImagePrompt,
      imageUrl,
      status: 'ready',
      childTaskId: result.taskId,
    };
  } catch (err) {
    nextItem = {
      id: itemId,
      order: typeof target.order === 'number' ? target.order : itemIndex + 1,
      title,
      mxmImagePrompt,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const items = albumResult.items.slice();
  items[itemIndex] = nextItem;
  items.sort((a, b) => a.order - b.order);

  const prevStorage = task.result?.storageInfo;
  const prevKeys = Array.isArray(prevStorage?.keys) ? [...prevStorage!.keys!] : [];
  const prevUrls = Array.isArray(prevStorage?.urls) ? [...prevStorage!.urls!] : [];
  let bucket = prevStorage?.bucket || getGeneratedBucket();

  const prevReadyOrdered = albumResult.items
    .filter((it) => it.status === 'ready' && it.imageUrl)
    .sort((a, b) => a.order - b.order);

  /** itemId → MinIO storage slot */
  const storageByItemId = new Map<string, { key: string; url: string }>();
  prevReadyOrdered.forEach((it, i) => {
    const key = prevKeys[i];
    if (!key) return;
    storageByItemId.set(it.id, {
      key,
      url: typeof prevUrls[i] === 'string' ? prevUrls[i]! : '',
    });
  });

  if (nextItem.status === 'ready' && newEphemeralUrl) {
    const storageResults = await storeFromGenerateResult(
      { mediaUrls: [newEphemeralUrl], metadata: { model: 'gpt-image-2' } },
      {
        bucket: getGeneratedBucket(),
        pathTemplate: '{userId}/graph/{timestamp}-{randomId}-{index}.{ext}',
      },
      userId,
      'gpt-image-2'
    );
    const sr = storageResults[0];
    if (!sr) throw new Error('转存重试图片失败');
    bucket = sr.bucket;
    storageByItemId.set(itemId, {
      key: sr.key,
      url: sr.url.replace(/http:+\/\//g, 'http://').replace(/https:+\/\//g, 'https://'),
    });
  }

  const readyOrdered = items.filter((it) => it.status === 'ready');
  const nextKeys: string[] = [];
  const nextUrls: string[] = [];
  const proxyUrls: string[] = [];
  let readyIdx = 0;
  const mergedItems: AlbumResultItem[] = items.map((it) => {
    if (it.status !== 'ready') return it;
    const slot = storageByItemId.get(it.id);
    if (!slot?.key) {
      console.warn(`[retryAlbumItem] ready item ${it.id} missing storage key`);
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
    coverUrl: proxyUrls[0] ?? albumResult.coverUrl,
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

  // 重试成功且任务曾因部分失败被标 failed 时，恢复为 completed
  if (readyCount > 0 && (task.status === 'failed' || task.status === 'cancelled')) {
    try {
      await taskManager.updateTaskStatus(parentTaskId, 'completed');
    } catch {
      /* 状态更新失败不阻断重试结果 */
    }
  }

  return {
    itemId,
    status: nextItem.status,
    error: nextItem.error,
    albumResult: nextAlbum,
    mediaUrls: proxyUrls,
  };
}
