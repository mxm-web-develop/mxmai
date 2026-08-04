import { stripSubtitlePunctuation } from './subtitleDisplayText';

export type SubtitleCue = {
  text: string;
  startMs: number;
  endMs: number;
};

function toMsPair(start: unknown, end: unknown): { startMs: number; endMs: number } | null {
  const s = typeof start === 'number' && Number.isFinite(start) ? start : Number(start);
  const e = typeof end === 'number' && Number.isFinite(end) ? end : Number(end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
  const scale = Math.max(s, e) > 1000 ? 1 : 1000;
  return { startMs: s * scale, endMs: e * scale };
}

function cueFromRow(row: Record<string, unknown>): SubtitleCue | null {
  const raw =
    (typeof row.text === 'string' && row.text.trim()) ||
    (typeof row.content === 'string' && row.content.trim()) ||
    (typeof row.sentence === 'string' && row.sentence.trim()) ||
    '';
  const text = stripSubtitlePunctuation(raw);
  if (!text) return null;

  const pairs: Array<[unknown, unknown]> = [
    [row.time_begin, row.time_end],
    [row.begin_time, row.end_time],
    [row.start_time, row.end_time],
    [row.startSeconds, row.endSeconds],
    [row.start_ms, row.end_ms],
    [row.start, row.end],
    [row.begin, row.end],
    [row.time_start, row.time_end],
  ];
  for (const [a, b] of pairs) {
    const ms = toMsPair(a, b);
    if (ms) return { text, ...ms };
  }
  return null;
}

function rowsFromPayload(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  for (const key of ['sentences', 'subtitle', 'subtitles', 'segments', 'data', 'items', 'list']) {
    const v = o[key];
    if (Array.isArray(v)) return v;
  }
  return [];
}

/** 将 MiniMax subtitle JSON 规范为统一 cue 列表 */
export function normalizeSubtitlePayload(raw: unknown): SubtitleCue[] {
  const rows = rowsFromPayload(raw);
  const out: SubtitleCue[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const cue = cueFromRow(row as Record<string, unknown>);
    if (cue) out.push(cue);
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

export function findActiveCueIndex(cues: SubtitleCue[], timeMs: number): number {
  if (!cues.length) return -1;
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    if (timeMs >= c.startMs && timeMs < c.endMs) return i;
  }
  for (let i = cues.length - 1; i >= 0; i--) {
    if (timeMs >= cues[i].startMs) return i;
  }
  return -1;
}
