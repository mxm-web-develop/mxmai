/**
 * webSearch 结果清洗：域名降权/剔除、导航样板剥离、URL+标题去重。
 * 平台通用；业务用 params.resultClean 开关（industryTrend 默认开启）。
 */

export type WebSearchCleanItem = {
  title?: string;
  url?: string;
  snippet?: string;
  domain?: string;
};

export type WebSearchResultCleanOptions = {
  /** 剔除低质量域名（reddit / x 个人帖等） */
  dropLowQualityDomains?: boolean;
  /** 剥离导航/菜单样板文案 */
  stripBoilerplate?: boolean;
  /** 按规范化 URL + 标题去重 */
  dedupeByUrlTitle?: boolean;
  /** 清洗后 snippet 过短则丢弃（默认 24） */
  minSnippetChars?: number;
};

export const DEFAULT_WEB_SEARCH_CLEAN: Required<WebSearchResultCleanOptions> = {
  dropLowQualityDomains: true,
  stripBoilerplate: true,
  dedupeByUrlTitle: true,
  minSnippetChars: 24,
};

/** 行业日报 / 资讯类检索默认视为低质量来源 */
const LOW_QUALITY_HOST_RE =
  /(^|\.)(reddit\.com|old\.reddit\.com|redd\.it|x\.com|twitter\.com|t\.co|tiktok\.com|instagram\.com|facebook\.com|fb\.com|threads\.net|quora\.com|zhihu\.com\/question)(\/|$)/i;

const BOILERPLATE_RE =
  /\*?\s*Plus Icon[^*.\n]{0,80}|\bClick to (expand|Expand)[^.!\n]{0,60}|\bMega Menu\b|\bWhat To (Watch|Hear)\b|\bExpand Search Input\b|\bCookie (Policy|Settings|Preferences)\b|\bAccept (all )?cookies\b|\bTerms of (Service|Use)\b|\bPrivacy Policy\b|\bSign (in|up)\b|\bSubscribe now\b|\bNewsletter\b/gi;

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function resolveItemHost(it: WebSearchCleanItem): string {
  const d = String(it.domain ?? '')
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');
  if (d) return d;
  return hostFromUrl(String(it.url ?? '').trim()).replace(/^www\./, '');
}

export function isLowQualitySearchHost(hostOrUrl: string): boolean {
  const raw = String(hostOrUrl || '').trim().toLowerCase();
  if (!raw) return false;
  const host = raw.includes('/') || raw.includes(':') ? hostFromUrl(raw) || raw : raw;
  const normalized = host.replace(/^www\./, '');
  return LOW_QUALITY_HOST_RE.test(normalized) || LOW_QUALITY_HOST_RE.test(`${normalized}/`);
}

/** 剥离门户导航 / UI 控件文案 */
export function stripSearchBoilerplate(text: string): string {
  return String(text || '')
    .replace(BOILERPLATE_RE, ' ')
    .replace(/#\s+/g, ' ')
    .replace(/\*\s+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeDedupeKey(it: WebSearchCleanItem): string {
  const url = String(it.url ?? '')
    .trim()
    .toLowerCase()
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
  const title = String(it.title ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (url) return `u:${url}`;
  return `t:${title}`;
}

/**
 * 解析节点 params.resultClean：
 * - true / 缺省且 preferDefault → 全开
 * - false → 关闭
 * - object → 覆盖单项
 */
export function resolveWebSearchCleanOptions(
  resultClean: unknown,
  preferDefault: boolean
): Required<WebSearchResultCleanOptions> | null {
  if (resultClean === false) return null;
  if (resultClean === true || (resultClean == null && preferDefault)) {
    return { ...DEFAULT_WEB_SEARCH_CLEAN };
  }
  if (resultClean && typeof resultClean === 'object' && !Array.isArray(resultClean)) {
    const o = resultClean as Record<string, unknown>;
    return {
      dropLowQualityDomains:
        o.dropLowQualityDomains === undefined
          ? DEFAULT_WEB_SEARCH_CLEAN.dropLowQualityDomains
          : Boolean(o.dropLowQualityDomains),
      stripBoilerplate:
        o.stripBoilerplate === undefined
          ? DEFAULT_WEB_SEARCH_CLEAN.stripBoilerplate
          : Boolean(o.stripBoilerplate),
      dedupeByUrlTitle:
        o.dedupeByUrlTitle === undefined
          ? DEFAULT_WEB_SEARCH_CLEAN.dedupeByUrlTitle
          : Boolean(o.dedupeByUrlTitle),
      minSnippetChars:
        typeof o.minSnippetChars === 'number' && Number.isFinite(o.minSnippetChars)
          ? Math.max(0, Math.floor(o.minSnippetChars))
          : DEFAULT_WEB_SEARCH_CLEAN.minSnippetChars,
    };
  }
  if (preferDefault) return { ...DEFAULT_WEB_SEARCH_CLEAN };
  return null;
}

export function cleanWebSearchItems(
  items: WebSearchCleanItem[],
  options?: WebSearchResultCleanOptions | null
): { items: WebSearchCleanItem[]; filteredOut: number } {
  if (!options) {
    return { items: [...items], filteredOut: 0 };
  }
  const opts = { ...DEFAULT_WEB_SEARCH_CLEAN, ...options };
  const kept: WebSearchCleanItem[] = [];
  const seen = new Set<string>();
  let filteredOut = 0;

  for (const raw of items) {
    const host = resolveItemHost(raw);
    if (opts.dropLowQualityDomains && isLowQualitySearchHost(host || String(raw.url ?? ''))) {
      filteredOut += 1;
      continue;
    }

    let title = String(raw.title ?? '').trim();
    let snippet = String(raw.snippet ?? '').trim();
    if (opts.stripBoilerplate) {
      title = stripSearchBoilerplate(title);
      snippet = stripSearchBoilerplate(snippet);
    }

    const blob = `${title} ${snippet}`.trim();
    if (!blob) {
      filteredOut += 1;
      continue;
    }
    if (snippet.length > 0 && snippet.length < opts.minSnippetChars && title.length < 12) {
      filteredOut += 1;
      continue;
    }

    const next: WebSearchCleanItem = {
      title,
      snippet,
      ...(raw.url ? { url: String(raw.url).trim() } : {}),
      ...(host ? { domain: host } : raw.domain ? { domain: String(raw.domain).trim() } : {}),
    };

    if (opts.dedupeByUrlTitle) {
      const key = normalizeDedupeKey(next);
      if (!key || key === 'u:' || key === 't:') {
        filteredOut += 1;
        continue;
      }
      if (seen.has(key)) {
        filteredOut += 1;
        continue;
      }
      seen.add(key);
    }

    kept.push(next);
  }

  return { items: kept, filteredOut };
}
