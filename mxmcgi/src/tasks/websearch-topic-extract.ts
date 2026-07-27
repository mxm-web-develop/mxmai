/**
 * webSearch 后可选：调用 text 业务从检索结果提炼话题 chips。
 * 必须走 runTaskV2 计价。模型返回空 topics 时，用已清洗的检索标题做确定性兜底（不编造新事件）。
 * 仅当检索侧也无可用标题时才抛错。
 */
import type { TaskRunV2Request } from './types';
import { parseNestedTextTaskKey } from './business-pipeline';
import { MXM_WARP_CONTRACT_VERSION, emptyContract } from './mxm-warp/contract-types';
import {
  escapeRawControlsInJsonStrings,
  extractJsonObject,
  stripOuterMarkdownFence,
} from './parse-llm-json';

export const DEFAULT_TOPIC_EXTRACT_TEXT_KEY = 'text/expert/industry-hot-topics';

/** 联网检索条数上限（写入合同 items） */
export const SEARCH_HIT_MAX = 200;
/** 热点提炼：送模候选上限（title+短 snippet） */
export const TOPIC_EXTRACT_INPUT_MAX = 80;
/** 热点提炼：返回给用户的话题上限 */
export const TOPIC_OUTPUT_MAX = 30;

/** 检索条数：1～200 */
export function clampSearchMaxResults(n: unknown, fallback = 8): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : fallback;
  return Math.max(1, Math.min(SEARCH_HIT_MAX, v));
}

/** 话题输出条数：1～30（用户要的热点数，与检索条数解耦） */
export function clampTopicMaxResults(n: unknown, fallback = 8): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : fallback;
  return Math.max(1, Math.min(TOPIC_OUTPUT_MAX, v));
}

/** 送模候选条数：不少于输出目标，不超过 TOPIC_EXTRACT_INPUT_MAX */
export function clampTopicExtractInputCount(n: unknown, outputTarget = 8): number {
  const want = clampTopicMaxResults(outputTarget);
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : TOPIC_EXTRACT_INPUT_MAX;
  return Math.max(want, Math.min(TOPIC_EXTRACT_INPUT_MAX, v));
}

/** 按用户要的话题数生成 field_specs（禁止写死 6～12）；宁缺毋滥 */
export function buildTopicExtractFieldSpecs(maxTopics: number) {
  const n = clampTopicMaxResults(maxTopics);
  const softMin = Math.max(1, Math.ceil(n * 0.4));
  const preferMin = Math.max(softMin, Math.ceil(n * 0.55));
  return [
    {
      name: 'topics',
      type: 'array',
      description: `JSON 数组，最多 ${n} 条（建议 ${preferMin}～${n}；弱证据可少到 ${softMin}，禁止为凑数编造）。检索条目非空时禁止返回空数组。元素可以是字符串，或 {topic,confidence}（confidence∈0～1，低于 0.55 的勿输出）。按「与行业/检索词关联度 → 热度/重要性 → 可报道价值」排序，多余候选一律丢掉。每条一句可读事件，勿编号、勿附字数、勿英文推理。禁止栏目名/媒体名/首页/小时榜/榜单标题；禁止仅有艺人健康/取消一场演出且无行业影响的碎片话题`,
    },
  ] as const;
}

/** @deprecated 仅兼容旧引用；新代码请用 buildTopicExtractFieldSpecs(maxResults) */
export const TOPIC_EXTRACT_FIELD_SPECS = buildTopicExtractFieldSpecs(8);

export type WebsourceItem = {
  title?: string;
  url?: string;
  snippet?: string;
  domain?: string;
};

export type WebsourcePayload = {
  query?: string;
  depth?: string;
  providers?: string[];
  hitCount?: number;
  truncated?: boolean;
  text?: string;
  items?: WebsourceItem[];
  topicChips?: string[];
  [k: string]: unknown;
};

export type TopicExtractResult = {
  topics: string[];
  textTaskId: string;
  filteredOut: number;
};

import {
  cleanWebSearchItems,
  resolveWebSearchCleanOptions,
  type WebSearchResultCleanOptions,
} from './mxm-warp/web-search-result-clean';

/** 栏目/榜单/体育集锦/App 广告等噪声 */
const NOISE_RE =
  /小时报|热点小时|Premier Plays|MLB\.com|\bMLB\b|Highlights|流动应用|APP是一个|娱乐串燒|娱乐串烧|早報頭條|早报头条|头版头条内容精华|官方网站|门户导航|订阅页|訂閱/i;

