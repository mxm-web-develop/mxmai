import type { MxmClipMetadata, TimelineSubtitle } from './types';

export type StockSearchQueryInput = {
  subtitleText?: string;
  contextSubtitles?: string;
  projectTopic?: string;
};

const DEFAULT_CONTEXT_PAD_SEC = 10;
const MIN_SUBSTANTIVE_CHARS = 14;

export function substantiveTextLength(text: string): number {
  return text.replace(/[\s，。、；：！？,.;:!?「」『』"'""'']/g, '').length;
}

export function resolveClipSubtitleSearchContext(
  subtitles: TimelineSubtitle[],
  clipStart: number,
  clipDuration: number,
  projectTopic?: string
): StockSearchQueryInput {
  const pad = DEFAULT_CONTEXT_PAD_SEC;
  const clipEnd = clipStart + clipDuration;

  const inClip = subtitles
    .filter((s) => s.startTime < clipEnd && s.endTime > clipStart)
    .map((s) => s.text.trim())
    .filter(Boolean);

  const contextStart = clipStart - pad;
  const contextEnd = clipEnd + pad;
  const withContext = subtitles
    .filter((s) => s.startTime < contextEnd && s.endTime > contextStart)
    .map((s) => s.text.trim())
    .filter(Boolean);

  const subtitleText = inClip.join(' ');
  const contextSubtitles = [...new Set(withContext)].join(' ');

  return {
    subtitleText,
    contextSubtitles: contextSubtitles || subtitleText,
    projectTopic: projectTopic?.trim() || undefined,
  };
}

/** 图库检索无意义的英文停用/泛化词（与 mxmcgi stock-media-query 对齐） */
const STOCK_QUERY_STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'as',
  'is', 'are', 'was', 'were', 'be', 'being', 'been', 'this', 'that', 'these', 'those', 'it', 'its',
  'we', 'they', 'their', 'our', 'your', 'you', 'he', 'she', 'his', 'her', 'them', 'us',
  'about', 'into', 'over', 'under', 'between', 'while', 'when', 'then', 'than', 'so', 'but',
  'showing', 'depicting', 'depict', 'shows', 'show', 'view', 'views', 'scene', 'scenes', 'image',
  'images', 'footage', 'video', 'videos', 'clip', 'shot', 'background', 'backdrop', 'concept',
  'conceptual', 'abstract', 'generic', 'various', 'related', 'thing', 'things', 'stuff',
  'people', 'person', 'man', 'woman', 'guy', 'someone',
]);

const MAX_STOCK_QUERY_WORDS = 5;

/** 与 mxmcgi 对齐：开场/结尾用空旷背景 */
export const OPENING_CLOSING_STOCK_QUERY = 'empty background';

export function isOpeningOrClosingBeat(
  meta?: Pick<MxmClipMetadata, 'mxmBeatRole' | 'mxmFragmentRole'> | null
): boolean {
  const beat = meta?.mxmBeatRole;
  if (beat === 'opening' || beat === 'closing') return true;
  const frag = meta?.mxmFragmentRole;
  return frag === 'opening' || frag === 'outro';
}

/**
 * 归一化图库检索词：仅保留英文/数字词、去停用词、去重、限制词数。
 * 与 mxmcgi `stock-media-query.ts#normalizeStockQuery` 保持一致，保证预览与服务端结果同源。
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

/** 从片段 metadata + 字幕上下文提取图库检索词（与 mxmcgi stock-media-query 对齐） */
export function buildStockSearchQuery(
  meta?: MxmClipMetadata,
  subtitleText?: string,
  input?: StockSearchQueryInput
): string {
  if (isOpeningOrClosingBeat(meta)) {
    return OPENING_CLOSING_STOCK_QUERY;
  }

  // 1) LLM/用户显式检索词：归一化（英文、限词数）后使用
  const custom = meta?.mxmStockSearchQuery?.trim();
  if (custom) {
    const norm = normalizeStockQuery(custom);
    if (norm) return norm;
  }

  // 2) 段级英文 keywords（含本段核心实体/专名）
  const fromKeywords = englishKeywordsQuery(meta?.mxmStockKeywords);
  if (fromKeywords) return fromKeywords;

  const prompt =
    meta?.mxmVideoPrompt?.trim() ||
    meta?.mxmImagePrompt?.trim() ||
    meta?.mxmPrompt?.trim() ||
    '';
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

  const brief = meta?.mxmGsapSceneBrief?.trim();
  if (brief) {
    const norm = normalizeStockQuery(brief);
    if (norm) return norm;
  }

  return 'documentary b-roll';
}
