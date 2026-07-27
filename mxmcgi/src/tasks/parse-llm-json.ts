import { ConfigurationError } from './errors';

function sanitizeJsonLike(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, '$1');
}

/**
 * 去掉首尾 markdown 围栏（含只有开头 ```json、末尾被截断的情况）。
 */
export function stripOuterMarkdownFence(raw: string): string {
  let s = raw.trim();
  // 成对围栏
  const paired = s.match(/^```(?:json|JSON)?\s*([\s\S]*?)```\s*$/);
  if (paired?.[1]) return paired[1].trim();
  // 仅开头围栏（常见于 max_tokens 截断）
  s = s.replace(/^```(?:json|JSON)?\s*/i, '');
  // 仅结尾残留围栏
  s = s.replace(/\s*```\s*$/i, '');
  return s.trim();
}

/**
 * 将 JSON 字符串字面量内的裸换行 / 制表符转义为 \\n / \\t。
 * LLM 经常输出多行字符串，原生 JSON.parse 会失败。
 */
export function escapeRawControlsInJsonStrings(raw: string): string {
  let out = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (inString) {
      if (escape) {
        out += ch;
        escape = false;
        continue;
      }
      if (ch === '\\') {
        out += ch;
        escape = true;
        continue;
      }
      if (ch === '"') {
        out += ch;
        inString = false;
        continue;
      }
      if (ch === '\n') {
        out += '\\n';
        continue;
      }
      if (ch === '\r') {
        out += '\\r';
        continue;
      }
      if (ch === '\t') {
        out += '\\t';
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    out += ch;
  }
  return out;
}

/** 从 LLM 混合输出中提取首个完整 JSON 对象（忽略前后 reasoning / markdown） */
export function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]!;
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * 截断输出时：尽量拼回「到最后一个完整对象」的根级数组字段。
 * 支持 album `items`、shot-list `segments`、cut-beat `beats`。
 */
export function salvageTruncatedArrayField(
  raw: string,
  fieldName: 'items' | 'segments' | 'beats'
): string | null {
  const fieldKey = raw.search(new RegExp(`"${fieldName}"\\s*:\\s*\\[`));
  if (fieldKey < 0) return null;
  const arrStart = raw.indexOf('[', fieldKey);
  if (arrStart < 0) return null;

  const completeItems: string[] = [];
  let i = arrStart + 1;
  while (i < raw.length) {
    while (i < raw.length && /[\s,]/.test(raw[i]!)) i += 1;
    if (i >= raw.length || raw[i] === ']') break;
    if (raw[i] !== '{') break;

    let depth = 0;
    let inString = false;
    let escape = false;
    const start = i;
    let end = -1;
    for (; i < raw.length; i++) {
      const ch = raw[i]!;
      if (inString) {
        if (escape) escape = false;
        else if (ch === '\\') escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          i += 1;
          break;
        }
      }
    }
    if (end < 0) break;
    completeItems.push(raw.slice(start, end + 1));
  }

  if (completeItems.length === 0) return null;

  const before = raw.slice(0, arrStart);
  const rootStart = before.lastIndexOf('{');
  if (rootStart < 0) return null;
  const head = raw.slice(rootStart, arrStart);
  return `${head}[${completeItems.join(',')}]}`;
}

/** @deprecated 使用 salvageTruncatedArrayField(raw, 'items') */
export function salvageTruncatedItemsObject(raw: string): string | null {
  return salvageTruncatedArrayField(raw, 'items');
}

function stripMarkdownFence(raw: string): string[] {
  const out: string[] = [];
  const stripped = stripOuterMarkdownFence(raw);
  if (stripped && stripped !== raw.trim()) out.push(stripped);

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/gi);
  if (fenced) {
    for (const block of fenced) {
      const inner = block.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      if (inner) out.push(inner);
    }
  }
  out.push(raw.trim());
  out.push(stripped);
  return out;
}

function tryParseCandidate(raw: string): unknown | null {
  const attempts = [
    raw,
    sanitizeJsonLike(raw),
    escapeRawControlsInJsonStrings(raw),
    sanitizeJsonLike(escapeRawControlsInJsonStrings(raw)),
  ];
  for (const cand of attempts) {
    if (!cand.trim()) continue;
    try {
      return JSON.parse(cand);
    } catch {
      /* next */
    }
  }
  return null;
}

/**
 * 解析 nestedText / LLM 结构化输出。
 * 失败时抛出 ConfigurationError（含可读片段），避免裸 SyntaxError。
 */
export function parseLlmStructuredOutput(text: string, label = 'LLM 输出'): unknown {
  const trimmed = text.trim();
  if (!trimmed) return text;

  let lastMessage = 'empty';
  const candidates: string[] = [];

  for (const chunk of stripMarkdownFence(trimmed)) {
    candidates.push(chunk);
    const extracted = extractJsonObject(chunk);
    if (extracted) candidates.push(extracted);
    const start = chunk.indexOf('{');
    const end = chunk.lastIndexOf('}');
    if (start >= 0 && end > start) {
      candidates.push(chunk.slice(start, end + 1));
    }
    for (const field of ['segments', 'beats', 'items'] as const) {
      const salvaged = salvageTruncatedArrayField(chunk, field);
      if (salvaged) candidates.push(salvaged);
    }
  }

  for (const cand of [...new Set(candidates.filter(Boolean))]) {
    const parsed = tryParseCandidate(cand);
    if (parsed != null) return parsed;
    try {
      JSON.parse(cand);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 勿用「``` 开头」的错误盖住真正失败原因（去围栏后的截断/引号问题）
      if (lastMessage === 'empty' || /Unexpected token '`/.test(lastMessage) || !/`/.test(cand.slice(0, 12))) {
        lastMessage = msg;
      }
    }
  }

  const hasFence = /```/.test(trimmed);
  const closedArray =
    /"(?:items|segments|beats)"\s*:\s*\[[\s\S]*\]\s*\}/.test(stripOuterMarkdownFence(trimmed));
  const looksTruncated = hasFence || !closedArray;

  throw new ConfigurationError(
    `${label}不是有效 JSON（${lastMessage}）。` +
      (looksTruncated
        ? ` 可能被截断或夹了 Markdown 围栏；请提高 generateParams.maxTokens，或缩短每条字段。`
        : ` 常见原因：字符串内未转义双引号、枚举写了「a | b」、或模型输出了说明文字。`) +
      ` 片段：${trimmed.slice(0, 280)}${trimmed.length > 280 ? '…' : ''}`
  );
}

export function assertShotListOutput(parsed: unknown, rawText: string): void {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ConfigurationError(
      `shot-list 须为 JSON 对象（含 segments 数组），实际为 ${typeof parsed}。` +
        ` 片段：${rawText.trim().slice(0, 200)}…`
    );
  }
  const segments = (parsed as { segments?: unknown }).segments;
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new ConfigurationError(
      'shot-list JSON 缺少非空 segments 数组。请重试任务；若反复失败可在 Admin 换用非推理模型或提高 maxTokens。'
    );
  }
}

export function assertCutBeatOutput(parsed: unknown, rawText: string): void {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ConfigurationError(
      `cut-beat 须为 JSON 对象（含 beats 数组），实际为 ${typeof parsed}。` +
        ` 片段：${rawText.trim().slice(0, 200)}…`
    );
  }
  const beats = (parsed as { beats?: unknown }).beats;
  if (!Array.isArray(beats) || beats.length === 0) {
    throw new ConfigurationError(
      'cut-beat JSON 缺少非空 beats 数组。请重试任务；若反复失败可在 Admin 换用非推理模型或提高 maxTokens。'
    );
  }
}
