/**
 * 大纲结构类型配置
 * 定义8种大纲结构类型的配置、匹配规则和 prompt 模板
 */

import type { OutlineType, OutlineStructureType, OutlineApplyTo } from './type';

/**
 * 结构类型配置接口
 */
export interface StructureTypeConfig {
  /** 结构类型标识 */
  type: OutlineStructureType;
  /** 结构类型名称（中文） */
  nameZh: string;
  /** 结构类型名称（英文） */
  nameEn: string;
  /** 结构类型描述（中文） */
  descriptionZh: string;
  /** 结构类型描述（英文） */
  descriptionEn: string;
  /** Prompt 模板片段（中文） */
  promptTemplateZh: string;
  /** Prompt 模板片段（英文） */
  promptTemplateEn: string;
}

/**
 * 检查结构类型是否可用
 * @param applyto 应用类型
 * @param outlineType 细分类型（可选）
 * @param structureType 结构类型
 * @returns 是否可用
 */
export function isStructureTypeAvailable(
  applyto: OutlineApplyTo,
  outlineType: OutlineType | undefined,
  structureType: OutlineStructureType
): boolean {
  // 三段式始终可用（fallback）
  if (structureType === 'three-act') {
    return true;
  }

  // 如果没有细分类型，只有三段式可用
  if (!outlineType) {
    return structureType === 'three-act';
  }

  // AIDA: 仅当 applyto='voice-scripts' && outline_type='sales-voice'
  if (structureType === 'aida') {
    return applyto === 'voice-scripts' && outlineType === 'sales-voice';
  }

  // PAS: 仅当 applyto='voice-scripts' && outline_type='sales-voice'
  if (structureType === 'pas') {
    return applyto === 'voice-scripts' && outlineType === 'sales-voice';
  }

  // BAB: applyto='voice-scripts' && (outline_type='sales-voice' || outline_type='emotional-story-voice')
  if (structureType === 'bab') {
    return (
      applyto === 'voice-scripts' &&
      (outlineType === 'sales-voice' || outlineType === 'emotional-story-voice')
    );
  }

  // 英雄之旅: 
  // - applyto='articles' && outline_type='story-novel'
  // - applyto='voice-scripts' && outline_type='emotional-story-voice'
  // - applyto='storyboard-scripts' && 电影/动画/游戏CG 等叙事型分镜
  if (structureType === 'hero-journey') {
    if (applyto === 'articles' && outlineType === 'story-novel') {
      return true;
    }
    if (applyto === 'voice-scripts' && outlineType === 'emotional-story-voice') {
      return true;
    }
    const heroJourneyStoryboard: OutlineType[] = [
      'movie-storyboard',
      'animation-storyboard',
      'game-cg-storyboard',
    ];
    if (applyto === 'storyboard-scripts' && outlineType && heroJourneyStoryboard.includes(outlineType)) {
      return true;
    }
    return false;
  }

  // IMRaD: applyto='articles' && outline_type='academic-paper'
  if (structureType === 'imrad') {
    return applyto === 'articles' && outlineType === 'academic-paper';
  }

  // 钩子-干货-CTA:
  // - applyto='voice-scripts' && outline_type='knowledge-sharing-voice'
  // - applyto='storyboard-scripts' && 短视频/广告等转化导向分镜
  if (structureType === 'hook-value-cta') {
    if (applyto === 'voice-scripts' && outlineType === 'knowledge-sharing-voice') {
      return true;
    }
    const hookValueCtaStoryboard: OutlineType[] = [
      'short-video-storyboard',
      'commercial-storyboard',
    ];
    if (applyto === 'storyboard-scripts' && outlineType && hookValueCtaStoryboard.includes(outlineType)) {
      return true;
    }
    return false;
  }

  // 幕式分镜: applyto='storyboard-scripts' && 电影/动画/游戏CG 等幕式叙事分镜
  if (structureType === 'act-scene-storyboard') {
    const actSceneStoryboard: OutlineType[] = [
      'movie-storyboard',
      'animation-storyboard',
      'game-cg-storyboard',
    ];
    return (
      applyto === 'storyboard-scripts' &&
      !!outlineType &&
      actSceneStoryboard.includes(outlineType)
    );
  }

  return false;
}

