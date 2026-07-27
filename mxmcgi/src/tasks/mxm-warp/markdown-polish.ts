/**
 * 成稿 Markdown 确定性抛光（不改事实）：
 * - 中文语境半角标点 → 全角
 * - 单行数据表降级为列表
 * - 连续近重复段落去重
 * - 剥离常见编辑元话语
 */

const META_DISCOURSE_RE =
  /^(源中未给出[^\n]{0,80}|本文仅作存在性陈述[^\n]{0,40}|具体[^。\n]{0,40}未在源中详述[^\n]{0,40}|源材料以[「"].{0,120}概述[^\n]{0,40}|本期(?:日报|周报|月报)以[^\n]{0,80})$/gm;

/** 写作课口令 / 高频 AI 套话（中文成稿） */
const AI_WORKSHOP_PHRASE_RE =
  /所以?(?:先抛立场|先抛观点|先给态度|先立住判断|把立场甩出来)|观点先行/g;

const AI_FILLER_PHRASE_RE =
  /(?:值得注意的是|不难发现|换句话说|综上所述|在某种程度上|需要指出的是|这意味着什么呢|值得注意的是|不難發現|換句話說|綜上所述)[，,]*/g;

/** English AI fillers (case-insensitive) */
const EN_AI_FILLER_RE =
  /\b(?:It is worth noting that|Needless to say,|At the end of the day,|In today's rapidly evolving [^,]{0,40},|Let's unpack |Here's the thing:|In conclusion,|This means that)\s*/gi;

/** Japanese AI fillers */
const JA_AI_FILLER_RE = /(?:なお、|つまり、|まとめると、|興味深いことに、|言うまでもなく、)/g;

/** 句中自指从句：「…，构成本期日报的叙事主轴。」→「…。」 */
const SELF_REFERENCE_CLAUSE_RE =
  /\uff0c[^\uff0c\u3002\n]{0,30}(?:叙事主轴|叙事主线|本期(?:日报|周报|月报)的主线)(?:\u3002|(?=\n|$))/gm;

/** 句首赘语：「如前所述，」 */
const STALE_TRANSITION_RE = /(^|[\u3002\uff01\uff1f\n])如前所述\uff0c?/gm;

/** 中文/全角字符邻接处的英文标点替换为中文标点 */
export function normalizeChinesePunctuation(text: string): string {
  let s = String(text || '');
  // CJK 之间或两侧的半角逗号/冒号/分号/问号/叹号
  s = s.replace(/([\u4e00-\u9fff])\s*,\s*/g, '$1，');
  s = s.replace(/\s*,\s*([\u4e00-\u9fff])/g, '，$1');
  s = s.replace(/([\u4e00-\u9fff])\s*:\s*/g, '$1：');
  s = s.replace(/([\u4e00-\u9fff])\s*;\s*/g, '$1；');
  s = s.replace(/([\u4e00-\u9fff])\s*\?\s*/g, '$1？');
  s = s.replace(/([\u4e00-\u9fff])\s*!\s*/g, '$1！');
  // 数字与中文之间多余空格（保留千分位数字内空格不处理）
  s = s.replace(/([\u4e00-\u9fff])\s+(\d)/g, '$1$2');
  s = s.replace(/(\d)\s+([\u4e00-\u9fff])/g, '$1$2');
  return s;
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|[\s:|-|]*\|?\s*$/.test(line);
}

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith('|') && t.includes('|', 1);
}

function parseTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/** 仅 1 行数据的 GFM 表 → 无序列表（表头+一行） */
export function demoteSingleRowTables(md: string): string {
  const lines = String(md || '').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (isTableRow(lines[i]!) && i + 1 < lines.length && isTableSeparator(lines[i + 1]!)) {
      const header = parseTableCells(lines[i]!);
      let j = i + 2;
      const dataRows: string[][] = [];
      while (j < lines.length && isTableRow(lines[j]!) && !isTableSeparator(lines[j]!)) {
        dataRows.push(parseTableCells(lines[j]!));
        j += 1;
      }
      if (dataRows.length === 1) {
        const row = dataRows[0]!;
        out.push('');
        for (let c = 0; c < Math.min(header.length, row.length); c += 1) {
          const h = header[c] || `列${c + 1}`;
          const v = row[c] || '';
          if (!h && !v) continue;
          out.push(`- **${h}**：${v}`);
        }
        out.push('');
        i = j;
        continue;
      }
    }
    out.push(lines[i]!);
    i += 1;
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

function normalizeParaKey(p: string): string {
  return p
    .replace(/\s+/g, '')
    .replace(/[，。；：、！？,.!?;:"'“”‘’（）()【】\[\]]/g, '')
    .slice(0, 120);
}

/** 去掉连续近重复段落（导语复读等） */
export function dedupeNearDuplicateParagraphs(md: string): string {
  const blocks = String(md || '').split(/\n{2,}/);
  const out: string[] = [];
  let prevKey = '';
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    // 跳过标题/表/列表的激进去重
    if (/^#{1,6}\s/.test(trimmed) || trimmed.startsWith('|') || trimmed.startsWith('- ') || trimmed.startsWith('>')) {
      out.push(trimmed);
      prevKey = '';
      continue;
    }
    const key = normalizeParaKey(trimmed);
    if (key && prevKey) {
      const shorter = key.length <= prevKey.length ? key : prevKey;
      const longer = key.length > prevKey.length ? key : prevKey;
      if (key === prevKey || (shorter.length >= 12 && longer.includes(shorter))) {
        continue;
      }
    }
    out.push(trimmed);
    prevKey = key;
  }
  return out.join('\n\n');
}

export function stripEditorialMetaDiscourse(md: string): string {
  return String(md || '')
    .replace(META_DISCOURSE_RE, '')
    .replace(/[（(]源中未给出[^）)]{0,60}[）)]/g, '')
    .replace(SELF_REFERENCE_CLAUSE_RE, '\u3002')
    .replace(STALE_TRANSITION_RE, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 剥离写作课口令与高频 AI 开场套话（不改事实从句） */
export function stripAiWorkshopPhrases(md: string, language?: string): string {
  const lang = String(language ?? 'zh').trim().toLowerCase();
  let s = String(md || '');
  if (!lang || lang === 'zh' || lang.startsWith('zh')) {
    s = s.replace(AI_WORKSHOP_PHRASE_RE, '');
    s = s.replace(AI_FILLER_PHRASE_RE, '');
  }
  if (lang === 'en' || lang.startsWith('en')) {
    s = s.replace(EN_AI_FILLER_RE, '');
  }
  if (lang === 'ja' || lang.startsWith('ja')) {
    s = s.replace(JA_AI_FILLER_RE, '');
  }
  s = s.replace(/[，,]{2,}/g, '，');
  s = s.replace(/([。！？])[，,]+/g, '$1');
  s = s.replace(/(^|\n)[，,\s]+/g, '$1');
  s = s.replace(/[，,]\s*([。！？])/g, '$1');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

/** 可视长度：CJK/全角计 1，ASCII 约 0.5，用于标题过长判断 */
export function visualTitleLength(text: string): number {
  let n = 0;
  for (const ch of String(text || '')) {
    const code = ch.codePointAt(0) ?? 0;
    n += code > 0xff ? 1 : 0.5;
  }
  return n;
}

const TITLE_OVERFLOW_MAX = 36;

/**
 * 过长 `#` 总标题拆成短标题 + 导语段。
 * 典型坏例：把导语/多话题/多数据整段塞进 H1。
 */
export function shortenOversizedDocumentTitle(md: string, maxVisual = TITLE_OVERFLOW_MAX): string {
  const lines = String(md || '').split('\n');
  let h1Index = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.trim();
    if (/^#\s+\S/.test(t) && !/^##/.test(t)) {
      h1Index = i;
      break;
    }
  }
  if (h1Index < 0) return String(md || '');

  const raw = lines[h1Index]!.trim().replace(/^#\s+/, '').trim();
  if (!raw) return String(md || '');

  let title = raw;
  let spilled = '';

  // 句号：标题只留首句，其余作导语
  const periodIdx = title.search(/[\u3002\uff01\uff1f]/);
  if (periodIdx >= 0 && periodIdx < title.length - 1) {
    spilled = title.slice(periodIdx + 1).trim();
    title = title.slice(0, periodIdx).trim();
  }

  // 仍过长：优先保留「主句：副句」中较短的一侧，或截到逗号/顿号
  if (visualTitleLength(title) > maxVisual) {
    const colon = title.search(/[\uff1a:]/);
    if (colon > 4 && colon < maxVisual) {
      const head = title.slice(0, colon).trim();
      const tail = title.slice(colon + 1).trim();
      if (visualTitleLength(head) <= maxVisual && visualTitleLength(`${head}\uff1a${tail}`) > maxVisual) {
        spilled = [tail, spilled].filter(Boolean).join(' ').trim();
        title = head;
      }
    }
  }
  if (visualTitleLength(title) > maxVisual) {
    const cutAt = Math.max(
      title.lastIndexOf('\uff0c', Math.ceil(maxVisual * 1.2)),
      title.lastIndexOf('\u3001', Math.ceil(maxVisual * 1.2)),
      title.lastIndexOf(',', Math.ceil(maxVisual * 1.2))
    );
    if (cutAt >= 8) {
      spilled = [title.slice(cutAt + 1).trim(), spilled].filter(Boolean).join(' ').trim();
      title = title.slice(0, cutAt).trim();
    } else {
      // 硬截：按可视长度近似切
      let acc = 0;
      let end = title.length;
      for (let i = 0; i < title.length; i++) {
        const code = title.codePointAt(i) ?? 0;
        acc += code > 0xff ? 1 : 0.5;
        if (acc >= maxVisual) {
          end = i;
          break;
        }
      }
      spilled = [title.slice(end).trim(), spilled].filter(Boolean).join(' ').trim();
      title = title.slice(0, end).trim().replace(/[\uff0c\u3001,::\uff1a\-\u2013\u2014]+$/u, '');
    }
  }

  if (title === raw || !title) return String(md || '');

  lines[h1Index] = `# ${title}`;
  if (spilled) {
    // 若下一非空块已是同一导语，不重复插入
    let j = h1Index + 1;
    while (j < lines.length && !lines[j]!.trim()) j += 1;
    const next = j < lines.length ? lines[j]!.trim() : '';
    const sameLead =
      next &&
      (next === spilled ||
        normalizeParaKey(next) === normalizeParaKey(spilled) ||
        normalizeParaKey(next).includes(normalizeParaKey(spilled).slice(0, 24)));
    if (!sameLead) {
      lines.splice(h1Index + 1, 0, '', spilled);
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

/** 组合抛光；可按语言跳过中文标点（非 zh* 时） */
export function polishEditorialMarkdown(
  md: string,
  opts?: {
    language?: string;
    punctuation?: boolean;
    demoteTables?: boolean;
    dedupeParas?: boolean;
    stripMeta?: boolean;
    shortenTitle?: boolean;
  }
): string {
  const language = String(opts?.language ?? 'zh').trim().toLowerCase();
  const isZh = !language || language === 'zh' || language.startsWith('zh');
  let s = String(md || '');
  if (opts?.shortenTitle !== false) s = shortenOversizedDocumentTitle(s);
  if (opts?.stripMeta !== false) s = stripEditorialMetaDiscourse(s);
  s = stripAiWorkshopPhrases(s, language);
  if (opts?.demoteTables !== false) s = demoteSingleRowTables(s);
  if (opts?.dedupeParas !== false) s = dedupeNearDuplicateParagraphs(s);
  if (opts?.punctuation !== false && isZh) s = normalizeChinesePunctuation(s);
  return s.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
