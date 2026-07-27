/** Provider 基础评分 */
export const PROVIDER_BASE_SCORE: Record<string, number> = {
  tavily: 70,
  anysearch: 72,
  brave: 65,
  serpapi: 75,
  arxiv: 80,
  duckduckgo: 40,
  bing: 60,
  bocha: 68,
};

/** 官方域名后缀 */
const OFFICIAL_DOMAINS = [
  '.gov',
  '.edu',
  '.org',
  'wikipedia.org',
  'github.com',
  'stackoverflow.com',
];

/** 权威来源域名 */
const AUTHORITATIVE_SOURCES = [
  'nature.com',
  'science.org',
  'arxiv.org',
  'ieee.org',
  'acm.org',
  'springer.com',
  'wiley.com',
  'sciencedirect.com',
];

/**
 * 判断是否为官方域名
 */
export function isOfficialDomain(domain: string): boolean {
  const lower = domain.toLowerCase();
  return OFFICIAL_DOMAINS.some((d) => lower.endsWith(d));
}

/**
 * 判断是否为权威来源
 */
export function isAuthoritativeSource(domain: string): boolean {
  const lower = domain.toLowerCase();
  return AUTHORITATIVE_SOURCES.some((s) => lower.includes(s));
}
