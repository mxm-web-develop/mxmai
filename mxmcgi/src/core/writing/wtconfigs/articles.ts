/**
 * 文章写作类型配置
 * 用于为 articles 类型的写作任务提供系统提示词和格式要求
 */

import type { WritingTypeConfig } from './index';
import type { FormOptionsConfig, FieldMetadata } from '../../shared/formOptions';

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
1. **正式程度**：根据文章类型和受众调整语言风格（学术、通俗、专业等）
2. **语调**：保持客观、专业，避免过于主观或情绪化的表达
3. **用词**：准确、恰当，避免重复和冗余
4. **句式**：长短句结合，避免过于复杂或过于简单的句式

【写作技巧】
1. 使用具体例子、数据、案例来支撑观点
2. 适当使用修辞手法（比喻、排比、设问等）增强表达效果
3. 保持段落长度适中（一般 3-5 句话）
4. 注意前后呼应，保持文章整体性

【注意事项】
- 避免使用过于绝对化的表述
- 尊重不同观点，保持客观中立
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
    return ['motivation', 'stance', 'tone', 'length', 'key_elements'];
  },

  /**
   * 获取表单选项配置
   */
  getFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
    const isZh = language === 'zh';

    const articlesFormOptionsZh: FormOptionsConfig = {
      // Select 类型字段
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

      // 元数据（为所有字段提供中文标签）
      _metadata: {
        motivation: {
          type: 'textarea',
          label: '写作动机',
          labelEn: 'Motivation',
          placeholder: '请描述写作的动机和目的...',
          placeholderEn: 'Describe the motivation and purpose...',
          helpText: '说明为什么要写这篇文章，想要达到什么目的',
          helpTextEn: 'Explain why you are writing this article',
        },
        stance: {
          type: 'select',
          label: '立场',
          labelEn: 'Stance',
          helpText: '选择文章的立场和态度',
          helpTextEn: 'Select the stance and attitude',
        },
        tone: {
          type: 'select',
          label: '语调',
          labelEn: 'Tone',
          helpText: '选择文章的语言风格',
          helpTextEn: 'Select the language style',
        },
        length: {
          type: 'select',
          label: '长度',
          labelEn: 'Length',
          helpText: '选择文章的长度',
          helpTextEn: 'Select the article length',
        },
        key_elements: {
          type: 'multi-select',
          label: '关键要素',
          labelEn: 'Key Elements',
          helpText: '选择文章需要包含的关键要素',
          helpTextEn: 'Select key elements to include',
        },
      },
    };

    if (language === 'en') {
      // 英文版本
      return {
        stance: articlesFormOptionsZh.stance.map(opt => ({
          value: opt.value,
          label: opt.labelEn || opt.value,
        })),
        tone: articlesFormOptionsZh.tone.map(opt => ({
          value: opt.value,
          label: opt.labelEn || opt.value,
        })),
        length: articlesFormOptionsZh.length.map(opt => ({
          value: opt.value,
          label: opt.labelEn || opt.value,
        })),
        key_elements: articlesFormOptionsZh.key_elements.map(opt => ({
          value: opt.value,
          label: opt.labelEn || opt.value,
        })),
        _metadata: {
          motivation: {
            ...articlesFormOptionsZh._metadata!.motivation,
            label: articlesFormOptionsZh._metadata!.motivation.labelEn || 'Motivation',
            placeholder: articlesFormOptionsZh._metadata!.motivation.placeholderEn,
            helpText: articlesFormOptionsZh._metadata!.motivation.helpTextEn,
          },
          key_elements: {
            ...articlesFormOptionsZh._metadata!.key_elements,
            label: articlesFormOptionsZh._metadata!.key_elements.labelEn || 'Key Elements',
            helpText: articlesFormOptionsZh._metadata!.key_elements.helpTextEn,
          },
        },
      };
    }

    return articlesFormOptionsZh;
  },
}