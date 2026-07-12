/**
 * 分镜分段策略 — 纯函数，由 buildVideoEditTimeline 步骤 params.segmentStrategy 选择
 */
import type { TimelineVisualSegment, VoiceoverSubtitleLike } from './timeline-segment-types';
import type { MxmRenderMode } from './types';
import { normalizeMxmRenderMode } from './render-mode';
import {
  parseSegmentOverlays,
  parseSegmentTransition,
} from './timeline-overlay-builder';
import { roundToWholeSeconds, snapVisualSegmentsToWholeSeconds } from './timeline-whole-seconds';
import {
  normalizeCutRhythmId,
  reflowSegmentsByModeDuration,
  resolveCutRhythmBounds,
  type CutRhythmId,
} from './cut-rhythm';

export type { CutRhythmId } from './cut-rhythm';
export {
  CUT_RHYTHM_PRESETS,
  GLOBAL_MAX_CUT_SECONDS,
  RENDER_MODE_DURATION,
  normalizeCutRhythmId,
  resolveCutRhythmBounds,
  resolveAutoCutRhythmBounds,
  reflowSegmentsByModeDuration,
  formatCutRhythmPromptBlock,
  formatRenderModeDurationPromptBlock,
} from './cut-rhythm';

/** @deprecated 使用 cut-rhythm.ts 的 CUT_RHYTHM_PRESETS */
export type LegacyCutRhythmId = 'science-promo' | 'dialogue-show' | 'comic-drama';

export type SegmentStrategyId =
  | 'voiceover-subtitles'
  | 'fixed-chunk'
  | 'shot-list'
  | 'image-sequence'
  | 'document-sections';

export type SegmentResolverInput = {
  strategy: SegmentStrategyId;
  totalDurationSeconds: number;
  /** 原始 segments JSON（字符串或已解析） */
  segmentsRaw?: unknown;
  chunkSeconds?: number;
  /** 切镜节奏：fast | default | slow | auto（兼容 science-promo 等旧值） */
  cutRhythm?: string;
  minCutSeconds?: number;
  maxCutSeconds?: number;
};

function roundSec(n: number): number {
  return roundToWholeSeconds(n);
}

function parseJsonArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { segments?: unknown }).segments)) {
        return (parsed as { segments: unknown[] }).segments;
      }
    } catch {
      return [];
    }
  }
  if (raw && typeof raw === 'object' && Array.isArray((raw as { segments?: unknown }).segments)) {
    return (raw as { segments: unknown[] }).segments;
  }
  return [];
}

function parseVoiceoverSegments(raw: unknown): VoiceoverSubtitleLike[] {
  const out: VoiceoverSubtitleLike[] = [];
  for (const item of parseJsonArray(raw)) {
    if (!item || typeof item !== 'object') continue;
    const text = String((item as { text?: unknown }).text ?? '').trim();
    const startSeconds = Number((item as { startSeconds?: unknown }).startSeconds);
    const endSeconds = Number((item as { endSeconds?: unknown }).endSeconds);
    if (!text || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) continue;
    out.push({ text, startSeconds, endSeconds });
  }
  return out;
}

/** 句级字幕 → 连续无黑场可视窗 */
export function voiceoverSegmentsToWindows(
  segments: VoiceoverSubtitleLike[],
  totalDuration: number
): TimelineVisualSegment[] {
  const duration = Math.max(0.1, totalDuration);
  if (!segments.length) {
    return fixedChunkWindows(duration, 8);
  }

  const sorted = [...segments]
    .filter((s) => s.text.trim() && Number.isFinite(s.startSeconds) && Number.isFinite(s.endSeconds))
    .sort((a, b) => a.startSeconds - b.startSeconds);

  if (!sorted.length) {
    return [{ startSeconds: 0, endSeconds: duration, text: '' }];
  }

  const windows: TimelineVisualSegment[] = sorted.map((s) => ({
    startSeconds: Math.max(0, s.startSeconds),
    endSeconds: Math.max(s.startSeconds + 0.1, s.endSeconds),
    text: s.text.trim(),
  }));

  if (windows[0]!.startSeconds > 0) windows[0]!.startSeconds = 0;
  for (let i = 0; i < windows.length - 1; i++) {
    windows[i]!.endSeconds = windows[i + 1]!.startSeconds;
  }
  windows[windows.length - 1]!.endSeconds = duration;

  return windows
    .filter((w) => w.endSeconds > w.startSeconds)
    .map((w) => ({
      ...w,
      startSeconds: roundSec(w.startSeconds),
      endSeconds: roundSec(w.endSeconds),
    }));
}