/**
 * 易触发 Maxplan 1026（input new_sensitive）的硬敏感；
 * 非「国际/军事/时政」行业时送模前剔除。含门户侧栏/相关阅读常见噪声。
 */
const HARD_SENSITIVE_RE =
  /伊核|猛轰|核区|核打击|导弹|轰炸|战区告急|血腥|斩首|恐袭|ISIS|哈马斯|真主党|习近平|总书记|中央军委|解放军|台独|港独|法轮|六四|维稳|反腐|打虎|胡塞|核武器|核协议|亚伯拉罕|上海合作组织|上合组织|went rogue|cyber-?attack|hacked a start/i;

/** 送模 snippet 上限：门户常把整页导航塞进摘要，过长易夹带敏感侧栏 */
const SNIPPET_MAX_CHARS = 180;
const TITLE_MAX_CHARS = 100;

function itemBlob(it: WebsourceItem): string {
  return `${String(it.title ?? '')} ${String(it.snippet ?? '')}`;
}

export type PrepareItemsOptions = {
  /** 默认开启（资讯类）；传 false 关闭域名/样板/去重清洗 */
  resultClean?: boolean | WebSearchResultCleanOptions | null;
};

/** 送模/落库前清洗：去掉噪声与（按行业）硬敏感；maxItems 由调用方决定（检索可达 200，提炼候选通常 ≤80） */
export function prepareItemsForTopicExtract(
  items: WebsourceItem[],
  industry: string,
  maxItems = 8,
  prepareOpts?: PrepareItemsOptions
): { items: WebsourceItem[]; filteredOut: number } {
  const sector = String(industry || '').trim();
  const allowHardGeo = /国际|军事|时政|地缘|防务/.test(sector);
  const limit = Math.max(1, Math.min(SEARCH_HIT_MAX, Math.floor(maxItems) || 8));

  const cleanOpts = resolveWebSearchCleanOptions(
    prepareOpts?.resultClean === undefined ? true : prepareOpts.resultClean,
    true
  );
  const preCleaned = cleanWebSearchItems(items, cleanOpts);
  let filteredOut = preCleaned.filteredOut;

  const kept: WebsourceItem[] = [];
  for (const it of preCleaned.items) {
    const blob = itemBlob(it);
    if (!blob.trim()) {
      filteredOut += 1;
      continue;
    }
    if (NOISE_RE.test(blob)) {
      filteredOut += 1;
      continue;
    }
    if (!allowHardGeo && HARD_SENSITIVE_RE.test(blob)) {
      filteredOut += 1;
      continue;
    }
    kept.push({
      title: String(it.title ?? '')
        .trim()
        .slice(0, TITLE_MAX_CHARS),
      snippet: String(it.snippet ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, SNIPPET_MAX_CHARS),
      domain: String(it.domain ?? '').trim().slice(0, 40),
      ...(it.url ? { url: String(it.url).trim().slice(0, 300) } : {}),
    });
    if (kept.length >= limit) break;
  }
  return { items: kept, filteredOut };
}

/**
 * 写入合同 / 嵌套写作前：截断 snippet、剔硬敏感，并重建 text。
 * 预览缓存的超长摘要必须再过一遍，否则 Maxplan 仍会 1026。
 */
export function sanitizeWebsourceForLlm(
  payload: WebsourcePayload,
  industry: string,
  maxItems = 12,
  prepareOpts?: PrepareItemsOptions
): WebsourcePayload {
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const { items, filteredOut } = prepareItemsForTopicExtract(
    rawItems,
    industry,
    maxItems,
    prepareOpts
  );
  const query = String(payload.query ?? '').trim() || '（查询）';
  const depth = String(payload.depth ?? '').trim();
  const header = depth
    ? `【联网检索 · ${depth}】\n查询: ${query}\n`
    : `【联网检索】\n查询: ${query}\n`;
  const lines = items.map((it, i) => {
    const title = String(it.title ?? '').trim();
    const snippet = String(it.snippet ?? '').trim();
    const url = String(it.url ?? '').trim();
    return `[${i + 1}] ${title}\n${snippet}${url ? `\n来源: ${url}` : ''}`.trim();
  });
  const text =
    items.length === 0
      ? `${header}\n（未检索到可用结果）`
      : `${header.trimEnd()}\n\n${lines.join('\n\n')}`;
  // extracted 与 queries 透传：即使 snippet 全部被过滤，也可被 LLM 二次使用
  const { extracted: _e, queries: _q, ...rest } = payload as Record<string, unknown>;
  return {
    ...rest,
    items,
    hitCount: items.length,
    truncated: Boolean(payload.truncated) || filteredOut > 0 || rawItems.length > items.length,
    text: text.slice(0, 3500),
    sanitized: true,
    filteredOut,
    extracted: payload.extracted,
    queries: payload.queries,
  };
}

