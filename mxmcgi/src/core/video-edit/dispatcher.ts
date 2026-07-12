/**
 * Video Edit Dispatcher — 按 mxmRenderMode 分发 clip 渲染
 */

import type {
  ClipDispatchResult,
  DispatchInput,
  DispatchOutput,
  MxmClipMetadata,
  MxmRenderMode,
  VideoEditScript,
} from "./types";
import { dispatchGsapAnimation } from "./gsap-renderer";
import { dispatchStaticImageHold } from "./static-image-renderer";
import { normalizeClientAccessibleMediaUrl } from "../audio/voiceover-audio-source";
import { concatClipsToFinal, orderedClipResultsFromScript } from "./concat-engine";
import { applySubtitleBurnToScript, applyTextOverlaysToScript } from "./overlay-compositor";
import { subtitleContextForClipInScript } from "./stock-subtitle-context";
import { buildFragmentParamsFromClipMetadata } from "./fragment-pipeline-params";
import { buildAiImageDispatchParams } from "./ai-image-dispatch-params";
import { normalizeVideoGeneratorRoute } from "../video/video-business-category";
import { normalizeGraphImageRoute } from "../graph/graph-image-business";
import {
  extractImageUrlFromTaskResult,
  extractVideoUrlFromTaskResult,
  summarizeMissingMediaTaskResult,
} from "./media-url-extract";
import { preassignAutoStockForClipJobs, type StockMediaResolveResult } from "./stock-media-resolver";
import { parseClipRenderAttempts, sleepMs, clipRetryDelayMs } from "./clip-retry";

export { extractVideoUrlFromTaskResult } from "./media-url-extract";

function parseVideoEditClipConcurrency(): number {
  const raw = process.env.VIDEO_EDIT_CLIP_CONCURRENCY;
  const n = raw ? Number(raw) : 2;
  return Number.isFinite(n) && n > 0 ? Math.floor(Math.min(n, 8)) : 2;
}

function isSuccessfulClipResult(r: ClipDispatchResult): boolean {
  return Boolean(r.videoUrl) && !r.error;
}

