/**
 * 将 enrich 产出的 lines / script_draft 强制对齐用户 cast（禁止模型私增角色）
 */

export type DialogueCastMember = {
  id?: string;
  name?: string;
  roleHint?: string;
};

function asCast(raw: unknown): DialogueCastMember[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((c) => c && typeof c === 'object') as DialogueCastMember[];
}

function resolveCastId(
  cast: DialogueCastMember[],
  speakerId: string,
  speakerName: string
): string {
  const id = speakerId.trim();
  const name = speakerName.trim();
  if (id && cast.some((c) => String(c.id ?? '').trim() === id)) return id;
  if (name) {
    const byName = cast.find((c) => String(c.name ?? '').trim() === name);
    if (byName?.id) return String(byName.id).trim();
  }
  if (/旁白|解说|narrator/i.test(name) || /旁白|narrator/i.test(id)) {
    const narr = cast.find((c) => {
      const rh = String(c.roleHint ?? '');
      const n = String(c.name ?? '');
      return rh === 'narrator' || /旁白/.test(n);
    });
    if (narr?.id) return String(narr.id).trim();
  }
  return String(cast[0]?.id ?? 'host').trim();
}

function formatScript(lines: Array<Record<string, unknown>>, idToName: Map<string, string>): string {
  const parts: string[] = [];
  for (const line of lines) {
    const speakerId = String(line.speakerId ?? '').trim();
    const name =
      String(line.speakerName ?? '').trim() || idToName.get(speakerId) || speakerId || '角色';
    const kind = String(line.kind ?? 'main');
    const kindTag =
      kind === 'affirmation' ? '·附和' : kind === 'interrupt' ? '·插话' : '';
    const text = String(line.tts_markup ?? line.text ?? '').trim();
    if (!text) continue;
    parts.push(`【${name}${kindTag}】${text}`);
  }
  return parts.join('\n');
}

/**
 * 回写 lines.speakerId / speakerName，并用 cast.name 重生成 script_draft
 */
export function normalizeDialogueBusinessToCast(business: Record<string, unknown>): Record<string, unknown> {
  const cast = asCast(business.cast);
  if (cast.length === 0) return business;

  const idToName = new Map<string, string>();
  for (const c of cast) {
    const id = String(c.id ?? '').trim();
    const name = String(c.name ?? '').trim() || id;
    if (id) idToName.set(id, name);
  }

  const rawLines = Array.isArray(business.lines) ? (business.lines as Array<Record<string, unknown>>) : [];
  const lines = rawLines.map((line, i) => {
    const prevId = String(line.speakerId ?? line.speaker_id ?? '').trim();
    const prevName = String(line.speakerName ?? '').trim();
    const speakerId = resolveCastId(cast, prevId, prevName);
    const speakerName = idToName.get(speakerId) || String(cast[0]?.name ?? '主持');
    return {
      ...line,
      id: String(line.id ?? `L${i + 1}`),
      speakerId,
      speakerName,
    };
  });

  const script_draft = formatScript(lines, idToName) || String(business.script_draft ?? '');

  return {
    ...business,
    lines,
    script_draft,
  };
}