/**
 * 将句级 ASR 字幕合并为更长的切镜段（按 min/max 秒数切分，避免 1–3 秒碎镜）
 */
export function mergeVoiceoverSegmentsByCutRhythm(
  segments: VoiceoverSubtitleLike[],
  totalDuration: number,
  minCutSeconds: number,
  maxCutSeconds: number
): TimelineVisualSegment[] {
  const minCut = Math.max(0.5, minCutSeconds);
  const maxCut = Math.max(minCut, maxCutSeconds);

  const sorted = [...segments]
    .filter((s) => s.text.trim() && Number.isFinite(s.startSeconds) && Number.isFinite(s.endSeconds))
    .sort((a, b) => a.startSeconds - b.startSeconds);

  if (!sorted.length) {
    return fixedChunkWindows(totalDuration, Math.round((minCut + maxCut) / 2));
  }

  const coarse: VoiceoverSubtitleLike[] = [];
  let i = 0;

  while (i < sorted.length) {
    const chunkStart = sorted[i]!.startSeconds;
    const texts: string[] = [];
    let j = i;

    while (j < sorted.length) {
      const spanEnd = j + 1 < sorted.length ? sorted[j + 1]!.startSeconds : sorted[j]!.endSeconds;
      const spanDur = spanEnd - chunkStart;

      if (texts.length > 0 && spanDur > maxCut) break;

      texts.push(sorted[j]!.text.trim());
      j++;

      if (spanDur >= minCut) {
        if (j >= sorted.length) break;
        const nextSpanEnd =
          j + 1 < sorted.length ? sorted[j + 1]!.startSeconds : sorted[j]!.endSeconds;
        if (nextSpanEnd - chunkStart > maxCut) break;
      }
    }

    if (!texts.length) {
      texts.push(sorted[i]!.text.trim());
      j = i + 1;
    }

    coarse.push({
      text: texts.join(' '),
      startSeconds: chunkStart,
      endSeconds: sorted[Math.max(i, j - 1)]!.endSeconds,
    });
    i = j;
  }

  let windows = voiceoverSegmentsToWindows(coarse, totalDuration);

  if (windows.length >= 2) {
    const last = windows[windows.length - 1]!;
    const lastDur = last.endSeconds - last.startSeconds;
    if (lastDur < minCut) {
      const prev = windows[windows.length - 2]!;
      windows = [
        ...windows.slice(0, -2),
        {
          ...prev,
          endSeconds: last.endSeconds,
          text: `${prev.text} ${last.text}`.trim(),
        },
      ];
    }
  }

  return windows;
}

export function fixedChunkWindows(totalDuration: number, chunkSeconds = 8): TimelineVisualSegment[] {
  const duration = Math.max(0.1, totalDuration);
  const chunk = Math.max(1, chunkSeconds);
  const out: TimelineVisualSegment[] = [];
  for (let t = 0; t < duration; t += chunk) {
    const end = Math.min(duration, t + chunk);
    out.push({ startSeconds: roundSec(t), endSeconds: roundSec(end), text: '' });
  }
  if (!out.length) out.push({ startSeconds: 0, endSeconds: roundSec(duration), text: '' });
  return out;
}

