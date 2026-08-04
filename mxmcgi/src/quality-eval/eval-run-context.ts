/**
 * 评估运行上下文：把用户表单选项注入评分，避免「一套规则套死」。
 * 行业日报等业务的篇幅 / 主观分析 / 文风立场会改变语法、自然度等维度的合格标准。
 */

export type ArticleLengthKey = 'brief' | 'standard' | 'in_depth' | string;

export type EvalRunContext = {
  /** 用户选择的篇幅档 */
  articleLength?: ArticleLengthKey;
  /** 是否打开主观分析 */
  subjectiveAnalysis?: boolean;
  /** 分析立场（幽默/批判/乐观/客观…） */
  analysisStance?: string;
  language?: string;
  industry?: string;
  mainTopic?: string;
  /** 是否挂了语感文风包（有内容即 true） */
  hasWritingStylePack?: boolean;
  /** 其它值得展示给评委的键值（已过滤） */
  extraOptions?: Record<string, string>;
};

export type LengthBand = {
  key: string;
  label: string;
  minChars: number;
  maxChars: number;
};

/** 与 industry-daily 业务 prompt 对齐的篇幅带 */
export const INDUSTRY_DAILY_LENGTH_BANDS: Record<string, LengthBand> = {
  brief: { key: 'brief', label: '简短报道', minChars: 500, maxChars: 800 },
  standard: { key: 'standard', label: '适中报道', minChars: 800, maxChars: 1600 },
  in_depth: { key: 'in_depth', label: '深度报道', minChars: 1600, maxChars: 3500 },
};

const OPTION_KEYS = [
  'article_length',
  'subjective_analysis',
  'analysis_stance',
  'language',
  'industry',
  'industry_custom',
  'main_topic',
  'core_topic',
  'writing_summary',
  'style',
  'date_mode',
  'search_region',
] as const;

