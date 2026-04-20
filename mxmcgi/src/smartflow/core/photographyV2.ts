/**
 * 摄影风格分析 + Prompt 生成 - V2 业务线
 */

import { Smartflow } from './models/types';

/**
 * 摄影分析 V2 工作流
 */
export const photographyAnalysisV2: Smartflow = {
  id: 'photography-analysis-v2',
  name: '摄影风格分析与Prompt生成 V2',
  description: '根据用户所在地、文化背景、摄影类型、风格和色调要求，分析并生成专业的摄影Prompt',
  category: 'photography',
  tags: ['photography', 'portrait', 'classical', 'warm-tone', 'analysis', 'prompt-generator'],
  status: 'active',
  version: '2.0.0',
  is_public: true,
  schema: {
    version: '2.0.0',
    nodes: [
      {
        id: 'start',
        type: 'start',
        name: '开始',
        input: [
          { name: 'photography_type', type: 'text', content: '' },
          { name: 'style', type: 'text', content: 'classical' },
          { name: 'tone', type: 'text', content: 'warm' },
          { name: 'location', type: 'text', content: '' },
          { name: 'cultural_background', type: 'text', content: '' },
          { name: 'subject', type: 'text', content: '' },
        ],
        expected_outputs: [
          { type: 'text', name: 'cultural_style_analysis', required: true },
          { type: 'text', name: 'similar_photographers', required: true },
          { type: 'text', name: 'composition_analysis', required: true },
          { type: 'text', name: 'final_prompt', required: true },
        ],
        smartflow_name: '摄影风格分析与Prompt生成 V2',
      },
      {
        id: 'analyze_cultural_style',
        type: 'model',
        name: '分析古典风格',
        model_type: 'text',
        model: 'gpt-5-nano',
        prompt: `你是一位专业的摄影艺术史学家。请分析以下信息，并详细描述符合该文化背景的古典摄影风格：

用户所在地：{{input.location}}
文化背景：{{input.cultural_background}}
摄影类型：{{input.photography_type}}
风格要求：{{input.style}}
色调要求：{{input.tone}}

请提供以下分析：
1. 该文化背景下"古典风格"的定义和特征
2. 古典风格摄影的典型元素：构图、光线、色彩、题材
3. 这种风格的历史渊源和代表作品
4. 与现代摄影的区别`,
        params: { temperature: 0.7, max_tokens: 1500 },
      },
      {
        id: 'find_similar_photographers',
        type: 'model',
        name: '分析类似摄影师',
        model_type: 'text',
        model: 'gpt-5-nano',
        prompt: `基于以下信息，找出在古典风格方面有类似作品或风格的摄影师：

摄影类型：{{input.photography_type}}
风格要求：{{input.style}}
色调要求：{{input.tone}}
文化背景：{{input.cultural_background}}

请分析：
1. 3-5位最符合这种风格要求的知名摄影师
2. 每位摄影师的作品特点、代表作品
3. 这些摄影师的风格与用户需求的匹配度`,
        params: { temperature: 0.6, max_tokens: 1200 },
      },
      {
        id: 'analyze_warm_portrait',
        type: 'model',
        name: '分析暖色调人像',
        model_type: 'text',
        model: 'gpt-5-nano',
        prompt: `作为一位专业的人像摄影师，请详细分析暖色调人像摄影的构图和元素风格：

摄影师参考：{{find_similar_photographers.output.text}}
摄影类型：{{input.photography_type}}
色调要求：{{input.tone}}
文化背景：{{input.cultural_background}}

请从以下几个方面分析：
1. **构图方式**：如何安排人物在画面中的位置
2. **光线运用**：暖色调如何实现
3. **背景处理**：背景的选择、与主体的关系
4. **色彩搭配**：暖色调的具体色系
5. **情绪表达**：暖色调如何传递情感
6. **细节元素**：服饰、道具、妆面等`,
        params: { temperature: 0.7, max_tokens: 1500 },
      },
      {
        id: 'generate_final_prompt',
        type: 'model',
        name: '生成Prompt',
        model_type: 'text',
        model: 'gpt-5-nano',
        prompt: `基于以下所有分析，请生成一个专业、详细的摄影Prompt，用于AI图像生成：

主题：{{input.subject}}
摄影类型：{{input.photography_type}}
风格：{{input.style}}
色调：{{input.tone}}
文化背景：{{input.cultural_background}}

风格分析：{{analyze_cultural_style.output.text}}
摄影师参考：{{find_similar_photographers.output.text}}
构图分析：{{analyze_warm_portrait.output.text}}

请生成一个高质量的AI摄影Prompt，包含：
1. **主体描述**：人物的外貌特征、姿态、表情
2. **环境设置**：背景、场景布置、光线
3. **风格要素**：构图方式、色彩风格、氛围
4. **技术参数**：景深、运动感、质感要求

Prompt要求：英文撰写、细节丰富、专业摄影术语准确。`,
        params: { temperature: 0.8, max_tokens: 800 },
      },
      {
        id: 'end',
        type: 'end',
        name: '结束',
        output_mapping: {
          cultural_style_analysis: '{{analyze_cultural_style.output.text}}',
          similar_photographers: '{{find_similar_photographers.output.text}}',
          composition_analysis: '{{analyze_warm_portrait.output.text}}',
          final_prompt: '{{generate_final_prompt.output.text}}',
          metadata: '{{start.output}}',
        },
        validate_outputs: true,
      },
    ],
    edges: [
      { from: 'start', to: 'analyze_cultural_style' },
      { from: 'start', to: 'find_similar_photographers' },
      { from: 'find_similar_photographers', to: 'analyze_warm_portrait' },
      { from: 'analyze_cultural_style', to: 'analyze_warm_portrait' },
      { from: 'analyze_warm_portrait', to: 'generate_final_prompt' },
      { from: 'generate_final_prompt', to: 'end' },
    ],
    settings: {
      timeout: 120,
      retry_count: 1,
      error_handling: 'continue',
    },
  },
};

export const PREDEFINED_SMARTFLOWS: Smartflow[] = [
  photographyAnalysisV2,
];
