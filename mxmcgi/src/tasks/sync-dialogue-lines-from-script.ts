/**
 * 将【角色名】台词本回写到 contract.business.lines（保留 cue / id / kind）
 */
export function syncDialogueLinesFromScript(args: {
  script: string;
  lines: Array<Record<string, unknown>>;
  cast?: Array<Record<string, unknown>>;
}): Array<Record<string, unknown>> {
  const script = args.script.trim();
  if (!script) return args.lines;

  const turns: Array<{ speaker: string; text: string }> = [];
  const bracketRe = /^[ \t]*【([^】\n]{1,24})】[ \t]*(.*)$/;
  for (const rawLine of script.split(/\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = bracketRe.exec(line);
    if (m) {
      turns.push({ speaker: m[1]!.trim(), text: (m[2] ?? '').trim() });
    } else if (turns.length > 0) {
      const last = turns[turns.length - 1]!;
      last.text = `${last.text} ${line}`.trim();
    }
  }
  if (turns.length === 0) return args.lines;

  const cast = args.cast ?? [];
  const nameToId = new Map<string, string>();
  for (const c of cast) {
    const id = String(c.id ?? '').trim();
    const name = String(c.name ?? '').trim();
    if (id && name) nameToId.set(name, id);
  }

  const prev = args.lines;
  const next: Array<Record<string, unknown>> = [];
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i]!;
    const prevLine = prev[i] && typeof prev[i] === 'object' ? { ...prev[i]! } : {};
    const speakerId =
      nameToId.get(t.speaker) ||
      String(prevLine.speakerId ?? prevLine.speaker_id ?? t.speaker).trim() ||
      t.speaker;
    next.push({
      ...prevLine,
      id: String(prevLine.id ?? `L${i + 1}`),
      speakerId,
      speakerName: t.speaker,
      text: t.text,
      tts_markup: t.text,
      kind: prevLine.kind ?? 'main',
      cue: prevLine.cue,
    });
  }
  return next;
}

export function formatDialogueScriptFromLines(
  lines: Array<Record<string, unknown>>,
  cast?: Array<Record<string, unknown>>
): string {
  const idToName = new Map<string, string>();
  for (const c of cast ?? []) {
    const id = String(c.id ?? '').trim();
    const name = String(c.name ?? '').trim();
    if (id && name) idToName.set(id, name);
  }
  const parts: string[] = [];
  for (const line of lines) {
    const speakerId = String(line.speakerId ?? line.speaker_id ?? '').trim();
    const name =
      String(line.speakerName ?? '').trim() ||
      idToName.get(speakerId) ||
      speakerId ||
      '旁白';
    const text = String(line.tts_markup ?? line.text ?? '').trim();
    if (!text) continue;
    parts.push(`【${name}】${text}`);
  }
  return parts.join('\n');
}
