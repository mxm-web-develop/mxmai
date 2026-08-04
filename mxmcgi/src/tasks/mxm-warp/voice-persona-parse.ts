/** 从 LLM 原文解析 persona 字段（纯函数，可单测） */
export function parsePersonaText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  try {
    const direct = JSON.parse(trimmed) as Record<string, unknown>;
    if (direct && typeof direct === 'object') {
      const p = direct.persona ?? direct.host_persona ?? direct.text;
      if (typeof p === 'string' && p.trim()) return p.trim();
    }
  } catch {
    /* try fence / object slice */
  }
  const m = trimmed.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const root = JSON.parse(m[0]!) as Record<string, unknown>;
      const p = root.persona ?? root.host_persona ?? root.text;
      if (typeof p === 'string' && p.trim()) return p.trim();
    } catch {
      /* fall through */
    }
  }
  if (!trimmed.startsWith('{') && trimmed.length >= 8) return trimmed;
  return '';
}