async function dispatchOneWithRetry(
  job: ClipJob,
  userId: string,
  parentTaskId: string | undefined,
  pipelineCtx: { globalTopic?: string; editStyle?: string } | undefined,
  preassignedStock: StockMediaResolveResult | undefined,
  maxAttempts: number
): Promise<ClipDispatchResult> {
  let last: ClipDispatchResult | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let result: ClipDispatchResult;
    try {
      result = await dispatchOne(
        job,
        userId,
        parentTaskId,
        pipelineCtx,
        // 仅首次使用预分配素材；重试时让 resolver 重新选，避免坏链接反复失败
        attempt === 0 ? preassignedStock : undefined
      );
    } catch (err) {
      result = {
        clipId: job.clipId,
        renderMode: job.renderMode,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    if (isSuccessfulClipResult(result)) {
      if (attempt > 0) {
        console.info(
          `[video-edit-dispatcher] ${job.clipId} 第 ${attempt + 1}/${maxAttempts} 次渲染成功`
        );
      }
      return result;
    }
    last = result;
    if (attempt < maxAttempts - 1) {
      const delay = clipRetryDelayMs(attempt);
      console.warn(
        `[video-edit-dispatcher] ${job.clipId} 第 ${attempt + 1}/${maxAttempts} 次失败，${delay}ms 后重试:`,
        result.error ?? "unknown"
      );
      await sleepMs(delay);
    }
  }
  return (
    last ?? {
      clipId: job.clipId,
      renderMode: job.renderMode,
      error: `渲染失败（已重试 ${maxAttempts} 次）`,
    }
  );
}

export async function dispatchVideoEdit(input: DispatchInput): Promise<DispatchOutput> {
  const startedAt = Date.now();
  const { script, userId, parentTaskId } = input;
  const options = input.options ?? {};
  const concatFinal = options.concatFinal !== false;
  const skipReadyClips = options.skipReadyClips === true;
  const concatOnly = options.concatOnly === true;
  const applyOverlays = options.applyOverlays === true;
  const applySubtitleBurn = options.applySubtitleBurn !== false && !concatOnly;
  const applyTransitions = options.applyTransitions === true;
  const maxAttempts = parseClipRenderAttempts();

  let results: ClipDispatchResult[] = [];

  if (concatOnly) {
    results = orderedClipResultsFromScript(script);
  } else {
    const clipJobs = collectRenderableClips(script, { skipReadyClips });
    const pipelineCtx = readPipelineDispatchContext(script);
    const stockPreassign = await preassignAutoStockForClipJobs(clipJobs);
    const CONCURRENCY = parseVideoEditClipConcurrency();

    for (let i = 0; i < clipJobs.length; i += CONCURRENCY) {
      const batch = clipJobs.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map((job) =>
          dispatchOneWithRetry(
            job,
            userId,
            parentTaskId,
            pipelineCtx,
            stockPreassign.get(job.clipId),
            maxAttempts
          )
        )
      );
      for (let j = 0; j < batch.length; j++) {
        const job = batch[j]!;
        const r = batchResults[j]!;
        if (r.status === "fulfilled") {
          results.push(r.value);
        } else {
          results.push({
            clipId: job.clipId,
            renderMode: job.renderMode,
            error: r.reason instanceof Error ? r.reason.message : String(r.reason),
          });
        }
      }
    }

    // 整批结束后再对仍失败的片段做一轮补救（每段再试 2 次）
    const salvageAttempts = Math.min(2, maxAttempts);
    const failedIds = new Set(
      results.filter((r) => !isSuccessfulClipResult(r)).map((r) => r.clipId)
    );
    if (failedIds.size > 0) {
      const retryJobs = clipJobs.filter((j) => failedIds.has(j.clipId));
      console.warn(
        `[video-edit-dispatcher] ${retryJobs.length} 段仍失败，开始最终补救轮（每段最多 ${salvageAttempts} 次）`
      );
      for (let i = 0; i < retryJobs.length; i += CONCURRENCY) {
        const batch = retryJobs.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.allSettled(
          batch.map((job) =>
            dispatchOneWithRetry(job, userId, parentTaskId, pipelineCtx, undefined, salvageAttempts)
          )
        );
        for (let j = 0; j < batch.length; j++) {
          const job = batch[j]!;
          const r = batchResults[j]!;
          const next =
            r.status === "fulfilled"
              ? r.value
              : {
                  clipId: job.clipId,
                  renderMode: job.renderMode,
                  error: r.reason instanceof Error ? r.reason.message : String(r.reason),
                };
          const idx = results.findIndex((x) => x.clipId === job.clipId);
          if (idx >= 0) results[idx] = next;
          else results.push(next);
        }
      }
    }

    if (skipReadyClips) {
      results = mergeWithExistingReadyClips(script, results);
    }
  }

  applyRenderedUrlsToScript(script, results);

  if (applySubtitleBurn) {
    await applySubtitleBurnToScript(script, userId, parentTaskId);
  }

  if (applyOverlays) {
    await applyTextOverlaysToScript(script, userId, parentTaskId);
  }

  let finalVideoUrl: string | undefined;
  if (concatFinal) {
    const ordered = orderedClipResultsFromScript(script);
    finalVideoUrl = await concatClipsToFinal({
      clips: ordered,
      totalDuration: script.project.timeline.duration,
      userId,
      parentTaskId,
      script,
      applyTransitions,
    }).catch((e) => {
      console.warn("[video-edit-dispatcher] concat 失败，跳过拼接：", e);
      return undefined;
    });
  }

  const failedCount = orderedClipResultsFromScript(script).filter((r) => Boolean(r.error)).length;
  return {
    clips: orderedClipResultsFromScript(script),
    finalVideoUrl,
    script,
    totalDurationMs: Date.now() - startedAt,
    failedCount,
  };
}

interface ClipJob {
  clipId: string;
  renderMode: MxmRenderMode;
  startTime: number;
  duration: number;
  metadata: MxmClipMetadata;
  targetWidth?: number;
  targetHeight?: number;
  stockSearch?: {
    subtitleText?: string;
    contextSubtitles?: string;
    projectTopic?: string;
  };
}

