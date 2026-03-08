/**
 * 简历（resumes）写作类型 - 客户端表单选项
 */
import type { FormOption, FormOptionsConfig } from '../shared/formOptions';

const resumesFormOptionsZh: FormOptionsConfig = {
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
  _metadata: {
    workYears: { type: 'select', label: '工作年限', labelEn: 'Work Years', helpText: '选择工作年限', helpTextEn: 'Select work years' },
    industry: { type: 'select', label: '行业领域', labelEn: 'Industry', helpText: '选择行业领域', helpTextEn: 'Select the industry' },
    skillFocus: { type: 'multi-select', label: '技能重点', labelEn: 'Skill Focus', helpText: '选择需要在简历中重点突出的技能类型', helpTextEn: 'Select skill types to highlight in the resume' },
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

const asOpts = (arr: FormOption[] | undefined) =>
  (arr || []).map((opt) => ({ value: opt.value, label: opt.labelEn || opt.value }));

export function getResumesFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
  if (language === 'en') {
    const m = resumesFormOptionsZh._metadata!;
    return {
      workYears: asOpts(resumesFormOptionsZh.workYears as FormOption[]),
      industry: asOpts(resumesFormOptionsZh.industry as FormOption[]),
      skillFocus: asOpts(resumesFormOptionsZh.skillFocus as FormOption[]),
      _metadata: {
        targetPosition: { ...m.targetPosition, label: m.targetPosition.labelEn || 'Target Position', placeholder: m.targetPosition.placeholderEn, helpText: m.targetPosition.helpTextEn },
        highlightAchievements: { ...m.highlightAchievements, label: m.highlightAchievements.labelEn || 'Highlight Achievements', placeholder: m.highlightAchievements.placeholderEn, helpText: m.highlightAchievements.helpTextEn },
        skillFocus: { ...m.skillFocus, label: m.skillFocus.labelEn || 'Skill Focus', helpText: m.skillFocus.helpTextEn },
      },
    };
  }
  return resumesFormOptionsZh;
}
