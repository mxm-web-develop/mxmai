import { stripSubtitlePunctuation } from '../../lib/subtitleDisplayText';
import type { MxmClipMetadata, TimelineClip, TimelineSubtitle } from './types';

export function overlapsClipTime(
  sub: TimelineSubtitle,
  clipStart: number,
  clipDuration: number
): boolean {
  const clipEnd = clipStart + clipDuration;
  return sub.startTime < clipEnd && sub.endTime > clipStart;
}

export function subtitlesForClip(
  subtitles: TimelineSubtitle[],
  clip: Pick<TimelineClip, 'startTime' | 'duration'>
): TimelineSubtitle[] {
  return subtitles.filter((s) => overlapsClipTime(s, clip.startTime, clip.duration));
}

/** 本段口播展示文案：优先 clip.metadata，否则合并句级字幕 */
export function segmentVoiceoverDisplayText(
  meta: MxmClipMetadata | undefined,
  clip: Pick<TimelineClip, 'startTime' | 'duration'>,
  subtitles: TimelineSubtitle[]
): string {
  const voice = meta?.mxmVoiceoverText?.trim();
  if (voice) return voice;
  return subtitlesForClip(subtitles, clip)
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join('\n');
}

/** 按字幕时长权重把整段文案拆回各句（用于同步 timeline.subtitles） */
export function distributeTextToSubtitles(
  text: string,
  subs: TimelineSubtitle[]
): Map<string, string> {
  const normalized = stripSubtitlePunctuation(text.replace(/\n+/g, ' '));
  const result = new Map<string, string>();
  if (subs.length === 0) return result;
  if (subs.length === 1) {
    result.set(subs[0]!.id, normalized);
    return result;
  }
  const weights = subs.map((s) => Math.max(0.05, s.endTime - s.startTime));
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = 0;
  for (let i = 0; i < subs.length; i++) {
    const isLast = i === subs.length - 1;
    const share = isLast
      ? normalized.length - cursor
      : Math.max(1, Math.round((weights[i]! / total) * normalized.length));
    result.set(subs[i]!.id, normalized.slice(cursor, cursor + share).trim());
    cursor += share;
  }
  return result;
}