function readPipelineDispatchContext(script: DispatchInput["script"]): {
  globalTopic?: string;
  editStyle?: string;
} {
  const name = script.project?.name?.trim();
  const settings = (script.project as { settings?: Record<string, unknown> }).settings;
  const globalTopic = name || undefined;
  const editStyle =
    (typeof settings?.mxmEditStyle === "string" && settings.mxmEditStyle.trim()) || undefined;
  return { globalTopic, editStyle };
}

function shouldSkipClipRender(meta: MxmClipMetadata, skipReadyClips: boolean): boolean {
  if (!skipReadyClips) return false;
  if (meta.mxmUserEdited) return false;
  return meta.mxmRenderStatus === "ready" && Boolean(meta.mxmRenderedVideoUrl);
}

function resolveProjectResolution(
  script: DispatchInput["script"]
): { width?: number; height?: number } {
  const settings = (script.project as { settings?: { width?: unknown; height?: unknown } }).settings;
  const width = typeof settings?.width === "number" && settings.width > 0 ? settings.width : undefined;
  const height =
    typeof settings?.height === "number" && settings.height > 0 ? settings.height : undefined;
  return { width, height };
}

function collectRenderableClips(
  script: DispatchInput["script"],
  opts?: { skipReadyClips?: boolean }
): ClipJob[] {
  const { width, height } = resolveProjectResolution(script);
  const skipReady = opts?.skipReadyClips ?? false;
  const jobs: ClipJob[] = [];
  for (const track of script.project.timeline.tracks) {
    for (const clip of track.clips) {
      const mx = clip.metadata as MxmClipMetadata | undefined;
      if (!mx?.mxmRenderMode) continue;
      if (shouldSkipClipRender(mx, skipReady)) continue;
      const stockSearch =
        mx.mxmRenderMode === 'static-image'
          ? subtitleContextForClipInScript(script, clip.startTime, clip.duration)
          : undefined;
      jobs.push({
        clipId: clip.id,
        renderMode: mx.mxmRenderMode,
        startTime: clip.startTime,
        duration: clip.duration,
        metadata: mx,
        targetWidth: width,
        targetHeight: height,
        stockSearch,
      });
    }
  }
  jobs.sort((a, b) => a.startTime - b.startTime);
  return jobs;
}

function mergeWithExistingReadyClips(
  script: VideoEditScript,
  freshResults: ClipDispatchResult[]
): ClipDispatchResult[] {
  const map = new Map(freshResults.map((r) => [r.clipId, r]));
  return orderedClipResultsFromScript(script).map((existing) => map.get(existing.clipId) ?? existing);
}

async function dispatchOne(
  job: ClipJob,
  userId: string,
  parentTaskId: string | undefined,
  pipelineCtx?: { globalTopic?: string; editStyle?: string },
  preassignedStock?: StockMediaResolveResult
): Promise<ClipDispatchResult> {
  const t0 = Date.now();
  switch (job.renderMode) {
    case "ai-video-gen":
      if (job.metadata.mxmAiOutputKind === "image") {
        return await dispatchAiImageGen(job, userId, parentTaskId, t0, pipelineCtx);
      }
      return await dispatchAiVideoGen(job, userId, parentTaskId, t0, pipelineCtx);
    case "static-image":
      return await dispatchStaticImageHold(
        {
          clipId: job.clipId,
          duration: job.duration,
          metadata: job.metadata,
          targetWidth: job.targetWidth,
          targetHeight: job.targetHeight,
          stockSearch: job.stockSearch,
          preassignedStock,
        },
        userId,
        parentTaskId,
        t0
      );
    case "gsap-html-animation":
      return await dispatchGsapAnimation(job, userId, parentTaskId, t0);
    default: {
      const _exhaustive: never = job.renderMode;
      return {
        clipId: job.clipId,
        renderMode: _exhaustive,
        error: `未知 mxmRenderMode: ${_exhaustive as string}`,
      };
    }
  }
}

