/**
 * 多人语音「指导性时间轴」：用估算时长 + cue 推相对轴，供人审对齐台词。
 * 与最终 TTS 成片轴会有误差，仅作剪辑指导。
 */

export type DialogueGuidanceCue = {
  afterLineId?: string;
  offsetMs?: number;
  gapMs?: number;
};

export type DialogueGuidanceLine = {
  id: string;
  speakerId?: string;
  speakerName?: string;
  text?: string;
  tts_markup?: string;
  kind?: string;
  cue?: DialogueGuidanceCue;
  /** 若已有真实时长则优先用 */
  duration_ms?: number;
  start_ms?: number;
};

export type DialogueGuidanceCast = {
  id: string;
  name?: string;
  roleHint?: string;
};

export type ResolvedGuidanceLine = DialogueGuidanceLine & {
  start_ms: number;
  duration_ms: number;
  displayText: string;
  displayName: string;
};

function asFiniteMs(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** 从 TTS 标记文估算时长（含 <#秒#> 停顿） */
export function estimateDialogueLineDurationMs(
  markupOrText: string,
  broadcastStyle?: string
): number {
  let pauseMs = 0;
  const withoutPause = String(markupOrText ?? '').replace(/<#([\d.]+)#>/g, (_, s: string) => {
    const sec = Number.parseFloat(s);
    if (Number.isFinite(sec)) pauseMs += Math.round(sec * 1000);
    return '';
  });
  const chars = withoutPause
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, '')
    .length;
  const cps =
    broadcastStyle === 'fast_talk'
      ? 6.2
      : broadcastStyle === 'news'
        ? 5.2
        : broadcastStyle === 'late_night'
          ? 3.2
          : 4.5;
  const speechMs = Math.round((chars / Math.max(1, cps)) * 1000);
  return Math.max(320, speechMs + pauseMs);
}

