/**
 * MiniMax Speech TTS 口播稿标记：
 * - 停顿 `<#秒#>`、非言语 `(breath)`、语气助词
 * - 多角色对白行首：`【角色名】`（主）或 `角色名：` / `角色名:`（兼容）
 */

export type VoiceoverMarkupSegment =
  | { id: string; kind: 'text'; value: string }
  | { id: string; kind: 'pause'; seconds: number; raw: string }
  | { id: string; kind: 'sound'; name: string; raw: string }
  | { id: string; kind: 'particle'; value: string; raw: string };

export type VoiceoverSpeakerStyle = 'bracket' | 'colon';

export type VoiceoverTurn = {
  id: string;
  /** null = 单口旁白 / 未标注说话人 */
  speaker: string | null;
  style: VoiceoverSpeakerStyle;
  segments: VoiceoverMarkupSegment[];
};

export type VoiceoverDocument = {
  mode: 'mono' | 'dialogue';
  turns: VoiceoverTurn[];
};

const PAUSE_RE = /<#([0-9]{1,2}(?:\.[0-9]{1,2})?)#>/y;
const SOUND_RE = /\((breath|laughs|sighs|coughs|gasps|smiles|humming|clearing[_-]?throat)\)/iy;
const PARTICLE_CHARS = new Set([
  '啊',
  '呢',
  '吧',
  '嗯',
  '哦',
  '呀',
  '嘛',
  '吗',
  '哈',
  '欸',
  '唉',
  '噢',
  '呦',
  '诶',
  '哼',
  '哇',
  '呵',
]);