async function dispatchAiVideoGen(
  job: ClipJob,
  userId: string,
  parentTaskId: string | undefined,
  t0: number,
  pipelineCtx?: { globalTopic?: string; editStyle?: string }
): Promise<ClipDispatchResult> {
  const { runTaskV2Single } = await import("../../tasks/task-engine");
  const meta = job.metadata;
  const route = normalizeVideoGeneratorRoute(meta.mxmVideoTaskKey, meta.mxmVideoSubtype);
  const params = buildAiVideoDispatchParams(meta, job.duration, job.clipId, pipelineCtx);

  const result = await runTaskV2Single(
    {
      scope: "video",
      taskKey: route.taskKey,
      subtype: route.subtype,
      params,
      metadata: {
        label: `AI视频 · ${job.clipId}`,
        parentAutocutTaskId: parentTaskId,
        autocutClipAsset: true,
        renderMode: "ai-video-gen",
        clipId: job.clipId,
        aiOutputKind: "video",
      },
      // 同步等待结果，但保留为视频列表中的独立可预览任务
      options: { ephemeral: true, keepTask: true },
    },
    userId
  );

  const videoUrl = extractVideoUrlFromTaskResult(result);
  if (!videoUrl) {
    const diag = summarizeMissingMediaTaskResult(result);
    return {
      clipId: job.clipId,
      renderMode: "ai-video-gen",
      childTaskId: result.taskId,
      error: `AI 视频子任务 (${route.taskKey}/${route.subtype}) 未返回视频 URL${diag}`,
      durationMs: Date.now() - t0,
    };
  }

  return {
    clipId: job.clipId,
    renderMode: "ai-video-gen",
    videoUrl,
    childTaskId: result.taskId,
    durationMs: Date.now() - t0,
  };
}

/** 构建 ai-video-gen 子任务 params（供 dispatch 与单测复用） */
export function buildAiVideoDispatchParams(
  meta: MxmClipMetadata,
  jobDuration: number,
  clipId: string,
  ctx?: { globalTopic?: string; editStyle?: string }
): Record<string, unknown> {
  const route = normalizeVideoGeneratorRoute(meta.mxmVideoTaskKey, meta.mxmVideoSubtype);
  if (route.taskKey === 'generator' && route.subtype === 'fragment') {
    return buildFragmentParamsFromClipMetadata(meta, jobDuration, clipId, ctx);
  }
  const ratio = meta.mxmRatio ?? '16:9';
  const durationSec = Math.min(15, Math.max(1, Math.round(meta.mxmDuration ?? jobDuration)));
  const videoMode =
    meta.mxmVideoMode ??
    (meta.mxmReferenceImages && meta.mxmReferenceImages.length > 1
      ? 'reference-to-video'
      : meta.mxmSourceImageUrl
        ? 'image-to-video'
        : 'text-to-video');
  const params: Record<string, unknown> = {
    prompt: meta.mxmPrompt?.trim() ?? '',
    duration: durationSec,
    aspectRatio: ratio,
    uid: `mxm-ai-video-${clipId}`,
    atlas_video_mode: videoMode,
    generate_audio: meta.mxmGenerateAudio ?? false,
    reference_images: meta.mxmReferenceImages ?? [],
  };
  if (videoMode === 'image-to-video' && meta.mxmSourceImageUrl) {
    params.input_reference = meta.mxmSourceImageUrl;
    params.image = meta.mxmSourceImageUrl;
  }
  return params;
}

