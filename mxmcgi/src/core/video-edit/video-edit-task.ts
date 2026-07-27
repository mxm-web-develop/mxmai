/**
 * video-edit-render 专用 Task 入口（scope=video, subtype=render）
 */
import { taskExecutor } from "../../task/task-executor";
import { dispatchVideoEdit } from "./dispatcher";
import type { VideoEditRenderOptions, VideoEditScript } from "./types";
import type { MxmClipMetadata } from "./types";

function countClipRenderStats(script: VideoEditScript): {
  renderable: number;
  ready: number;
  failed: number;
} {
  let renderable = 0;
  let ready = 0;
  let failed = 0;
  for (const track of script.project.timeline.tracks) {
    for (const clip of track.clips) {
      const mx = clip.metadata as MxmClipMetadata | undefined;
      if (!mx?.mxmRenderMode) continue;
      renderable += 1;
      if (mx.mxmRenderStatus === "ready" && mx.mxmRenderedVideoUrl) ready += 1;
      else if (mx.mxmRenderStatus === "failed") failed += 1;
    }
  }
  return { renderable, ready, failed };
}

async function updateRenderProgress(
  taskId: string,
  progress: number,
  logs?: string[]
): Promise<void> {
  const taskManager = taskExecutor.getTaskManager();
  await taskManager.updateTaskProgress(taskId, { progress, logs });
  const { syncParentProgressFromRenderTask } = await import("../../tasks/nested-video-render");
  await syncParentProgressFromRenderTask(
    taskId,
    progress,
    logs?.[0]
  ).catch(() => {});
}

export async function startVideoEditRenderTask(
  taskId: string,
  originalParams?: Record<string, unknown>
): Promise<void> {
  const taskManager = taskExecutor.getTaskManager();
  const taskResponse = await taskManager.getTask(taskId);
  if (!taskResponse?.task) throw new Error(`任务 ${taskId} 不存在`);

  const task = taskResponse.task;

  try {
    await taskManager.updateTaskStatus(taskId, "processing", { progress: 10, startedAt: new Date() });
    await updateRenderProgress(taskId, 10, ["开始逐段渲染…"]);

    const requestParams = (originalParams || task.requestParams || {}) as Record<string, unknown>;
    const innerParams = (requestParams.params as Record<string, unknown>) || {};
    const merged = { ...innerParams, ...requestParams };

    const scriptRaw = merged.videoEditScriptJson ?? innerParams.videoEditScriptJson;
    if (!scriptRaw || typeof scriptRaw !== "object") {
      throw new Error("video-edit-render 缺少 videoEditScriptJson");
    }

    const renderOptions = (merged.renderOptions ?? innerParams.renderOptions) as
      | VideoEditRenderOptions
      | undefined;

    const userId =
      (requestParams.userId as string) ||
      (task.metadata?.userId as string) ||
      (task.metadata?.billingUserId as string);
    if (!userId) throw new Error("video-edit-render 缺少 userId");

    const concatFinal = renderOptions?.concatFinal !== false;
    const concatOnly = renderOptions?.concatOnly === true;
    await updateRenderProgress(taskId, 20, [
      concatOnly
        ? "开始拼接各段成片…"
        : concatFinal
          ? "开始按 clip 分发渲染并拼接…"
          : "开始按 clip 分发渲染（不拼接，供成片审核）…",
    ]);

    const output = await dispatchVideoEdit({
      script: structuredClone(scriptRaw) as VideoEditScript,
      userId,
      parentTaskId: taskId,
      options: renderOptions,
    });

    const finalUrl = output.finalVideoUrl;
    const clipUrls = output.clips.filter((c) => c.videoUrl).map((c) => c.videoUrl!);
    const mediaUrls = finalUrl ? [finalUrl] : clipUrls;
    const clipStats = countClipRenderStats(output.script);

    if (clipStats.renderable > 0 && clipStats.ready === 0) {
      throw new Error(
        `逐段渲染全部失败（${clipStats.failed}/${clipStats.renderable} 段）。` +
          `常见原因：AI 片段时长超限、存储 URL 不可访问（含 Gateway 相对路径 /api/v1/media/* 未解析）、或 ffmpeg 未安装。`
      );
    }

    if (concatFinal && mediaUrls.length === 0 && output.failedCount > 0) {
      throw new Error(`全部 clip 渲染失败（${output.failedCount} 个）`);
    }

    if (!concatFinal && output.failedCount > 0) {
      await updateRenderProgress(taskId, 90, [
        `部分 clip 渲染失败（${output.failedCount}/${clipStats.renderable}），已就绪 ${clipStats.ready} 段，请进入成片审核检查`,
      ]);
    }

    await taskManager.setTaskResult(taskId, {
      mediaUrls,
      metadata: {
        ...task.metadata,
        model: "video-edit-dispatcher",
        provider: "internal",
        videoEditRender: output,
        renderedScript: output.script,
        failedClipCount: output.failedCount,
        readyClipCount: clipStats.ready,
        totalRenderClips: clipStats.renderable,
        concatFinal,
        videoEditRenderPhase: concatFinal ? "final-export" : "clips-for-review",
      },
    });

    await updateRenderProgress(taskId, 100, ["剪辑渲染完成"]);

    const completedSnap = await taskManager.getTask(taskId);
    if (completedSnap?.task) {
      const { notifyParentPipelineAfterRenderTask } = await import("../../tasks/nested-video-render");
      await notifyParentPipelineAfterRenderTask(completedSnap.task).catch((e) => {
        console.warn("[video-edit-render] 续跑父任务失败:", e);
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      const failedSnap = await taskManager.getTask(taskId);
      if (failedSnap?.task) {
        const { buildPipelineFailureSnapshot } = await import('../../task/pipeline-retry');
        const snapshot = buildPipelineFailureSnapshot(failedSnap.task);
        await taskManager.updateTaskRequestParams(taskId, snapshot);
      }
    } catch (persistErr) {
      console.warn('[video-edit-render] failure snapshot persist failed:', persistErr);
    }
    await taskManager.setTaskError(taskId, message);
    const failedSnap = await taskManager.getTask(taskId);
    if (failedSnap?.task) {
      const { notifyParentPipelineAfterRenderTask } = await import("../../tasks/nested-video-render");
      await notifyParentPipelineAfterRenderTask(failedSnap.task).catch((e) => {
        console.warn("[video-edit-render] 通知父任务失败:", e);
      });
    }
    throw error;
  }
}
