/**
 * 文章写作类型配置
 * 用于为 articles 类型的写作任务提供系统提示词和格式要求
 */

import type { WritingTypeConfig } from './index';
import type { FormOptionsConfig, FieldMetadata } from '../../shared/formOptions';
import type { OutlineType } from '../type';

type ArticlesOutlineType = Extract<OutlineType, 'tech-article' | 'story-novel' | 'academic-paper'> | undefined;

export function getArticlesParamsForSubtype(outlineType?: ArticlesOutlineType): string[] {
  if (outlineType === 'story-novel') {
    return [
      'genre',
      'pov',
      'writing_style',
      'pacing',
      'length',
      'setting',
      'main_characters',
      'conflict',
      'ending_type',
      'themes',
    ];
  }
  if (outlineType === 'academic-paper') {
    return [
      'discipline',
      'paper_type',
      'paper_structure',
      'research_question',
      'methodology',
      'data_sources',
      'citation_style',
      'keywords',
      'contribution',
      'length',
    ];
  }
  // 默认：科技文章（也兼容 outlineType 未指定的情况）
  return ['motivation', 'stance', 'tone', 'targetAudience', 'depth', 'length', 'key_elements'];
}

export function getArticlesFormOptions(
  language: 'zh' | 'en' = 'zh',
  outlineType?: ArticlesOutlineType
): FormOptionsConfig {
  const asOptionArray = (config: FormOptionsConfig, key: string) => {
    const v = config[key];
    return Array.isArray(v) ? v : [];
  };

  // 为 metadata-only 字段提供空数组 key，确保前端能渲染
  const ensureKeys = (config: FormOptionsConfig) => {
    const meta = config._metadata || {};
    Object.keys(meta).forEach((k) => {
      if (!(k in config)) {
        (config as any)[k] = [];
      }
    });
    return config;
  };

  // ===== tech-article（默认） =====
  const techZh: FormOptionsConfig = ensureKeys({
    motivation: [],
    stance: [
      { value: 'neutral', label: '中立客观', labelEn: 'Neutral' },
      { value: 'supportive', label: '支持赞同', labelEn: 'Supportive' },
      { value: 'critical', label: '批判质疑', labelEn: 'Critical' },
    ],
    tone: [
      { value: 'formal', label: '正式严谨', labelEn: 'Formal' },
      { value: 'casual', label: '轻松随意', labelEn: 'Casual' },
      { value: 'professional', label: '专业权威', labelEn: 'Professional' },
      { value: 'friendly', label: '友好亲切', labelEn: 'Friendly' },
    ],
    targetAudience: [
      { value: 'general', label: '大众读者', labelEn: 'General Audience' },
      { value: 'tech', label: '技术读者', labelEn: 'Tech Readers' },
      { value: 'product', label: '产品/业务读者', labelEn: 'Product/Business' },
      { value: 'investor', label: '投资/管理读者', labelEn: 'Investor/Management' },
    ],
    depth: [
      { value: 'overview', label: '科普概览', labelEn: 'Overview' },
      { value: 'practical', label: '实践导向', labelEn: 'Practical' },
      { value: 'deep', label: '深度解析', labelEn: 'Deep Dive' },
    ],
    length: [
      { value: 'short', label: '短篇（500-1000字）', labelEn: 'Short (500-1000 words)' },
      { value: 'medium', label: '中篇（1000-3000字）', labelEn: 'Medium (1000-3000 words)' },
      { value: 'long', label: '长篇（3000字以上）', labelEn: 'Long (3000+ words)' },
    ],
    key_elements: [
      { value: 'data', label: '数据支撑', labelEn: 'Data Support' },
      { value: 'examples', label: '案例说明', labelEn: 'Examples' },
      { value: 'quotes', label: '引用参考', labelEn: 'Quotes' },
      { value: 'analysis', label: '深度分析', labelEn: 'Deep Analysis' },
    ],
    _metadata: {
      motivation: {
        type: 'textarea',
        label: '写作动机',
        labelEn: 'Motivation',
        placeholder: '例如：面向谁？解决什么问题？希望读者得到什么？',
        placeholderEn: 'Audience, problem, and takeaway...',
        helpText: '说明为什么要写这篇科技文章以及想达到的效果',
        helpTextEn: 'Explain why you write this tech article and the goal',
      },
      stance: { type: 'select', label: '立场', labelEn: 'Stance', helpText: '文章态度', helpTextEn: 'Article stance' },
      tone: { type: 'select', label: '语调', labelEn: 'Tone', helpText: '语言风格', helpTextEn: 'Language style' },
      targetAudience: {
        type: 'select',
        label: '目标读者',
        labelEn: 'Target Audience',
        helpText: '选择文章主要面向的读者群体',
        helpTextEn: 'Select the target audience',
      },
      depth: {
        type: 'select',
        label: '深度',
        labelEn: 'Depth',
        helpText: '选择内容深度（科普/实践/深度）',
        helpTextEn: 'Select content depth',
      },
      length: { type: 'select', label: '长度', labelEn: 'Length', helpText: '选择篇幅', helpTextEn: 'Select length' },
      key_elements: {
        type: 'select',
        label: '关键要素',
        labelEn: 'Key Elements',
        helpText: '选择文章侧重点（数据/案例/引用/分析）',
        helpTextEn: 'Select key elements',
      },
    } satisfies Record<string, FieldMetadata>,
  });

  // ===== story-novel =====
  const storyZh: FormOptionsConfig = ensureKeys({
    genre: [
      { value: 'sci-fi', label: '科幻', labelEn: 'Sci-Fi' },
      { value: 'fantasy', label: '奇幻', labelEn: 'Fantasy' },
      { value: 'suspense', label: '悬疑', labelEn: 'Suspense' },
      { value: 'romance', label: '爱情', labelEn: 'Romance' },
      { value: 'realism', label: '现实主义', labelEn: 'Realism' },
    ],
    pov: [
      { value: 'first', label: '第一人称', labelEn: 'First-person' },
      { value: 'third-limited', label: '第三人称（有限视角）', labelEn: 'Third-person (limited)' },
      { value: 'third-omniscient', label: '第三人称（全知视角）', labelEn: 'Third-person (omniscient)' },
    ],
    writing_style: [
      { value: 'cinematic', label: '电影感（画面强）', labelEn: 'Cinematic' },
      { value: 'literary', label: '文学性（细腻）', labelEn: 'Literary' },
      { value: 'fast-paced', label: '爽文节奏（高密度）', labelEn: 'Fast-paced' },
      { value: 'dialogue-heavy', label: '对话驱动', labelEn: 'Dialogue-driven' },
    ],
    pacing: [
      { value: 'slow', label: '慢热铺垫', labelEn: 'Slow burn' },
      { value: 'balanced', label: '均衡推进', labelEn: 'Balanced' },
      { value: 'fast', label: '快节奏推进', labelEn: 'Fast' },
    ],
    ending_type: [
      { value: 'happy', label: '圆满结局', labelEn: 'Happy ending' },
      { value: 'tragic', label: '悲剧结局', labelEn: 'Tragic ending' },
      { value: 'open', label: '开放式结局', labelEn: 'Open ending' },
    ],
    length: [
      { value: 'short', label: '短篇（1k-3k字）', labelEn: 'Short (1k-3k)' },
      { value: 'medium', label: '中篇（3k-10k字）', labelEn: 'Medium (3k-10k)' },
      { value: 'long', label: '长篇（10k+字）', labelEn: 'Long (10k+)' },
    ],
    setting: [],
    main_characters: [],
    conflict: [],
    themes: [],
    _metadata: {
      genre: { type: 'select', label: '题材', labelEn: 'Genre', helpText: '选择故事题材', helpTextEn: 'Select genre' },
      pov: { type: 'select', label: '叙事视角', labelEn: 'POV', helpText: '选择叙事人称', helpTextEn: 'Select POV' },
      writing_style: {
        type: 'select',
        label: '文风',
        labelEn: 'Style',
        helpText: '选择故事语言与表现方式',
        helpTextEn: 'Select narrative style',
      },
      pacing: { type: 'select', label: '节奏', labelEn: 'Pacing', helpText: '选择故事推进节奏', helpTextEn: 'Select pacing' },
      length: { type: 'select', label: '目标篇幅', labelEn: 'Target Length', helpText: '选择目标篇幅', helpTextEn: 'Select target length' },
      setting: {
        type: 'textarea',
        label: '世界观/背景设定',
        labelEn: 'Setting',
        placeholder: '例如：时间、地点、规则、科技/魔法体系...',
        placeholderEn: 'Time, place, rules, systems...',
      },
      main_characters: {
        type: 'textarea',
        label: '主要人物',
        labelEn: 'Main Characters',
        placeholder: '例如：主角/反派/关键配角的目标与缺陷...',
        placeholderEn: 'Protagonist/antagonist/key roles...',
      },
      conflict: {
        type: 'textarea',
        label: '核心冲突',
        labelEn: 'Core Conflict',
        placeholder: '例如：人物冲突/价值冲突/外部危机...',
        placeholderEn: 'Internal/external conflict...',
      },
      ending_type: {
        type: 'select',
        label: '结局类型',
        labelEn: 'Ending Type',
        helpText: '选择结局倾向',
        helpTextEn: 'Select ending type',
      },
      themes: {
        type: 'text',
        label: '主题关键词',
        labelEn: 'Themes',
        placeholder: '例如：时间、代价、宿命、救赎...',
        placeholderEn: 'e.g. time, cost, fate, redemption...',
      },
    } satisfies Record<string, FieldMetadata>,
  });

  // ===== academic-paper =====
  const paperZh: FormOptionsConfig = ensureKeys({
    paper_type: [
      { value: 'survey', label: '综述/调研', labelEn: 'Survey' },
      { value: 'empirical', label: '实证研究', labelEn: 'Empirical' },
      { value: 'theoretical', label: '理论研究', labelEn: 'Theoretical' },
      { value: 'case-study', label: '案例研究', labelEn: 'Case study' },
    ],
    paper_structure: [
      { value: 'imrad', label: 'IMRaD（引言-方法-结果-讨论）', labelEn: 'IMRaD' },
      { value: 'classic', label: '摘要-引言-相关工作-方法-实验-结论', labelEn: 'Classic' },
    ],
    citation_style: [
      { value: 'gost', label: 'GB/T 7714', labelEn: 'GB/T 7714' },
      { value: 'apa', label: 'APA', labelEn: 'APA' },
      { value: 'ieee', label: 'IEEE', labelEn: 'IEEE' },
      { value: 'mla', label: 'MLA', labelEn: 'MLA' },
    ],
    length: [
      { value: 'short', label: '短文（2k-4k字）', labelEn: 'Short (2k-4k)' },
      { value: 'medium', label: '常规（4k-8k字）', labelEn: 'Medium (4k-8k)' },
      { value: 'long', label: '长文（8k+字）', labelEn: 'Long (8k+)' },
    ],
    discipline: [],
    research_question: [],
    methodology: [],
    data_sources: [],
    keywords: [],
    contribution: [],
    _metadata: {
      discipline: {
        type: 'text',
        label: '学科/领域',
        labelEn: 'Discipline',
        placeholder: '例如：计算机科学、社会学、教育学...',
        placeholderEn: 'e.g. CS, sociology, education...',
      },
      paper_type: { type: 'select', label: '论文类型', labelEn: 'Paper Type' },
      paper_structure: { type: 'select', label: '结构模板', labelEn: 'Structure' },
      research_question: {
        type: 'textarea',
        label: '研究问题/假设',
        labelEn: 'Research Question',
        placeholder: '明确你的研究问题、假设或目标...',
        placeholderEn: 'Define research question/hypothesis...',
      },
      methodology: {
        type: 'textarea',
        label: '方法与设计',
        labelEn: 'Methodology',
        placeholder: '例如：方法、样本、变量、实验/调研设计...',
        placeholderEn: 'Methods, samples, variables, design...',
      },
      data_sources: {
        type: 'textarea',
        label: '数据/材料来源',
        labelEn: 'Data Sources',
        placeholder: '例如：公开数据集、问卷、访谈、文献...',
        placeholderEn: 'Datasets, surveys, interviews, literature...',
      },
      citation_style: { type: 'select', label: '引用格式', labelEn: 'Citation Style' },
      keywords: {
        type: 'text',
        label: '关键词（用、分隔）',
        labelEn: 'Keywords',
        placeholder: '例如：时间操控、蝴蝶效应、因果推断...',
        placeholderEn: 'e.g. ...',
      },
      contribution: {
        type: 'textarea',
        label: '主要贡献/结论要点',
        labelEn: 'Contributions',
        placeholder: '写出你希望论文得出的关键结论或贡献点...',
        placeholderEn: 'Key contributions/conclusions...',
      },
      length: { type: 'select', label: '目标篇幅', labelEn: 'Target Length' },
    } satisfies Record<string, FieldMetadata>,
  });

  const zhConfig =
    outlineType === 'story-novel' ? storyZh : outlineType === 'academic-paper' ? paperZh : techZh;

  if (language === 'en') {
    const meta = zhConfig._metadata || {};
    const enMeta: Record<string, FieldMetadata> = {};
    Object.entries(meta).forEach(([k, m]) => {
      enMeta[k] = {
        ...m,
        label: m.labelEn || m.label,
        placeholder: m.placeholderEn || m.placeholder,
        helpText: m.helpTextEn || m.helpText,
      };
    });

    const enConfig: FormOptionsConfig = { _metadata: enMeta };
    Object.keys(zhConfig)
      .filter((k) => k !== '_metadata')
      .forEach((k) => {
        const opts = asOptionArray(zhConfig, k);
        (enConfig as any)[k] = opts.map((opt: any) => ({
          value: opt.value,
          label: opt.labelEn || opt.label || opt.value,
        }));
      });

    return ensureKeys(enConfig);
  }

  return zhConfig;
}