async function dispatchAiImageGen(
  job: ClipJob,
  userId: string,
  parentTaskId: string | undefined,
  t0: number,
  pipelineCtx?: { globalTopic?: string; editStyle?: string }
): Promise<ClipDispatchResult> {
  const { runTaskV2Single } = await import("../../tasks/task-engine");
  const meta = job.metadata;
  const route = normalizeGraphImageRoute(meta.mxmGraphTaskKey, meta.mxmGraphSubtype);
  const params = buildAiImageDispatchParams(meta, job.clipId, pipelineCtx);

  const result = await runTaskV2Single(
    {
      scope: "graph",
      taskKey: route.taskKey,
      subtype: route.subtype,
      params,
      metadata: {
        label: `AI配图 · ${job.clipId}`,
        parentAutocutTaskId: parentTaskId,
        autocutClipAsset: true,
        renderMode: "ai-video-gen",
        clipId: job.clipId,
        aiOutputKind: "image",
      },
      // 同步等待结果，但保留为图文列表中的独立可预览任务
      options: { ephemeral: true, keepTask: true },
    },
    userId
  );

  const imageUrl = extractImageUrlFromTaskResult(result);
  if (!imageUrl) {
    const diag = summarizeMissingMediaTaskResult(result);
    return {
      clipId: job.clipId,
      renderMode: "ai-video-gen",
      childTaskId: result.taskId,
      error: `AI 图片子任务 (${route.taskKey}/${route.subtype ?? "default"}) 未返回图片 URL${diag}`,
      durationMs: Date.now() - t0,
    };
  }

  const holdMeta: MxmClipMetadata = {
    ...meta,
    mxmAiGeneratedImageUrl: imageUrl,
    mxmSourceImageUrl: imageUrl,
    mxmImageMotionEnabled: meta.mxmImageMotionEnabled ?? true,
    mxmImageMotion:
      meta.mxmImageMotion && meta.mxmImageMotion !== "none" ? meta.mxmImageMotion : "zoom-in",
  };

  const hold = await dispatchStaticImageHold(
    {
      clipId: job.clipId,
      duration: job.duration,
      metadata: holdMeta,
      targetWidth: job.targetWidth,
      targetHeight: job.targetHeight,
    },
    userId,
    parentTaskId,
    t0
  );

  return {
    ...hold,
    imageUrl,
    childTaskId: result.taskId,
  };
}

function applyRenderedUrlsToScript(
  script: DispatchInput["script"],
  results: ClipDispatchResult[]
): void {
  const urlMap = new Map<string, string>();
  const imageMap = new Map<string, string>();
  const resolvedImageMap = new Map<string, string>();
  const resolvedVideoMap = new Map<string, string>();
  const taskIdMap = new Map<string, string>();
  const errMap = new Map<string, string>();
  for (const r of results) {
    if (r.videoUrl) urlMap.set(r.clipId, r.videoUrl);
    if (r.imageUrl) imageMap.set(r.clipId, r.imageUrl);
    if (r.resolvedImageUrl) resolvedImageMap.set(r.clipId, r.resolvedImageUrl);
    if (r.resolvedVideoUrl) resolvedVideoMap.set(r.clipId, r.resolvedVideoUrl);
    if (r.childTaskId) taskIdMap.set(r.clipId, r.childTaskId);
    if (r.error) errMap.set(r.clipId, r.error);
  }
  for (const track of script.project.timeline.tracks) {
    for (const clip of track.clips) {
      const mx = clip.metadata as MxmClipMetadata | undefined;
      if (!mx?.mxmRenderMode) continue;
      const url = urlMap.get(clip.id);
      const imageUrl = imageMap.get(clip.id);
      const childTaskId = taskIdMap.get(clip.id);
      if (childTaskId) {
        (mx as MxmClipMetadata & { mxmAiGenTaskId?: string }).mxmAiGenTaskId = childTaskId;
      }
      if (imageUrl) {
        mx.mxmAiGeneratedImageUrl = normalizeClientAccessibleMediaUrl(imageUrl);
        mx.mxmSourceImageUrl = mx.mxmSourceImageUrl || mx.mxmAiGeneratedImageUrl;
      }
      // 回写渲染实际使用的素材 URL，供成片审核在拉流失败/加载中时回退展示（永不黑屏）
      const resolvedImage = resolvedImageMap.get(clip.id);
      if (resolvedImage && !mx.mxmSourceImageUrl) {
        mx.mxmSourceImageUrl = normalizeClientAccessibleMediaUrl(resolvedImage);
      }
      const resolvedVideo = resolvedVideoMap.get(clip.id);
      if (resolvedVideo && !mx.mxmSourceVideoUrl) {
        mx.mxmSourceVideoUrl = normalizeClientAccessibleMediaUrl(resolvedVideo);
      }
      if (url) {
        mx.mxmRenderedVideoUrl = normalizeClientAccessibleMediaUrl(url);
        mx.mxmRenderStatus = "ready";
        mx.mxmRenderError = undefined;
        mx.mxmUserEdited = false;
      } else if (errMap.has(clip.id)) {
        mx.mxmRenderStatus = "failed";
        mx.mxmRenderError = errMap.get(clip.id);
        mx.mxmRenderedVideoUrl = undefined;
      }
    }
  }
}
