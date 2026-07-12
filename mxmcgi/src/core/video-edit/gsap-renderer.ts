/**
 * GSAP HTML 动画渲染器
 *
 * 把 ProjectFile JSON 中 mxmRenderMode === 'gsap-html-animation' 的 clip
 * 用 GSAP + CompositionRenderer 渲染成 mp4。
 *
 * 三种实现路径：
 * A. 调内部 gsap-render HTTP 服务（推荐：CompositionRenderer 跑在浏览器里）
 * B. puppeteer 启动 headless Chromium，加载 HTML+GSAP，录屏为 mp4
 * C. 客户端渲染（前端编辑器跑 GSAP + MediaRecorder 上传 URL）—— 用户在 OpenReel 剪辑器里触发
 *
 * 当前默认实现走 A（最简）。
 * 关联：mxm-editor-core/src/animation/{gsap-engine,composition-renderer,animation-schema}.ts
 */

import type { ClipDispatchResult, MxmClipMetadata } from "./types";

// ============================================================
// 0. 从 brief 生成 GSAP 场景（text/plan/gsap-scene）
// ============================================================

export async function generateGsapSceneFromBrief(
  brief: string,
  opts: { duration?: number; structuredData?: unknown; aspectRatio?: string } | undefined,
  userId: string
): Promise<Pick<MxmClipMetadata, "mxmHtmlContent" | "mxmGsapTimeline" | "mxmGsapEase" | "mxmDuration">> {
  const { runTaskV2Single } = await import("../../tasks/task-engine");
  const textResult = await runTaskV2Single(
    {
      scope: "text",
      taskKey: "plan",
      subtype: "gsap-scene",
      params: {
        brief,
        structuredData: opts?.structuredData,
        duration: opts?.duration ?? 6,
        aspectRatio: opts?.aspectRatio ?? "16:9",
      },
    },
    userId
  );

  const rawText = textResult.syncResult?.text ?? "";
  let scene: Record<string, unknown>;
  try {
    scene = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    throw new Error("GSAP 场景子业务未返回合法 JSON");
  }

  const { normalizeGsapSceneOutput } = await import("./gsap-storyboard");
  const normalized = await normalizeGsapSceneOutput(scene);

  return {
    mxmHtmlContent: normalized.mxmHtmlContent,
    mxmGsapTimeline: normalized.mxmGsapTimeline,
    mxmGsapEase: normalized.mxmGsapEase,
    mxmDuration: normalized.mxmDuration ?? opts?.duration,
  };
}

// ============================================================
// 1. dispatcher 入口（被 dispatcher.ts 调用）
// ============================================================

interface GsapJob {
  clipId: string;
  duration: number;
  metadata: MxmClipMetadata;
}

