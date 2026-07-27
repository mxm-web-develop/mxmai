/**
 * graph/group 图集编排：不走外部生图，仅把 album_spec 写入 core 进入 post 并发生图
 */

export const ALBUM_ORCHESTRATOR_MODEL = 'album-pipeline-orchestrator';

export function isAlbumPipelineOrchestrator(args: {
  graphTaskKey?: string;
  graphSubtype?: string | null;
  templateExtra?: Record<string, unknown> | null;
}): boolean {
  const extra = args.templateExtra ?? {};
  if (extra.pipelineOrchestrator === true && extra.albumPipeline === true) return true;
  const key = String(args.graphTaskKey ?? '').trim();
  const sub = String(args.graphSubtype ?? '').trim();
  if (key !== 'group') return false;
  return sub === 'content-album' || sub === 'content-album-plan';
}

export function extractAlbumSpecPayload(requestParams: Record<string, unknown>): {
  albumSpecJson: string;
  title: string;
} {
  const bps = (requestParams.businessPipelineState ?? {}) as Record<string, unknown>;
  const inner = (requestParams.params ?? {}) as Record<string, unknown>;
  const candidates: unknown[] = [
    bps.albumSpec,
    requestParams.album_spec,
    inner.album_spec,
    (bps.finalArtifact as { text?: string } | undefined)?.text,
  ];

  for (const c of candidates) {
    if (c == null) continue;
    if (typeof c === 'string' && c.trim()) {
      return {
        albumSpecJson: c.trim(),
        title: pickTitle(requestParams, c),
      };
    }
    if (typeof c === 'object') {
      const json = JSON.stringify(c);
      return { albumSpecJson: json, title: pickTitle(requestParams, c) };
    }
  }

  throw new Error('图集管线：缺少合法 album_spec（请上传 JSON 或完成文档规划审核）');
}

function pickTitle(requestParams: Record<string, unknown>, spec: unknown): string {
  // 主题由规划 LLM 写入 AlbumSpec.title；表单不再手填 topic
  if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
    const t = String((spec as { title?: unknown }).title ?? '').trim();
    if (t) return t.slice(0, 40);
  }
  const inner = (requestParams.params ?? {}) as Record<string, unknown>;
  const topic = String(inner.topic ?? requestParams.topic ?? '').trim();
  if (topic) return topic.slice(0, 40);
  return '内容配图图集';
}
