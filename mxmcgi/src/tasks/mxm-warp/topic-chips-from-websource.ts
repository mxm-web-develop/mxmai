/**
 * 从合同 sources.websource（pre.webSearch 落点）抽取短标题，供交互卡话题 chips。
 * 优先用结构化 items[].title；否则回退解析 text 行。
 */

export type WebsourceLike =
  | string
  | {
      text?: string;
      items?: Array<{ title?: string; url?: string; snippet?: string }>;
      [k: string]: unknown;
    }
  | null
  | undefined;

/** 过滤栏目页 / 媒体名 / 导航噪声，只留像「当日热点话题」的标题 */
export function isLikelyHotTopicTitle(title: string): boolean {
  const t = title.trim();
  if (t.length < 10 || t.length > 80) return false;
  if (t.startsWith('#') || t.startsWith('查询:') || t.startsWith('【')) return false;
  if (t.includes('来源:')) return false;
  // 「金融话题 - 金融 - 工商时报」这类栏目面包屑
  if ((t.match(/[-—–|｜]/g) || []).length >= 2 && t.length < 56) return false;
  if (/话题\s*[-—–]/.test(t)) return false;
  if (/^\s*Week Ahead\b/i.test(t)) return false;
  // 纯媒体 / 频道名 / 源站
  if (
    /^(国际)?金融报社$|^彭博|^Bloomberg$|marketscreener\.com$|^订阅|^訂閱|首页|频道汇总|热门推荐|更多新闻|财经频道|金融市场\s*[|｜]/i.test(
      t
    )
  ) {
    return false;
  }
  if (/报社$|时报$/.test(t) && t.length <= 12) return false;
  return true;
}

function pushChip(chips: string[], raw: string, max: number): void {
  let t = raw.trim();
  if (!t) return;
  // 去掉常见「[1] 标题」前缀
  if (t.startsWith('[') && t.includes(']')) {
    const i = t.indexOf(']');
    t = t.slice(i + 1).trim();
  }
  if (!isLikelyHotTopicTitle(t)) return;
  if (chips.includes(t)) return;
  chips.push(t);
}

/** 从 websource 载荷抽热点：优先用 topicChips（热点提取节点产物），禁止把上百条检索 title 直接当选项 */
export function extractTopicChipsFromWebsource(
  web: WebsourceLike,
  opts?: { max?: number }
): string[] {
  const max = opts?.max ?? 8;
  const chips: string[] = [];

  if (web && typeof web === 'object' && Array.isArray((web as { topicChips?: unknown }).topicChips)) {
    const raw = (web as { topicChips: unknown[] }).topicChips;
    for (const c of raw) {
      if (chips.length >= max) break;
      const t = String(c ?? '').trim();
      if (!t || chips.includes(t)) continue;
      chips.push(t);
    }
    // 已显式写入 topicChips（含空数组）时不再回退到检索 title，避免把 200 条塞给用户
    return chips;
  }

  if (web && typeof web === 'object' && Array.isArray(web.items)) {
    for (const it of web.items) {
      if (chips.length >= max) break;
      if (it && typeof it.title === 'string') pushChip(chips, it.title, max);
    }
    if (chips.length > 0) return chips;
  }

  let text = '';
  if (typeof web === 'string') text = web;
  else if (web && typeof web === 'object' && typeof web.text === 'string') text = web.text;
  else if (web && typeof web === 'object') text = JSON.stringify(web);

  if (!text.trim()) return [];
  for (const line of text.split('\n')) {
    if (chips.length >= max) break;
    pushChip(chips, line, max);
  }
  return chips;
}

/** 交互卡 fields 是否声明了话题 chips 字段 */
export function fieldsWantTopicChips(fields: unknown): boolean {
  if (!Array.isArray(fields)) return false;
  return fields.some((f) => {
    if (!f || typeof f !== 'object') return false;
    const o = f as Record<string, unknown>;
    return o['x-ui'] === 'topic-chips' || o.name === 'core_topic';
  });
}

/** 从 TaskContext 合同取 sources.websource */
export function extractTopicChipsFromContractState(
  contract: Record<string, unknown> | null | undefined,
  opts?: { max?: number }
): string[] {
  const sources = contract?.sources as Record<string, unknown> | undefined;
  return extractTopicChipsFromWebsource(sources?.websource as WebsourceLike, opts);
}
