/**
 * A0：确定性切镜时间窗（句级字幕 + cut_rhythm → rhythm windows）
 * 供 planVideoCutWindows 管线步骤与 text/plan/video-cut-beat 前置注入。
 */
import { voiceoverSegmentsToWindows } from './timeline-segment-resolvers';
import type { VoiceoverSubtitleLike } from './timeline-segment-types';
import { resolveCutRhythmBounds, type CutRhythmId } from './cut-rhythm';
import { planDiscourseSegments, type BeatRole } from './plan-discourse-segments';

export type { BeatRole } from './plan-discourse-segments';

export type RhythmWindow = {
  windowId: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  voiceoverText: string;
  /** 覆盖的句级字幕下标 [start, end]（含端点） */
  subtitleSpan: [number, number];
  /** 语篇角色：opening（开场白）| transition（章节转场）| body | closing（结尾） */
  beatRole: BeatRole;
};

export type RhythmWindowsPlan = {
  cutRhythmResolved: CutRhythmId | 'auto';
  minCutSeconds: number;
  maxCutSeconds: number;
  windows: RhythmWindow[];
};

function parseVoiceoverSegments(raw: unknown): VoiceoverSubtitleLike[] {
  if (!raw) return [];
  let data: unknown = raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      data = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  const arr = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { segments?: unknown }).segments)
      ? (data as { segments: unknown[] }).segments
      : [];
  const out: VoiceoverSubtitleLike[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const text = String((item as { text?: unknown }).text ?? '').trim();
    const startSeconds = Number((item as { startSeconds?: unknown }).startSeconds);
    const endSeconds = Number((item as { endSeconds?: unknown }).endSeconds);
    if (!text || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) continue;
    out.push({ text, startSeconds, endSeconds });
  }
  return out.sort((a, b) => a.startSeconds - b.startSeconds);
}

function subtitleSpanForWindow(
  subs: VoiceoverSubtitleLike[],
  start: number,
  end: number
): [number, number] {
  let first = -1;
  let last = -1;
  for (let i = 0; i < subs.length; i++) {
    const s = subs[i]!;
    if (s.endSeconds > start + 0.01 && s.startSeconds < end - 0.01) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) return [0, 0];
  return [first, last];
}

/** 句级字幕 + cut_rhythm → 候选时间窗（无 LLM） */
export function planRhythmWindows(input: {
  voiceoverSegmentsRaw: unknown;
  totalDurationSeconds: number;
  cutRhythm?: string;
  minCutSeconds?: number;
  maxCutSeconds?: number;
}): RhythmWindowsPlan {
  const total = Math.max(0.1, input.totalDurationSeconds);
  const subs = parseVoiceoverSegments(input.voiceoverSegmentsRaw);

  const rhythm = resolveCutRhythmBounds({
    cutRhythm: input.cutRhythm,
    minCutSeconds: input.minCutSeconds,
    maxCutSeconds: input.maxCutSeconds,
    voiceoverSegments: subs,
    totalDurationSeconds: total,
  });

  const minCut = rhythm?.minCutSeconds ?? 5;
  const maxCut = rhythm?.maxCutSeconds ?? 10;
  const rhythmId = rhythm?.rhythmId ?? 'default';

  // 语篇感知分段（识别开场/转场/结尾，长段再按 min/max 细分）
  const discourse = subs.length > 0 ? planDiscourseSegments(subs, total, minCut, maxCut) : [];

  const windows: RhythmWindow[] =
    discourse.length > 0
      ? discourse.map((w, i) => ({
          windowId: `w${i + 1}`,
          startSeconds: w.startSeconds,
          endSeconds: w.endSeconds,
          durationSeconds: Math.max(0.1, w.endSeconds - w.startSeconds),
          voiceoverText: w.voiceoverText,
          subtitleSpan: w.subtitleSpan,
          beatRole: w.beatRole,
        }))
      : voiceoverSegmentsToWindows([], total).map((w, i) => ({
          windowId: `w${i + 1}`,
          startSeconds: w.startSeconds,
          endSeconds: w.endSeconds,
          durationSeconds: Math.max(0.1, w.endSeconds - w.startSeconds),
          voiceoverText: w.text.trim(),
          subtitleSpan: subtitleSpanForWindow(subs, w.startSeconds, w.endSeconds),
          beatRole: 'body' as BeatRole,
        }));

  return {
    cutRhythmResolved: rhythmId,
    minCutSeconds: minCut,
    maxCutSeconds: maxCut,
    windows,
  };
}
