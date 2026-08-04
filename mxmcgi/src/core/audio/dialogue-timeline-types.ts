/**
 * 多人语音对话时间轴：相对 cue → 绝对 start_ms（支持重叠）
 */

export type DialogueLineKind = 'main' | 'affirmation' | 'interrupt' | 'aside';

export interface DialogueLineCue {
  /** 锚定在哪一句结束之后（缺省则按数组顺序锚定上一句） */
  afterLineId?: string;
  /** 相对锚点结束时刻的偏移（ms）；负值 = 抢词叠在上一句尾部前 */
  offsetMs?: number;
  /** 额外空隙（ms），加在上一句结束后、offset 之前 */
  gapMs?: number;
}

export interface DialogueTimelineLine {
  id: string;
  speakerId?: string;
  text?: string;
  tts_markup?: string;
  kind?: DialogueLineKind | string;
  cue?: DialogueLineCue;
  audio_url?: string;
  duration_ms?: number;
  start_ms?: number;
  /** 句级字幕（相对本句起点的秒） */
  subtitles?: Array<{ text: string; startSeconds: number; endSeconds: number }>;
}

export interface ResolvedDialogueLine extends DialogueTimelineLine {
  start_ms: number;
  duration_ms: number;
}

export interface ResolveDialogueTimelineResult {
  lines: ResolvedDialogueLine[];
  totalDurationMs: number;
}
