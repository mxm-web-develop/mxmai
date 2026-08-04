/**
 * cue 相对关系 → 绝对 start_ms（允许重叠）
 *
 * 落轴按「有效语音」对齐：上一句尾停顿 / 本句头停顿不计入抢词与接话间距，
 * 否则 TTS 文件里的 `<#…#>` 静音会把 interrupt 负 offset 抵消掉。
 */
import type {
  DialogueTimelineLine,
  ResolveDialogueTimelineResult,
  ResolvedDialogueLine,
} from './dialogue-timeline-types';
import { extractTtsEdgePauseMs } from '../../tasks/audio-tts-params';

function asFiniteMs(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function lineMarkup(line: DialogueTimelineLine): string {
  return String(line.tts_markup ?? line.text ?? '');
}

function lineEdgeMs(line: DialogueTimelineLine): { leadMs: number; trailMs: number } {
  return extractTtsEdgePauseMs(lineMarkup(line));
}

function normalizeLines(raw: DialogueTimelineLine[]): DialogueTimelineLine[] {
  return raw
    .filter((l) => l && typeof l === 'object' && String(l.id ?? '').trim())
    .map((l) => ({
      ...l,
      id: String(l.id).trim(),
      duration_ms: Math.max(0, asFiniteMs(l.duration_ms, 0)),
      cue:
        l.cue && typeof l.cue === 'object'
          ? {
              afterLineId:
                typeof l.cue.afterLineId === 'string' && l.cue.afterLineId.trim()
                  ? l.cue.afterLineId.trim()
                  : undefined,
              offsetMs: l.cue.offsetMs != null ? asFiniteMs(l.cue.offsetMs, 0) : undefined,
              gapMs: l.cue.gapMs != null ? asFiniteMs(l.cue.gapMs, 0) : undefined,
            }
          : undefined,
    }));
}

/**
 * 拓扑展开：按 cue.afterLineId 依赖排序；无依赖时保持输入顺序。
 * 缺 duration_ms 的行视为 0（仍占位，便于调试）。
 */
export function resolveDialogueTimeline(
  inputLines: DialogueTimelineLine[]
): ResolveDialogueTimelineResult {
  const lines = normalizeLines(inputLines);
  if (lines.length === 0) {
    return { lines: [], totalDurationMs: 0 };
  }

  const byId = new Map<string, DialogueTimelineLine>();
  for (const l of lines) {
    if (byId.has(l.id)) {
      throw new Error(`resolveDialogueTimeline：重复 line id「${l.id}」`);
    }
    byId.set(l.id, l);
  }

  for (const l of lines) {
    const after = l.cue?.afterLineId;
    if (after && !byId.has(after)) {
      throw new Error(`resolveDialogueTimeline：line「${l.id}」锚定不存在的 afterLineId「${after}」`);
    }
    if (after === l.id) {
      throw new Error(`resolveDialogueTimeline：line「${l.id}」不能锚定自身`);
    }
  }

  // 检测环：DFS
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, stack: string[]): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`resolveDialogueTimeline：cue 环路 ${[...stack, id].join(' → ')}`);
    }
    visiting.add(id);
    const line = byId.get(id)!;
    const after = line.cue?.afterLineId;
    if (after) visit(after, [...stack, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const l of lines) visit(l.id, []);

  const resolved = new Map<string, ResolvedDialogueLine>();

  const resolveOne = (line: DialogueTimelineLine, prevInOrder: ResolvedDialogueLine | null): ResolvedDialogueLine => {
    if (resolved.has(line.id)) return resolved.get(line.id)!;

    const duration_ms = Math.max(0, asFiniteMs(line.duration_ms, 0));
    const selfEdge = lineEdgeMs(line);
    // 尾/头停顿不超过时长，避免异常 markup 把 start 算飞
    const selfLead = Math.min(selfEdge.leadMs, duration_ms);
    let start_ms = 0;

    const placeAfter = (ref: ResolvedDialogueLine) => {
      const refEdge = lineEdgeMs(ref);
      const refTrail = Math.min(refEdge.trailMs, ref.duration_ms);
      const gap = asFiniteMs(line.cue?.gapMs, 0);
      const offset = asFiniteMs(line.cue?.offsetMs, 0);
      // 有效语音结束 → 加 gap/offset → 再回退本句头停顿，得到文件起点
      const refSpeechEnd = ref.start_ms + ref.duration_ms - refTrail;
      const speechStart = refSpeechEnd + gap + offset;
      return speechStart - selfLead;
    };

    const afterId = line.cue?.afterLineId;
    if (afterId) {
      const refLine = byId.get(afterId)!;
      const ref = resolveOne(refLine, null);
      start_ms = placeAfter(ref);
    } else if (prevInOrder) {
      start_ms = placeAfter(prevInOrder);
    } else {
      const gap = asFiniteMs(line.cue?.gapMs, 0);
      const offset = asFiniteMs(line.cue?.offsetMs, 0);
      start_ms = gap + offset - selfLead;
    }

    const out: ResolvedDialogueLine = {
      ...line,
      start_ms: Math.max(0, Math.round(start_ms)),
      duration_ms: Math.round(duration_ms),
    };
    resolved.set(line.id, out);
    return out;
  };

  // 按输入顺序解析；显式 afterLineId 会递归解析锚点
  const outLines: ResolvedDialogueLine[] = [];
  let prev: ResolvedDialogueLine | null = null;
  for (const line of lines) {
    const r = resolveOne(line, prev);
    outLines.push(r);
    prev = r;
  }

  let totalDurationMs = 0;
  for (const l of outLines) {
    totalDurationMs = Math.max(totalDurationMs, l.start_ms + l.duration_ms);
  }

  return { lines: outLines, totalDurationMs };
}

