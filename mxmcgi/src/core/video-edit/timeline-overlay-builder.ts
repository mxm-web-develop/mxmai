import type { TextClip } from '@mxmai/mxm-editor-core/text/types';
import type { Transition } from '@mxmai/mxm-editor-core/types/timeline';
import type { Track } from '@mxmai/mxm-editor-core/types/timeline';
import type { TimelineVisualSegment } from './timeline-segment-types';
import type {
  OverlayTextAnimationPreset,
  OverlayTextPosition,
  SegmentOverlaySpec,
  SegmentTransitionSpec,
} from './timeline-overlay-types';
import { pickDefaultOverlayStyle, positionForLayout } from './overlay-style-presets';

export const TEXT_OVERLAY_TRACK_ID = 'track-text-overlay';
export const GRAPHICS_OVERLAY_TRACK_ID = 'track-graphics-overlay';

const DEFAULT_TRANSITION: SegmentTransitionSpec = {
  type: 'crossfade',
  durationSeconds: 0.5,
};

function mapTextAnimation(preset?: OverlayTextAnimationPreset) {
  if (!preset || preset === 'none') return undefined;
  const inDuration = preset === 'typewriter' ? 1.2 : 0.55;
  const outDuration = 0.35;
  return {
    preset,
    params: {},
    inDuration,
    outDuration,
    unit: 'word' as const,
  };
}

export function migrateGsapSegmentToOverlays(segment: TimelineVisualSegment): SegmentOverlaySpec[] {
  const brief = segment.mxmGsapSceneBrief?.trim();
  if (!brief) return [];
  const headline =
    segment.keywords?.slice(0, 3).join(' · ') ||
    brief.split(/[/／\n]/)[0]?.trim().slice(0, 48) ||
    segment.text.trim().slice(0, 48);
  if (!headline) return [];
  return [
    {
      kind: 'text',
      text: headline,
      animationPreset: 'fade',
      position: 'center',
      startOffsetSeconds: 0.2,
    },
  ];
}

export function buildOpenReelOverlaysFromSegments(
  segments: TimelineVisualSegment[],
  opts: { projectWidth: number; projectHeight: number; editStyle?: string }
): {
  textClips: TextClip[];
  textTrack: Track | null;
  graphicsTrack: Track | null;
  transitions: Transition[];
} {
  const textClips: TextClip[] = [];
  const transitions: Transition[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const segStart = seg.startSeconds;
    const segDur = Math.max(0.5, seg.endSeconds - seg.startSeconds);
    const overlays = seg.overlays?.length
      ? seg.overlays
      : seg.mxmGsapSceneBrief
        ? migrateGsapSegmentToOverlays(seg)
        : [];

    for (let j = 0; j < overlays.length; j++) {
      const ov = overlays[j]!;
      if (ov.kind === 'template') continue;
      const text = ov.text?.trim();
      if (!text) continue;

      const offset = Math.max(0, ov.startOffsetSeconds ?? 0);
      const duration = Math.max(0.4, ov.durationSeconds ?? segDur - offset);
      // YouTube / B站风格：按文案长度与位置自动选大标题/关键词/下三分之一条
      const { style, layout } = pickDefaultOverlayStyle(text, ov.position);
      void opts.editStyle;
      const finalPos = positionForLayout(layout);

      textClips.push({
        id: `text-ov-${i + 1}-${j + 1}`,
        trackId: TEXT_OVERLAY_TRACK_ID,
        startTime: segStart + offset,
        duration: Math.min(duration, segDur - offset),
        text,
        style,
        transform: {
          position: finalPos,
          scale: { x: 1, y: 1 },
          rotation: 0,
          anchor: { x: 0.5, y: 0.5 },
          opacity: 1,
        },
        animation: mapTextAnimation(ov.animationPreset ?? 'pop'),
        keyframes: [],
      });
    }

    if (i < segments.length - 1) {
      const tr = seg.transition ?? DEFAULT_TRANSITION;
      const clipAId = `clip-vis-${i + 1}`;
      const clipBId = `clip-vis-${i + 2}`;
      transitions.push({
        id: `tr-${i + 1}`,
        clipAId,
        clipBId,
        type: tr.type,
        duration: Math.max(0.2, Math.min(1.5, tr.durationSeconds ?? 0.5)),
        params: {},
      });
    }
  }

  const textTrack: Track | null = textClips.length
    ? {
        id: TEXT_OVERLAY_TRACK_ID,
        type: 'text',
        name: '文字叠加',
        clips: [],
        transitions: [],
        locked: false,
        hidden: false,
        muted: false,
        solo: false,
      }
    : null;

  return {
    textClips,
    textTrack,
    graphicsTrack: null,
    transitions,
  };
}

/** 解析 shot-list JSON 中的 overlays 数组 */
export function parseSegmentOverlays(raw: unknown): SegmentOverlaySpec[] {
  if (!Array.isArray(raw)) return [];
  const out: SegmentOverlaySpec[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const kindRaw = String((item as { kind?: unknown }).kind ?? 'text').trim();
    const kind = kindRaw === 'template' ? 'template' : 'text';
    const text = String((item as { text?: unknown }).text ?? '').trim();
    const templateId = String((item as { templateId?: unknown }).templateId ?? '').trim();
    const animationPreset = String(
      (item as { animationPreset?: unknown }).animationPreset ?? 'fade'
    ).trim() as OverlayTextAnimationPreset;
    const position = String((item as { position?: unknown }).position ?? 'bottom').trim() as OverlayTextPosition;
    const startOffsetSeconds = Number((item as { startOffsetSeconds?: unknown }).startOffsetSeconds);
    const durationSeconds = Number((item as { durationSeconds?: unknown }).durationSeconds);

    if (kind === 'text' && !text) continue;
    if (kind === 'template' && !templateId) continue;

    out.push({
      kind,
      text: text || undefined,
      templateId: templateId || undefined,
      animationPreset,
      position,
      startOffsetSeconds: Number.isFinite(startOffsetSeconds) ? startOffsetSeconds : undefined,
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : undefined,
    });
  }
  return out;
}

export function parseSegmentTransition(raw: unknown): SegmentTransitionSpec | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const type = String((raw as { type?: unknown }).type ?? 'crossfade').trim() as SegmentTransitionSpec['type'];
  const durationSeconds = Number((raw as { durationSeconds?: unknown }).durationSeconds);
  return {
    type,
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : undefined,
  };
}
