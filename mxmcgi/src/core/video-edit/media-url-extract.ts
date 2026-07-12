/**
 * 从 Task V2 单任务返回值解析媒体 URL（video-edit dispatcher 复用）
 */

function pickMediaUrlFromRecord(
  obj?: Record<string, unknown> | null,
  opts?: { preferVideo?: boolean }
): string | undefined {
  if (!obj) return undefined;
  const preferVideo = opts?.preferVideo !== false;

  const mediaUrls = obj.mediaUrls;
  if (Array.isArray(mediaUrls) && mediaUrls.length > 0) {
    const first = mediaUrls[0];
    if (typeof first === "string" && first.trim()) return first.trim();
  }

  const keys = preferVideo
    ? (["videoUrl", "video_url", "video", "url", "output_url", "outputUrl", "result_url", "imageUrl", "image_url", "image"] as const)
    : (["imageUrl", "image_url", "image", "url", "output_url", "outputUrl", "result_url", "videoUrl", "video_url", "video"] as const);

  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }

  const meta = obj.metadata;
  if (meta && typeof meta === "object") {
    const fromMeta = pickMediaUrlFromRecord(meta as Record<string, unknown>, opts);
    if (fromMeta) return fromMeta;
  }
  const raw = obj.raw;
  if (raw && typeof raw === "object") {
    const fromRaw = pickMediaUrlFromRecord(raw as Record<string, unknown>, opts);
    if (fromRaw) return fromRaw;
  }
  const outputs = obj.outputs;
  if (Array.isArray(outputs)) {
    for (const item of outputs) {
      if (typeof item === "string" && item.trim()) return item.trim();
      if (item && typeof item === "object") {
        const fromNested = pickMediaUrlFromRecord(item as Record<string, unknown>, opts);
        if (fromNested) return fromNested;
      }
    }
  }
  const outputUrls = obj.output_urls ?? obj.outputUrls;
  if (Array.isArray(outputUrls)) {
    for (const item of outputUrls) {
      if (typeof item === "string" && item.trim()) return item.trim();
    }
  }
  return undefined;
}

function parseMediaUrlFromJsonText(text: unknown, opts?: { preferVideo?: boolean }): string | undefined {
  if (typeof text !== "string" || !text.trim()) return undefined;
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object") {
      return pickMediaUrlFromRecord(parsed as Record<string, unknown>, opts);
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function extractMediaUrlFromTaskResult(result: unknown, opts?: { preferVideo?: boolean }): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const r = result as Record<string, unknown>;
  const sync = r.syncResult;
  if (sync && typeof sync === "object") {
    const fromSync =
      pickMediaUrlFromRecord(sync as Record<string, unknown>, opts) ??
      parseMediaUrlFromJsonText((sync as Record<string, unknown>).text, opts);
    if (fromSync) return fromSync;
  }
  return pickMediaUrlFromRecord(r, opts) ?? parseMediaUrlFromJsonText(r.text, opts);
}

/** 从 Task V2 单任务返回值解析视频 URL */
export function extractVideoUrlFromTaskResult(result: unknown): string | undefined {
  return extractMediaUrlFromTaskResult(result, { preferVideo: true });
}

/** 从 Task V2 单任务返回值解析图片 URL */
export function extractImageUrlFromTaskResult(result: unknown): string | undefined {
  return extractMediaUrlFromTaskResult(result, { preferVideo: false });
}

/** 生成「未返回 URL」类错误的诊断片段（便于排查 Atlas 空 outputs） */
export function summarizeMissingMediaTaskResult(result: unknown, maxLen = 280): string {
  if (!result || typeof result !== "object") return "";
  const r = result as Record<string, unknown>;
  const sync = r.syncResult;
  const payload =
    sync && typeof sync === "object"
      ? {
          status: r.status,
          taskId: r.taskId,
          syncMetadata: (sync as Record<string, unknown>).metadata,
          syncTextHead:
            typeof (sync as Record<string, unknown>).text === "string"
              ? String((sync as Record<string, unknown>).text).slice(0, maxLen)
              : undefined,
        }
      : { status: r.status, taskId: r.taskId, keys: Object.keys(r) };
  try {
    const s = JSON.stringify(payload);
    return s.length > maxLen ? `；诊断=${s.slice(0, maxLen)}…` : `；诊断=${s}`;
  } catch {
    return "";
  }
}