export async function dispatchGsapAnimation(
  job: GsapJob,
  userId: string,
  parentTaskId: string | undefined,
  t0: number
): Promise<ClipDispatchResult> {
  let meta = job.metadata;

  if (!meta.mxmHtmlContent || !meta.mxmGsapTimeline) {
    const { assembleGsapClipFromSegment } = await import('./gsap-shot-planning');
    const fromSegment = await assembleGsapClipFromSegment(
      {
        startSeconds: 0,
        endSeconds: meta.mxmDuration ?? job.duration,
        text: meta.mxmGsapSceneBrief ?? '',
        mxmRenderMode: 'gsap-html-animation',
        mxmGsapStyleId: meta.mxmGsapStyleId,
        mxmGsapSceneType: meta.mxmGsapSceneType,
        mxmGsapSceneData: meta.mxmGsapSceneData,
        mxmGsapSceneBrief: meta.mxmGsapSceneBrief,
      },
      { aspectRatio: meta.mxmRatio ?? '16:9' }
    );
    if (fromSegment) {
      meta = {
        ...meta,
        mxmHtmlContent: fromSegment.mxmHtmlContent,
        mxmGsapTimeline: fromSegment.mxmGsapTimeline,
        mxmGsapEase: fromSegment.mxmGsapEase,
        mxmDuration: fromSegment.mxmDuration ?? meta.mxmDuration,
      };
    }
  }

  if (!meta.mxmHtmlContent || !meta.mxmGsapTimeline) {
    const brief = meta.mxmGsapSceneBrief?.trim();
    if (!brief) {
      return {
        clipId: job.clipId,
        renderMode: "gsap-html-animation",
        error: "gsap-html-animation 缺少 mxmGsapSceneBrief，无法生成场景",
      };
    }
    try {
      const generated = await generateGsapSceneFromBrief(
        brief,
        {
          duration: meta.mxmDuration ?? job.duration,
          aspectRatio: meta.mxmRatio ?? "16:9",
        },
        userId
      );
      meta = { ...meta, ...generated };
    } catch (e) {
      return {
        clipId: job.clipId,
        renderMode: "gsap-html-animation",
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  try {
    const result = await callGsapRenderService({
      clipId: job.clipId,
      html: meta.mxmHtmlContent!,
      gsapTimeline: meta.mxmGsapTimeline!,
      gsapEase: meta.mxmGsapEase ?? "power3.out",
      designRef: meta.mxmDesignRef,
      duration: meta.mxmDuration ?? job.duration,
      aspectRatio: meta.mxmRatio ?? "16:9",
      fps: meta.mxmRenderFps ?? 30,
      pixelRatio: meta.mxmRenderPixelRatio ?? 1,
      userId,
      parentTaskId,
    });
    return {
      clipId: job.clipId,
      renderMode: "gsap-html-animation",
      videoUrl: result.videoUrl,
      durationMs: Date.now() - t0,
    };
  } catch (e) {
    return {
      clipId: job.clipId,
      renderMode: "gsap-html-animation",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ============================================================
// 2. 调内部 gsap-render HTTP 服务（实现 A）
// ============================================================

interface GsapRenderRequest {
  clipId: string;
  html: string;
  gsapTimeline: string;
  gsapEase: string;
  designRef?: string;
  duration: number;
  aspectRatio: "16:9" | "9:16" | "1:1";
  fps: number;
  pixelRatio: number;
  userId: string;
  parentTaskId?: string;
}

interface GsapRenderResponse {
  videoUrl: string;
  durationMs: number;
}

async function callGsapRenderService(
  req: GsapRenderRequest
): Promise<GsapRenderResponse> {
  const endpoint = process.env.GSAP_RENDER_ENDPOINT?.trim();
  const renderBody = {
    html: req.html,
    gsapTimeline: req.gsapTimeline,
    gsapEase: req.gsapEase,
    duration: req.duration,
    aspectRatio: req.aspectRatio,
    fps: req.fps,
  };

  if (endpoint) {
    const res = await fetch(`${endpoint.replace(/\/$/, '')}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`GSAP render failed: ${res.status} ${errText}`);
    }
    const data = (await res.json()) as GsapRenderResponse;
    return persistGsapRenderResult(data, req);
  }

  // 无 GSAP_RENDER_ENDPOINT：worker 本机 Playwright + ffmpeg 内联渲染
  const t0 = Date.now();
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { renderGsapSceneToFile } = await import('../../services/gsap-render-server');
  const workDir = mkdtempSync(join(tmpdir(), 'gsap-inline-'));
  const localPath = join(workDir, `${req.clipId}.mp4`);
  try {
    await renderGsapSceneToFile(renderBody, localPath);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `GSAP 动画渲染失败：${msg}。请确认 worker 已安装 Playwright Chromium（pnpm exec playwright install chromium）与 ffmpeg；或配置 GSAP_RENDER_ENDPOINT 指向独立渲染服务。`
    );
  }
  const { persistLocalFileToStorage } = await import('./storage-upload');
  const uploaded = await persistLocalFileToStorage({
    localPath,
    userId: req.userId,
    parentTaskId: req.parentTaskId,
    clipId: req.clipId,
    ext: 'mp4',
    contentType: 'video/mp4',
  });
  return { videoUrl: uploaded.url, durationMs: Date.now() - t0 };
}

async function persistGsapRenderResult(
  data: GsapRenderResponse,
  req: GsapRenderRequest
): Promise<GsapRenderResponse> {
  let videoUrl = data.videoUrl;
  if (videoUrl.startsWith('data:video/mp4;base64,')) {
    const b64 = videoUrl.slice('data:video/mp4;base64,'.length);
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'gsap-b64-'));
    const local = join(dir, 'clip.mp4');
    writeFileSync(local, Buffer.from(b64, 'base64'));
    const { persistLocalFileToStorage } = await import('./storage-upload');
    const uploaded = await persistLocalFileToStorage({
      localPath: local,
      userId: req.userId,
      parentTaskId: req.parentTaskId,
      clipId: req.clipId,
      ext: 'mp4',
      contentType: 'video/mp4',
    });
    videoUrl = uploaded.url;
  }
  return { videoUrl, durationMs: data.durationMs };
}

// ============================================================
// 3. 客户端渲染（实现 C — OpenReel 剪辑器调用）
// ============================================================

/**
 * 前端 OpenReel 剪辑器（VideoTimelineReviewModal）里调用：
 * 1. 拿到 clip 列表
 * 2. 对每个 gsap-html-animation clip：
 *    - 在浏览器里跑 GSAP timeline + CompositionRenderer
 *    - 用 MediaRecorder 录 mp4
 *    - 上传到 MinIO，返回 URL
 * 3. 调用 PUT /api/v2/tasks/:id/clip-rendered-url 更新 clip.mediaId
 *
 * 当前由前端编辑器实现，详见：
 * orchestration/_handoff/current/video-timeline-review-modal-design.md
 */