function voiceoverSubsFromShotListRaw(raw: unknown): VoiceoverSubtitleLike[] {
  const items = parseJsonArray(raw);
  const out: VoiceoverSubtitleLike[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const text = String(
      (item as { voiceover_text?: unknown }).voiceover_text ??
        (item as { text?: unknown }).text ??
        ''
    ).trim();
    const start = Number((item as { startSeconds?: unknown }).startSeconds);
    let end = Number((item as { endSeconds?: unknown }).endSeconds);
    const dur = Number((item as { durationSeconds?: unknown }).durationSeconds);
    if (!Number.isFinite(start)) continue;
    if (!Number.isFinite(end) && Number.isFinite(dur) && dur > 0) {
      end = start + dur;
    }
    if (!text || !Number.isFinite(end) || end <= start) continue;
    out.push({ text, startSeconds: start, endSeconds: end });
  }
  return out;
}

function parseShotList(raw: unknown, totalDuration: number): TimelineVisualSegment[] {
  const items = parseJsonArray(raw);
  const out: TimelineVisualSegment[] = [];
  let cursor = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== 'object') continue;
    const text = String(
      (item as { text?: unknown }).text ??
        (item as { prompt?: unknown }).prompt ??
        (item as { mxmPrompt?: unknown }).mxmPrompt ??
        ''
    ).trim();
    let start = Number((item as { startSeconds?: unknown }).startSeconds ?? (item as { startTime?: unknown }).startTime);
    let dur = Number(
      (item as { durationSeconds?: unknown }).durationSeconds ??
        (item as { duration?: unknown }).duration
    );
    if (!Number.isFinite(start) || start < 0) start = cursor;
    if (!Number.isFinite(dur) || dur <= 0) {
      const end = Number((item as { endSeconds?: unknown }).endSeconds);
      dur = Number.isFinite(end) && end > start ? end - start : 0;
    }
    if (dur <= 0 && i === items.length - 1) {
      dur = Math.max(0.1, totalDuration - start);
    }
    if (dur <= 0) continue;
    const end = Math.min(totalDuration, start + dur);
    const rawMode = (item as { mxmRenderMode?: MxmRenderMode }).mxmRenderMode;
    const mode = normalizeMxmRenderMode(rawMode);
    const overlays = parseSegmentOverlays((item as { overlays?: unknown }).overlays);
    const transition = parseSegmentTransition((item as { transition?: unknown }).transition);
    const videoModeRaw = String((item as { mxmVideoMode?: unknown }).mxmVideoMode ?? '').trim();
    const mxmVideoMode =
      videoModeRaw === 'image-to-video' ||
      videoModeRaw === 'reference-to-video' ||
      videoModeRaw === 'text-to-video'
        ? videoModeRaw
        : undefined;
    const imageUrl = String((item as { mxmSourceImageUrl?: unknown }).mxmSourceImageUrl ?? (item as { url?: unknown }).url ?? '').trim();
    const gsapBrief = String(
      (item as { mxmGsapSceneBrief?: unknown }).mxmGsapSceneBrief ?? ''
    ).trim();
    const gsapStyleId = String((item as { mxmGsapStyleId?: unknown }).mxmGsapStyleId ?? '').trim();
    const gsapSceneType = String((item as { mxmGsapSceneType?: unknown }).mxmGsapSceneType ?? '').trim();
    const gsapSceneDataRaw = (item as { mxmGsapSceneData?: unknown }).mxmGsapSceneData;
    const gsapSceneData =
      gsapSceneDataRaw && typeof gsapSceneDataRaw === 'object'
        ? (gsapSceneDataRaw as Record<string, unknown>)
        : undefined;
    const voiceoverText = String(
      (item as { voiceover_text?: unknown }).voiceover_text ?? ''
    ).trim();
    const beatRoleRaw = String((item as { mxmBeatRole?: unknown }).mxmBeatRole ?? '').trim();
    const beatRole =
      beatRoleRaw === 'opening' ||
      beatRoleRaw === 'transition' ||
      beatRoleRaw === 'body' ||
      beatRoleRaw === 'closing'
        ? beatRoleRaw
        : undefined;
    const fragmentRole = String((item as { mxmFragmentRole?: unknown }).mxmFragmentRole ?? '').trim();
    const videoTaskKey = String((item as { mxmVideoTaskKey?: unknown }).mxmVideoTaskKey ?? '').trim();
    const videoSubtype = String((item as { mxmVideoSubtype?: unknown }).mxmVideoSubtype ?? '').trim();
    const aiOutputKindRaw = String((item as { mxmAiOutputKind?: unknown }).mxmAiOutputKind ?? '').trim();
    const aiOutputKind =
      mode === 'ai-video-gen' && aiOutputKindRaw === 'image' ? ('image' as const) : undefined;
    const visualStyle = String((item as { mxmVisualStyle?: unknown }).mxmVisualStyle ?? '').trim();
    const motionIntensity = String((item as { mxmMotionIntensity?: unknown }).mxmMotionIntensity ?? '').trim();
    const backgroundMode = String((item as { mxmBackgroundMode?: unknown }).mxmBackgroundMode ?? '').trim();
    const rawPrompt = String((item as { mxmPrompt?: unknown }).mxmPrompt ?? '').trim();
    const rawStock = String((item as { mxmStockSearchQuery?: unknown }).mxmStockSearchQuery ?? '').trim();
    const keywords = (item as { keywords?: unknown }).keywords;
    const keywordQuery = Array.isArray(keywords)
      ? keywords.map((k) => String(k).trim()).filter(Boolean).join(' ')
      : '';
    const stockQuery = rawStock || keywordQuery || undefined;
    out.push({
      startSeconds: roundSec(start),
      endSeconds: roundSec(end),
      text,
      mxmRenderMode: mode,
      overlays: overlays.length ? overlays : undefined,
      transition,
      mxmVideoMode,
      mxmPrompt: mode === 'ai-video-gen' ? rawPrompt || undefined : undefined,
      mxmStockSearchQuery:
        mode === 'static-image' ? stockQuery || text || undefined : stockQuery || undefined,
      mxmSourceImageUrl: imageUrl || undefined,
      mxmGsapSceneBrief:
        rawMode === 'gsap-html-animation' ? gsapBrief || undefined : undefined,
      mxmGsapStyleId: rawMode === 'gsap-html-animation' && gsapStyleId ? gsapStyleId : undefined,
      mxmGsapSceneType: rawMode === 'gsap-html-animation' && gsapSceneType ? gsapSceneType : undefined,
      mxmGsapSceneData: rawMode === 'gsap-html-animation' ? gsapSceneData : undefined,
      mxmVoiceoverText: voiceoverText || undefined,
      mxmBeatRole: beatRole,
      keywords: Array.isArray(keywords)
        ? keywords.map((k) => String(k).trim()).filter(Boolean)
        : undefined,
      mxmFragmentRole:
        mode === 'ai-video-gen' && fragmentRole
          ? (fragmentRole as TimelineVisualSegment['mxmFragmentRole'])
          : undefined,
      mxmVideoTaskKey: mode === 'ai-video-gen' && videoTaskKey ? videoTaskKey : undefined,
      mxmVideoSubtype: mode === 'ai-video-gen' && videoSubtype ? videoSubtype : undefined,
      mxmAiOutputKind: aiOutputKind,
      mxmImageMotionEnabled: true,
      mxmImageMotion: aiOutputKind === 'image' ? 'zoom-in' : mode === 'static-image' ? 'pan-left' : undefined,
      mxmVisualStyle: mode === 'ai-video-gen' && visualStyle ? visualStyle : undefined,
      mxmMotionIntensity:
        mode === 'ai-video-gen' && motionIntensity
          ? (motionIntensity as TimelineVisualSegment['mxmMotionIntensity'])
          : undefined,
      mxmBackgroundMode:
        mode === 'ai-video-gen' && backgroundMode
          ? (backgroundMode as TimelineVisualSegment['mxmBackgroundMode'])
          : undefined,
    });
    cursor = end;
  }
  if (out.length && out[out.length - 1]!.endSeconds < totalDuration) {
    out[out.length - 1]!.endSeconds = roundSec(totalDuration);
  }
  return out.length ? out : fixedChunkWindows(totalDuration, 8);
}

