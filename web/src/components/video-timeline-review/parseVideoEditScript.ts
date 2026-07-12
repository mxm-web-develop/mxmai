import type { VideoEditScript } from './types';

/** 解析 OpenReel ProjectFile（支持 JSON 字符串） */
export function parseVideoEditScript(raw: unknown): VideoEditScript | null {
  let value: unknown = raw;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      value = JSON.parse(trimmed) as unknown;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const pf = value as VideoEditScript;
  if (!Array.isArray(pf.project?.timeline?.tracks)) return null;
  return pf;
}