/** 英文推理 / 字数自检等元话语，不当作话题 */
const META_PROSE_RE =
  /\b(is correct|another topic|let'?s keep|we already have|chars?\)|keep it to)\b/i;

function cjkRatio(s: string): number {
  const chars = [...s];
  if (chars.length === 0) return 0;
  const cjk = chars.filter((ch) => /[\u4e00-\u9fff]/.test(ch)).length;
  return cjk / chars.length;
}

function normalizeTopicCandidate(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(/^[\d]+[.\u3001、)\]]\s*/, '').trim();
  s = s.replace(/\s*\(\d+\s*chars?\)\s*$/i, '').trim();
  s = s.replace(/^["“「『]+|["”」』]+$/g, '').trim();
  if (s.length < 6 || s.length > 72) return null;
  if (META_PROSE_RE.test(s)) return null;
  if (cjkRatio(s) < 0.35 && !/[\u4e00-\u9fff]{4,}/.test(s)) return null;
  if (
    /首页|小时报|热点小时|Highlights|Premier Plays|流动应用|APP是一个|娱乐串燒|娱乐串烧/i.test(s) &&
    s.length < 36
  ) {
    return null;
  }
  if (HARD_SENSITIVE_RE.test(s)) return null;
  return s;
}

/**
 * 模型返回空 topics 时，从已清洗检索标题确定性生成 chips（不编造事件）。
 * 对纯拉丁标题放宽长度限制，避免英文资讯检索后整单失败。
 */
export function fallbackTopicsFromSearchItems(
  items: WebsourceItem[],
  maxTopics: number
): string[] {
  const limit = clampTopicMaxResults(maxTopics);
  const out: string[] = [];
  for (const it of items) {
    if (out.length >= limit) break;
    const title = String(it.title ?? '').trim();
    if (!title) continue;
    let n = normalizeTopicCandidate(title);
    if (!n) {
      let s = title.replace(/^[\d]+[.\u3001、)\]]\s*/, '').trim();
      s = s.replace(/^["“「『]+|["”」』]+$/g, '').trim();
      if (
        s.length >= 12 &&
        s.length <= 100 &&
        !META_PROSE_RE.test(s) &&
        !HARD_SENSITIVE_RE.test(s) &&
        !NOISE_RE.test(s)
      ) {
        n = s.length > 72 ? `${s.slice(0, 71)}…` : s;
      }
    }
    if (!n || out.includes(n)) continue;
    out.push(n);
  }
  return out;
}

const MIN_TOPIC_CONFIDENCE = 0.55;

function collectTopicsFromList(list: unknown[], maxTopics: number): string[] {
  const limit = clampTopicMaxResults(maxTopics);
  const out: string[] = [];
  for (const row of list) {
    if (out.length >= limit) break;
    let s = '';
    if (typeof row === 'string') s = row.trim();
    else if (row && typeof row === 'object') {
      const r = row as Record<string, unknown>;
      const conf = r.confidence ?? r.score;
      if (typeof conf === 'number' && Number.isFinite(conf) && conf < MIN_TOPIC_CONFIDENCE) {
        continue;
      }
      for (const k of ['topic', 'event', 'title', 'text', 'headline', 'core']) {
        if (typeof r[k] === 'string' && String(r[k]).trim()) {
          s = String(r[k]).trim();
          break;
        }
      }
    }
    const n = normalizeTopicCandidate(s);
    if (!n || out.includes(n)) continue;
    out.push(n);
  }
  return out;
}

