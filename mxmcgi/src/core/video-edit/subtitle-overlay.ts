/**
 * 将 OpenReel timeline.subtitles 转为 textClips，走 overlay-compositor ffmpeg drawtext 烧录。
 * 对齐 mxm-editor-core video-engine.renderSubtitleToCanvasCtx（底部白字 + 半透明底）。
 *
 * 设计原则（参考 YouTube 自动字幕 / B 站知识区 / Netflix 纪录片）：
 * - 单条字幕最长 18 个汉字的"舒适阅读宽度"，>14 字强制按词拆成 2 行
 * - 字号 48px @ 1080p，移动端可读、不抢占注意力
 * - 默认仅在章节画面文字为零时显示（与 textClips 互斥）
 * - 半透明黑底 0.62 + 圆角 8px，避免硬切
 */
import type { TextClip } from '@mxmai/mxm-editor-core/text/types';
import { stripSubtitlePunctuation } from '../audio/voiceover-subtitle-normalize';
import type { VideoEditScript } from './types';

export const SUBTITLE_BURN_TRACK_ID = 'track-subtitle-burn';

/** 单行最大长度（中文字符计 1 个，英文词计 1 个） */
const SUBTITLE_MAX_CHARS_PER_LINE = 14;
const SUBTITLE_MAX_LINES = 2;

/** 按字数阈值切行（自上而下、自左到右） */
function wrapSubtitleTwoLines(raw: string): string {
  const text = (raw ?? '').replace(/\r?\n/g, ' ').trim();
  if (!text) return '';
  // 用空格优先切；中文连续用 N 字一刀
  if (text.length <= SUBTITLE_MAX_CHARS_PER_LINE * SUBTITLE_MAX_LINES) {
    // 仍然尝试一下单词切（英文场景）
    const segs = text.split(/\s+/);
    if (segs.length === 1) return text;
    // 累计不超过 28 字符二行限制
    const lines: string[] = [];
    let cur = '';
    for (const s of segs) {
      const trial = cur ? `${cur} ${s}` : s;
      if (trial.length <= SUBTITLE_MAX_CHARS_PER_LINE) cur = trial;
      else {
        if (cur) lines.push(cur);
        cur = s.length > SUBTITLE_MAX_CHARS_PER_LINE ? s.slice(0, SUBTITLE_MAX_CHARS_PER_LINE) : s;
      }
      if (lines.length >= SUBTITLE_MAX_LINES) break;
    }
    if (cur && lines.length < SUBTITLE_MAX_LINES) lines.push(cur);
    return lines.length ? lines.join('\n') : text;
  }
  // 中文/超长场景：字符级切
  const mid = Math.floor(text.length / 2);
  // 找最近的空格或第 N 个字符
  let cut = mid;
  for (let i = mid; i > mid - 6 && i > 0; i--) {
    if (text[i] === ' ') {
      cut = i;
      break;
    }
  }
  if (cut >= text.length) cut = mid;
  return text.slice(0, cut).trimEnd() + '\n' + text.slice(cut + 1).trimStart();
}

/** OpenReel DEFAULT_SUBTITLE_STYLE 语义，字号按 1080p 可读性略放大 */
function subtitleTextStyle(editStyle?: string) {
  const dark =
    editStyle === 'science-minimal' ||
    editStyle === 'documentary' ||
    editStyle === 'motion-infographic';
  return {
    fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif',
    fontSize: editStyle === 'classroom' ? 56 : 48,
    fontWeight: 700 as const,
    fontStyle: 'normal' as const,
    color: '#ffffff',
    backgroundColor: dark ? 'rgba(0, 0, 0, 0.72)' : 'rgba(0, 0, 0, 0.62)',
    /** 圆角矩形背景 ffmpeg drawtext 用 box=1 + line_spacing 0 即可；
     * 这里仅记录品牌设计，实际烧录由 overlay-compositor 渲染（processShotListOpenReel） */
    textAlign: 'center' as const,
    verticalAlign: 'bottom' as const,
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
      text: wrapSubtitleTwoLines(text),
      style,
      transform: {
        position: { x: 0.5, y: 0.85 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        anchor: { x: 0.5, y: 0.5 },
        opacity: 1,
      },
      animation: {
        preset: 'fade',
        params: {},
        inDuration: 0.1,
        outDuration: 0.15,
        unit: 'line',
      },
      keyframes: [],
    });
  }
  return clips;
}
