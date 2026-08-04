import type { VoiceoverSubtitleBundle, VoiceoverSubtitleSegment } from './voiceover-subtitle-types';

function roundSec(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** 口播字幕展示：去掉中英文标点（保留句内数字、英文单词连字符） */
export function stripSubtitlePunctuation(text: string): string {
  return text
    .replace(
      /[，。！？；：、,.!?;:'"()[\]{}「」『』（）【】《》…—–·～~、]/g,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function pushSegment(
  out: VoiceoverSubtitleSegment[],
  text: string,
  startSeconds: number,
  endSeconds: number
): void {
  const t = stripSubtitlePunctuation(text);
  if (!t) return;
  out.push({
    text: t,
    startSeconds: roundSec(startSeconds),
    endSeconds: roundSec(Math.max(endSeconds, startSeconds + 0.05)),
  });
}

/**
 * MiniMax TTS subtitle_file：可能是数组，或 { sentences: [...] }。
 * time_begin / time_end 始终为毫秒。
 * 旧启发式 `>1000 才 /1000` 会把 1ms～1000ms 误当成秒，导致字幕与口播错位。
 */
export function normalizeMinimaxTtsSubtitlePayload(payload: unknown): VoiceoverSubtitleSegment[] {
  if (!payload || typeof payload !== 'object') return [];
  const sentences = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { sentences?: unknown }).sentences)
      ? ((payload as { sentences: unknown[] }).sentences)
      : [];
  const segments: VoiceoverSubtitleSegment[] = [];

  for (const item of sentences) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const text = typeof row.text === 'string' ? row.text : '';
    if (!text.trim()) continue;

    const hasMinimaxMsFields =
      Object.prototype.hasOwnProperty.call(row, 'time_begin') ||
      Object.prototype.hasOwnProperty.call(row, 'time_end') ||
      Object.prototype.hasOwnProperty.call(row, 'time_begin_ms') ||
      Object.prototype.hasOwnProperty.call(row, 'time_end_ms');

    const beginRaw = Number(
      row.time_begin ?? row.time_begin_ms ?? row.start_ms ?? row.begin_ms ?? row.start ?? row.begin ?? 0
    );
    const endRaw = Number(
      row.time_end ?? row.time_end_ms ?? row.end_ms ?? row.finish_ms ?? row.end ?? row.finish ?? beginRaw
    );
    if (!Number.isFinite(beginRaw) || !Number.isFinite(endRaw)) continue;

    // MiniMax 官方 time_* 为 ms；仅兼容无官方字段且数值很小的「已是秒」别名
    const treatAsMs = hasMinimaxMsFields || beginRaw > 30 || endRaw > 30;
    const startSeconds = treatAsMs ? beginRaw / 1000 : beginRaw;
    const endSeconds = treatAsMs ? endRaw / 1000 : endRaw;
    pushSegment(segments, text, startSeconds, endSeconds);
  }

  return segments;
}

/** FunASR Python 脚本 stdout：{ text, segments: [{ text, startSeconds, endSeconds }] } */
export function normalizeFunAsrJson(payload: unknown): VoiceoverSubtitleSegment[] {
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as Record<string, unknown>;
  const segments: VoiceoverSubtitleSegment[] = [];

  const list = Array.isArray(root.segments) ? root.segments : [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const text = typeof row.text === 'string' ? row.text : '';
    const start = Number(row.startSeconds ?? row.start ?? 0);
    const end = Number(row.endSeconds ?? row.end ?? start);
    pushSegment(segments, text, start, end);
  }

  if (segments.length === 0 && typeof root.text === 'string' && root.text.trim()) {
    pushSegment(segments, root.text, 0, 1);
  }

  return segments;
}

/** @deprecated 仅保留历史 Whisper 测试兼容 */
export function normalizeWhisperVerboseJson(payload: unknown): VoiceoverSubtitleSegment[] {
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as Record<string, unknown>;
  const segments: VoiceoverSubtitleSegment[] = [];

  const list = Array.isArray(root.segments) ? root.segments : [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const text = typeof row.text === 'string' ? row.text : '';
    const start = Number(row.start ?? 0);
    const end = Number(row.end ?? start);
    pushSegment(segments, text, start, end);
  }

  if (segments.length === 0 && typeof root.text === 'string' && root.text.trim()) {
    pushSegment(segments, root.text, 0, 1);
  }

  return segments;
}

export function segmentsToFullText(segments: VoiceoverSubtitleSegment[]): string {
  return segments
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join('');
}

export function buildSubtitleBundle(
  source: VoiceoverSubtitleBundle['source'],
  segments: VoiceoverSubtitleSegment[],
  opts?: { skippedAsrReason?: string; fullText?: string }
): VoiceoverSubtitleBundle {
  const fullText = (opts?.fullText ?? segmentsToFullText(segments)).trim();
  return {
    source,
    fullText,
    segments,
    ...(opts?.skippedAsrReason ? { skippedAsrReason: opts.skippedAsrReason } : {}),
  };
}

/** 仅有文稿无时间轴时，按总时长均分（兜底，精度低于 TTS/ASR） */
export function estimateSegmentsFromScript(script: string, durationSeconds: number): VoiceoverSubtitleSegment[] {
  const chunks = script
    .split(/(?<=[。！？；.!?])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (chunks.length === 0) return [];

  const totalChars = chunks.reduce((n, c) => n + c.length, 0) || chunks.length;
  let cursor = 0;
  const segments: VoiceoverSubtitleSegment[] = [];

  for (const chunk of chunks) {
    const weight = chunk.length / totalChars;
    const dur = Math.max(0.5, durationSeconds * weight);
    pushSegment(segments, chunk, cursor, cursor + dur);
    cursor += dur;
  }

  if (segments.length > 0) {
    segments[segments.length - 1].endSeconds = roundSec(durationSeconds);
  }

  return segments;
}
