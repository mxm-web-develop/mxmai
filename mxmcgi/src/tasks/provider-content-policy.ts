/**
 * 上游内容审核 / 涉敏：解析命中词 → 从请求中剔除/替换 → 重试。
 * 无命中词时再缩证据 / 去证据（仍不跳过节点）。
 */

export type ContentPolicyErrorInfo = {
  hitWords: string[];
  statusCode?: number;
  sensitiveType?: number;
  message: string;
};

export class ProviderContentPolicyError extends Error {
  readonly code = 'CONTENT_POLICY';
  readonly hitWords: string[];
  readonly statusCode?: number;
  readonly sensitiveType?: number;
  readonly upstreamJson?: Record<string, unknown>;

  constructor(message: string, opts?: {
    hitWords?: string[];
    statusCode?: number;
    sensitiveType?: number;
    upstreamJson?: Record<string, unknown>;
  }) {
    super(message);
    this.name = 'ProviderContentPolicyError';
    this.hitWords = opts?.hitWords ?? [];
    this.statusCode = opts?.statusCode;
    this.sensitiveType = opts?.sensitiveType;
    this.upstreamJson = opts?.upstreamJson;
  }
}

const HIT_WORD_KEYS = [
  'sensitive_word',
  'sensitive_words',
  'hit_words',
  'hit_word',
  'input_sensitive_words',
  'output_sensitive_words',
  'blocked_words',
  'trigger_words',
] as const;

/** 从上游 JSON 抽取命中词（有则返回） */
export function extractHitWordsFromUpstreamJson(json: Record<string, unknown> | null | undefined): string[] {
  if (!json || typeof json !== 'object') return [];
  const out: string[] = [];
  const push = (s: string) => {
    const t = s.trim();
    if (t && t.length <= 64 && !out.includes(t)) out.push(t);
  };

  for (const key of HIT_WORD_KEYS) {
    const v = json[key];
    if (typeof v === 'string') {
      for (const part of v.split(/[,，、;；\s]+/)) push(part);
    } else if (Array.isArray(v)) {
      for (const x of v) {
        if (typeof x === 'string') push(x);
        else if (x && typeof x === 'object') {
          const o = x as Record<string, unknown>;
          for (const k of ['word', 'text', 'term', 'value']) {
            if (typeof o[k] === 'string') push(String(o[k]));
          }
        }
      }
    }
  }

  // 嵌套 base_resp / error / detail
  for (const nestKey of ['base_resp', 'error', 'detail', 'data']) {
    const nest = json[nestKey];
    if (nest && typeof nest === 'object' && !Array.isArray(nest)) {
      for (const w of extractHitWordsFromUpstreamJson(nest as Record<string, unknown>)) push(w);
    }
  }
  return out.slice(0, 32);
}

