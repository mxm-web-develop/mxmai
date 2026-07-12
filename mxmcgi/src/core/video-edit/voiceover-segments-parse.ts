import type { VoiceoverSubtitleLike } from './timeline-segment-types';

/** 解析句级字幕 JSON（数组或 { segments } 包装） */
export function parseVoiceoverSubtitleSegments(raw: unknown): VoiceoverSubtitleLike[] {
  if (!raw) return [];
  let data: unknown = raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      data = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  const arr = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { segments?: unknown }).segments)
      ? (data as { segments: unknown[] }).segments
      : [];
  const out: VoiceoverSubtitleLike[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const text = String((item as { text?: unknown }).text ?? '').trim();
    const startSeconds = Number((item as { startSeconds?: unknown }).startSeconds);
    const endSeconds = Number((item as { endSeconds?: unknown }).endSeconds);
    if (!text || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) continue;
    out.push({ text, startSeconds, endSeconds });
  }
  return out.sort((a, b) => a.startSeconds - b.startSeconds);
}

export function subtitleSpanInRange(
  subs: VoiceoverSubtitleLike[],
  start: number,
  end: number
): [number, number] {
  let first = -1;
  let last = -1;
  for (let i = 0; i < subs.length; i++) {
    const s = subs[i]!;
    if (s.endSeconds > start + 0.01 && s.startSeconds < end - 0.01) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) return [0, 0];
  return [first, last];
}

export function voiceoverTextInRange(
  subs: VoiceoverSubtitleLike[],
  start: number,
  end: number
): string {
  return subs
    .filter((s) => s.endSeconds > start + 0.01 && s.startSeconds < end - 0.01)
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join(' ');
}