/** 行首【角色名】 */
const BRACKET_SPEAKER_RE = /^[ \t]*【([^】\n]{1,24})】[ \t]*/;
/** 行首 角色名： / 角色名: （排除 URL、时间等） */
const COLON_SPEAKER_RE = /^[ \t]*([^\s：:\n【】<>#]{1,16})[ \t]*[：:][ \t]*/;

let segSeq = 0;
function nextId(prefix: string): string {
  segSeq += 1;
  return `${prefix}-${segSeq}`;
}

export function resetVoiceoverSegmentIdsForTests(): void {
  segSeq = 0;
}

function isHan(ch: string): boolean {
  return /[\u4e00-\u9fff]/.test(ch);
}

function clampPauseSeconds(n: number): number {
  if (!Number.isFinite(n)) return 0.3;
  return Math.min(99.99, Math.max(0.01, Math.round(n * 100) / 100));
}

export function formatPauseTag(seconds: number): string {
  const s = clampPauseSeconds(seconds);
  const text = Number.isInteger(s) ? String(s) : String(s);
  return `<#${text}#>`;
}

export function looksLikeVoiceoverTtsMarkup(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  if (/<#[0-9]{1,2}(?:\.[0-9]{1,2})?#>/i.test(text)) return true;
  if (/\((breath|laughs|sighs|coughs|gasps)\)/i.test(text)) return true;
  if (looksLikeDialogueScript(text)) return true;
  return false;
}

export function looksLikeDialogueScript(text: string): boolean {
  if (!text?.trim()) return false;
  let hits = 0;
  for (const line of text.split(/\n/)) {
    if (!line.trim()) continue;
    if (BRACKET_SPEAKER_RE.test(line) || isLikelyColonSpeaker(line)) hits += 1;
    if (hits >= 2) return true;
  }
  return hits >= 1 && /【[^】]{1,24}】/.test(text);
}

function isLikelyColonSpeaker(line: string): boolean {
  const m = COLON_SPEAKER_RE.exec(line);
  if (!m) return false;
  const name = m[1];
  // 排除 http、数字时刻、过长英文句
  if (/^https?$/i.test(name)) return false;
  if (/^\d{1,2}$/.test(name)) return false;
  if (/^[A-Za-z]{12,}$/.test(name)) return false;
  return true;
}

function tryReadParticle(text: string, i: number): { value: string; end: number } | null {
  const ch = text[i];
  if (!PARTICLE_CHARS.has(ch)) return null;
  const prev = i > 0 ? text[i - 1] : '';
  const next = i + 1 < text.length ? text[i + 1] : '';
  if (prev && isHan(prev) && next && isHan(next) && !PARTICLE_CHARS.has(next)) return null;

  let end = i + 1;
  while (end < text.length && text[end] === ch && end - i < 3) end += 1;
  return { value: text.slice(i, end), end };
}

export function parseVoiceoverMarkup(input: string): VoiceoverMarkupSegment[] {
  const text = input ?? '';
  const out: VoiceoverMarkupSegment[] = [];
  let i = 0;
  let buf = '';

  const flushText = () => {
    if (!buf) return;
    out.push({ id: nextId('t'), kind: 'text', value: buf });
    buf = '';
  };

  while (i < text.length) {
    PAUSE_RE.lastIndex = i;
    const pause = PAUSE_RE.exec(text);
    if (pause && pause.index === i) {
      flushText();
      const seconds = clampPauseSeconds(Number(pause[1]));
      out.push({ id: nextId('p'), kind: 'pause', seconds, raw: pause[0] });
      i = PAUSE_RE.lastIndex;
      continue;
    }

    SOUND_RE.lastIndex = i;
    const sound = SOUND_RE.exec(text);
    if (sound && sound.index === i) {
      flushText();
      out.push({
        id: nextId('s'),
        kind: 'sound',
        name: sound[1].toLowerCase().replace(/_/g, '-'),
        raw: sound[0],
      });
      i = SOUND_RE.lastIndex;
      continue;
    }

    const particle = tryReadParticle(text, i);
    if (particle) {
      flushText();
      out.push({
        id: nextId('a'),
        kind: 'particle',
        value: particle.value,
        raw: particle.value,
      });
      i = particle.end;
      continue;
    }

    buf += text[i];
    i += 1;
  }
  flushText();
  return out;
}

export function serializeVoiceoverMarkup(segments: VoiceoverMarkupSegment[]): string {
  return segments
    .map((seg) => {
      if (seg.kind === 'text') return seg.value;
      if (seg.kind === 'pause') return formatPauseTag(seg.seconds);
      if (seg.kind === 'sound') return `(${seg.name})`;
      return seg.value;
    })
    .join('');
}

type SpeakerHit = {
  index: number;
  speaker: string;
  style: VoiceoverSpeakerStyle;
  headerLen: number;
};

function findSpeakerHits(text: string): SpeakerHit[] {
  const hits: SpeakerHit[] = [];
  let offset = 0;
  const lines = text.split('\n');
  for (let li = 0; li < lines.length; li += 1) {
    const line = lines[li];
    const lineStart = offset;
    let m = BRACKET_SPEAKER_RE.exec(line);
    if (m) {
      hits.push({
        index: lineStart + (m.index ?? 0),
        speaker: m[1].trim(),
        style: 'bracket',
        headerLen: m[0].length,
      });
    } else if (isLikelyColonSpeaker(line)) {
      m = COLON_SPEAKER_RE.exec(line);
      if (m) {
        hits.push({
          index: lineStart + (m.index ?? 0),
          speaker: m[1].trim(),
          style: 'colon',
          headerLen: m[0].length,
        });
      }
    }
    offset += line.length + (li < lines.length - 1 ? 1 : 0);
  }
  return hits;
}

export function parseVoiceoverDocument(input: string): VoiceoverDocument {
  const text = input ?? '';
  const hits = findSpeakerHits(text);
  const dialogue = hits.length >= 2 || (hits.length === 1 && looksLikeDialogueScript(text));

  if (!dialogue || hits.length === 0) {
    return {
      mode: 'mono',
      turns: [
        {
          id: nextId('turn'),
          speaker: null,
          style: 'bracket',
          segments: parseVoiceoverMarkup(text),
        },
      ],
    };
  }

  const turns: VoiceoverTurn[] = [];
  // 说话人标记之前的正文 → 旁白
  if (hits[0].index > 0) {
    const lead = text.slice(0, hits[0].index).replace(/^\s+/, '').replace(/\s+$/, '');
    if (lead) {
      turns.push({
        id: nextId('turn'),
        speaker: '旁白',
        style: 'bracket',
        segments: parseVoiceoverMarkup(lead),
      });
    }
  }

  for (let i = 0; i < hits.length; i += 1) {
    const hit = hits[i];
    const bodyStart = hit.index + hit.headerLen;
    const bodyEnd = i + 1 < hits.length ? hits[i + 1].index : text.length;
    let body = text.slice(bodyStart, bodyEnd);
    // 对白之间多余空行收掉尾部，保留段内换行
    if (i + 1 < hits.length) body = body.replace(/\s+$/, '');
    else body = body.replace(/\s+$/, '');
    turns.push({
      id: nextId('turn'),
      speaker: hit.speaker || '角色',
      style: hit.style,
      segments: parseVoiceoverMarkup(body),
    });
  }

  return { mode: 'dialogue', turns };
}

export function formatSpeakerPrefix(speaker: string, style: VoiceoverSpeakerStyle): string {
  const name = speaker.trim() || '角色';
  return style === 'colon' ? `${name}：` : `【${name}】`;
}

export function serializeVoiceoverDocument(doc: VoiceoverDocument): string {
  if (doc.mode === 'mono' || doc.turns.length === 0) {
    const only = doc.turns[0];
    return only ? serializeVoiceoverMarkup(only.segments) : '';
  }
  return doc.turns
    .map((turn) => {
      const body = serializeVoiceoverMarkup(turn.segments);
      const speaker = turn.speaker?.trim() || '旁白';
      return `${formatSpeakerPrefix(speaker, turn.style)}${body}`;
    })
    .join('\n\n');
}

export function listSpeakers(doc: VoiceoverDocument): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const t of doc.turns) {
    const n = (t.speaker ?? '旁白').trim() || '旁白';
    if (seen.has(n)) continue;
    seen.add(n);
    names.push(n);
  }
  return names;
}

/** 稳定配色索引（0–5） */
export function speakerColorIndex(name: string, roster: string[]): number {
  const n = name.trim() || '旁白';
  const idx = roster.indexOf(n);
  return (idx >= 0 ? idx : Math.abs(hashStr(n))) % 6;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export function updatePauseSeconds(
  segments: VoiceoverMarkupSegment[],
  id: string,
  seconds: number
): VoiceoverMarkupSegment[] {
  const next = clampPauseSeconds(seconds);
  return segments.map((seg) =>
    seg.kind === 'pause' && seg.id === id
      ? { ...seg, seconds: next, raw: formatPauseTag(next) }
      : seg
  );
}

export function removeSegment(segments: VoiceoverMarkupSegment[], id: string): VoiceoverMarkupSegment[] {
  const filtered = segments.filter((s) => s.id !== id);
  const merged: VoiceoverMarkupSegment[] = [];
  for (const seg of filtered) {
    const last = merged[merged.length - 1];
    if (seg.kind === 'text' && last?.kind === 'text') {
      merged[merged.length - 1] = { ...last, value: last.value + seg.value };
    } else {
      merged.push(seg);
    }
  }
  return merged;
}

export function updateTextSegment(
  segments: VoiceoverMarkupSegment[],
  id: string,
  value: string
): VoiceoverMarkupSegment[] {
  return segments.map((seg) => (seg.kind === 'text' && seg.id === id ? { ...seg, value } : seg));
}

export function insertPauseAfter(
  segments: VoiceoverMarkupSegment[],
  afterId: string | null,
  seconds = 0.3
): VoiceoverMarkupSegment[] {
  const tag: VoiceoverMarkupSegment = {
    id: nextId('p'),
    kind: 'pause',
    seconds: clampPauseSeconds(seconds),
    raw: formatPauseTag(seconds),
  };
  if (!afterId) return [...segments, tag];
  const idx = segments.findIndex((s) => s.id === afterId);
  if (idx < 0) return [...segments, tag];
  const next = [...segments];
  next.splice(idx + 1, 0, tag);
  return next;
}

export function updateTurnSegments(
  doc: VoiceoverDocument,
  turnId: string,
  segments: VoiceoverMarkupSegment[]
): VoiceoverDocument {
  return {
    ...doc,
    turns: doc.turns.map((t) => (t.id === turnId ? { ...t, segments } : t)),
  };
}

export function renameTurnSpeaker(
  doc: VoiceoverDocument,
  turnId: string,
  speaker: string
): VoiceoverDocument {
  const name = speaker.trim() || '角色';
  return {
    ...doc,
    mode: 'dialogue',
    turns: doc.turns.map((t) => (t.id === turnId ? { ...t, speaker: name } : t)),
  };
}

export function addDialogueTurn(
  doc: VoiceoverDocument,
  speaker?: string,
  afterTurnId?: string | null
): VoiceoverDocument {
  const roster = listSpeakers(doc);
  const defaultName =
    speaker?.trim() ||
    (roster.length === 0 ? '主持人' : roster.length === 1 ? '嘉宾' : `角色${roster.length + 1}`);
  const turn: VoiceoverTurn = {
    id: nextId('turn'),
    speaker: defaultName,
    style: 'bracket',
    segments: [{ id: nextId('t'), kind: 'text', value: '' }],
  };

  // mono → dialogue：保留原文为第一轮
  let base = doc;
  if (doc.mode === 'mono') {
    const first = doc.turns[0];
    base = {
      mode: 'dialogue',
      turns: [
        {
          id: first?.id ?? nextId('turn'),
          speaker: first?.speaker?.trim() || '主持人',
          style: 'bracket',
          segments: first?.segments?.length
            ? first.segments
            : [{ id: nextId('t'), kind: 'text', value: '' }],
        },
      ],
    };
  }

  const turns = [...base.turns];
  const idx = afterTurnId ? turns.findIndex((t) => t.id === afterTurnId) : turns.length - 1;
  const at = idx >= 0 ? idx + 1 : turns.length;
  turns.splice(at, 0, turn);
  return { mode: 'dialogue', turns };
}

export function removeDialogueTurn(doc: VoiceoverDocument, turnId: string): VoiceoverDocument {
  if (doc.turns.length <= 1) {
    const only = doc.turns[0];
    return {
      mode: 'mono',
      turns: [
        {
          id: only?.id ?? nextId('turn'),
          speaker: null,
          style: 'bracket',
          segments: only?.segments ?? [],
        },
      ],
    };
  }
  const turns = doc.turns.filter((t) => t.id !== turnId);
  const stillDialogue = turns.some((t) => t.speaker) && turns.length >= 1;
  return {
    mode: stillDialogue ? 'dialogue' : 'mono',
    turns: stillDialogue
      ? turns
      : turns.map((t) => ({ ...t, speaker: null })),
  };
}

export function soundLabel(name: string): string {
  const n = name.toLowerCase();
  if (n === 'breath') return '换气';
  if (n === 'laughs') return '笑';
  if (n === 'sighs') return '叹气';
  if (n === 'coughs') return '咳嗽';
  if (n === 'gasps') return '倒吸气';
  if (n.includes('throat')) return '清嗓';
  if (n === 'smiles') return '笑意';
  if (n === 'humming') return '哼唱';
  return name;
}
