/**
 * 估价纯函数：图集张数 / 时间轴 AI 段计数（无 DB）。
 */

function asObject(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return null;
    try {
      const parsed = JSON.parse(t) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

/** 从图集 album_spec / 审核 JSON 读取张数 */
export function countAlbumItemsFromParams(params: Record<string, unknown>): number {
  const raw =
    params.album_spec ??
    params.albumSpec ??
    (params.reviewJson != null ? params.reviewJson : undefined);
  const obj = asObject(raw);
  if (!obj) return 0;
  return Array.isArray(obj.items) ? obj.items.length : 0;
}

/** 时间轴 AI 段粗计：ai-video-gen → 图 / 视频 */
export function countTimelineAiUsage(params: Record<string, unknown>): {
  imageCount: number;
  videoClipCount: number;
} {
  const root = params.reviewJson ?? params.timeline ?? params.script ?? params;
  let imageCount = 0;
  let videoClipCount = 0;

  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const x of node) walk(x);
      return;
    }
    const o = node as Record<string, unknown>;
    const mode = String(o.mxmRenderMode ?? o.renderMode ?? '').trim();
    if (mode === 'ai-video-gen') {
      const kind = String(o.mxmAiOutputKind ?? 'video').trim();
      if (kind === 'image') imageCount += 1;
      else videoClipCount += 1;
    }
    if (Array.isArray(o.segments)) walk(o.segments);
    if (Array.isArray(o.tracks)) walk(o.tracks);
    if (Array.isArray(o.clips)) walk(o.clips);
    if (o.timeline && typeof o.timeline === 'object') walk(o.timeline);
  };

  walk(root);
  return { imageCount, videoClipCount };
}