export function plainDialogueText(markupOrText: string): string {
  return String(markupOrText ?? '')
    .replace(/<#([\d.]+)#>/g, ' ')
    .replace(/\(.*?\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function castNameMap(cast: DialogueGuidanceCast[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of cast) {
    const id = String(c.id ?? '').trim();
    const name = String(c.name ?? '').trim();
    if (id && name) m.set(id, name);
  }
  return m;
}

/**
 * 与后端 resolveDialogueTimeline 同序：按输入顺序 + afterLineId 递归。
 * 缺 duration_ms 时用估算值。
 */
export function resolveGuidanceTimeline(
  inputLines: DialogueGuidanceLine[],
  opts?: { cast?: DialogueGuidanceCast[]; broadcastStyle?: string }
): { lines: ResolvedGuidanceLine[]; totalDurationMs: number } {
  const cast = opts?.cast ?? [];
  const names = castNameMap(cast);
  const style = opts?.broadcastStyle;

  const lines = inputLines
    .filter((l) => l && typeof l === 'object' && String(l.id ?? '').trim())
    .map((l) => {
      const id = String(l.id).trim();
      const markup = String(l.tts_markup ?? l.text ?? '');
      const duration_ms =
        l.duration_ms != null && Number.isFinite(Number(l.duration_ms)) && Number(l.duration_ms) > 0
          ? Math.round(Number(l.duration_ms))
          : estimateDialogueLineDurationMs(markup, style);
      return { ...l, id, duration_ms };
    });

  if (lines.length === 0) return { lines: [], totalDurationMs: 0 };

  const byId = new Map(lines.map((l) => [l.id, l]));
  const resolved = new Map<string, ResolvedGuidanceLine>();

function extractEdgePauseMs(text: string): { leadMs: number; trailMs: number } {
  const t = String(text ?? '').trim();
  if (!t) return { leadMs: 0, trailMs: 0 };
  const lead = t.match(/^(<#(\d+(?:\.\d+)?)#>)(\s*)/);
  const trail = t.match(/(\s*)(<#(\d+(?:\.\d+)?)#>)$/);
  const leadSec = lead ? Number(lead[2]) : NaN;
  const trailSec = trail ? Number(trail[3]) : NaN;
  return {
    leadMs: Number.isFinite(leadSec) ? Math.max(0, Math.round(leadSec * 1000)) : 0,
    trailMs: Number.isFinite(trailSec) ? Math.max(0, Math.round(trailSec * 1000)) : 0,
  };
}

  const resolveOne = (
    line: DialogueGuidanceLine & { duration_ms: number },
    prevInOrder: ResolvedGuidanceLine | null
  ): ResolvedGuidanceLine => {
    if (resolved.has(line.id)) return resolved.get(line.id)!;

    const duration_ms = Math.max(0, asFiniteMs(line.duration_ms, 0));
    const selfEdge = extractEdgePauseMs(String(line.tts_markup ?? line.text ?? ''));
    const selfLead = Math.min(selfEdge.leadMs, duration_ms);
    let start_ms = 0;

    const placeAfter = (ref: ResolvedGuidanceLine) => {
      const refEdge = extractEdgePauseMs(String(ref.tts_markup ?? ref.text ?? ''));
      const refTrail = Math.min(refEdge.trailMs, ref.duration_ms);
      const gap = asFiniteMs(line.cue?.gapMs, 0);
      const offset = asFiniteMs(line.cue?.offsetMs, 0);
      const refSpeechEnd = ref.start_ms + ref.duration_ms - refTrail;
      return refSpeechEnd + gap + offset - selfLead;
    };

    const afterId = line.cue?.afterLineId?.trim();
    if (afterId && byId.has(afterId)) {
      const ref = resolveOne(byId.get(afterId)! as DialogueGuidanceLine & { duration_ms: number }, null);
      start_ms = placeAfter(ref);
    } else if (prevInOrder) {
      start_ms = placeAfter(prevInOrder);
    } else {
      start_ms =
        asFiniteMs(line.cue?.gapMs, 0) + asFiniteMs(line.cue?.offsetMs, 0) - selfLead;
    }

    const speakerId = String(line.speakerId ?? '').trim();
    const displayName =
      String(line.speakerName ?? '').trim() || names.get(speakerId) || speakerId || '角色';
    const displayText = plainDialogueText(String(line.tts_markup ?? line.text ?? ''));
    const out: ResolvedGuidanceLine = {
      ...line,
      start_ms: Math.max(0, Math.round(start_ms)),
      duration_ms: Math.round(duration_ms),
      displayName,
      displayText,
    };
    resolved.set(line.id, out);
    return out;
  };

  const outLines: ResolvedGuidanceLine[] = [];
  let prev: ResolvedGuidanceLine | null = null;
  for (const line of lines) {
    const r = resolveOne(line as DialogueGuidanceLine & { duration_ms: number }, prev);
    outLines.push(r);
    prev = r;
  }

  let totalDurationMs = 0;
  for (const l of outLines) {
    totalDurationMs = Math.max(totalDurationMs, l.start_ms + l.duration_ms);
  }
  return { lines: outLines, totalDurationMs };
}

export function formatMsClock(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  return `${m}:${rem.toFixed(1).padStart(4, '0')}`;
}

export function formatDialogueScriptFromGuidanceLines(
  lines: DialogueGuidanceLine[],
  cast?: DialogueGuidanceCast[]
): string {
  const names = castNameMap(cast ?? []);
  const parts: string[] = [];
  for (const line of lines) {
    const speakerId = String(line.speakerId ?? '').trim();
    const name =
      String(line.speakerName ?? '').trim() || names.get(speakerId) || speakerId || '旁白';
    const text = String(line.tts_markup ?? line.text ?? '').trim();
    if (!text) continue;
    parts.push(`【${name}】${text}`);
  }
  return parts.join('\n');
}

export const KIND_LABELS: Record<string, string> = {
  main: '主句',
  affirmation: '附和',
  interrupt: '插话',
  aside: '旁白',
};
