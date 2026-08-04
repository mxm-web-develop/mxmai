/**
 * 成稿语言指令：把 language 码展开为可执行的母语写作硬约束。
 * 仅「zh」码不够——模型常写成翻译腔 / 写作课口令 / 半截比喻。
 * 支持平台四语：zh / zh-TW / en / ja。
 */

export function normalizeManuscriptLanguage(raw: unknown): string {
  const s = String(raw ?? 'zh').trim().toLowerCase();
  if (!s) return 'zh';
  if (s === 'zh-cn' || s === 'zh_hans' || s === 'cn' || s === 'simplified') return 'zh';
  if (s === 'zh-tw' || s === 'zh_hant' || s === 'tw' || s === 'traditional') return 'zh-TW';
  if (s === 'en-us' || s === 'en-gb' || s.startsWith('en')) return 'en';
  if (s === 'ja-jp' || s.startsWith('ja')) return 'ja';
  if (s === 'zh' || s.startsWith('zh-')) return s === 'zh-tw' ? 'zh-TW' : 'zh';
  return s;
}

export function manuscriptLanguageLabel(languageRaw: unknown): string {
  const language = normalizeManuscriptLanguage(languageRaw);
  switch (language) {
    case 'zh':
      return '简体中文（中国大陆当代书面语）';
    case 'zh-TW':
      return '繁體中文（台灣書面語）';
    case 'en':
      return 'English (contemporary editorial prose)';
    case 'ja':
      return '日本語（自然な書き言葉）';
    default:
      return language;
  }
}

/** 注入成稿 system 末尾：覆盖合同里空泛的 language=zh */
export function buildManuscriptLanguageDirective(languageRaw: unknown): string {
  const language = normalizeManuscriptLanguage(languageRaw);

  if (language === 'zh' || language === 'zh-CN') {
    return `## 当前成稿语言（已解析 · 违反即失败）
language 码 = zh → 你必须用**简体中文母语书面语**写完整文章（中国大陆当代报刊/深度报道可读标准），不是把英文提纲译成中文，不是写作课示范，不是 AI 模板腔。

### 思维连贯（硬）
- 每一段只推进一个信息点；下一段必须接上上一段的因果、转折、递进或举例，禁止并列堆「又一个观点」。
- 禁止同一判断/同一比喻在全文换措辞复读（用户感知为「出现大量两次」）。
- 先写清事实（谁做了什么、结果如何），再写态度；态度必须嵌在完整中文句里，禁止写作课口令入文。

### 句子与动词（硬）
- 一句一事；单句尽量 ≤36 字；每段 ≤3 句。
- 动词必须与主语搭配成立：人「押注/决定/宣布」，不能「押在那张泛黄的…」半截；局势「趋紧/缓解」，不能硬套「抛/甩/砸」等花哨动词。
- 读不通就删：半截比喻、喻体对不上、定语过长导致动词悬空——整句重写或删掉，宁平实勿花哨。

### 中文成稿黑名单（出现即失败，整句删除重写）
- 写作课口令：「所以先抛立场」「先抛观点」「先给态度」「观点先行」「先立住判断」「把立场甩出来」。
- AI 套话：「值得注意的是」「不难发现」「换句话说」「综上所述」「在某种程度上」「需要指出的是」「这意味着什么呢」。
- 半截/生造比喻：「押在那张泛…」「把宝押在一张…却说不清押什么」「时间窗口贴脸」「装进物理」。
- 欧化堆砌：「对于…来说」「进行了…」「做出了…」连续出现；三个以上抽象名词串成一句。
- 中英硬对仗、电报提纲扩写、大段外文粘贴。
- 管道字段泄漏：「variant」「【variant 1】」「voice_id」「seek_count」「key_passages」「styled_evidence」「style_profile」「tone_directives」；以及「版本一/二/三」「三则短讯」「三篇」平行合集结构。

### 幽默/个性（若 humor 高）
- 可读性 > 花样。全篇最多 2 处真正好笑且读得通的点评；其余写清楚即可。
- 禁止为幽默牺牲主谓宾完整；禁止把 tone_directives 原文粘进正文。

输出前默读一遍：若像机器翻译或写作教程，整段重写后再输出。`;
  }

  if (language === 'zh-TW') {
    return `## 當前成稿語言（已解析 · 違反即失敗）
language 碼 = zh-TW → 必須用**繁體台灣書面語**寫完整文章，禁止翻譯腔、寫作課口令、半截比喻、AI 套話。
一句一事；動詞與主語搭配成立；段與段須有銜接；同一判斷不換詞复讀。
禁止：「所以先拋立場」「值得注意的是」「不難發現」等套話入文。
輸出前默讀：像譯文或寫作教程就整段重寫。`;
  }

  if (language === 'en') {
    return `## Resolved manuscript language (hard)
language = en → Write natural contemporary English prose for readers, not Chinglish, not outline-expansion, not AI filler ("It is worth noting", "In conclusion", "This means that").
One idea per sentence; coherent paragraph transitions; no repeated judgments rephrased across sections.
Wit must stay grammatical; drop broken metaphors.`;
  }

  if (language === 'ja') {
    return `## 解決済みの原稿言語（必須）
language = ja → 自然な日本語の文章で書く。翻訳調・アウトライン直訳・AI定型句は禁止。
一文一義、段落の接続を明確に。壊れた比喩は削る。`;
  }

  return `## Resolved manuscript language (hard)
language = ${language} → Write the entire article natively in this language. No translationese, no writing-workshop meta instructions in the body, no broken metaphors.`;
}