function parseImageSequence(raw: unknown, totalDuration: number): TimelineVisualSegment[] {
  const items = parseJsonArray(raw);
  if (!items.length) return fixedChunkWindows(totalDuration, 8);
  const per = totalDuration / items.length;
  return items.map((item, i) => {
    const obj = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const url = String(obj.url ?? obj.imageUrl ?? obj.mxmSourceImageUrl ?? '').trim();
    const caption = String(obj.caption ?? obj.text ?? obj.title ?? '').trim();
    const dur = Number(obj.durationSeconds ?? obj.duration);
    const start = roundSec(Number.isFinite(dur) && dur > 0 ? i * dur : i * per);
    const end = roundSec(
      Number.isFinite(dur) && dur > 0 ? start + dur : Math.min(totalDuration, (i + 1) * per)
    );
    return {
      startSeconds: start,
      endSeconds: end,
      text: caption,
      mxmRenderMode: 'static-image' as const,
      mxmSourceImageUrl: url || undefined,
    };
  });
}

function parseDocumentSections(raw: unknown, totalDuration: number): TimelineVisualSegment[] {
  const items = parseJsonArray(raw);
  if (!items.length) return fixedChunkWindows(totalDuration, 8);

  const weights: number[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      weights.push(1);
      continue;
    }
    const fixed = Number((item as { durationSeconds?: unknown }).durationSeconds);
    if (Number.isFinite(fixed) && fixed > 0) {
      weights.push(fixed);
      continue;
    }
    const text = String((item as { text?: unknown }).text ?? (item as { title?: unknown }).title ?? '').trim();
    weights.push(Math.max(1, text.length));
  }
  const sum = weights.reduce((a, b) => a + b, 0);
  let cursor = 0;
  return items.map((item, i) => {
    const obj = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const text = String(obj.text ?? obj.title ?? '').trim();
    const dur =
      Number.isFinite(Number(obj.durationSeconds)) && Number(obj.durationSeconds) > 0
        ? Number(obj.durationSeconds)
        : (weights[i]! / sum) * totalDuration;
    const start = roundSec(cursor);
    const end = roundSec(Math.min(totalDuration, cursor + dur));
    cursor += dur;
    return {
      startSeconds: start,
      endSeconds: end,
      text,
      mxmRenderMode: 'static-image' as const,
    };
  });
}

