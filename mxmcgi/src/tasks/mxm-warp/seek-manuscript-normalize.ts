/**
 * seek 成稿确定性规范化（不改事实）：
 * - 剥离泄漏的合约/voice_id/variant 标记/多版本前言
 * - 多版本合集只保留本路（或第一路 / 最长一路）正文
 * - 保证篇首有读者向 `#` 标题
 * - 粗体滥用时剥掉 **
 * - 「墙字」按句号拆成段落
 */

export type SeekManuscriptNormalizeOpts = {
  /** 缺 H1 / 元标题时补上的标题（通常 = topic） */
  fallbackTitle?: string;
  /** 当前路 voice_id（用于从合集中切出本路） */
  voiceId?: string;
  maxBoldSpans?: number;
  maxBoldRatio?: number;
};

const VOICE_ID_TOKEN = String.raw`(?:cn|gat|ja|en)_[a-z0-9_]+`;

/** 合约/工艺泄漏行 */
const META_LEAK_LINE =
  /seek_count|voice_ids|按合约配置|各写一版|下面分别为|四种笔法|多路文风|笔法各异|事实底色一致|文风对照|笔法对照|写同一场|四种文风|四档|三篇皆以|不进入正文|风格说明|共同基调|tone_directives|style_profile|key_passages|styled_evidence/;

/** 读者向标题不合格：合集元标题 / 内部标签 */
const META_TITLE =
  /四种笔法|多路|多版|写同一|笔法对照|文风对照|各写一版|seek_count|voice_ids|四种文风|三则|三篇|四则|四篇|感官密集版|短讯速报\s*[·•]\s*|对照成稿|对照文集|variant\s*\d+/i;

/** 分路小标题：① **cn_plain_warm** · … */
const STYLE_SECTION_HEAD = new RegExp(
  `^[①②③④⑤⑥⑦⑧⑨⑩一二三四五六七八九十\\d]+\\s*[.、．]?\\s*\\*?\\*?(${VOICE_ID_TOKEN})\\b`,
  'i'
);
const STYLE_SECTION_HEAD_LOOSE = new RegExp(
  `^#{1,3}\\s*\\*?\\*?(${VOICE_ID_TOKEN})\\b|^\\*?\\*?(${VOICE_ID_TOKEN})\\*?\\*?\\s*[·•—\\-]`,
  'i'
);

