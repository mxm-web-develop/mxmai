/**
 * A1 输出校验 / 归一化，以及与 shot-list 画面段合并。
 */
import type { SegmentTransitionSpec } from './timeline-overlay-types';
import type { RhythmWindow, RhythmWindowsPlan, BeatRole } from './plan-cut-windows';
import type { VoiceoverSubtitleLike } from './timeline-segment-types';

export type CutBeatType =
  | 'hook'
  | 'explain'
  | 'evidence'
  | 'climax'
  | 'transition'
  | 'outro';

export type CutRhythmHint = 'hold' | 'normal' | 'accelerate';

export type CutBeat = {
  beatId: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  voiceoverText: string;
  subtitleSpan: [number, number];
  /** 语篇角色（A0 确定性产出，A1 不可改） */
  beatRole: BeatRole;
  beatType?: CutBeatType;
  rhythmHint?: CutRhythmHint;
  semanticTheme?: string;
  transitionOut?: SegmentTransitionSpec;
  onBeatReason?: string;
};

export type CutBeatPlan = {
  global_topic?: string;
  cut_rhythm_resolved?: string;
  beats: CutBeat[];
};

const BEAT_TYPES = new Set<CutBeatType>([
  'hook',
  'explain',
  'evidence',
  'climax',
  'transition',
  'outro',
]);

const RHYTHM_HINTS = new Set<CutRhythmHint>(['hold', 'normal', 'accelerate']);

function parseTransition(raw: unknown): SegmentTransitionSpec | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const type = String((raw as { type?: unknown }).type ?? '').trim();
  const durationSeconds = Number((raw as { durationSeconds?: unknown }).durationSeconds);
  if (!type) return undefined;
  return {
    type: type as SegmentTransitionSpec['type'],
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0.5,
  };
}

/** 语篇角色 → 默认节拍标注 */
function defaultsForRole(role: BeatRole): {
  beatType: CutBeatType;
  rhythmHint: CutRhythmHint;
} {
  switch (role) {
    case 'opening':
      return { beatType: 'hook', rhythmHint: 'hold' };
    case 'transition':
      return { beatType: 'transition', rhythmHint: 'normal' };
    case 'closing':
      return { beatType: 'outro', rhythmHint: 'hold' };
    default:
      return { beatType: 'explain', rhythmHint: 'normal' };
  }
}

function beatFromWindow(w: RhythmWindow): CutBeat {
  const d = defaultsForRole(w.beatRole);
  return {
    beatId: w.windowId.replace(/^w/, 'b'),
    startSeconds: w.startSeconds,
    endSeconds: w.endSeconds,
    durationSeconds: w.durationSeconds,
    voiceoverText: w.voiceoverText,
    subtitleSpan: w.subtitleSpan,
    beatRole: w.beatRole,
    beatType: d.beatType,
    rhythmHint: d.rhythmHint,
    transitionOut: { type: 'crossfade', durationSeconds: 0.5 },
  };
}

/**
 * 章节转场处理：正文/结尾章节起点（transition/closing）之前的一镜用较强转场（dipToBlack）。
 * 就地修改 beats。
 */
function applySectionTransitions(beats: CutBeat[]): void {
  for (let i = 0; i < beats.length - 1; i++) {
    const next = beats[i + 1]!;
    if (next.beatRole === 'transition' || next.beatRole === 'closing') {
      // 用户/LLM 未显式指定时才覆盖为章节转场
      if (!beats[i]!.transitionOut || beats[i]!.transitionOut?.type === 'crossfade') {
        beats[i]!.transitionOut = { type: 'dipToBlack', durationSeconds: 0.6 };
      }
    }
  }
}

/** A1 校验失败 / 无 LLM 时：直接用 A0 语篇 windows + 角色默认标注 */
export function fallbackCutBeatPlan(
  rhythmPlan: RhythmWindowsPlan,
  globalTopic?: string
): CutBeatPlan {
  const beats = rhythmPlan.windows.map(beatFromWindow);
  applySectionTransitions(beats);
  return {
    global_topic: globalTopic,
    cut_rhythm_resolved: rhythmPlan.cutRhythmResolved,
    beats,
  };
}

type BeatAnnotation = {
  beatType?: CutBeatType;
  rhythmHint?: CutRhythmHint;
  semanticTheme?: string;
  transitionOut?: SegmentTransitionSpec;
  onBeatReason?: string;
};

/** 提取 LLM 单条 beat 的标注字段（不含时间/口播/subtitleSpan） */
function parseAnnotation(item: unknown): BeatAnnotation {
  if (!item || typeof item !== 'object') return {};
  const beatTypeRaw = String((item as { beatType?: unknown }).beatType ?? '').trim();
  const rhythmHintRaw = String((item as { rhythmHint?: unknown }).rhythmHint ?? '').trim();
  return {
    beatType: BEAT_TYPES.has(beatTypeRaw as CutBeatType)
      ? (beatTypeRaw as CutBeatType)
      : undefined,
    rhythmHint: RHYTHM_HINTS.has(rhythmHintRaw as CutRhythmHint)
      ? (rhythmHintRaw as CutRhythmHint)
      : undefined,
    semanticTheme:
      String((item as { semanticTheme?: unknown }).semanticTheme ?? '').trim() || undefined,
    transitionOut: parseTransition((item as { transitionOut?: unknown }).transitionOut),
    onBeatReason:
      String((item as { onBeatReason?: unknown }).onBeatReason ?? '').trim() || undefined,
  };
}

