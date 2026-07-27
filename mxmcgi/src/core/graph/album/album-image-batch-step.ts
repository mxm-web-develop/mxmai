/**
 * 管线步骤：albumImageBatch — 并发生成图集全部配图（atlas gpt-image-2 / content-illustration）
 */
import type { PipelineStep, TaskContext } from '../../../tasks/types';
import { extractImageUrlFromTaskResult } from '../../video-edit/media-url-extract';
import { DEFAULT_AI_IMAGE_GENERATOR } from '../graph-image-business';
import { normalizeAlbumSpec } from './album-spec';
import {
  albumImageConcurrency,
  type AlbumResult,
  type AlbumResultItem,
  type AlbumSpec,
} from './album-types';

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
  // 兼容旧 flat_visual_tone 枚举
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

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (!items.length) return [];
  const limit =
    !Number.isFinite(concurrency) || concurrency >= items.length
      ? items.length
      : Math.max(1, Math.floor(concurrency));
  const out: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: limit }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i]!, i);
    }
  });
  await Promise.all(runners);
  return out;
}

function readAlbumSpec(ctx: TaskContext): AlbumSpec {
  const raw =
    ctx.state.albumSpec ??
    ctx.params.album_spec ??
    (typeof ctx.state.albumSpecJson === 'string' ? ctx.state.albumSpecJson : null) ??
    (ctx.state.finalArtifact as { text?: string } | undefined)?.text ??
    (ctx.state.coreArtifact as { text?: string } | undefined)?.text;
  return normalizeAlbumSpec(raw);
}

export async function runAlbumImageBatchStep(
  ctx: TaskContext,
  step: PipelineStep
): Promise<TaskContext> {
  const userId = ctx.userId;
  if (!userId) throw new Error('albumImageBatch：缺少 userId');

  const spec = readAlbumSpec(ctx);
  const taskKey =
    String(step.params?.graphTaskKey ?? '').trim() || DEFAULT_AI_IMAGE_GENERATOR.taskKey;
  const subtype =
    String(step.params?.graphSubtype ?? '').trim() || DEFAULT_AI_IMAGE_GENERATOR.subtype;
  const usageContext = mapUsageContext(
    step.params?.usage_context ?? ctx.params.usage_context
  );
  const flatTone = mapIllustrationStyle(
    step.params?.illustration_style ??
      ctx.params.illustration_style ??
      step.params?.flat_visual_tone ??
      ctx.params.flat_visual_tone
  );
  const concurrency = albumImageConcurrency();
  const parentTaskId = ctx.taskId;

  const { runTaskV2Single } = await import('../../../tasks/task-engine');

  const settled = await mapPool(spec.items, concurrency, async (item) => {
    const t0 = Date.now();
    try {
      const result = await runTaskV2Single(
        {
          scope: 'graph',
          taskKey,
          subtype,
          params: {
            type: 'poster',
            core_content: item.mxmImagePrompt,
            usage_context: usageContext,
            aspect_ratio: item.aspect_ratio ?? spec.aspect_ratio ?? '16:9',
            illustration_style: flatTone,
            flat_visual_tone: flatTone,
            prompt: item.notes?.trim() || '',
            style_ref_images: [],
            source: 'graph-album-pipeline',
            album_item_id: item.id,
            label: `内容配图 · ${item.title}`,
            uid: `album-${parentTaskId ?? 'x'}-${item.id}`,
          },
          metadata: {
            label: `内容配图 · ${item.title}`,
            parentAlbumTaskId: parentTaskId,
            albumItemAsset: true,
            albumItemId: item.id,
          },
          options: { ephemeral: true, keepTask: false },
        },
        userId
      );

      // runTaskV2Single 媒体在 syncResult.mediaUrls（勿读顶层 mediaUrls）
      const imageUrl = extractImageUrlFromTaskResult(result);
      const row: AlbumResultItem = {
        id: item.id,
        order: item.order,
        title: item.title,
        mxmImagePrompt: item.mxmImagePrompt,
        imageUrl,
        status: imageUrl ? 'ready' : 'failed',
        error: imageUrl ? undefined : '子任务未返回图片 URL（syncResult.mediaUrls/storageInfo）',
        childTaskId: result.taskId,
      };
      return { row, durationMs: Date.now() - t0 };
    } catch (err) {
      const row: AlbumResultItem = {
        id: item.id,
        order: item.order,
        title: item.title,
        mxmImagePrompt: item.mxmImagePrompt,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      };
      return { row, durationMs: Date.now() - t0 };
    }
  });

  const resultItems = settled.map((s) => s.row).sort((a, b) => a.order - b.order);
  const mediaUrls = resultItems
    .filter((r) => r.status === 'ready' && r.imageUrl)
    .map((r) => r.imageUrl!);
  const failed = resultItems.filter((r) => r.status === 'failed');

  if (mediaUrls.length === 0) {
    const sample = failed[0]?.error ?? '未知错误';
    throw new Error(`图集并发生图全部失败（${failed.length}/${resultItems.length}）：${sample}`);
  }

  // 部分失败：不抛错，父任务仍 completed，由 metadata.albumFailedCount 告知前端
  if (failed.length > 0) {
    console.warn(
      `[albumImageBatch] 部分失败 ${failed.length}/${resultItems.length}（taskId=${parentTaskId}），已保留 ${mediaUrls.length} 张成功图`
    );
  }

  const albumResult: AlbumResult = {
    albumId: String(parentTaskId ?? ''),
    title: spec.title?.trim() || String(ctx.params.topic ?? '').trim() || '内容配图图集',
    itemCount: resultItems.length,
    aspect_ratio: spec.aspect_ratio ?? '16:9',
    coverUrl: mediaUrls[0],
    items: resultItems,
  };

  const prevFinal = ctx.state.finalArtifact;
  const prevCore = ctx.state.coreArtifact;
  const metaBase =
    (prevFinal?.metadata as Record<string, unknown> | undefined) ??
    (prevCore?.metadata as Record<string, unknown> | undefined) ??
    {};

  const artifact = {
    kind: 'image' as const,
    mediaUrls,
    text: typeof prevFinal?.text === 'string' ? prevFinal.text : JSON.stringify(spec),
    metadata: {
      ...metaBase,
      resultKind: 'image-album',
      albumResult,
      albumItemCount: resultItems.length,
      albumReadyCount: mediaUrls.length,
      albumFailedCount: failed.length,
      orchestrator: true,
    },
  };

  return {
    ...ctx,
    state: {
      ...ctx.state,
      albumResult,
      coreArtifact: artifact,
      finalArtifact: artifact,
    },
  };
}
