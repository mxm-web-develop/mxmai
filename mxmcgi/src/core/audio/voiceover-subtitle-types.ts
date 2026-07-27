/** 口播句级字幕（秒为单位，供分镜/配图管线使用） */
export interface VoiceoverSubtitleSegment {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

export type VoiceoverSubtitleSource = 'tts' | 'asr' | 'manual' | 'script_only';

export interface VoiceoverSubtitleBundle {
  source: VoiceoverSubtitleSource;
  fullText: string;
  segments: VoiceoverSubtitleSegment[];
  /** 跳过 ASR 时的原因（如 tts_subtitles / user_script） */
  skippedAsrReason?: string;
}
