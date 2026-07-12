/**
 * 将 OpenReel timeline.subtitles 转为 textClips，走 overlay-compositor ffmpeg drawtext 烧录。
 * 对齐 mxm-editor-core video-engine.renderSubtitleToCanvasCtx（底部白字 + 半透明底）。
 */
import type { TextClip } from '@mxmai/mxm-editor-core/text/types';
import { stripSubtitlePunctuation } from '../audio/voiceover-subtitle-normalize';
import type { VideoEditScript } from './types';

export const SUBTITLE_BURN_TRACK_ID = 'track-subtitle-burn';

/** OpenReel DEFAULT_SUBTITLE_STYLE 语义，字号按 1080p 可读性略放大 */
function subtitleTextStyle(editStyle?: string) {
  const dark =
    editStyle === 'science-minimal' ||
    editStyle === 'documentary' ||
    editStyle === 'motion-infographic';
  return {
    fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif',
    fontSize: editStyle === 'classroom' ? 48 : 40,
    fontWeight: 700 as const,
    fontStyle: 'normal' as const,
    color: '#ffffff',
    backgroundColor: dark ? 'rgba(0, 0, 0, 0.72)' : 'rgba(0, 0, 0, 0.68)',
    textAlign: 'center' as const,
    verticalAlign: 'middle' as const,
    lineHeight: 1.25,
    letterSpacing: 0,
  };
}

/** timeline.subtitles → 可烧录 TextClip（与 project.textClips 共用 drawtext 管线） */
export function subtitlesToTextClips(script: VideoEditScript): TextClip[] {
  const subs = script.project.timeline.subtitles ?? [];
  if (subs.length === 0) return [];

  const editStyle = script.project.settings.mxmEditStyle;
  const style = subtitleTextStyle(typeof editStyle === 'string' ? editStyle : undefined);

  const clips: TextClip[] = [];
  for (let i = 0; i < subs.length; i++) {
    const sub = subs[i]!;
    const text = stripSubtitlePunctuation(String(sub.text ?? ''));
    if (!text) continue;
    const startTime = Number(sub.startTime);
    const endTime = Number(sub.endTime);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) continue;

    clips.push({
      id: `sub-burn-${sub.id || i + 1}`,
      trackId: SUBTITLE_BURN_TRACK_ID,
      startTime,
      duration: Math.max(0.2, endTime - startTime),
      text,
      style,
      transform: {
        position: { x: 0.5, y: 0.82 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        anchor: { x: 0.5, y: 0.5 },
        opacity: 1,
      },
      animation: {
        preset: 'none',
        params: {},
        inDuration: 0.05,
        outDuration: 0.05,
        unit: 'line',
      },
      keyframes: [],
    });
  }
  return clips;
}
