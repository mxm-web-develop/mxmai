/**
 * 简历写作类型配置
 * 用于为 resumes 类型的写作任务提供系统提示词和格式要求
 */

import type { WritingTypeConfig } from './index';
import type { FormOptionsConfig, FieldMetadata } from '../../shared/formOptions';

export const resumesConfig: WritingTypeConfig = {
  /**
   * 简历写作规则和指导原则
   */
  rules: `你是一位专业的简历写作助手，擅长创作各类高质量简历，帮助求职者突出优势、展现价值。

【简历写作原则】
1. **真实性**：确保所有信息真实准确，不夸大或虚构
2. **针对性**：根据目标职位调整简历内容，突出相关经验和技能
3. **简洁性**：语言简洁有力，避免冗余，重点突出
4. **专业性**：使用专业术语，展现行业理解
5. **量化成果**：使用具体数据和成果展示工作能力

【简历结构要求】
1. **个人信息**：姓名、联系方式、地址等基本信息
2. **职业目标/个人简介**：简洁概括职业方向和核心优势
3. **工作经历**：按时间倒序，包含公司、职位、时间、职责和成果
4. **教育背景**：学校、专业、学历、时间
5. **技能专长**：专业技能、语言能力、证书等
6. **项目经验**（可选）：重要项目经历和成果
7. **其他信息**（可选）：获奖情况、兴趣爱好等

【写作技巧】
1. 使用动词开头描述工作职责（如：负责、管理、开发、优化）
2. 量化工作成果（如：提升30%效率、管理10人团队）
3. 突出与目标职位相关的经验和技能
4. 保持格式统一，便于阅读
5. 避免使用过于主观的形容词`,

  /**
   * 简历结构要求
   */
  outputformat: `【简历格式要求】

1. **整体格式**：
   - 使用清晰的标题和分段
   - 保持一致的字体和格式
   - 合理使用粗体、斜体突出重点
   - 确保排版整洁，易于阅读

2. **内容组织**：
   - 个人信息：姓名、电话、邮箱、地址
   - 职业目标：1-2句话概括职业方向
   - 工作经历：公司名 | 职位 | 时间范围
     - 职责描述（使用动词开头）
     - 工作成果（量化数据）
   - 教育背景：学校 | 专业 | 学历 | 时间
   - 技能专长：分类列出（如：技术技能、语言能力、证书）

3. **内容要求**：
   - 工作经历按时间倒序排列
   - 每个职位包含3-5个职责点
   - 突出与目标职位相关的经验
   - 使用专业术语，展现行业理解

4. **长度控制**：
   - 应届生或初级：1页
   - 中级：1-2页
   - 高级或管理岗：2-3页
   - 保持内容精炼，重点突出`,

  /**
   * 获取简历类型需要的参数列表
   */
  getParamsForType(): string[] {
    return ['workYears', 'industry', 'skillFocus', 'targetPosition', 'highlightAchievements'];
  },

  /**
   * 获取表单选项配置
   */
  getFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
    const isZh = language === 'zh';

    const resumesFormOptionsZh: FormOptionsConfig = {
      // Select 类型字段
      workYears: [
        { value: '0-1', label: '0-1年', labelEn: '0-1 years' },
        { value: '2-5', label: '2-5年', labelEn: '2-5 years' },
        { value: '5-10', label: '5-10年', labelEn: '5-10 years' },
        { value: '10+', label: '10年以上', labelEn: '10+ years' },
      ],
      industry: [
        { value: 'tech', label: '科技互联网', labelEn: 'Technology' },
        { value: 'finance', label: '金融', labelEn: 'Finance' },
        { value: 'education', label: '教育', labelEn: 'Education' },
        { value: 'healthcare', label: '医疗健康', labelEn: 'Healthcare' },
        { value: 'manufacturing', label: '制造业', labelEn: 'Manufacturing' },
        { value: 'retail', label: '零售', labelEn: 'Retail' },
        { value: 'consulting', label: '咨询', labelEn: 'Consulting' },
      ],
      skillFocus: [
        { value: 'technical', label: '技术能力', labelEn: 'Technical Skills' },
        { value: 'management', label: '管理能力', labelEn: 'Management' },
        { value: 'communication', label: '沟通能力', labelEn: 'Communication' },
        { value: 'leadership', label: '领导力', labelEn: 'Leadership' },
        { value: 'analytical', label: '分析能力', labelEn: 'Analytical Skills' },
      ],

      // 元数据（为所有字段提供中文标签）
      _metadata: {
        workYears: {
          type: 'select',
          label: '工作年限',
          labelEn: 'Work Years',
          helpText: '选择工作年限',
          helpTextEn: 'Select work years',
        },
        industry: {
          type: 'select',
          label: '行业领域',
          labelEn: 'Industry',
          helpText: '选择行业领域',
          helpTextEn: 'Select the industry',
        },
        skillFocus: {
          type: 'multi-select',
          label: '技能重点',
          labelEn: 'Skill Focus',
          helpText: '选择需要在简历中重点突出的技能类型',
          helpTextEn: 'Select skill types to highlight in the resume',
        },
        targetPosition: {
          type: 'text',
          label: '目标职位',
          labelEn: 'Target Position',
          placeholder: '例如：高级软件工程师',
          placeholderEn: 'e.g., Senior Software Engineer',
          helpText: '希望申请的职位名称',
          helpTextEn: 'The position you are applying for',
        },
        highlightAchievements: {
          type: 'textarea',
          label: '突出成就',
          labelEn: 'Highlight Achievements',
          placeholder: '描述主要工作成就、项目成果等...',
          placeholderEn: 'Describe main achievements, project results...',
          helpText: '重点突出的工作成就和项目成果，用于简历中重点展示',
          helpTextEn: 'Key achievements and project results to highlight in the resume',
        },
      },
    };

    if (language === 'en') {
      return {
        workYears: resumesFormOptionsZh.workYears.map(opt => ({
          value: opt.value,
          label: opt.labelEn || opt.value,
        })),
        industry: resumesFormOptionsZh.industry.map(opt => ({
          value: opt.value,
          label: opt.labelEn || opt.value,
        })),
        skillFocus: resumesFormOptionsZh.skillFocus.map(opt => ({
          value: opt.value,
          label: opt.labelEn || opt.value,
        })),
        _metadata: {
          targetPosition: {
            ...resumesFormOptionsZh._metadata!.targetPosition,
            label: resumesFormOptionsZh._metadata!.targetPosition.labelEn || 'Target Position',
            placeholder: resumesFormOptionsZh._metadata!.targetPosition.placeholderEn,
            helpText: resumesFormOptionsZh._metadata!.targetPosition.helpTextEn,
          },
          highlightAchievements: {
            ...resumesFormOptionsZh._metadata!.highlightAchievements,
            label: resumesFormOptionsZh._metadata!.highlightAchievements.labelEn || 'Highlight Achievements',
            placeholder: resumesFormOptionsZh._metadata!.highlightAchievements.placeholderEn,
            helpText: resumesFormOptionsZh._metadata!.highlightAchievements.helpTextEn,
          },
          skillFocus: {
            ...resumesFormOptionsZh._metadata!.skillFocus,
            label: resumesFormOptionsZh._metadata!.skillFocus.labelEn || 'Skill Focus',
            helpText: resumesFormOptionsZh._metadata!.skillFocus.helpTextEn,
          },
        },
      };
    }

    return resumesFormOptionsZh;
  },
}