function tryParseTopicsJson(body: string, maxTopics: number): string[] {
  const attempts: string[] = [body];
  const extracted = extractJsonObject(body);
  if (extracted) attempts.push(extracted);
  const startArr = body.indexOf('[');
  const endArr = body.lastIndexOf(']');
  if (startArr >= 0 && endArr > startArr) attempts.push(body.slice(startArr, endArr + 1));
  const startObj = body.indexOf('{');
  const endObj = body.lastIndexOf('}');
  if (startObj >= 0 && endObj > startObj) attempts.push(body.slice(startObj, endObj + 1));

  for (const cand of attempts) {
    for (const variant of [cand, escapeRawControlsInJsonStrings(cand)]) {
      try {
        const parsed = JSON.parse(variant) as unknown;
        if (Array.isArray(parsed)) {
          const topics = collectTopicsFromList(parsed, maxTopics);
          if (topics.length) return topics;
        } else if (parsed && typeof parsed === 'object') {
          const o = parsed as Record<string, unknown>;
          for (const k of ['topics', 'topicChips', 'chips', 'events', 'items']) {
            if (Array.isArray(o[k])) {
              const topics = collectTopicsFromList(o[k] as unknown[], maxTopics);
              if (topics.length) return topics;
            }
          }
        }
      } catch {
        /* next */
      }
    }
  }
  return [];
}

