import type { ReviewDraftPayload, WritingTaskItem } from '../api/client';

function readBps(task: WritingTaskItem | null | undefined): Record<string, unknown> {
  const rp = task?.requestParams;
  if (!rp || typeof rp !== 'object') return {};
  const root = (rp.businessPipelineState ?? {}) as Record<string, unknown>;
  const inner =
    rp.params && typeof rp.params === 'object'
      ? ((rp.params as Record<string, unknown>).businessPipelineState ?? {})
      : {};
  return { ...(inner as Record<string, unknown>), ...root };
}

function pickString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/** 客户端兜底：API 草稿为空时从任务 requestParams 读取（需 getTask 全量详情） */
export function resolveReviewTextFallback(
  task: WritingTaskItem | null | undefined,
  draft: ReviewDraftPayload | null | undefined,
  apiText?: string
): string {
  const fromDraft = pickString(draft?.text, apiText);
  if (fromDraft) return fromDraft;

  const bps = readBps(task);
  const pending = bps.pendingReviewDraft as { text?: string } | undefined;
  const voiceOver = bps.voiceOverPipeline as { ttsText?: string } | undefined;
  const finalArtifact = bps.finalArtifact as { text?: string } | undefined;

  return pickString(
    pending?.text,
    bps.prePipelineReviewText,
    voiceOver?.ttsText,
    finalArtifact?.text
  );
}

export function resolveReviewJsonFallback(
  task: WritingTaskItem | null | undefined,
  draft: ReviewDraftPayload | null | undefined
): unknown {
  if (draft?.json != null) return draft.json;
  const bps = readBps(task);
  const pending = bps.pendingReviewDraft as { json?: unknown } | undefined;
  if (pending?.json != null) return pending.json;
  const raw = bps.videoEditScriptJson;
  if (raw == null) return undefined;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return undefined;
    }
  }
  return raw;
}
