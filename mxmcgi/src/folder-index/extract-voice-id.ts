/**
 * 从文本中提取 Minimax voice_id（角色卡文档/旁注）
 */
const VOICE_ID_PATTERNS = [
  /voice[_-]?id\s*[:=]\s*["']?([A-Za-z0-9_\-.]+)/i,
  /clone_voice(?:Id)?\s*[:=]\s*["']?([A-Za-z0-9_\-.]+)/i,
  /minimax[^\n]{0,40}?([A-Za-z0-9_\-]{8,})/i,
];

export function extractVoiceIdFromText(text: string): string | undefined {
  const t = text.trim();
  if (!t) return undefined;
  for (const re of VOICE_ID_PATTERNS) {
    const m = t.match(re);
    if (m?.[1] && m[1].length >= 4) return m[1];
  }
  // 整行仅含一个疑似 id
  if (/^[A-Za-z0-9_\-.]{6,64}$/.test(t)) return t;
  return undefined;
}
