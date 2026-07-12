/**
 * static-image 模式：用户图片 / 自动配图 / 自动配视频 → MinIO mp4
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClipDispatchResult, MxmClipMetadata } from "./types";
import { resolveEffectiveImageMotion } from "./types";
import { imageToHoldMp4, trimStockVideoToClip } from "./ffmpeg-runner";
import { fetchMediaBuffer } from "./media-fetch";
import { persistLocalFileToStorage } from "./storage-upload";
import {
  resolveAutoStockMediaForClip,
  type StockMediaResolveResult,
} from "./stock-media-resolver";

interface StaticImageJob {
  clipId: string;
  duration: number;
  metadata: MxmClipMetadata;
  targetWidth?: number;
  targetHeight?: number;
  stockSearch?: {
    subtitleText?: string;
    contextSubtitles?: string;
    projectTopic?: string;
  };
  preassignedStock?: StockMediaResolveResult;
}

async function fetchSourceImageUrl(taskId: string): Promise<string | undefined> {
  try {
    const { taskExecutor } = await import("../../task/task-executor");
    const task = await taskExecutor.getTaskManager().getTask(taskId);
    const urls = (task?.result as { mediaUrls?: string[] } | undefined)?.mediaUrls;
    if (urls && urls.length > 0) return urls[0];
  } catch {
    /* fall through */
  }
  return undefined;
}

async function renderImageHold(
  job: StaticImageJob,
  sourceImageUrl: string,
  userId: string,
  parentTaskId: string | undefined,
  t0: number
): Promise<ClipDispatchResult> {
  const meta = job.metadata;
  const workDir = mkdtempSync(join(tmpdir(), "mxm-static-img-"));
  const imagePath = join(workDir, "source.img");
  const mp4Path = join(workDir, "hold.mp4");

  try {
    const buf = await fetchMediaBuffer(sourceImageUrl);
    writeFileSync(imagePath, buf);

    await imageToHoldMp4({
      imagePath,
      outputPath: mp4Path,
      durationSec: Math.max(0.5, job.duration),
      fps: 30,
      targetWidth: job.targetWidth,
      targetHeight: job.targetHeight,
      fit: meta.mxmImageFit ?? "cover",
      motion: resolveEffectiveImageMotion(meta),
    });

    const uploaded = await persistLocalFileToStorage({
      localPath: mp4Path,
      userId,
      parentTaskId,
      clipId: job.clipId,
      ext: "mp4",
      contentType: "video/mp4",
    });

    return {
      clipId: job.clipId,
      renderMode: "static-image",
      videoUrl: uploaded.url,
      resolvedImageUrl: sourceImageUrl,
      durationMs: Date.now() - t0,
    };
  } catch (e) {
    return {
      clipId: job.clipId,
      renderMode: "static-image",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function renderStockVideoClip(
  job: StaticImageJob,
  videoUrl: string,
  userId: string,
  parentTaskId: string | undefined,
  t0: number
): Promise<ClipDispatchResult> {
  const meta = job.metadata;
  const workDir = mkdtempSync(join(tmpdir(), "mxm-stock-vid-"));
  const sourcePath = join(workDir, "source.mp4");
  const outPath = join(workDir, "clip.mp4");

  try {
    const buf = await fetchMediaBuffer(videoUrl);
    writeFileSync(sourcePath, buf);

    await trimStockVideoToClip({
      videoPath: sourcePath,
      outputPath: outPath,
      durationSec: meta.mxmDuration ?? job.duration,
      targetWidth: job.targetWidth,
      targetHeight: job.targetHeight,
      fit: meta.mxmImageFit ?? "cover",
      fps: 30,
    });

    const uploaded = await persistLocalFileToStorage({
      localPath: outPath,
      userId,
      parentTaskId,
      clipId: job.clipId,
      ext: "mp4",
      contentType: "video/mp4",
    });

    return {
      clipId: job.clipId,
      renderMode: "static-image",
      videoUrl: uploaded.url,
      resolvedVideoUrl: videoUrl,
      durationMs: Date.now() - t0,
    };
  } catch (e) {
    return {
      clipId: job.clipId,
      renderMode: "static-image",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function dispatchStaticImageHold(
  job: StaticImageJob,
  userId: string,
  parentTaskId: string | undefined,
  t0: number
): Promise<ClipDispatchResult> {
  const meta = job.metadata;
  let sourceImageUrl = meta.mxmSourceImageUrl;
  if (!sourceImageUrl && meta.mxmSourceImageTaskId) {
    sourceImageUrl = await fetchSourceImageUrl(meta.mxmSourceImageTaskId);
  }

  const sourceVideoUrl = meta.mxmSourceVideoUrl?.trim();
  if (sourceVideoUrl) {
    return renderStockVideoClip(job, sourceVideoUrl, userId, parentTaskId, t0);
  }

  if (sourceImageUrl) {
    return renderImageHold(job, sourceImageUrl, userId, parentTaskId, t0);
  }

  const stock =
    job.preassignedStock ??
    (await resolveAutoStockMediaForClip(meta, {
      preferWidth: job.targetWidth,
      ...job.stockSearch,
    }));

  if (stock?.kind === "video") {
    return renderStockVideoClip(job, stock.url, userId, parentTaskId, t0);
  }

  if (stock?.kind === "image") {
    return renderImageHold(job, stock.url, userId, parentTaskId, t0);
  }

  const autoVideo = meta.mxmAutoStockVideo === true;
  const autoImage = meta.mxmAutoStockImage !== false;
  if (!autoVideo && !autoImage) {
    return {
      clipId: job.clipId,
      renderMode: "static-image",
      error: "static-image 未插入图片且已关闭自动配图/配视频",
    };
  }

  return {
    clipId: job.clipId,
    renderMode: "static-image",
    error: autoVideo
      ? "自动配视频未找到匹配素材（需配置 PEXELS_API_KEY），自动配图也未命中"
      : "自动配图未找到匹配素材，请手动插入图片或调整检索词",
  };
}
