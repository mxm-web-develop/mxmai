/**
 * 写作成稿卫生：拦截模型把英文思考/规则自检当成正文落库。
 * MiniMax-M3 在未 reasoning_split / token 不够时会把 scratchpad 直接写进 content。
 */

const SCRATCHPAD_MARKERS = [
  /^The user wants\b/m,
  /^Let me (analyze|draft|write|check|follow|reconsider|finalize|assemble|use|trim|pick|think)\b/im,
  /^OK let me\b/im,
  /^Humor beats\b/m,
  /^ARTICLE LENGTH\b/m,
  /^Wait,? the\b/m,
  /^Hmm,? (but|this|the)\b/im,
  /\bI should follow the contract\b/i,
  /\bLet me also (make sure|check|think|reconsider)\b/i,
  /\bNeed to trim to\b/i,
  /\bthe directive says\b/i,
  /\bbasic\.article_length\b/,
  /\btone_directives\b/,
];

/** 成稿像模型草稿纸 / 规则自检，而非读者可读文章 */
export function looksLikeLlmScratchpad(text: string): boolean {
  const t = String(text ?? '').trim();
  if (!t) return false;
  let hits = 0;
  for (const re of SCRATCHPAD_MARKERS) {
    if (re.test(t)) hits += 1;
    if (hits >= 2) return true;
  }
  if (/^The user wants\b/m.test(t)) return true;
  if (/^Let me analyze the contract\b/im.test(t)) return true;
  const enPlanning =
    (t.match(/\b(Let me|Humor beats|Section \d|OK let me|I need to|Actually let me)\b/gi) || [])
      .length;
  const hasZhArticle = /^#\s+.+/m.test(t) && /[\u4e00-\u9fff]{40,}/.test(t);
  if (enPlanning >= 4 && !hasZhArticle) return true;
  if (enPlanning >= 8) return true;
  return false;
}

/**
 * 若思考过程夹在正文前，尝试从首个像样的 Markdown 标题起裁切。
 * 裁切后仍像草稿纸则返回 null。
 */
export function extractMarkdownArticleFromMixedOutput(text: string): string | null {
  const t = String(text ?? '').trim();
  if (!t) return null;
  if (!looksLikeLlmScratchpad(t)) return t;

  const re = /^#\s+[^\n]*[\u4e00-\u9fff][^\n]*$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(t)) !== null) {
    const slice = t.slice(match.index).trim();
    const hasSections = /^##\s/m.test(slice);
    if (!hasSections && slice.length < 500) continue;
    if (hasSections && slice.length < 80) continue;
    if (looksLikeLlmScratchpad(slice)) continue;
    return slice;
  }
  return null;
}

export function assertCleanWritingManuscript(text: string, label = '写作成稿'): string {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) throw new Error(`${label}为空`);

  const salvaged = extractMarkdownArticleFromMixedOutput(trimmed);
  if (salvaged) {
    if (looksLikeLlmScratchpad(salvaged)) {
      throw new Error(
        `${label}疑似模型思考草稿（英文规则自检/Let me…），禁止落库。请确认 maxplan 已关闭 thinking（或仅过程不写入 content），并提高 maxTokens 后重试。`
      );
    }
    return salvaged;
  }
  throw new Error(
    `${label}疑似模型思考草稿（英文规则自检/Let me…），且无法裁出可用 Markdown。禁止落库。`
  );
}
