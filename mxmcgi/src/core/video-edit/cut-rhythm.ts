/**
 * 口播视频切镜节奏：与句级字幕合并，非漫剧式硬切秒数。
 * - 节奏档位：fast | default | slow | auto
 * - 各 mxmRenderMode 单段时长上限（慢节奏长镜也不超过 GLOBAL_MAX）
 */
import type { MxmRenderMode } from './types';
import { normalizeMxmRenderMode } from './render-mode';
import type { TimelineVisualSegment, VoiceoverSubtitleLike } from './timeline-segment-types';
import { roundToWholeSeconds, snapVisualSegmentsToWholeSeconds } from './timeline-whole-seconds';

export type CutRhythmId = 'fast' | 'default' | 'slow' | 'auto';

/** 旧 bundle / 任务参数兼容 */
export type LegacyCutRhythmId = 'science-promo' | 'dialogue-show' | 'comic-drama';

export const GLOBAL_MAX_CUT_SECONDS = 15;

export const RENDER_MODE_DURATION: Record<
  MxmRenderMode,
  { minSeconds: number; maxSeconds: number; label: string }
> = {
  'static-image': { minSeconds: 4, maxSeconds: 12, label: '素材引入' },
  'ai-video-gen': { minSeconds: 4, maxSeconds: 12, label: 'AI 生成' },
  'gsap-html-animation': { minSeconds: 4, maxSeconds: 12, label: '素材引入（遗留）' },
};

export const CUT_RHYTHM_PRESETS: Record<
  Exclude<CutRhythmId, 'auto'>,
  { label: string; minCutSeconds: number; maxCutSeconds: number; hint: string }
> = {
  fast: {
    label: '快',
    minCutSeconds: 4,
    maxCutSeconds: 8,
    hint: '信息密集、短句口播；合并字幕为 4–8 秒/镜',
  },
  default: {
    label: '默认',
    minCutSeconds: 5,
    maxCutSeconds: 10,
    hint: '科普 / 谈话 / 新闻常规节奏；5–10 秒/镜',
  },
  slow: {
    label: '慢',
    minCutSeconds: 8,
    maxCutSeconds: GLOBAL_MAX_CUT_SECONDS,
    hint: '长句解说、少切镜；8–15 秒/镜（最长不超过 15 秒）',
  },
};

const LEGACY_CUT_RHYTHM_ALIASES: Record<string, CutRhythmId> = {
  'science-promo': 'default',
  'dialogue-show': 'default',
  'comic-drama': 'fast',
};

export function normalizeCutRhythmId(raw?: string | null): CutRhythmId | undefined {
  const id = raw?.trim();
  if (!id) return undefined;
  if (id in CUT_RHYTHM_PRESETS || id === 'auto') return id as CutRhythmId;
  return LEGACY_CUT_RHYTHM_ALIASES[id];
}

/** 根据句级字幕密度推断 auto 档位边界 */
export function resolveAutoCutRhythmBounds(
  segments: VoiceoverSubtitleLike[],
  totalDurationSeconds: number
): { minCutSeconds: number; maxCutSeconds: number; resolved: Exclude<CutRhythmId, 'auto'> } {
  if (!segments.length || totalDurationSeconds <= 0) {
    return { ...CUT_RHYTHM_PRESETS.default, resolved: 'default' };
  }

  const spans = segments
    .map((s) => s.endSeconds - s.startSeconds)
    .filter((d) => d > 0.05);
  const avgSpan = spans.length ? spans.reduce((a, b) => a + b, 0) / spans.length : 3;
  const charCount = segments.reduce((n, s) => n + s.text.trim().length, 0);
  const charsPerSec = charCount / Math.max(1, totalDurationSeconds);

  // 短句 / 快语速 → 快；长句 / 慢语速 → 慢
  if (avgSpan <= 2.8 || charsPerSec >= 5.5) {
    return { ...CUT_RHYTHM_PRESETS.fast, resolved: 'fast' };
  }
  if (avgSpan >= 4.2 || charsPerSec <= 3.2) {
    return { ...CUT_RHYTHM_PRESETS.slow, resolved: 'slow' };
  }
  return { ...CUT_RHYTHM_PRESETS.default, resolved: 'default' };
}

