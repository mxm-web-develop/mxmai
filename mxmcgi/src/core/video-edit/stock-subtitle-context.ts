import type { VideoEditScript } from './types';

export type ClipSubtitleSearchContext = {
  /** 与本 clip 时间重叠的字幕 */
  subtitleText: string;
  /** 本段 + 前后邻接字幕（短句时用于配图检索） */
  contextSubtitles: string;
  projectTopic?: string;
};

type SubtitleLike = { text: string; startTime: number; endTime: number };

const DEFAULT_CONTEXT_PAD_SEC = 10;
const MIN_SUBSTANTIVE_CHARS = 14;

export function substantiveTextLength(text: string): number {
  return text.replace(/[\s，。、；：！？,.;:!?「」『』"'""'']/g, '').length;
}

/** 按时间窗收集字幕；短句时扩展前后 contextPadSec 秒邻接句 */
export function resolveClipSubtitleSearchContext(
  subtitles: SubtitleLike[],
  clipStart: number,
  clipDuration: number,
  opts?: { contextPadSec?: number; projectTopic?: string }
): ClipSubtitleSearchContext {
  const pad = opts?.contextPadSec ?? DEFAULT_CONTEXT_PAD_SEC;
  const clipEnd = clipStart + clipDuration;

  const inClip = subtitles
    .filter((s) => s.startTime < clipEnd && s.endTime > clipStart)
    .map((s) => s.text.trim())
    .filter(Boolean);

  const contextStart = clipStart - pad;
  const contextEnd = clipEnd + pad;
  const withContext = subtitles
    .filter((s) => s.startTime < contextEnd && s.endTime > contextStart)
    .map((s) => s.text.trim())
    .filter(Boolean);

  const subtitleText = inClip.join(' ');
  const contextSubtitles = [...new Set(withContext)].join(' ');

  return {
    subtitleText,
    contextSubtitles: contextSubtitles || subtitleText,
    projectTopic: opts?.projectTopic?.trim() || undefined,
  };
}

export function subtitleContextForClipInScript(
  script: VideoEditScript,
  clipStart: number,
  clipDuration: number
): ClipSubtitleSearchContext {
  const subtitles = (script.project.timeline.subtitles ?? []).map((s) => ({
    text: s.text,
    startTime: s.startTime,
    endTime: s.endTime,
  }));
  const projectTopic = script.project.name?.trim();
  return resolveClipSubtitleSearchContext(subtitles, clipStart, clipDuration, { projectTopic });
}

export { MIN_SUBSTANTIVE_CHARS };