/** 粗算中文为主的正文字数（去 Markdown 标记） */
export function countManuscriptChars(markdown: string): number {
  const plain = String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~`>#|-]/g, '')
    .replace(/\s+/g, '');
  return plain.length;
}

export function resolveLengthBand(articleLength?: string): LengthBand | null {
  const key = String(articleLength || '')
    .trim()
    .toLowerCase();
  if (!key) return null;
  return INDUSTRY_DAILY_LENGTH_BANDS[key] || null;
}

/**
 * 篇幅契合分：落在带内满分；偏短/偏长按偏离比例扣分。
 * 证据偏薄时允许 brief 略低于下限（仍给中高分），避免误杀。
 */
export function scoreLengthFit(actualChars: number, band: LengthBand): {
  score: number;
  comment: string;
} {
  const { minChars, maxChars, label } = band;
  if (actualChars >= minChars && actualChars <= maxChars) {
    return {
      score: 92,
      comment: `篇幅档「${label}」目标约 ${minChars}–${maxChars} 字，实测约 ${actualChars} 字，落在区间内。`,
    };
  }
  if (actualChars < minChars) {
    const deficit = minChars - actualChars;
    const ratio = deficit / minChars;
    // brief 允许证据不足写短：短缺 <30% 仍给 ≥75
    const score =
      ratio <= 0.15 ? 82 : ratio <= 0.3 ? 72 : ratio <= 0.5 ? 58 : Math.max(30, 55 - Math.round(ratio * 40));
    return {
      score,
      comment: `篇幅档「${label}」目标约 ${minChars}–${maxChars} 字，实测约 ${actualChars} 字，偏短（缺 ${deficit}）。证据不足时可短写，但不应空心复读凑段。`,
    };
  }
  const excess = actualChars - maxChars;
  const ratio = excess / maxChars;
  const score =
    ratio <= 0.15 ? 84 : ratio <= 0.35 ? 70 : ratio <= 0.6 ? 55 : Math.max(28, 50 - Math.round(ratio * 35));
  return {
    score,
    comment: `篇幅档「${label}」目标约 ${minChars}–${maxChars} 字，实测约 ${actualChars} 字，偏长（超 ${excess}）。`,
  };
}

function asBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1 || v === '1') return true;
  if (v === 'false' || v === 0 || v === '0') return false;
  return undefined;
}

function pickParamsBag(raw: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const k of OPTION_KEYS) {
    if (raw[k] !== undefined && raw[k] !== null && raw[k] !== '') out[k] = raw[k];
  }
  // 合同 basic 区
  const basic = raw.basic;
  if (basic && typeof basic === 'object' && !Array.isArray(basic)) {
    for (const k of OPTION_KEYS) {
      const bv = (basic as Record<string, unknown>)[k];
      if (bv !== undefined && bv !== null && bv !== '' && out[k] === undefined) out[k] = bv;
    }
  }
  // camelCase 别名（偶发）
  if (out.article_length == null && raw.articleLength != null && raw.articleLength !== '') {
    out.article_length = raw.articleLength;
  }
  if (out.subjective_analysis == null && raw.subjectiveAnalysis != null && raw.subjectiveAnalysis !== '') {
    out.subjective_analysis = raw.subjectiveAnalysis;
  }
  if (out.analysis_stance == null && raw.analysisStance != null && raw.analysisStance !== '') {
    out.analysis_stance = raw.analysisStance;
  }
  if (out.main_topic == null && raw.mainTopic != null && raw.mainTopic !== '') {
    out.main_topic = raw.mainTopic;
  }
  return out;
}

/**
 * 从任务记录提取用户选项。
 * Task V2 常见落点：`requestParams.params.*`（input_data 包一层 params），
 * 以及 `contract.basic` / 顶层扁平字段 —— 必须都扫到，否则评委会误报「未提供 article_length」。
 */
export function extractEvalRunContextFromTask(task: Record<string, unknown>): EvalRunContext {
  const rp = (task.requestParams || task.request_params || {}) as Record<string, unknown>;
  const params = (task.params || {}) as Record<string, unknown>;
  const rpInner =
    rp.params && typeof rp.params === 'object' && !Array.isArray(rp.params)
      ? (rp.params as Record<string, unknown>)
      : {};
  const paramsInner =
    params.params && typeof params.params === 'object' && !Array.isArray(params.params)
      ? (params.params as Record<string, unknown>)
      : {};

  // 后写覆盖前写：越靠近业务表单的层优先级越高
  const merged: Record<string, unknown> = {
    ...pickParamsBag(rp),
    ...pickParamsBag(params),
    ...pickParamsBag(rpInner),
    ...pickParamsBag(paramsInner),
  };

  // state.contract.basic 兜底
  const state = (task.state || {}) as Record<string, unknown>;
  const contract = (state.contract ||
    params.contract ||
    rp.contract ||
    rpInner.contract ||
    {}) as Record<string, unknown>;
  Object.assign(merged, pickParamsBag(contract));
  if (contract.basic && typeof contract.basic === 'object') {
    Object.assign(merged, pickParamsBag(contract.basic as Record<string, unknown>));
  }

  // businessPipelineState / metadata 偶发残留
  const pipelineState =
    (rp.businessPipelineState as Record<string, unknown> | undefined) ||
    (params.businessPipelineState as Record<string, unknown> | undefined);
  if (pipelineState?.contract && typeof pipelineState.contract === 'object') {
    const pc = pipelineState.contract as Record<string, unknown>;
    Object.assign(merged, pickParamsBag(pc));
    if (pc.basic && typeof pc.basic === 'object') {
      Object.assign(merged, pickParamsBag(pc.basic as Record<string, unknown>));
    }
  }

  const writingSummary = String(merged.writing_summary || '').trim();
  const stance = String(merged.analysis_stance || merged.style || '').trim();

  const extraOptions: Record<string, string> = {};
  for (const [k, v] of Object.entries(merged)) {
    if (
      [
        'article_length',
        'subjective_analysis',
        'analysis_stance',
        'language',
        'industry',
        'main_topic',
        'writing_summary',
      ].includes(k)
    ) {
      continue;
    }
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      extraOptions[k] = String(v).slice(0, 200);
    }
  }

  return {
    articleLength: merged.article_length != null ? String(merged.article_length) : undefined,
    subjectiveAnalysis: asBool(merged.subjective_analysis),
    analysisStance: stance || undefined,
    language: merged.language != null ? String(merged.language) : undefined,
    industry: merged.industry != null ? String(merged.industry) : undefined,
    mainTopic: merged.main_topic != null ? String(merged.main_topic).slice(0, 120) : undefined,
    hasWritingStylePack: writingSummary.length > 0,
    extraOptions: Object.keys(extraOptions).length ? extraOptions : undefined,
  };
}

/** 生成注入评分 Prompt 的「用户选项与动态合格标准」 */
export function formatEvalRunContextForPrompt(
  ctx: EvalRunContext | null | undefined,
  manuscriptChars?: number
): string {
  if (!ctx) return '';

  const lines: string[] = ['## 本次用户选项（评分必须相对这些选项，禁止用单一死板标准）'];

  const band = resolveLengthBand(ctx.articleLength);
  if (band) {
    lines.push(
      `- 篇幅档 article_length=${band.key}（${band.label}）：目标约 ${band.minChars}–${band.maxChars} 字（去标记后估算）。`
    );
    if (typeof manuscriptChars === 'number') {
      const fit = scoreLengthFit(manuscriptChars, band);
      lines.push(`- 实测约 ${manuscriptChars} 字。篇幅初判：${fit.comment}`);
    }
  } else if (ctx.articleLength) {
    lines.push(`- 篇幅档 article_length=${ctx.articleLength}（无标准字数带时，按「与选项一致、不无故灌水/截断」评判）。`);
  } else {
    lines.push(
      '- 篇幅档：任务参数中未能解析到 article_length（实现问题，不是用户没选）。请勿臆造「用户未提供档位」；length_fit 以实测字数与常规 standard 区间对照，并在 comment 标明「档位缺失属参数解析」。'
    );
  }

  if (ctx.subjectiveAnalysis === false) {
    lines.push(
      '- 主观分析 subjective_analysis=关闭：正文应为客观报道；禁止空泛评论、研报腔小结、估值/确定性判断。自然度应偏「干净新闻」，不是「没有态度」。'
    );
    lines.push('- 语法：中性书面新闻语体；营销口语（吸金/暴涨连用）可轻扣，但不因缺少幽默而扣语法。');
  } else if (ctx.subjectiveAnalysis === true) {
    const stance = ctx.analysisStance || '（未指定立场）';
    lines.push(`- 主观分析 subjective_analysis=打开；分析立场 analysis_stance=${stance}。`);
    if (/幽默/.test(stance)) {
      lines.push(
        '- 【幽默立场】语法与自然度：允许诙谐比喻、观点先行、轻吐槽；这不算语法错误或空套话。仍要求句子可读、比喻通顺；禁止低俗/人身攻击/镜头口播指令。不要用「严肃通讯稿」标准去扣幽默稿。'
      );
    } else if (/批判/.test(stance)) {
      lines.push(
        '- 【批判立场】允许锋芒质疑与忧虑语气；不要用「必须完全中立」去扣分。仍禁止阴谋论胡编与人身攻击。'
      );
    } else if (/乐观/.test(stance)) {
      lines.push('- 【乐观立场】允许克制积极展望；禁止无依据亢奋口号。');
    } else if (/客观分析|客观/.test(stance)) {
      lines.push('- 【客观分析立场】允许有温度的平衡推论，但仍须先事实后解读。');
    } else {
      lines.push('- 分析打开时：允许立场内的主观句，但仍须先事实后解读；不要按「纯客观快讯」扣自然度。');
    }
  }

  if (ctx.hasWritingStylePack) {
    lines.push('- 用户挂了语感文风包：语气应吸收该包偏好；不要按默认公文腔扣「不正式」。');
  }
  if (ctx.industry) lines.push(`- 行业：${ctx.industry}`);
  if (ctx.mainTopic) lines.push(`- 主话题：${ctx.mainTopic}`);
  if (ctx.language) lines.push(`- 语言：${ctx.language}`);
  if (ctx.extraOptions) {
    for (const [k, v] of Object.entries(ctx.extraOptions)) {
      lines.push(`- ${k}=${v}`);
    }
  }

  lines.push('');
  lines.push(
    '动态规则：grammar / ai_feel（自然度）/ readability 必须按上面的文风与分析开关调整合格标准；length_fit / voice_fit（若有）分别评篇幅与文风选项契合度。'
  );
  return lines.join('\n');
}

/** 行业日报建议维度（可写入 rubric） */
export function industryDailyEvalDimensions(): Array<{
  key: string;
  label: string;
  description: string;
  weight: number;
  failBelow: number;
}> {
  return [
    {
      key: 'data_authenticity',
      label: '数据鉴真',
      description:
        '事实与数据是否可核验、无明显编造；数字须与证据口径/时间一致。评判时结合用户篇幅：brief 允许写短，但不能用假精确数字充场面。',
      weight: 1.5,
      failBelow: 60,
    },
    {
      key: 'source_grounding',
      label: '来源锚定',
      description:
        '关键事实是否有合理出处痕迹（如文内「据某某报道」）；不要求文末链接列表。结合用户选项：客观模式下点到为止即可。',
      weight: 1.3,
      failBelow: 55,
    },
    {
      key: 'voice_fit',
      label: '文风契合',
      description:
        '成稿语气是否符合用户选择的 subjective_analysis / analysis_stance / 语感文风。幽默开则应有诙谐，关则应客观；不得用反选项标准扣分。',
      weight: 1.2,
      failBelow: 60,
    },
    {
      key: 'length_fit',
      label: '篇幅契合',
      description:
        '正文字数是否落在用户 article_length 对应区间（brief≈500–800，standard≈800–1600，in_depth≈1600–3500）。证据不足时可略短，但应说明密度而非注水。',
      weight: 1.1,
      failBelow: 55,
    },
    {
      key: 'grammar',
      label: '语法',
      description:
        '用词语法是否规范；须按用户文风调整：幽默立场允许口语化修辞，客观模式要求中性书面。',
      weight: 1,
      failBelow: 60,
    },
    {
      key: 'readability',
      label: '可读性',
      description: '结构清晰、易于屏幕阅读；行业日报体裁符合；篇幅档影响信息密度预期。',
      weight: 1.2,
      failBelow: 60,
    },
    {
      key: 'ai_feel',
      label: '自然度',
      description:
        '是否过度模板化、空洞套话（越高越自然）。幽默稿的观点先行/比喻不算套话；客观稿的研报腔小结算套话。',
      weight: 1,
      failBelow: 60,
    },
  ];
}