export function resolveCutRhythmBounds(input: {
  cutRhythm?: string;
  minCutSeconds?: number;
  maxCutSeconds?: number;
  /** auto 模式：句级字幕 */
  voiceoverSegments?: VoiceoverSubtitleLike[];
  totalDurationSeconds?: number;
}): { minCutSeconds: number; maxCutSeconds: number; rhythmId?: CutRhythmId } | null {
  const normalized = normalizeCutRhythmId(input.cutRhythm);

  if (normalized === 'auto') {
    const auto = resolveAutoCutRhythmBounds(
      input.voiceoverSegments ?? [],
      input.totalDurationSeconds ?? 0
    );
    return {
      minCutSeconds: auto.minCutSeconds,
      maxCutSeconds: auto.maxCutSeconds,
      rhythmId: 'auto',
    };
  }

  const preset =
    normalized && normalized !== 'auto' ? CUT_RHYTHM_PRESETS[normalized] : null;

  const minCut = input.minCutSeconds ?? preset?.minCutSeconds;
  const maxCut = input.maxCutSeconds ?? preset?.maxCutSeconds;
  if (minCut == null || maxCut == null) return null;

  const minCutSeconds = Math.max(0.5, minCut);
  const maxCutSeconds = Math.min(GLOBAL_MAX_CUT_SECONDS, Math.max(minCutSeconds, maxCut));
  return { minCutSeconds, maxCutSeconds, rhythmId: normalized };
}

export function modeDurationBounds(mode?: MxmRenderMode): { minSeconds: number; maxSeconds: number } {
  const normalized = normalizeMxmRenderMode(mode);
  const bounds = RENDER_MODE_DURATION[normalized];
  return {
    minSeconds: bounds.minSeconds,
    maxSeconds: Math.min(bounds.maxSeconds, GLOBAL_MAX_CUT_SECONDS),
  };
}

function subtitlesInRange(
  subs: VoiceoverSubtitleLike[],
  start: number,
  end: number
): VoiceoverSubtitleLike[] {
  return subs.filter((s) => s.endSeconds > start + 0.01 && s.startSeconds < end - 0.01);
}

/** 超长单镜按渲染模式上限拆段（优先在句级字幕边界切） */
export function reflowSegmentsByModeDuration(
  segments: TimelineVisualSegment[],
  totalDurationSeconds: number,
  voiceoverSegments?: VoiceoverSubtitleLike[]
): TimelineVisualSegment[] {
  if (!segments.length) return segments;

  const subs = voiceoverSegments ?? [];
  const out: TimelineVisualSegment[] = [];

  for (const seg of segments) {
    const mode = normalizeMxmRenderMode(seg.mxmRenderMode);
    const { maxSeconds } = modeDurationBounds(mode);
    const start = seg.startSeconds;
    const end = seg.endSeconds;
    const dur = end - start;

    if (dur <= maxSeconds + 0.01) {
      out.push(seg);
      continue;
    }

    const inRange = subtitlesInRange(subs, start, end);
    let cursor = start;

    while (cursor < end - 0.01) {
      const chunkEndTarget = Math.min(end, cursor + maxSeconds);
      let splitAt = chunkEndTarget;

      if (inRange.length) {
        const candidates = inRange
          .map((s) => s.startSeconds)
          .filter((t) => t > cursor + 0.5 && t <= chunkEndTarget + 0.01);
        if (candidates.length) {
          splitAt = candidates[candidates.length - 1]!;
        }
      }

      if (splitAt <= cursor + 0.5) {
        splitAt = Math.min(end, cursor + maxSeconds);
      }

      out.push({
        ...seg,
        startSeconds: roundToWholeSeconds(cursor),
        endSeconds: roundToWholeSeconds(splitAt),
        text: seg.text,
        mxmVoiceoverText: sliceVoiceoverText(inRange, cursor, splitAt, seg.mxmVoiceoverText),
      });
      cursor = splitAt;
    }
  }

  return snapVisualSegmentsToWholeSeconds(out, totalDurationSeconds);
}

function sliceVoiceoverText(
  subs: VoiceoverSubtitleLike[],
  start: number,
  end: number,
  fallback?: string
): string | undefined {
  const texts = subs
    .filter((s) => s.endSeconds > start + 0.01 && s.startSeconds < end - 0.01)
    .map((s) => s.text.trim())
    .filter(Boolean);
  if (texts.length) return texts.join(' ');
  return fallback;
}

/** 供 LLM prompt / Admin 展示 */
export function formatCutRhythmPromptBlock(cutRhythm: string): string {
  const id = normalizeCutRhythmId(cutRhythm) ?? 'default';
  if (id === 'auto') {
    return `- cut_rhythm=auto：按句级字幕密度自动选择快/默认/慢（短句→4–8s，常规→5–10s，长句→8–15s）`;
  }
  const p = CUT_RHYTHM_PRESETS[id];
  return `- cut_rhythm=${id}（${p.label}）：${p.hint}`;
}

export function formatRenderModeDurationPromptBlock(): string {
  return [
    '- static-image / ai-video-gen：单段 4–12 秒',
    `- 任意模式单镜最长不超过 ${GLOBAL_MAX_CUT_SECONDS} 秒`,
    '- 文字/转场动效走 overlays，不计入 mxmRenderMode',
  ].join('\n');
}
