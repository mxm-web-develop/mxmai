import type {
  ManualReviewGateInfo,
  ManualReviewKind,
  ReviewDraftPayload,
} from './manual-review-types';

function mergeBps(
  taskParams: Record<string, unknown>,
  nestedParams?: Record<string, unknown>,
  taskMeta?: Record<string, unknown>
): Record<string, unknown> {
  const inner = (nestedParams?.businessPipelineState ?? {}) as Record<string, unknown>;
  const root = (taskParams.businessPipelineState ?? {}) as Record<string, unknown>;
  const meta = (taskMeta?.businessPipelineState ?? {}) as Record<string, unknown>;
  return { ...inner, ...meta, ...root };
}

function pickNonEmptyString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function normalizeReviewJson(raw: unknown): unknown {
  if (raw == null) return undefined;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed) as unknown;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
  return raw;
}

function isReviewDraftPayload(raw: unknown): raw is ReviewDraftPayload {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as ReviewDraftPayload;
  return o.version === 1 && typeof o.gateId === 'string' && typeof o.kind === 'string';
}

/** Redis 审核草稿过期后，从任务持久化的 requestParams 恢复 */
export function reconstructReviewDraftFromTask(
  task: {
    requestParams?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
  },
  gateId: string
): ReviewDraftPayload | null {
  const gateMeta = task.metadata?.manualReviewGate as ManualReviewGateInfo | undefined;
  const rp = (task.requestParams ?? {}) as Record<string, unknown>;
  const inner = (rp.params && typeof rp.params === 'object'
    ? rp.params
    : {}) as Record<string, unknown>;
  const bps = mergeBps(rp, inner, (task.metadata ?? {}) as Record<string, unknown>);

  const pending = bps.pendingReviewDraft;
  if (isReviewDraftPayload(pending) && (!pending.gateId || pending.gateId === gateId)) {
    return { ...pending, gateId: pending.gateId || gateId };
  }

  const kind = (gateMeta?.kind ?? 'text') as ManualReviewKind;
  const phase = gateMeta?.phase ?? 'pre';
  const finalArtifact = bps.finalArtifact as { text?: string; mediaUrls?: string[] } | undefined;
  const coreArtifact = bps.coreArtifact as { text?: string; mediaUrls?: string[] } | undefined;
  const voiceOver = bps.voiceOverPipeline as { ttsText?: string } | undefined;

  const text = pickNonEmptyString(
    bps.prePipelineReviewText,
    voiceOver?.ttsText,
    finalArtifact?.text,
    coreArtifact?.text
  );

  const json = normalizeReviewJson(bps.videoEditScriptJson);

  const mediaUrls = [
    ...(Array.isArray(finalArtifact?.mediaUrls) ? finalArtifact!.mediaUrls! : []),
    ...(Array.isArray(coreArtifact?.mediaUrls) ? coreArtifact!.mediaUrls! : []),
  ].filter((u): u is string => typeof u === 'string' && u.trim().length > 0);

  const base: ReviewDraftPayload = {
    version: 1,
    gateId,
    phase,
    kind,
    editable: true,
    label: gateMeta?.label,
    hint: gateMeta?.hint,
  };

  if (kind === 'video-timeline') {
    if (json == null) return null;
    return {
      ...base,
      kind: 'video-timeline',
      json,
      text: text || undefined,
    };
  }

  if (kind === 'json') {
    const parsed = normalizeReviewJson(text) ?? json;
    if (parsed == null && !text) return null;
    return {
      ...base,
      kind: 'json',
      text: text || (parsed != null ? JSON.stringify(parsed, null, 2) : undefined),
      json: parsed ?? json,
    };
  }

  if (kind === 'image' || kind === 'media' || kind === 'composite') {
    if (!mediaUrls.length && !text) return null;
    return {
      ...base,
      kind,
      text: text || undefined,
      mediaUrls: mediaUrls.length ? mediaUrls : undefined,
      editable: false,
    };
  }

  if (!text) return null;
  return { ...base, kind: 'text', text };
}
