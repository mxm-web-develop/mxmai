/**
 * 口播驱动视频剪辑：video scope 编排任务（前置 nestedText 生成分镜 → post 审核 → render）
 */

export function isVideoPipelineOrchestrator(args: {
  videoSubtype?: string;
  templateExtra?: Record<string, unknown> | null;
}): boolean {
  const extra = args.templateExtra ?? {};
  if (extra.pipelineOrchestrator === true) return true;
  const subtype = String(args.videoSubtype ?? '').trim();
  return subtype === 'voiceover-science-pop';
}

export function extractOrchestratorScriptText(requestParams: Record<string, unknown>): string {
  const bps = (requestParams.businessPipelineState ?? {}) as Record<string, unknown>;
  const candidates: unknown[] = [
    (bps.finalArtifact as { text?: string } | undefined)?.text,
    (bps.nestedTextLast as { text?: string } | undefined)?.text,
    (bps.coreArtifact as { text?: string } | undefined)?.text,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  throw new Error('视频剪辑管线：前置分镜生成未产出 OpenReel ProjectFile JSON');
}