/** 无 voice_id 的「版本一 / ① 无为而牛」平行章 */
const VERSION_SECTION_HEAD =
  /^(?:#{1,3}\s*)?(?:版本\s*[一二三四五六七八九十\d]+|[①②③④⑤⑥⑦⑧⑨⑩])\s*[.、．·•—:\-：]?\s*\S/;

function stripOuterFence(md: string): string {
  let s = String(md || '').trim();
  const fence = s.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  if (fence?.[1]) s = fence[1].trim();
  return s;
}

export function seekVisibleLength(text: string): number {
  let n = 0;
  for (const ch of String(text || '')) {
    if (/\s/.test(ch)) continue;
    const code = ch.codePointAt(0) ?? 0;
    n += code > 0xff ? 1 : 0.5;
  }
  return n;
}

export function countBoldSpans(md: string): number {
  const matches = String(md || '').match(/\*\*[^*\n][^*]*?\*\*/g);
  return matches?.length ?? 0;
}

export function boldCharRatio(md: string): number {
  const s = String(md || '');
  const total = seekVisibleLength(s.replace(/\*\*/g, ''));
  if (total <= 0) return 0;
  let bold = 0;
  for (const m of s.matchAll(/\*\*([^*\n][^*]*?)\*\*/g)) {
    bold += seekVisibleLength(m[1] || '');
  }
  return bold / total;
}

export function demoteAbusiveBold(
  md: string,
  opts?: { maxBoldSpans?: number; maxBoldRatio?: number }
): string {
  const maxSpans = opts?.maxBoldSpans ?? 8;
  const maxRatio = opts?.maxBoldRatio ?? 0.12;
  const s = String(md || '');
  const spans = countBoldSpans(s);
  if (spans === 0) return s;
  if (spans > maxSpans) {
    return s.replace(/\*\*([^*\n][^*]*?)\*\*/g, '$1');
  }
  const bodyLen = seekVisibleLength(s.replace(/\*\*/g, ''));
  if (spans >= 4 && bodyLen >= 120 && boldCharRatio(s) > maxRatio) {
    return s.replace(/\*\*([^*\n][^*]*?)\*\*/g, '$1');
  }
  return s;
}

export function isSeekMetaTitle(title: string): boolean {
  return META_TITLE.test(String(title || '').trim());
}

function isStyleSectionHead(line: string): boolean {
  const t = line.trim().replace(/^\*+|\*+$/g, '').trim();
  return STYLE_SECTION_HEAD.test(t) || STYLE_SECTION_HEAD_LOOSE.test(t);
}

function isVersionSectionHead(line: string): boolean {
  const t = line.trim().replace(/^\*+|\*+$/g, '').trim();
  if (!t || isStyleSectionHead(t)) return false;
  return VERSION_SECTION_HEAD.test(t);
}

function voiceIdFromSectionHead(line: string): string {
  const t = line.trim();
  const m1 = t.match(STYLE_SECTION_HEAD);
  if (m1?.[1]) return m1[1].toLowerCase();
  const m2 = t.match(new RegExp(VOICE_ID_TOKEN, 'i'));
  return (m2?.[0] || '').toLowerCase();
}

/** 去掉行内 / 行首的 variant、变体、英文字段泄漏 */
export function stripVariantMarkers(md: string): string {
  return String(md || '')
    .replace(/```+\s*---\s*```+/g, '\n\n')
    .replace(/`{0,3}\s*---\s*`{0,3}/g, '\n\n')
    .replace(/【\s*variant\s*\d+\s*】/gi, '')
    .replace(/【\s*变体\s*\d+\s*】/g, '')
    .replace(/【\s*版本\s*[一二三四五六七八九十\d]+\s*】/g, '')
    .replace(/\bvariant\s*[:=]?\s*\d+\b/gi, '')
    .replace(/\bvariants?\b/gi, '')
    .replace(/\bvoice_ids?\b/gi, '')
    .replace(/\bseek_count\b/gi, '')
    .replace(/\bkey_passages\b/gi, '')
    .replace(/\bstyled_evidence\b/gi, '')
    .replace(/\bstyle_profile\b/gi, '')
    .replace(/\btone_directives\b/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/([。！？])\s*(今天的话题|有人问|「)/g, '$1\n\n$2')
    // 模型把素材句与开篇硬粘：…先别上菜今天的话题…
    .replace(/([^\s。！？\n#])(今天的话题|有人问行情|有人已经替)/g, '$1。\n\n$2');
}

/** 去掉含合约字段 / voice_id 泄漏的行与行内反引号片段 */
export function stripSeekMetaLeak(md: string): string {
  const voiceIdLine = new RegExp(
    `^#{0,3}\\s*\\*?\\*?(${VOICE_ID_TOKEN})\\*?\\*?(\\s*[·•—\\-].*)?$`,
    'i'
  );
  const numberedVoice = new RegExp(
    `^[①②③④⑤⑥⑦⑧⑨⑩一二三四五六七八九十\\d]+\\s*[.、．]?\\s*\\*?\\*?(${VOICE_ID_TOKEN})\\b`,
    'i'
  );
  const lines = String(md || '').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      out.push('');
      continue;
    }
    if (META_LEAK_LINE.test(t)) continue;
    if (voiceIdLine.test(t) || numberedVoice.test(t)) continue;
    if (/^按合约|^根据合约|^合约配置/.test(t)) continue;
    if (isStyleSectionHead(t)) continue;
    // 文末元说明 / 斜体附言
    if (/^\*+\s*(三篇|四篇|各路|统一回到|材料有限：未提供)/.test(t)) continue;
    if (/^\*\s*$/.test(t)) continue;

    let cleaned = stripVariantMarkers(line)
      .replace(/`[^`]*(?:seek_count|voice_ids|voice_id|variant)[^`]*`/gi, '')
      .replace(new RegExp(`\\*?\\*?\\b(${VOICE_ID_TOKEN})\\b\\*?\\*?`, 'gi'), '')
      .replace(/\(\s*[,，、\s]*\)/g, '')
      .replace(/[（(]\s*[)）]/g, '')
      .replace(/[ \t]{2,}/g, ' ');
    const trimmed = cleaned.trim();
    if (!trimmed) continue;
    if (/^[①②③④⑤⑥⑦⑧⑨⑩]\s*[·•—\-]?\s*$/.test(trimmed)) continue;
    if (META_LEAK_LINE.test(trimmed)) continue;
    if (/^(版本|变体|variant)\s*[一二三四五六七八九十\d]*\s*$/i.test(trimmed)) continue;
    out.push(cleaned.replace(/\s+$/g, ''));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * 若模型把多路写成一篇合集：按分路标题切开，只留本路（或第一路）正文。
 */
export function extractSingleVoiceSection(md: string, voiceId?: string): string {
  const s = String(md || '').trim();
  if (!s) return s;
  const lines = s.split('\n');
  const heads: Array<{ idx: number; voice: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    if (isStyleSectionHead(lines[i]!)) {
      heads.push({ idx: i, voice: voiceIdFromSectionHead(lines[i]!) });
    }
  }
  if (heads.length < 2) return s;

  const want = String(voiceId || '').trim().toLowerCase();
  let start = heads[0]!.idx;
  let end = heads[1]?.idx ?? lines.length;
  if (want) {
    const hit = heads.find((h) => h.voice === want);
    if (hit) {
      start = hit.idx;
      const hi = heads.indexOf(hit);
      end = heads[hi + 1]?.idx ?? lines.length;
    }
  }

  const bodyLines = lines.slice(start + 1, end);
  let body = bodyLines.join('\n').trim();
  if (seekVisibleLength(body) < 40) {
    body = lines
      .filter((_, i) => i < heads[0]!.idx || (i > start && i < end))
      .join('\n')
      .trim();
  }
  return body || s;
}

/**
 * 无 voice_id 的多版本/多则短讯合集：保留最长一路正文（丢掉版本标题行）。
 * 若是【variant N】拼贴且无明显章节头，则剥标记后拼成一篇。
 */
export function collapseParallelVersionPack(md: string): string {
  const s = String(md || '').trim();
  if (!s) return s;
  const lines = s.split('\n');
  const heads: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isVersionSectionHead(lines[i]!)) heads.push(i);
  }

  if (heads.length >= 2) {
    let best = '';
    let bestLen = 0;
    for (let h = 0; h < heads.length; h++) {
      const start = heads[h]!;
      const end = heads[h + 1] ?? lines.length;
      const body = lines
        .slice(start + 1, end)
        .join('\n')
        .trim();
      const len = seekVisibleLength(body);
      if (len > bestLen) {
        bestLen = len;
        best = body;
      }
    }
    // 保留文首 H1（若在第一个版本头之前）
    const preface = lines.slice(0, heads[0]).join('\n').trim();
    const prefaceH1 = preface.match(/^#\s+\S[\s\S]*?(?=\n\n|\n#|$)/);
    if (best && bestLen >= 40) {
      if (prefaceH1) {
        const titleLine = prefaceH1[0]!.split('\n')[0]!;
        return `${titleLine}\n\n${best}`.trim();
      }
      return best;
    }
  }

  // 【variant N】拼贴：剥标记后按段落拼接为一篇
  if (/【\s*variant\s*\d+\s*】/i.test(s) || /【\s*变体\s*\d+\s*】/.test(s)) {
    const chunks = s
      .split(/【\s*(?:variant|变体)\s*\d+\s*】/i)
      .map((c) => stripVariantMarkers(c).trim())
      .filter((c) => seekVisibleLength(c) >= 8);
    if (chunks.length >= 2) {
      const h1 = chunks[0]!.match(/^#\s+.+$/m)?.[0];
      const bodies = chunks.map((c) => c.replace(/^#\s+.+$/m, '').trim()).filter(Boolean);
      const joined = bodies.join('\n\n');
      return h1 ? `${h1}\n\n${joined}` : joined;
    }
  }

  return s;
}

export function ensureLeadingH1(md: string, fallbackTitle?: string): string {
  const s = String(md || '').trim();
  const fallback = String(fallbackTitle || '')
    .trim()
    .replace(/^#+\s*/, '')
    .slice(0, 48);

  if (!s) {
    return fallback ? `# ${fallback}\n` : '';
  }

  const lines = s.split('\n');
  const firstHeadingIdx = lines.findIndex((ln) => /^#{1,6}\s+\S/.test(ln.trim()));
  if (firstHeadingIdx >= 0) {
    const ht = lines[firstHeadingIdx]!.trim();
    const isH1 = /^#\s+\S/.test(ht) && !/^##/.test(ht);
    const isH2 = /^##\s+\S/.test(ht);
    if (isH1 || isH2) {
      let titleText = ht.replace(/^#{1,6}\s+/, '').trim();
      if (isSeekMetaTitle(titleText) && fallback) {
        titleText = fallback;
      }
      const rest = [...lines.slice(0, firstHeadingIdx), ...lines.slice(firstHeadingIdx + 1)]
        .join('\n')
        .trim();
      return `# ${titleText}\n\n${rest}`.replace(/\n{3,}/g, '\n\n').trim();
    }
  }

  if (!fallback) return s;
  return `# ${fallback}\n\n${s}`.replace(/\n{3,}/g, '\n\n');
}

export function breakWallOfText(md: string, minLen = 200): string {
  const s = String(md || '');
  const blocks = s.split(/\n{2,}/);
  if (blocks.filter((b) => b.trim()).length >= 3) return s;

  const lines = s.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (
      !trimmed ||
      /^#{1,6}\s/.test(trimmed) ||
      trimmed.startsWith('>') ||
      trimmed.startsWith('- ') ||
      trimmed.startsWith('* ') ||
      /^\d+\.\s/.test(trimmed)
    ) {
      out.push(line);
      i += 1;
      continue;
    }

    const chunk: string[] = [line];
    i += 1;
    while (i < lines.length) {
      const n = lines[i]!;
      const nt = n.trim();
      if (
        !nt ||
        /^#{1,6}\s/.test(nt) ||
        nt.startsWith('>') ||
        nt.startsWith('- ') ||
        nt.startsWith('* ') ||
        /^\d+\.\s/.test(nt)
      ) {
        break;
      }
      chunk.push(n);
      i += 1;
    }
    const joined = chunk.join('\n').replace(/\n+/g, '');
    if (joined.length < minLen || !/[。！？]/.test(joined)) {
      out.push(...chunk);
      continue;
    }
    const sentences: string[] = [];
    let acc = '';
    for (const ch of joined) {
      acc += ch;
      if (ch === '。' || ch === '！' || ch === '？') {
        sentences.push(acc);
        acc = '';
      }
    }
    if (acc.trim()) sentences.push(acc);
    let buf = '';
    let sentInBuf = 0;
    for (const sent of sentences) {
      buf += sent;
      sentInBuf += 1;
      if (sentInBuf >= 2 && buf.length >= 60) {
        out.push(buf.trim());
        out.push('');
        buf = '';
        sentInBuf = 0;
      }
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** 从正文首段抽短标题（无可用 H1 时） */
export function inferTitleFromBody(md: string, max = 28): string {
  const body = String(md || '')
    .replace(/^#{1,6}\s+.+$/m, '')
    .trim();
  const first = body.split(/\n+/).map((l) => l.trim()).find((l) => l && !/^[-*>]/.test(l));
  if (!first) return '';
  const plain = first.replace(/\*\*/g, '').replace(/[`「」『』]/g, '').trim();
  const cut = plain.search(/[。！？；]/);
  const one = (cut > 4 ? plain.slice(0, cut) : plain).trim();
  if (one.length <= max) return one;
  return one.slice(0, max).replace(/[，、,\s]+$/u, '') + '…';
}

export function normalizeSeekManuscript(
  md: string,
  opts?: SeekManuscriptNormalizeOpts
): string {
  let s = stripOuterFence(md);
  if (!s) return s;

  s = extractSingleVoiceSection(s, opts?.voiceId);
  s = collapseParallelVersionPack(s);
  s = stripVariantMarkers(s);
  s = stripSeekMetaLeak(s);
  s = demoteAbusiveBold(s, {
    maxBoldSpans: opts?.maxBoldSpans,
    maxBoldRatio: opts?.maxBoldRatio,
  });

  const fallback =
    String(opts?.fallbackTitle || '').trim() ||
    inferTitleFromBody(s) ||
    undefined;
  s = ensureLeadingH1(s, fallback);
  // 二次剥离：ensure 后仍可能残留前言段 / 版本头
  s = collapseParallelVersionPack(s);
  s = stripSeekMetaLeak(s);
  s = ensureLeadingH1(s, fallback);
  s = breakWallOfText(s);
  // 再清一次可能由拆段引入的空壳
  s = stripSeekMetaLeak(s);
  s = ensureLeadingH1(s, fallback);
  return s.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