export function resolveTimelineVisualSegments(input: SegmentResolverInput): TimelineVisualSegment[] {
  const duration = Math.max(0.1, input.totalDurationSeconds);
  const strategy = input.strategy;

  let segments: TimelineVisualSegment[];

  switch (strategy) {
    case 'voiceover-subtitles': {
      const subs = parseVoiceoverSegments(input.segmentsRaw);
      const rhythm = resolveCutRhythmBounds({
        cutRhythm: input.cutRhythm,
        minCutSeconds: input.minCutSeconds,
        maxCutSeconds: input.maxCutSeconds,
        voiceoverSegments: subs,
        totalDurationSeconds: duration,
      });
      if (rhythm) {
        segments = mergeVoiceoverSegmentsByCutRhythm(
          subs,
          duration,
          rhythm.minCutSeconds,
          rhythm.maxCutSeconds
        );
      } else {
        segments = voiceoverSegmentsToWindows(subs, duration);
      }
      segments = reflowSegmentsByModeDuration(segments, duration, subs);
      break;
    }
    case 'fixed-chunk':
      segments = fixedChunkWindows(duration, input.chunkSeconds ?? 8);
      break;
    case 'shot-list': {
      const shotSubs = voiceoverSubsFromShotListRaw(input.segmentsRaw);
      segments = parseShotList(input.segmentsRaw, duration);
      segments = reflowSegmentsByModeDuration(
        segments,
        duration,
        shotSubs.length ? shotSubs : undefined
      );
      break;
    }
    case 'image-sequence':
      segments = parseImageSequence(input.segmentsRaw, duration);
      break;
    case 'document-sections':
      segments = parseDocumentSections(input.segmentsRaw, duration);
      break;
    default:
      throw new Error(`未知 segmentStrategy: ${strategy}`);
  }

  return snapVisualSegmentsToWholeSeconds(segments, duration);
}