/** 从编号列表 / 引号串抢救中文事件（模型常输出 CoT 而非 JSON） */
function salvageTopicsFromProse(raw: string, maxTopics: number): string[] {
  const limit = clampTopicMaxResults(maxTopics);
  const out: string[] = [];
  const push = (cand: string) => {
    const n = normalizeTopicCandidate(cand);
    if (!n || out.includes(n) || out.length >= limit) return;
    out.push(n);
  };

  // 1. 编号项：6. "……" 或 6、……
  const numbered =
    /(?:^|[\s;；])(?:\d{1,2})[.\u3001、)\]]\s*[“"「]?([^”"」\n]{6,72})[”"」]?/g;
  for (const m of raw.matchAll(numbered)) push(m[1] || '');

  // 2. 双引号 / 弯引号包裹的短句
  const quoted = /[“"「]([^”"」\n]{6,72})[”"」]/g;
  for (const m of raw.matchAll(quoted)) push(m[1] || '');

  // 3. 行首像事件短句、但被截断缺左引号：……主管" is correct
  const dangling =
    /(?:^|[\n\r]|[-–—:：]\s*)([\u4e00-\u9fff][^”"」\n]{5,70}?)(?:[”"」]\s*(?:is correct|->|→|\(|$))/gi;
  for (const m of raw.matchAll(dangling)) push(m[1] || '');

  return out;
}

/**
 * 解析 text/expert/conclusion 输出为 topics。
 * 优先 JSON；失败时从编号列表/引号散文抢救（应对 Gemini 英文 CoT）。
 * @param maxTopics 与检索节点 maxResults 对齐，默认 8
 */
export function parseTopicsFromTextBusinessOutput(raw: string, maxTopics = 8): string[] {
  const t = raw.trim();
  if (!t) return [];
  const body = stripOuterMarkdownFence(t);
  const limit = clampTopicMaxResults(maxTopics);
  const fromJson = tryParseTopicsJson(body, limit);
  if (fromJson.length > 0) return fromJson;
  return salvageTopicsFromProse(body, limit);
}

/** 从 writing 业务 pipeline.pre 读取热点提取 text 业务键 */
export function readTopicExtractTextKeyFromWritingPipeline(
  pipeline:
    | {
        pre?: Array<{
          step?: string;
          nestedTextTaskKey?: string;
          params?: Record<string, unknown>;
        }>;
      }
    | null
    | undefined
): string | null {
  const pre = pipeline?.pre;
  if (!Array.isArray(pre)) return null;
  // 优先独立热点提取节点
  for (const step of pre) {
    if (String(step?.step || '') !== 'extractHotTopics') continue;
    const key = String(
      step?.params?.textKey ?? step?.nestedTextTaskKey ?? ''
    ).trim();
    if (key.startsWith('text/')) return key;
    return 'text/expert/industry-hot-topics';
  }
  // 兼容旧：挂在 webSearch.topicExtractTextKey
  for (const step of pre) {
    if (String(step?.step || '') !== 'webSearch') continue;
    const key = String(step?.params?.topicExtractTextKey ?? '').trim();
    if (key.startsWith('text/')) return key;
  }
  return null;
}

function buildExpertRequest(args: {
  taskKey: string;
  subtype: string | null;
  industry: string;
  ymd?: string;
  dateLabel?: string;
  dateMode?: string;
  language?: string;
  query?: string;
  items: WebsourceItem[];
  parentTaskId?: string;
  maxTopics: number;
}): TaskRunV2Request {
  const contract = emptyContract({
    version: MXM_WARP_CONTRACT_VERSION,
    scope: 'writing',
    taskKey: 'editorial',
    subtype: 'industry-daily',
    taskId: args.parentTaskId || '',
  });
  const language = String(args.language ?? 'zh').trim() || 'zh';
  contract.basic = {
    industry: args.industry,
    language,
    ...(args.ymd ? { report_ymd: args.ymd } : {}),
    ...(args.dateLabel ? { date_label: args.dateLabel } : {}),
    ...(args.dateMode ? { date_mode: args.dateMode } : {}),
  };
  contract.sources = {
    websource: {
      query: args.query,
      hitCount: args.items.length,
      items: args.items,
    },
  };
  return {
    scope: 'text',
    taskKey: args.taskKey,
    subtype: args.subtype,
    params: {
      contract,
      field_specs: [...buildTopicExtractFieldSpecs(args.maxTopics)],
    },
  };
}

/**
 * 调用配置的 text 业务提炼 topics。失败抛错，不做任何回退。
 */
export async function extractTopicChipsViaTextBusiness(args: {
  textKey: string;
  userId: string;
  industry: string;
  ymd?: string;
  dateLabel?: string;
  dateMode?: string;
  /** 用户成稿/界面语言：总结 topics 必须用此语言 */
  language?: string;
  websource: WebsourcePayload;
  parentTaskId?: string;
  /**
   * 最终返回话题数（用户 topic_count / topicExtractMax）。
   * 与检索 maxResults 解耦：可搜 200 条只提炼 8 条。
   */
  maxTopics?: number;
  /** 送模候选条数；缺省取 min(检索条数, TOPIC_EXTRACT_INPUT_MAX) */
  maxInputItems?: number;
  /** 检索清洗开关；默认开启 */
  resultClean?: boolean | WebSearchResultCleanOptions | null;
}): Promise<TopicExtractResult> {
  const textKey = args.textKey.trim();
  const rawItems = Array.isArray(args.websource.items) ? args.websource.items : [];
  const maxTopics = clampTopicMaxResults(args.maxTopics ?? 8);
  const maxInput = clampTopicExtractInputCount(
    args.maxInputItems ?? rawItems.length,
    maxTopics
  );
  if (!textKey.startsWith('text/')) {
    throw new Error('未配置话题提炼 text 业务（topicExtractTextKey）');
  }
  if (rawItems.length === 0) {
    throw new Error('检索结果为空，无法提炼话题');
  }

  const { items, filteredOut } = prepareItemsForTopicExtract(rawItems, args.industry, maxInput, {
    resultClean: args.resultClean === undefined ? true : args.resultClean,
  });
  if (items.length === 0) {
    throw new Error(
      `检索结果经清洗后无可送模条目（过滤 ${filteredOut} 条噪声/敏感），请换行业或日期重试`
    );
  }

  const { taskKey, subtype } = parseNestedTextTaskKey(textKey);
  const { runTaskV2 } = await import('./task-engine');
  const req = buildExpertRequest({
    taskKey,
    subtype,
    industry: args.industry,
    ymd: args.ymd,
    dateLabel: args.dateLabel,
    dateMode: args.dateMode,
    language: args.language,
    query: typeof args.websource.query === 'string' ? args.websource.query : undefined,
    items,
    parentTaskId: args.parentTaskId,
    maxTopics,
  });

  const result = await runTaskV2(req, args.userId);
  if (!result.success || !result.syncResult) {
    throw new Error(
      `话题提炼 text 业务失败：${textKey} status=${result.status} taskId=${result.taskId ?? ''}`
    );
  }

  const rawText = result.syncResult.text ?? '';
  let topics = parseTopicsFromTextBusinessOutput(rawText, maxTopics).slice(0, maxTopics);
  if (topics.length === 0) {
    topics = fallbackTopicsFromSearchItems(items, maxTopics);
    console.warn(
      `[topic-extract] empty LLM topics, fallback to ${topics.length} search titles taskId=${result.taskId} raw=${rawText
        .replace(/\s+/g, ' ')
        .slice(0, 120)}`
    );
  }
  if (topics.length === 0) {
    throw new Error('未能从检索结果提炼出可用热点，请换行业、日期或检索范围后重试');
  }

  return {
    topics,
    textTaskId: result.taskId!,
    filteredOut,
  };
}
