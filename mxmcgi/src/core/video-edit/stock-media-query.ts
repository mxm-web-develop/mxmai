import type { MxmClipMetadata } from './types';
import { MIN_SUBSTANTIVE_CHARS, substantiveTextLength } from './stock-subtitle-context';

export type StockSearchQueryInput = {
  subtitleText?: string;
  /** 含邻接句的上下文字幕（短句时优先） */
  contextSubtitles?: string;
  projectTopic?: string;
};

/** 图库检索无意义的英文停用/泛化词（避免整句直译式长检索词匹配到无关抽象图） */
const STOCK_QUERY_STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'as',
  'is', 'are', 'was', 'were', 'be', 'being', 'been', 'this', 'that', 'these', 'those', 'it', 'its',
  'we', 'they', 'their', 'our', 'your', 'you', 'he', 'she', 'his', 'her', 'them', 'us',
  'about', 'into', 'over', 'under', 'between', 'while', 'when', 'then', 'than', 'so', 'but',
  'showing', 'depicting', 'depict', 'shows', 'show', 'view', 'views', 'scene', 'scenes', 'image',
  'images', 'footage', 'video', 'videos', 'clip', 'shot', 'background', 'backdrop', 'concept',
  'conceptual', 'abstract', 'generic', 'various', 'related', 'related', 'thing', 'things', 'stuff',
  'people', 'person', 'man', 'woman', 'guy', 'someone',
]);

const MAX_STOCK_QUERY_WORDS = 5;

/**
 * 归一化图库检索词：仅保留英文/数字词、去停用词、去重、限制词数。
 * 让检索词回到「主体+场景」几个具体名词，而非整段可视化词堆砌。
 * 非英文（如中文原句）会被清空，交由上层回退到 keywords。
 */
export function normalizeStockQuery(raw: string, maxWords = MAX_STOCK_QUERY_WORDS): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const seen = new Set<string>();
  const words: string[] = [];
  for (const w of cleaned.split(' ')) {
    if (w.length < 2) continue;
    if (STOCK_QUERY_STOPWORDS.has(w)) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    words.push(w);
    if (words.length >= maxWords) break;
  }
  return words.join(' ');
}

function englishKeywordsQuery(keywords?: string[]): string {
  if (!Array.isArray(keywords) || !keywords.length) return '';
  return normalizeStockQuery(keywords.join(' '));
}

function extractPromptSemantics(prompt: string): { topic?: string; segment?: string } {
  const topic = prompt.match(/主题[「『"']([^」』"']+)[」』"']/)?.[1]?.trim();
  const segment =
    prompt.match(/本段(?:口播|内容)?[：:]\s*[「『"']([^」』"']+)[」』"']/)?.[1]?.trim() ??
    prompt.match(/本段内容[：:]\s*[「『"']([^」』"']+)[」』"']/)?.[1]?.trim();
  return { topic, segment };
}

function uniqueJoin(parts: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of parts) {
    const p = raw.trim();
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * 从片段 metadata + 字幕上下文提取图库/视频库检索词。
 * 避免把整段风格化 mxmPrompt 直接丢给 Pexels（易匹配到无关抽象图）。
 */
export function buildStockSearchQuery(
  meta: MxmClipMetadata,
  subtitleText?: string,
  input?: StockSearchQueryInput
): string {
  // 1) LLM/用户显式检索词：归一化（英文、限词数）后使用
  const custom = meta.mxmStockSearchQuery?.trim();
  if (custom) {
    const norm = normalizeStockQuery(custom);
    if (norm) return norm;
  }

  // 2) 段级英文 keywords（含本段核心实体/专名）
  const fromKeywords = englishKeywordsQuery(meta.mxmStockKeywords);
  if (fromKeywords) return fromKeywords;

  const prompt = meta.mxmPrompt?.trim() ?? '';
  const { topic: topicFromPrompt, segment: segmentFromPrompt } = extractPromptSemantics(prompt);
  const topic = input?.projectTopic?.trim() || topicFromPrompt;

  const inClip = (subtitleText ?? input?.subtitleText ?? '').trim();
  const contextual = (input?.contextSubtitles ?? inClip).trim();

  const utteranceBase = inClip || segmentFromPrompt || '';
  const useWiderContext =
    substantiveTextLength(utteranceBase) < MIN_SUBSTANTIVE_CHARS &&
    substantiveTextLength(contextual) > substantiveTextLength(utteranceBase);

  const utterance = useWiderContext
    ? contextual
    : utteranceBase || contextual || segmentFromPrompt || '';

  const parts: string[] = [];
  if (topic && utterance && !utterance.includes(topic)) {
    parts.push(topic);
  } else if (topic && !utterance) {
    parts.push(topic);
  }
  if (utterance) parts.push(utterance);
  else if (segmentFromPrompt) parts.push(segmentFromPrompt);

  // 派生词若含英文则归一化返回；纯中文（图库无翻译层，检索无效）不透传
  const joined = uniqueJoin(parts);
  if (joined) {
    const norm = normalizeStockQuery(joined);
    if (norm) return norm;
  }

  const brief = meta.mxmGsapSceneBrief?.trim();
  if (brief) {
    const norm = normalizeStockQuery(brief);
    if (norm) return norm;
  }

  return 'documentary b-roll';
}

export function isAutoStockImageEnabled(meta: MxmClipMetadata): boolean {
  return meta.mxmAutoStockImage !== false;
}

export function isAutoStockVideoEnabled(meta: MxmClipMetadata): boolean {
  return meta.mxmAutoStockVideo === true;
}