/**
 * 获取结构类型的 prompt 模板
 * @param structureType 结构类型
 * @param language 语言
 * @returns prompt 模板片段
 */
export function getStructurePromptTemplate(
  structureType: OutlineStructureType,
  language: import('@mxmai/mxmdata').AppLocale | 'zh' | 'en' = 'zh'
): string {
  const config = STRUCTURE_TYPE_CONFIGS[structureType];
  if (!config) {
    return '';
  }
  // 仅有 zh/en 模板：繁中跟简中，日语跟英文
  const useZh = language === 'zh' || language === 'zh-TW';
  return useZh ? config.promptTemplateZh : config.promptTemplateEn;
}

/**
 * 获取所有可用的结构类型（根据 applyto 和 outlineType 过滤）
 * @param applyto 应用类型
 * @param outlineType 细分类型（可选）
 * @returns 可用的结构类型列表
 */
export function getAvailableStructureTypes(
  applyto: OutlineApplyTo,
  outlineType?: OutlineType
): OutlineStructureType[] {
  const allTypes: OutlineStructureType[] = [
    'three-act',
    'aida',
    'pas',
    'bab',
    'hero-journey',
    'imrad',
    'hook-value-cta',
    'act-scene-storyboard',
  ];

  return allTypes.filter((type) => isStructureTypeAvailable(applyto, outlineType, type));
}

/**
 * 结构类型配置表
 */