/** 从 Error / ProviderContentPolicyError / 文案「命中：a、b」解析命中词 */
export function extractHitWordsFromError(err: unknown): string[] {
  if (err instanceof ProviderContentPolicyError && err.hitWords.length) {
    return [...err.hitWords];
  }
  if (err && typeof err === 'object' && Array.isArray((err as { hitWords?: unknown }).hitWords)) {
    return ((err as { hitWords: unknown[] }).hitWords)
      .map((x) => String(x ?? '').trim())
      .filter(Boolean)
      .slice(0, 32);
  }
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const m = msg.match(/命中[：:]\s*([^\n（(]+)/);
  if (!m?.[1]) return [];
  return m[1]
    .split(/[、,，;；\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 64)
    .slice(0, 32);
}

export function isProviderContentPolicyError(err: unknown): boolean {
  if (err instanceof ProviderContentPolicyError) return true;
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (!msg) return false;
  const m = msg.toLowerCase();
  return (
    m.includes('status_code=1026') ||
    m.includes('status_code=1027') ||
    m.includes('new_sensitive') ||
    m.includes('input_sensitive') ||
    m.includes('output_sensitive') ||
    m.includes('涉敏') ||
    m.includes('content_policy') ||
    m.includes('content policy') ||
    m.includes('content_filter') ||
    m.includes('content filter') ||
    m.includes('responsibleai') ||
    (m.includes('safety') && m.includes('blocked')) ||
    (m.includes('违规') && (m.includes('敏感') || m.includes('审核')))
  );
}

const HARD_SCRUB_RE =
  /伊核|猛轰|核区|核打击|导弹|轰炸|战区告急|血腥|斩首|恐袭|ISIS|哈马斯|真主党|习近平|总书记|中央军委|解放军|台独|港独|法轮|六四|维稳|反腐|打虎|胡塞|核武器|核协议/gi;

const REDACT = '…';

/** 按上游命中词替换（长短词优先，避免短词误伤） */
export function redactHitWordsInText(text: string, hitWords: string[]): string {
  if (!text || hitWords.length === 0) return text;
  const sorted = [...hitWords]
    .map((w) => w.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  let out = text;
  for (const w of sorted) {
    if (w.length < 2 && !/[\u4e00-\u9fff]/.test(w)) continue; // 单字母英太易误伤
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'gi'), REDACT);
  }
  return out;
}

export function redactHitWordsInValue(value: unknown, hitWords: string[]): unknown {
  if (hitWords.length === 0) return value;
  if (typeof value === 'string') return redactHitWordsInText(value, hitWords);
  if (Array.isArray(value)) return value.map((v) => redactHitWordsInValue(v, hitWords));
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      if (k.startsWith('__')) {
        next[k] = v;
        continue;
      }
      next[k] = redactHitWordsInValue(v, hitWords);
    }
    return next;
  }
  return value;
}

/** 整包 nestedParams：按命中词替换所有字符串字段 */
export function redactHitWordsInParams(
  params: Record<string, unknown>,
  hitWords: string[]
): Record<string, unknown> {
  const words = hitWords.map((w) => w.trim()).filter(Boolean);
  if (words.length === 0) return { ...params };
  const next = redactHitWordsInValue(params, words) as Record<string, unknown>;
  next.__contentPolicyRetry = `redact-hits:${words.slice(0, 8).join(',')}`;
  next.__redactedHitWords = words;
  return next;
}

function scrubText(s: string, max: number): string {
  return s
    .replace(HARD_SCRUB_RE, REDACT)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * level 1：缩证据包 + 硬敏感 scrub
 * level 2：去掉证据包（仅靠 claim 合同继续填字段）
 */
export function downgradeNestedParamsForContentPolicy(
  params: Record<string, unknown>,
  level: 1 | 2
): Record<string, unknown> {
  const next = { ...params };
  if (level >= 2) {
    delete next.evidencePack;
    next.__contentPolicyRetry = 'omit-evidence';
    return next;
  }

  const pack = next.evidencePack;
  if (Array.isArray(pack)) {
    next.evidencePack = pack.map((raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
      const e = raw as Record<string, unknown>;
      const items = Array.isArray(e.items)
        ? (e.items as Record<string, unknown>[])
            .slice(0, 4)
            .map((it) => ({
              title: scrubText(String(it.title ?? ''), 80),
              snippet: scrubText(String(it.snippet ?? ''), 120),
              domain: typeof it.domain === 'string' ? it.domain.slice(0, 40) : undefined,
            }))
            .filter((it) => it.title || it.snippet)
        : [];
      return {
        key: e.key,
        query: typeof e.query === 'string' ? scrubText(e.query, 80) : e.query,
        hitCount: items.length,
        digestText: scrubText(String(e.digestText ?? ''), 600),
        items,
      };
    });
    next.__contentPolicyRetry = 'shrink-evidence';
  } else if (pack != null) {
    delete next.evidencePack;
    next.__contentPolicyRetry = 'omit-evidence';
  }
  return next;
}

export function getContentPolicyErrorInfo(err: unknown): ContentPolicyErrorInfo {
  const message = err instanceof Error ? err.message : String(err ?? '');
  const hitWords = extractHitWordsFromError(err);
  const statusMatch = message.match(/status_code[=:\s]*(\d+)/i);
  const statusCode = statusMatch ? Number(statusMatch[1]) : undefined;
  const sensitiveType =
    err instanceof ProviderContentPolicyError ? err.sensitiveType : undefined;
  return { hitWords, statusCode, sensitiveType, message };
}
