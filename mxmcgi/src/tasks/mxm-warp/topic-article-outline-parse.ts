/**
 * 话题写作大纲：纯解析 / 结构垫底（无 DB / task-engine 依赖，便于单测）。
 */
import {
  escapeRawControlsInJsonStrings,
  extractJsonObject,
  stripOuterMarkdownFence,
} from '../parse-llm-json';
import { structuresForPurpose } from '../writing-style-presets/topic-article-purpose';

export type TopicArticleOutlineSection = {
  heading: string;
  intent: string;
  notes?: string;
};

export type TopicArticleOutline = {
  title: string;
  sections: TopicArticleOutlineSection[];
};

function normalizeSection(raw: unknown): TopicArticleOutlineSection | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const heading = String(o.heading ?? o.title ?? '').trim();
  const intent = String(o.intent ?? o.summary ?? o.goal ?? '').trim();
  const notes = String(o.notes ?? o.hint ?? '').trim();
  if (!heading && !intent) return null;
  return {
    heading: heading || intent.slice(0, 24),
    intent: intent || heading,
    ...(notes ? { notes } : {}),
  };
}

export function parseTopicArticleOutline(raw: string): TopicArticleOutline | null {
  const text = stripOuterMarkdownFence(String(raw || '').trim());
  if (!text) return null;
  let obj: Record<string, unknown> | null = null;
  try {
    const fixed = escapeRawControlsInJsonStrings(text);
    const extracted = extractJsonObject(fixed) || fixed;
    const parsed = JSON.parse(extracted) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      obj = parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  if (!obj) return null;
  const root =
    obj.outline && typeof obj.outline === 'object' && !Array.isArray(obj.outline)
      ? (obj.outline as Record<string, unknown>)
      : obj;
  const title = String(root.title ?? '').trim();
  const sectionsRaw = Array.isArray(root.sections) ? root.sections : [];
  const sections = sectionsRaw
    .map(normalizeSection)
    .filter((s): s is TopicArticleOutlineSection => !!s)
    .slice(0, 8);
  if (sections.length === 0) return null;
  return {
    title: title || sections[0]!.heading,
    sections,
  };
}

/** 无 LLM 时：用结构节拍垫底 */
export function fallbackOutlineFromStructure(input: {
  topic: string;
  purpose: string;
  structureId?: string;
  language?: string;
}): TopicArticleOutline {
  const structs = structuresForPurpose(input.purpose, input.language);
  const picked =
    structs.find((s) => s.id === String(input.structureId || '').trim()) || structs[0];
  const beats = picked?.beats?.length ? picked.beats : ['开场', '展开', '收束'];
  return {
    title: shortFallbackTitle(input.topic),
    sections: beats.map((b) => ({
      heading: b,
      intent: `围绕「${String(input.topic || '').trim()}」写清：${b}`,
    })),
  };
}

/** 垫底标题：勿把超长选题原文当文章名 */
export function shortFallbackTitle(topic: string, maxChars = 22): string {
  let s = String(topic || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '未命名';
  s = s.replace(/^【[^】]{0,48}】\s*/u, '').trim() || s;
  const clause = s.split(/[，,。！？；;：:\n|｜]/u)[0]?.trim() || s;
  const chars = [...clause];
  if (chars.length <= maxChars) return clause || '未命名';
  return `${chars.slice(0, maxChars - 1).join('')}…`;
}
