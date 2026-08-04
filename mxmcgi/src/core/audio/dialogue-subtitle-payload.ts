/**
 * 多人语音时间轴字幕 → 播放器可识别的 MiniMax 风格 payload
 */
function plainDialogueText(markupOrText: string): string {
  return String(markupOrText ?? '')
    .replace(/<#([\d.]+)#>/g, ' ')
    .replace(/\(.*?\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type DialogueSubtitleSeg = {
  text?: string;
  startSeconds?: number;
  endSeconds?: number;
  speakerId?: string;
  lineId?: string;
};

/**
 * 输出 { sentences: [{ text, time_begin, time_end }] }，time 为毫秒，
 * 与 AudioViewerModal / normalizeSubtitlePayload 对齐。
 */
export function dialogueSubtitlesToPlayerPayload(raw: unknown): {
  sentences: Array<{ text: string; time_begin: number; time_end: number; speakerId?: string }>;
} {
  const list = Array.isArray(raw) ? raw : [];
  const sentences: Array<{
    text: string;
    time_begin: number;
    time_end: number;
    speakerId?: string;
  }> = [];

  for (const row of list) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const seg = row as DialogueSubtitleSeg;
    const text = plainDialogueText(String(seg.text ?? ''));
    if (!text) continue;
    const startSec = Number(seg.startSeconds);
    const endSec = Number(seg.endSeconds);
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) continue;
    sentences.push({
      text,
      time_begin: Math.round(startSec * 1000),
      time_end: Math.round(endSec * 1000),
      ...(seg.speakerId ? { speakerId: String(seg.speakerId) } : {}),
    });
  }

  sentences.sort((a, b) => a.time_begin - b.time_begin);
  return { sentences };
}