export const articlesConfig: WritingTypeConfig = {
  /**
   * 文章写作规则和指导原则
   * 这些规则会被整合到生成 prompt 中，指导 AI 生成高质量的文章
   */
  rules: `你是一位专业的文章写作助手，擅长创作各类高质量文章。请遵循以下写作原则：

【内容质量要求】
1. **准确性**：确保所有事实、数据、引用准确无误，避免虚假信息
2. **逻辑性**：文章结构清晰，论点明确，论证充分，逻辑严密
3. **可读性**：语言流畅自然，表达清晰易懂，避免晦涩难懂的词汇
4. **原创性**：避免抄袭，确保内容具有原创性和独特性
5. **深度**：对主题进行深入分析，提供有价值的见解和思考

【文章结构要求】
1. **标题**：简洁有力，准确概括文章主题，具有吸引力
2. **开头**：引人入胜，能够快速抓住读者注意力，明确文章主题
3. **正文**：
   - 段落分明，每段聚焦一个核心观点
   - 使用过渡句连接段落，保持文章连贯性
   - 合理使用小标题组织内容，便于阅读
4. **结尾**：总结全文要点，可以提出思考或展望，给读者留下深刻印象

【语言风格要求】
1. **正式程度**：根据细分类型与受众调整语言风格（科技、故事、学术等）
2. **语调**：根据细分类型选择合适的表达方式（故事可更具画面感与情绪张力；学术应规范严谨）
3. **用词**：准确、恰当，避免重复和冗余
4. **句式**：长短句结合，避免过于复杂或过于简单的句式

【写作技巧】
1. 使用具体例子、数据、案例来支撑观点
2. 适当使用修辞手法（比喻、排比、设问等）增强表达效果
3. 保持段落长度适中（一般 3-5 句话）
4. 注意前后呼应，保持文章整体性

【注意事项】
- 避免使用过于绝对化的表述
- 尊重不同观点，避免偏见；故事类可更注重情绪与体验
- 确保内容符合相关法律法规和道德规范
- 如涉及专业知识，确保准确性和权威性`,

  /**
   * 文章结构要求
   * 定义文章的标准结构和组织方式
   */
  outputformat: `【文章结构要求】

1. **整体结构**：
   - 文章应包含：标题、开头、正文、结尾四个基本部分
   - 结构清晰，层次分明，逻辑严密
   - 各部分之间过渡自然，衔接流畅

2. **标题设计**：
   - 主标题：简洁有力，准确概括文章核心主题，具有吸引力和概括性
   - 副标题（可选）：补充说明或细化主标题，提供更多信息
   - 小标题：用于组织正文内容，帮助读者快速理解文章结构

3. **开头部分**：
   - 开门见山，快速引入主题
   - 可以使用：问题引入、故事引入、数据引入、背景介绍等方式
   - 明确文章要讨论的核心问题或观点
   - 吸引读者继续阅读

4. **正文部分**：
   - **段落组织**：
     * 每个段落聚焦一个核心观点或主题
     * 段落之间逻辑清晰，使用过渡句连接
     * 段落长度适中（一般 3-5 句话），避免过长或过短
   
   - **内容展开**：
     * 按照逻辑顺序组织内容（时间顺序、空间顺序、重要性顺序、因果关系等）
     * 使用总分总、并列、递进等结构方式
     * 每个观点都要有充分的论证和支撑
   
   - **论证方式**：
     * 使用事实、数据、案例、引用等支撑观点
     * 理论分析与实例说明相结合
     * 多角度分析问题，展现思考深度

5. **结尾部分**：
   - 总结全文核心观点和主要结论
   - 可以提出思考、展望或行动建议
   - 呼应开头，形成完整的文章闭环
   - 给读者留下深刻印象或启发

6. **结构类型**（根据文章主题选择）：
   - **总分总结构**：开头总述 → 分点论述 → 结尾总结
   - **递进结构**：由浅入深，层层递进
   - **并列结构**：多个方面并列论述
   - **对比结构**：通过对比突出观点
   - **问题-分析-解决**：提出问题 → 分析原因 → 提出解决方案

7. **结构要求**：
   - 保持结构完整，不缺少关键部分
   - 各部分比例协调，重点突出
   - 结构服务于内容，确保逻辑清晰
   - 根据文章类型和长度灵活调整结构`,

  /**
   * 获取文章类型需要的参数列表
   */
  getParamsForType(): string[] {
    // 默认返回科技文章参数；细分类型由外层根据 outline_type 选择
    return getArticlesParamsForSubtype(undefined);
  },
}