/**
 * 归一化 cut-beat plan。
 *
 * 时间轴权威来自 A0 语篇 windows（确定性、已卡语篇边界），A1 LLM **仅提供语义标注**
 * （beatType / rhythmHint / semanticTheme / transitionOut）。LLM 的时间/口播/切分一律忽略，
 * 从根本上避免 LLM 把语篇卡点重新抹平或产生黑场/漏字幕。
 *
 * subs 参数保留以兼容旧签名（当前不再用于校验）。
 */
export function normalizeCutBeatPlan(
  raw: unknown,
  rhythmPlan: RhythmWindowsPlan,
  _subs: VoiceoverSubtitleLike[],
  _totalDuration: number,
  globalTopic?: string
): CutBeatPlan {
  const beats = rhythmPlan.windows.map(beatFromWindow);

  // 收集 LLM 标注（按 index 与 beatId 双通道匹配）
  const beatsRaw =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as { beats?: unknown }).beats
      : undefined;
  if (Array.isArray(beatsRaw) && beatsRaw.length) {
    const byId = new Map<string, BeatAnnotation>();
    for (let i = 0; i < beatsRaw.length; i++) {
      const id = String((beatsRaw[i] as { beatId?: unknown })?.beatId ?? '').trim();
      if (id) byId.set(id, parseAnnotation(beatsRaw[i]));
    }
    for (let i = 0; i < beats.length; i++) {
      const ann = byId.get(beats[i]!.beatId) ?? parseAnnotation(beatsRaw[i]);
      if (ann.beatType) beats[i]!.beatType = ann.beatType;
      if (ann.rhythmHint) beats[i]!.rhythmHint = ann.rhythmHint;
      if (ann.semanticTheme) beats[i]!.semanticTheme = ann.semanticTheme;
      if (ann.transitionOut) beats[i]!.transitionOut = ann.transitionOut;
      if (ann.onBeatReason) beats[i]!.onBeatReason = ann.onBeatReason;
    }
  }

  applySectionTransitions(beats);

  return {
    global_topic:
      (raw && typeof raw === 'object' && !Array.isArray(raw)
        ? String((raw as { global_topic?: unknown }).global_topic ?? '').trim()
        : '') || globalTopic,
    cut_rhythm_resolved: rhythmPlan.cutRhythmResolved,
    beats,
  };
}

/** beat 时间轴 + shot-list 画面字段 → 完整 shot-list（供 buildVideoEditTimeline） */
export function mergeBeatPlanWithShotList(
  beatPlan: CutBeatPlan,
  shotListRaw: unknown
): Record<string, unknown> {
  if (!shotListRaw || typeof shotListRaw !== 'object' || Array.isArray(shotListRaw)) {
    throw new Error('shot-list 须为 JSON 对象');
  }
  const shot = shotListRaw as Record<string, unknown>;
  const segmentsRaw = shot.segments;
  if (!Array.isArray(segmentsRaw) || segmentsRaw.length === 0) {
    throw new Error('shot-list 缺少 segments 数组');
  }

  const beatById = new Map(beatPlan.beats.map((b) => [b.beatId, b]));
  const segments: Record<string, unknown>[] = [];

  for (let i = 0; i < segmentsRaw.length; i++) {
    const seg = segmentsRaw[i];
    if (!seg || typeof seg !== 'object') continue;
    const s = seg as Record<string, unknown>;
    const beatId = String(s.beatId ?? beatPlan.beats[i]?.beatId ?? `b${i + 1}`).trim();
    const beat = beatById.get(beatId) ?? beatPlan.beats[i];
    if (!beat) continue;

    segments.push({
      ...s,
      beatId: beat.beatId,
      startSeconds: beat.startSeconds,
      durationSeconds: beat.durationSeconds,
      voiceover_text: beat.voiceoverText,
      transition: s.transition ?? beat.transitionOut,
      mxmBeatType: beat.beatType,
      mxmBeatRole: beat.beatRole,
      mxmRhythmHint: beat.rhythmHint,
      mxmSemanticTheme: beat.semanticTheme,
    });
  }

  if (segments.length !== beatPlan.beats.length) {
    throw new Error(
      `shot-list segments（${segments.length}）须与 cut-beat 数量（${beatPlan.beats.length}）一致`
    );
  }

  return {
    ...shot,
    global_topic: shot.global_topic ?? beatPlan.global_topic,
    segments,
  };
}