/**
 * 供 text/transform/prose-deai 的 `${instruction}`：
 * 明确目标语言 + 四语去 AI 感任务说明（宿主只传 language 码即可）。
 */
export function buildProseDeaiInstruction(languageRaw: unknown): string {
  const language = normalizeManuscriptLanguage(languageRaw);
  const label = manuscriptLanguageLabel(language);

  return `Target language code: ${language}
Target language label: ${label}

Task: rewrite the Input Markdown to remove AI-sounding prose while keeping EVERY fact, number, name, date, source attribution, heading hierarchy, and section order.

Universal hard rules:
- Output polished Markdown only (no preamble, no code fence wrapping the whole doc).
- Do NOT invent facts; do NOT drop real evidence or source hints.
- Fix broken metaphors, verb mismatches, and workshop meta-commands that leaked into the body.
- Deduplicate: same judgment / same metaphor must not reappear rephrased.
- Keep persona/voice tone if present, but readability beats flashy wording.
- Preserve intentional humor only when the sentence is fully grammatical and native-sounding; otherwise flatten to clear prose.

Language-specific rules (apply ONLY the block matching Target language code):

### zh — 简体中文
- 写成中国大陆当代书面语；消灭翻译腔、提纲扩写、写作课口令。
- 删除并改写：「所以先抛立场」「先抛观点」「观点先行」「值得注意的是」「不难发现」「换句话说」「综上所述」「在某种程度上」。
- 半截比喻（如「押在那张泛…」）整句重写或删除；动词与主语必须搭配。
- 一句一事；段间要有因果/转折/递进；同一意思不说两遍。
- 全角中文标点。

### zh-TW — 繁體中文（台灣）
- 寫成台灣書面語；禁止翻譯腔與寫作課口令。
- 刪改：「所以先拋立場」「值得注意的是」「不難發現」「換句話說」「綜上所述」。
- 半截比喻與動詞搭配錯誤一律重寫；段與段要銜接；全形標點。

### en — English
- Natural contemporary editorial English; no translationese, no outline-expansion.
- Strip fillers: "It is worth noting that", "In conclusion", "This means that", "Needless to say", "At the end of the day", "Let's unpack", "Here's the thing", "In today's rapidly evolving…".
- No workshop stage directions in the body ("First, state the thesis…").
- One idea per sentence; coherent transitions; drop broken metaphors.

### ja — 日本語
- 自然な書き言葉。翻訳調・箇条書きの直訳拡張・AI定型を除去。
- 「なお」「つまり」「まとめると」「興味深いことに」「言うまでもなく」などの空虚なつなぎを削るか具体文に置換。
- 壊れた比喩・主語と動詞の不一致は書き直す。一文一義、段落の接続を明確に。`;
}
