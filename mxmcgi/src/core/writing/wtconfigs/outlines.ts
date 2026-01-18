/**
 * 大纲写作类型配置
 * 用于为 outlines 类型的写作任务提供系统提示词和格式要求
 */

import type { WritingTypeConfig } from './index';
import type { FormOptionsConfig, FieldMetadata } from '../../shared/formOptions';

export const outlinesConfig: WritingTypeConfig = {
  /**
   * 大纲写作规则和指导原则
   */
  rules: `你是一位专业的大纲写作助手，擅长为各类文章、报告、书籍等创作清晰、逻辑严密的大纲结构。

【大纲设计原则】
1. **层次清晰**：大纲应具有明确的层级结构，主标题、子标题、细节标题层次分明
2. **逻辑严密**：各章节之间逻辑关系清晰，前后呼应，形成完整的知识体系
3. **重点突出**：核心内容和关键观点应在大纲中明确体现
4. **结构完整**：确保大纲覆盖所有必要的内容模块，不遗漏关键部分
5. **可执行性**：大纲应具体到可以指导实际写作的程度

【大纲结构要求】
1. **一级标题**：文章的主要章节或核心主题，通常3-7个
2. **二级标题**：每个一级标题下的细分主题，支撑一级标题的论述
3. **三级标题**：进一步细化的内容点，提供具体的论述方向
4. **深度控制**：根据文章长度和复杂度，合理控制大纲层级深度

【大纲生成技巧】
1. 从整体到局部：先确定文章的整体框架，再细化各部分内容
2. 使用关键词：每个标题应包含核心关键词，便于理解内容方向
3. 保持平衡：各章节的篇幅和重要性应相对平衡
4. 预留扩展：大纲应具备一定的灵活性，允许在写作过程中微调

【字数分配原则】
1. 根据 applyto 类型确定内容结构特点（如 articles 需要详细论述，lyrics 需要简洁有力）
2. 核心章节（如正文主体）应分配更多字数
3. 次要章节（如引言、结尾）分配相对较少字数
4. 根据节点层级和重要性进行差异化分配，而非平均分配`,

  /**
   * 大纲结构要求
   */
  outputformat: `【大纲格式要求】

1. **格式规范**：
   - 使用标准的层级结构，一级标题用数字（1、2、3...）
   - 二级标题用数字加点（1.1、1.2、1.3...）
   - 三级标题用数字加双点（1.1.1、1.1.2...）
   - 每个标题应简洁明了，准确概括该部分内容

2. **结构要求**：
   - 必须包含：引言/开头、正文主体、结论/结尾
   - 正文主体应根据主题分为多个主要章节
   - 每个主要章节下应有2-5个子章节
   - 子章节可根据需要进一步细分

3. **内容要求**：
   - 每个标题应准确反映该部分要讨论的内容
   - 标题之间应有逻辑关联，形成完整的论述链条
   - 避免标题过于宽泛或过于具体
   - 确保大纲能够支撑完整的文章写作

4. **输出格式**：
   - 使用纯文本格式，层级通过缩进和编号体现
   - 每个标题占一行，层级通过缩进区分
   - 示例格式：
     1. 引言
       1.1 背景介绍
       1.2 问题提出
     2. 正文
       2.1 第一部分
         2.1.1 要点一
         2.1.2 要点二
       2.2 第二部分
     3. 结论

5. **字数分配要求**（如果提供了 total_textcount）：
   - 根据 applyto 类型的特点进行字数分配
   - 核心章节（正文主体）分配更多字数（通常占总字数的 60-70%）
   - 次要章节（引言、结尾）分配较少字数（通常占总字数的 10-20%）
   - 根据节点层级和重要性进行差异化分配
   - 一级标题节点通常比二级、三级节点分配更多字数
   - 确保总字数符合 total_textcount 要求`,

  /**
   * 获取大纲类型需要的参数列表
   */
  getParamsForType(): string[] {
    return ['maxDepth', 'expectedNodes', 'total_textcount', 'applyto'];
  },

  /**
   * 获取表单选项配置
   */
  getFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
    const isZh = language === 'zh';

    const outlinesFormOptionsZh: FormOptionsConfig = {
      // Select 类型字段
      maxDepth: [
        { value: '1', label: '一级标题', labelEn: 'Level 1' },
        { value: '2', label: '二级标题', labelEn: 'Level 2' },
        { value: '3', label: '三级标题', labelEn: 'Level 3' },
        { value: '4', label: '四级标题', labelEn: 'Level 4' },
      ],
      applyto: [
        { value: 'articles', label: '文章', labelEn: 'Articles' },
        { value: 'lyrics', label: '歌词', labelEn: 'Lyrics' },
        { value: 'media-post', label: '媒体帖子', labelEn: 'Media Post' },
        { value: 'storyboard-scripts', label: '分镜脚本', labelEn: 'Storyboard Scripts' },
        { value: 'reviews', label: '评论', labelEn: 'Reviews' },
        { value: 'resumes', label: '简历', labelEn: 'Resumes' },
        { value: 'voice-scripts', label: '口播稿', labelEn: 'Voice Scripts' },
      ],

      // 元数据
      _metadata: {
        expectedNodes: {
          type: 'number',
          label: '期望节点数',
          labelEn: 'Expected Nodes',
          placeholder: '例如：10',
          placeholderEn: 'e.g., 10',
          helpText: '大致控制大纲的篇幅（节点总数）',
          helpTextEn: 'Roughly control the outline length (total nodes)',
          min: 1,
          max: 100,
        },
        total_textcount: {
          type: 'number',
          label: '文字总量',
          labelEn: 'Total Text Count',
          placeholder: '例如：5000',
          placeholderEn: 'e.g., 5000',
          helpText: '文章的总字数，将根据 applyto 类型和节点重要性进行智能分布（重点章节分配更多字数）',
          helpTextEn: 'Total word count, will be intelligently distributed based on applyto type and node importance (key sections get more words)',
          min: 100,
          max: 100000,
        },
      },
    };

    if (language === 'en') {
      return {
        maxDepth: outlinesFormOptionsZh.maxDepth.map(opt => ({
          value: opt.value,
          label: opt.labelEn || opt.value,
        })),
        applyto: outlinesFormOptionsZh.applyto.map(opt => ({
          value: opt.value,
          label: opt.labelEn || opt.value,
        })),
        _metadata: {
          expectedNodes: {
            ...outlinesFormOptionsZh._metadata!.expectedNodes,
            label: outlinesFormOptionsZh._metadata!.expectedNodes.labelEn || 'Expected Nodes',
            placeholder: outlinesFormOptionsZh._metadata!.expectedNodes.placeholderEn,
            helpText: outlinesFormOptionsZh._metadata!.expectedNodes.helpTextEn,
          },
          total_textcount: {
            ...outlinesFormOptionsZh._metadata!.total_textcount,
            label: outlinesFormOptionsZh._metadata!.total_textcount.labelEn || 'Total Text Count',
            placeholder: outlinesFormOptionsZh._metadata!.total_textcount.placeholderEn,
            helpText: outlinesFormOptionsZh._metadata!.total_textcount.helpTextEn,
          },
        },
      };
    }

    return outlinesFormOptionsZh;
  },
}