export const STRUCTURE_TYPE_CONFIGS: Record<OutlineStructureType, StructureTypeConfig> = {
  'three-act': {
    type: 'three-act',
    nameZh: '三段式',
    nameEn: 'Three-Act Structure',
    descriptionZh: '最经典、最通用的叙事/内容框架，将内容分为开头、中间、结尾三部分，确保逻辑流畅、节奏感强。',
    descriptionEn: 'The most classic and universal narrative/content framework, dividing content into beginning, middle, and end, ensuring logical flow and strong rhythm.',
    promptTemplateZh: `【大纲结构要求：三段式（Three-Act Structure）】

请按照三段式结构生成大纲：

**第一段：开头（Setup / Hook）**
- 吸引注意力、介绍背景、抛出问题或钩子
- 建立故事/内容的起点和基本情境

**第二段：中间（Confrontation / Body）**
- 展开核心内容、冲突/论点/干货、层层递进
- 这是内容的主体部分，需要详细展开

**第三段：结尾（Resolution / Close）**
- 总结要点、升华主题、呼吁行动（CTA）或情感收尾
- 给出结论或解决方案，留下深刻印象

请确保三个部分逻辑连贯，形成完整的叙事链条。`,
    promptTemplateEn: `【Outline Structure Requirement: Three-Act Structure】

Please generate an outline following the three-act structure:

**Act 1: Beginning (Setup / Hook)**
- Attract attention, introduce background, raise questions or hooks
- Establish the starting point and basic situation of the story/content

**Act 2: Middle (Confrontation / Body)**
- Expand core content, conflicts/arguments/key points, progressive layers
- This is the main body of the content, requiring detailed expansion

**Act 3: End (Resolution / Close)**
- Summarize key points, elevate the theme, call for action (CTA) or emotional conclusion
- Provide conclusions or solutions, leaving a deep impression

Ensure the three parts are logically coherent, forming a complete narrative chain.`,
  },

  aida: {
    type: 'aida',
    nameZh: 'AIDA',
    nameEn: 'AIDA',
    descriptionZh: '经典营销/广告框架：Attention（注意）- Interest（兴趣）- Desire（欲望）- Action（行动）',
    descriptionEn: 'Classic marketing/advertising framework: Attention - Interest - Desire - Action',
    promptTemplateZh: `【大纲结构要求：AIDA 结构】

请按照 AIDA 结构生成大纲：

**A - Attention（注意）**
- 用标题、惊人事实、问题或视觉冲击抓住注意力
- 在开头3-10秒内吸引目标受众

**I - Interest（兴趣）**
- 通过细节、故事、好处激发持续兴趣
- 让受众产生"这对我有用"的认知

**D - Desire（欲望）**
- 放大产品/方案的价值、情感益处、社会证明
- 制造强烈渴望，让受众想要拥有或体验

**A - Action（行动）**
- 明确呼吁行动（买、关注、点击、注册等）
- 常带紧迫感，降低行动门槛

请确保四个阶段逻辑递进，最终导向明确的行动号召。`,
    promptTemplateEn: `【Outline Structure Requirement: AIDA Structure】

Please generate an outline following the AIDA structure:

**A - Attention**
- Capture attention with headlines, surprising facts, questions, or visual impact
- Attract target audience within the first 3-10 seconds

**I - Interest**
- Stimulate sustained interest through details, stories, benefits
- Make the audience realize "this is useful for me"

**D - Desire**
- Amplify the value, emotional benefits, social proof of the product/solution
- Create strong desire, making the audience want to own or experience it

**A - Action**
- Clearly call for action (buy, follow, click, register, etc.)
- Often with urgency, lowering the barrier to action

Ensure the four stages progress logically, ultimately leading to a clear call to action.`,
  },

  pas: {
    type: 'pas',
    nameZh: 'PAS',
    nameEn: 'PAS',
    descriptionZh: '现代文案/直邮营销常用公式：Problem（问题）- Agitate（激化/放大）- Solution（解决方案）',
    descriptionEn: 'Common formula for modern copywriting/direct mail marketing: Problem - Agitate - Solution',
    promptTemplateZh: `【大纲结构要求：PAS 结构】

请按照 PAS 结构生成大纲：

**P - Problem（问题）**
- 直接点出读者面临的痛点、困扰、问题
- 让人产生共鸣，认识到问题的严重性

**A - Agitate（激化/放大）**
- 深入挖掘痛点后果、情绪放大
- 描述为什么越来越糟、越描越黑
- 让读者感受到问题的紧迫性

**S - Solution（解决方案）**
- 自然引入你的产品/方法作为解药
- 强调轻松解决、立竿见影
- 展示解决方案的有效性和优势

请确保问题→激化→解决方案的逻辑链条清晰有力。`,
    promptTemplateEn: `【Outline Structure Requirement: PAS Structure】

Please generate an outline following the PAS structure:

**P - Problem**
- Directly point out the pain points, troubles, and problems faced by readers
- Create resonance and make people realize the severity of the problem

**A - Agitate**
- Deeply explore the consequences of pain points, amplify emotions
- Describe why things are getting worse
- Make readers feel the urgency of the problem

**S - Solution**
- Naturally introduce your product/method as the cure
- Emphasize easy solution and immediate results
- Demonstrate the effectiveness and advantages of the solution

Ensure the logical chain from problem → agitate → solution is clear and powerful.`,
  },

  bab: {
    type: 'bab',
    nameZh: 'BAB',
    nameEn: 'BAB',
    descriptionZh: '前后对比型文案公式：Before（之前）- After（之后）- Bridge（桥梁）',
    descriptionEn: 'Before-and-after copywriting formula: Before - After - Bridge',
    promptTemplateZh: `【大纲结构要求：BAB 结构】

请按照 BAB 结构生成大纲：

**B - Before（之前）**
- 描绘读者当前糟糕/普通/痛苦的状态（现状）
- 详细描述问题带来的困扰和影响

**A - After（之后）**
- 展示使用后美好、理想、转变后的未来画面（憧憬）
- 描绘理想状态，激发向往之情

**B - Bridge（桥梁）**
- 说明你的产品/服务就是连接"Before → After"的关键桥梁
- 解释为什么有效，如何实现转变
- 展示从现状到理想的路径

请确保前后对比鲜明，桥梁作用清晰。`,
    promptTemplateEn: `【Outline Structure Requirement: BAB Structure】

Please generate an outline following the BAB structure:

**B - Before**
- Depict the reader's current bad/ordinary/painful state (current situation)
- Describe in detail the troubles and impacts caused by problems

**A - After**
- Show the beautiful, ideal, transformed future picture after use (aspiration)
- Depict the ideal state, inspiring longing

**B - Bridge**
- Explain that your product/service is the key bridge connecting "Before → After"
- Explain why it works and how to achieve transformation
- Show the path from current state to ideal

Ensure clear before-and-after contrast and clear bridge role.`,
  },

  'hero-journey': {
    type: 'hero-journey',
    nameZh: '英雄之旅',
    nameEn: "Hero's Journey",
    descriptionZh: '经典英雄弧线：普通世界 → 冒险 → 转变 → 回归',
    descriptionEn: "Classic hero's arc: Ordinary World → Adventure → Transformation → Return",
    promptTemplateZh: `【大纲结构要求：英雄之旅（Hero's Journey）】

请按照英雄之旅结构生成大纲：

**第一阶段：普通世界（Ordinary World）**
- 主角日常、平凡或不满现状
- 建立初始状态和角色设定

**第二阶段：召唤冒险（Call to Adventure）**
- 出现问题/机会/挑战，打破平静
- 引入改变的动力

**第三阶段：拒绝召唤/遇到导师（Refusal / Mentor）**
- 犹豫、恐惧或获指导
- 展现内心的冲突和成长准备

**第四阶段：跨越门槛（Crossing Threshold）**
- 正式踏上旅程
- 进入新的世界或状态

**第五阶段：考验/高潮（Trials / Ordeal）**
- 面对重重困难、最大危机
- 展现成长和突破

**第六阶段：获得奖励（Reward）**
- 战胜、成长、获得宝物/顿悟
- 实现目标或获得收获

**第七阶段：回归（Return）**
- 带着改变回家，世界不同
- 完成转变，影响他人

请确保英雄弧线完整，展现完整的成长历程。`,
    promptTemplateEn: `【Outline Structure Requirement: Hero's Journey】

Please generate an outline following the Hero's Journey structure:

**Stage 1: Ordinary World**
- Protagonist's daily life, ordinary or dissatisfied with current state
- Establish initial state and character setting

**Stage 2: Call to Adventure**
- Problems/opportunities/challenges arise, breaking the calm
- Introduce the motivation for change

**Stage 3: Refusal / Mentor**
- Hesitation, fear, or receiving guidance
- Show inner conflict and preparation for growth

**Stage 4: Crossing Threshold**
- Formally embark on the journey
- Enter a new world or state

**Stage 5: Trials / Ordeal**
- Face numerous difficulties, the greatest crisis
- Show growth and breakthrough

**Stage 6: Reward**
- Victory, growth, obtaining treasure/enlightenment
- Achieve goals or gain rewards

**Stage 7: Return**
- Return home with changes, the world is different
- Complete transformation, influence others

Ensure the hero's arc is complete, showing the full growth journey.`,
  },

  imrad: {
    type: 'imrad',
    nameZh: 'IMRaD',
    nameEn: 'IMRaD',
    descriptionZh: '科学论文标准结构：Introduction（引言）- Methods（方法）- Results（结果）- Discussion（讨论）',
    descriptionEn: 'Standard scientific paper structure: Introduction - Methods - Results - Discussion',
    promptTemplateZh: `【大纲结构要求：IMRaD 结构】

请按照 IMRaD 结构生成大纲：

**I - Introduction（引言）**
- 背景、研究问题、文献综述
- 研究目的/假设
- 研究意义和重要性

**M - Methods（方法）**
- 实验/研究设计、材料、步骤
- 数据收集与分析方法（可重复）
- 研究工具和技术路线

**R - Results（结果）**
- 客观呈现数据、图表、发现（不解释）
- 按照逻辑顺序组织结果
- 突出关键发现

**D - Discussion（讨论）**
- 解释结果、与假设/文献对比
- 意义、局限、未来方向
- 总结和展望

请确保结构严谨，符合学术规范。`,
    promptTemplateEn: `【Outline Structure Requirement: IMRaD Structure】

Please generate an outline following the IMRaD structure:

**I - Introduction**
- Background, research questions, literature review
- Research objectives/hypotheses
- Research significance and importance

**M - Methods**
- Experimental/research design, materials, procedures
- Data collection and analysis methods (reproducible)
- Research tools and technical routes

**R - Results**
- Objectively present data, charts, findings (no interpretation)
- Organize results in logical order
- Highlight key findings

**D - Discussion**
- Interpret results, compare with hypotheses/literature
- Significance, limitations, future directions
- Summary and prospects

Ensure rigorous structure, conforming to academic standards.`,
  },

  'hook-value-cta': {
    type: 'hook-value-cta',
    nameZh: '钩子-干货-CTA',
    nameEn: 'Hook-Value-CTA',
    descriptionZh: '短视频/知识分享平台最常见的极简高效结构：快速吸睛+高密度价值+转化',
    descriptionEn: 'The most common minimalist and efficient structure for short video/knowledge sharing platforms: quick attention-grabbing + high-density value + conversion',
    promptTemplateZh: `【大纲结构要求：钩子-干货-CTA 结构】

请按照钩子-干货-CTA 结构生成大纲：

**第一部分：钩子（Hook）**
- 前3-10秒用问题、反常识、惊人数据、故事开头抓住人
- 必须立即吸引注意力，让人想继续看下去

**第二部分：干货（Value / Core Content）**
- 快速抛出1-5点实用知识、技巧、列表、步骤
- 高密度价值输出，确保每一点都有用
- 逻辑清晰，易于理解和记忆

**第三部分：CTA（Call to Action）**
- 结尾引导行动（点赞、关注、评论、链接下单、三连等）
- 明确告诉观众下一步该做什么
- 降低行动门槛，提高转化率

请确保结构紧凑，信息密度高，转化导向明确。`,
    promptTemplateEn: `【Outline Structure Requirement: Hook-Value-CTA Structure】

Please generate an outline following the Hook-Value-CTA structure:

**Part 1: Hook**
- Use questions, counter-intuitive facts, surprising data, or stories in the first 3-10 seconds to grab attention
- Must immediately attract attention and make people want to continue watching

**Part 2: Value / Core Content**
- Quickly present 1-5 practical knowledge points, tips, lists, or steps
- High-density value output, ensuring each point is useful
- Clear logic, easy to understand and remember

**Part 3: CTA (Call to Action)**
- Guide action at the end (like, follow, comment, link to purchase, triple action, etc.)
- Clearly tell the audience what to do next
- Lower the barrier to action, improve conversion rate

Ensure compact structure, high information density, and clear conversion orientation.`,
  },

  'act-scene-storyboard': {
    type: 'act-scene-storyboard',
    nameZh: '幕式分镜',
    nameEn: 'Act/Scene-based Storyboard',
    descriptionZh: '以"幕"（Act）或"场景"（Scene）为单位划分的视觉叙事框架，常用于影视/视频脚本',
    descriptionEn: 'Visual narrative framework divided by "Act" or "Scene" units, commonly used in film/video scripts',
    promptTemplateZh: `【大纲结构要求：幕式分镜（Act/Scene-based Storyboard）】

请按照幕式分镜结构生成大纲：

**第一幕（Act 1）：Setup（设定）**
- 介绍人物、世界观、初始冲突
- 建立故事背景和基本情境
- 每个场景描述镜头、动作、对白、转场、时长

**第二幕（Act 2）：Confrontation（冲突）**
- 冲突升级、考验、发展高潮
- 展现主要矛盾和挑战
- 每个场景描述镜头、动作、对白、转场、时长

**第三幕（Act 3）：Resolution（解决）**
- 高潮对决、结局、收尾
- 解决冲突，完成故事
- 每个场景描述镜头、动作、对白、转场、时长

请确保每个幕/场景都包含：镜头描述、动作、对白、转场、时长等要素。`,
    promptTemplateEn: `【Outline Structure Requirement: Act/Scene-based Storyboard】

Please generate an outline following the Act/Scene-based Storyboard structure:

**Act 1: Setup**
- Introduce characters, world view, initial conflict
- Establish story background and basic situation
- Each scene describes shots, actions, dialogue, transitions, duration

**Act 2: Confrontation**
- Escalating conflict, trials, developing climax
- Show main conflicts and challenges
- Each scene describes shots, actions, dialogue, transitions, duration

**Act 3: Resolution**
- Climactic confrontation, ending, conclusion
- Resolve conflicts, complete the story
- Each scene describes shots, actions, dialogue, transitions, duration

Ensure each act/scene includes: shot description, actions, dialogue, transitions, duration, and other elements.`,
  },
};