/** 去掉 TTS 停顿标签，供字幕展示 */
function plainLineText(markupOrText: string): string {
  return String(markupOrText ?? '')
    .replace(/<#([\d.]+)#>/g, ' ')
    .replace(/\(.*?\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 合并句级字幕到成片时间轴（秒） */
export function mergeDialogueSubtitles(
  lines: ResolvedDialogueLine[]
): Array<{ text: string; startSeconds: number; endSeconds: number; speakerId?: string; lineId: string }> {
  const out: Array<{
    text: string;
    startSeconds: number;
    endSeconds: number;
    speakerId?: string;
    lineId: string;
  }> = [];
  for (const line of lines) {
    const edge = extractTtsEdgePauseMs(String(line.tts_markup ?? line.text ?? ''));
    const leadSec = Math.min(edge.leadMs, line.duration_ms ?? 0) / 1000;
    const trailSec = Math.min(edge.trailMs, line.duration_ms ?? 0) / 1000;
    const base = ((line.start_ms ?? 0) / 1000) + leadSec;
    const subs = Array.isArray(line.subtitles) ? line.subtitles : [];
    if (subs.length === 0) {
      const text = plainLineText(String(line.tts_markup ?? line.text ?? ''));
      if (!text) continue;
      const dur = Math.max(0.05, (line.duration_ms ?? 0) / 1000 - leadSec - trailSec);
      out.push({
        text,
        startSeconds: base,
        endSeconds: base + dur,
        speakerId: line.speakerId,
        lineId: line.id,
      });
      continue;
    }
    for (const s of subs) {
      const text = plainLineText(String(s.text ?? ''));
      if (!text) continue;
      out.push({
        text,
        startSeconds: base + Number(s.startSeconds || 0),
        endSeconds: base + Number(s.endSeconds || 0),
        speakerId: line.speakerId,
        lineId: line.id,
      });
    }
  }
  out.sort((a, b) => a.startSeconds - b.startSeconds);
  return out;
}
