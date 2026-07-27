/**
 * 历史示例流程定义（仅作参考 / 单测引用，**不会**自动写入 DB）。
 * 运行时在 DB 维护；请用 mxm-smartflow-bundle JSON + apply:smartflow-bundle 或 Admin 设计器。
 */

import { Smartflow } from './models/types';

/**
 * 通用文案写作工作流
 */
export const writingArticleFlow: Smartflow = {
  id: 'writing-article-default',
  name: '通用文章写作',
  description: '根据主题生成专业文章，包含标题、摘要、正文结构',
  category: 'writing',
  tags: ['writing', 'article', 'content'],
  status: 'active',
  version: '1.0.0',
  is_public: true,
  schema: {
    version: '1.0.0',
    nodes: [
      {
        id: 'start',
        type: 'start',
        name: '开始',
        input: [
          { name: 'topic', type: 'text', content: '' },
          { name: 'wordCount', type: 'text', content: '1000' },
          { name: 'style', type: 'text', content: 'professional' },
        ],
        expected_outputs: [
          { type: 'text', name: 'title', required: true },
          { type: 'text', name: 'abstract', required: true },
          { type: 'text', name: 'content', required: true },
        ],
        smartflow_name: '通用文章写作',
      },
      {
        id: 'generate_outline',
        type: 'model',
        name: '生成文章大纲',
        model_type: 'text',
        model: 'gpt-5-nano',
        prompt: `请为以下主题生成文章大纲：

主题：{{input.topic}}
风格：{{input.style}}
字数要求：{{input.wordCount}}字

请生成包含以下部分的大纲：
1. 标题（吸引眼球）
2. 摘要（100字内）
3. 正文结构（3-5个主要章节，每章有子标题和简要说明）

要求：
- 结构清晰，逻辑连贯
- 子标题有信息量
- 符合{{input.style}}风格`,
        model_params: { temperature: 0.7, max_tokens: 1000 },
      },
      {
        id: 'generate_content',
        type: 'model',
        name: '生成完整文章',
        model_type: 'text',
        model: 'gpt-5-nano',
        prompt: `基于以下大纲，生成完整的专业文章：

主题：{{input.topic}}
风格：{{input.style}}
字数要求：{{input.wordCount}}字

大纲：{{generate_outline.output.text}}

要求：
1. 严格按照大纲结构撰写
2. 内容充实，有深度
3. 语言流畅，专业且易读
4. 符合{{input.style}}风格`,
        model_params: { temperature: 0.7, max_tokens: 2000 },
      },
      {
        id: 'end',
        type: 'end',
        name: '结束',
        output_mapping: {
          title: '{{generate_outline.output.text}}',
          abstract: '{{generate_outline.output.text}}',
          content: '{{generate_content.output.text}}',
        },
        validate_outputs: true,
      },
    ],
    edges: [
      { from: 'start', to: 'generate_outline' },
      { from: 'generate_outline', to: 'generate_content' },
      { from: 'generate_content', to: 'end' },
    ],
    settings: {
      timeout: 60,
      retry_count: 1,
      error_handling: 'continue',
    },
  },
};

/**
 * 视频脚本写作工作流
 */
export const writingScriptFlow: Smartflow = {
  id: 'writing-script-default',
  name: '视频脚本写作',
  description: '根据视频主题和时长生成专业分镜脚本',
  category: 'writing',
  tags: ['writing', 'script', 'video'],
  status: 'active',
  version: '1.0.0',
  is_public: true,
  schema: {
    version: '1.0.0',
    nodes: [
      {
        id: 'start',
        type: 'start',
        name: '开始',
        input: [
          { name: 'videoType', type: 'text', content: '产品展示' },
          { name: 'duration', type: 'text', content: '30秒' },
          { name: 'productName', type: 'text', content: '' },
        ],
        expected_outputs: [
          { type: 'text', name: 'script', required: true },
          { type: 'text', name: 'shotList', required: true },
        ],
        smartflow_name: '视频脚本写作',
      },
      {
        id: 'generate_script',
        type: 'model',
        name: '生成视频脚本',
        model_type: 'text',
        model: 'gpt-5-nano',
        prompt: `请为以下视频生成专业的分镜脚本：

视频类型：{{input.videoType}}
时长：{{input.duration}}
产品名称：{{input.productName}}

请生成包含以下内容的脚本：
1. 整体结构（开场-发展-高潮-结尾）
2. 每个镜头的详细描述：
   - 镜头编号和时长
   - 画面内容（场景、人物动作、道具）
   - 台词/配音
   - 背景音乐/音效建议
3. 视觉风格指导

格式要求：
- 每个镜头用【镜头X】标记
- 时长用秒表示
- 画面描述要具体生动`,
        model_params: { temperature: 0.7, max_tokens: 1500 },
      },
      {
        id: 'generate_shotlist',
        type: 'model',
        name: '生成镜头列表',
        model_type: 'text',
        model: 'gpt-5-nano',
        prompt: `基于以下视频脚本，生成简化的镜头列表：

视频类型：{{input.videoType}}
产品名称：{{input.productName}}

脚本：{{generate_script.output.text}}

请生成一个简洁的镜头列表，包含：
- 镜头序号
- 镜头类型（特写/中景/远景等）
- 时长
- 核心画面描述

用于拍摄执行参考。`,
        model_params: { temperature: 0.6, max_tokens: 800 },
      },
      {
        id: 'end',
        type: 'end',
        name: '结束',
        output_mapping: {
          script: '{{generate_script.output.text}}',
          shotList: '{{generate_shotlist.output.text}}',
        },
        validate_outputs: true,
      },
    ],
    edges: [
      { from: 'start', to: 'generate_script' },
      { from: 'generate_script', to: 'generate_shotlist' },
      { from: 'generate_shotlist', to: 'end' },
    ],
    settings: {
      timeout: 60,
      retry_count: 1,
      error_handling: 'continue',
    },
  },
};

/**
 * 海报设计工作流
 */
export const designPosterFlow: Smartflow = {
  id: 'design-poster-default',
  name: '海报设计生成',
  description: '根据主题和风格生成海报设计 Prompt',
  category: 'design',
  tags: ['design', 'poster', 'graphic'],
  status: 'active',
  version: '1.0.0',
  is_public: true,
  schema: {
    version: '1.0.0',
    nodes: [
      {
        id: 'start',
        type: 'start',
        name: '开始',
        input: [
          { name: 'theme', type: 'text', content: '' },
          { name: 'style', type: 'text', content: '简约' },
          { name: 'size', type: 'text', content: '1080x1920' },
        ],
        expected_outputs: [
          { type: 'text', name: 'designPrompt', required: true },
          { type: 'text', name: 'colorScheme', required: true },
        ],
        smartflow_name: '海报设计生成',
      },
      {
        id: 'analyze_theme',
        type: 'model',
        name: '分析主题元素',
        model_type: 'text',
        model: 'gpt-5-nano',
        prompt: `请分析以下海报主题，提取关键视觉元素：

主题：{{input.theme}}
风格：{{input.style}}

请分析：
1. 主题的核心视觉元素（人物、物品、场景等）
2. 风格特征（色彩倾向、构图方式、氛围）
3. 目标受众可能关注点
4. 竞品海报常用元素（供参考）

输出要求：简洁明了，突出重点。`,
        model_params: { temperature: 0.6, max_tokens: 800 },
      },
      {
        id: 'generate_prompt',
        type: 'model',
        name: '生成设计Prompt',
        model_type: 'text',
        model: 'gpt-5-nano',
        prompt: `基于以下分析，生成专业的AI海报设计Prompt：

主题：{{input.theme}}
风格：{{input.style}}
尺寸：{{input.size}}

主题分析：{{analyze_theme.output.text}}

请生成一个高质量的AI图像生成Prompt，包含：
1. 主体描述（人物/物体/场景的具体细节）
2. 背景环境描述
3. 风格元素（与{{input.style}}风格一致）
4. 构图方式（景深、角度、视线引导）
5. 色彩方案（主色调、辅助色、点缀色）
6. 氛围/情绪描述

要求：英文撰写，专业设计术语，细节丰富。`,
        model_params: { temperature: 0.8, max_tokens: 1000 },
      },
      {
        id: 'generate_colors',
        type: 'model',
        name: '生成配色方案',
        model_type: 'text',
        model: 'gpt-5-nano',
        prompt: `为以下海报设计生成配色方案：

主题：{{input.theme}}
风格：{{input.style}}

主题分析：{{analyze_theme.output.text}}

请生成：
1. 主色调（1-2个颜色，包含色值如 #FF5733）
2. 辅助色（2-3个颜色）
3. 点缀色（1-2个颜色，用于强调）
4. 配色理由（为什么这个配色适合该主题和风格）

格式清晰，便于前端使用。`,
        model_params: { temperature: 0.7, max_tokens: 600 },
      },
      {
        id: 'end',
        type: 'end',
        name: '结束',
        output_mapping: {
          designPrompt: '{{generate_prompt.output.text}}',
          colorScheme: '{{generate_colors.output.text}}',
        },
        validate_outputs: true,
      },
    ],
    edges: [
      { from: 'start', to: 'analyze_theme' },
      { from: 'analyze_theme', to: 'generate_prompt' },
      { from: 'analyze_theme', to: 'generate_colors' },
      { from: 'generate_prompt', to: 'end' },
      { from: 'generate_colors', to: 'end' },
    ],
    settings: {
      timeout: 60,
      retry_count: 1,
      error_handling: 'continue',
    },
  },
};

/**
 * 视频生成工作流（先脚本后生成）
 */
export const videoGenerateFlow: Smartflow = {
  id: 'video-generate-default',
  name: '视频生成完整流程',
  description: '先生成脚本再生成视频的完整流程',
  category: 'video',
  tags: ['video', 'generate', 'script'],
  status: 'active',
  version: '1.0.0',
  is_public: true,
  schema: {
    version: '1.0.0',
    nodes: [
      {
        id: 'start',
        type: 'start',
        name: '开始',
        input: [
          { name: 'content', type: 'text', content: '' },
          { name: 'duration', type: 'text', content: '30秒' },
          { name: 'aspectRatio', type: 'text', content: '9:16' },
        ],
        expected_outputs: [
          { type: 'text', name: 'script', required: true },
          { type: 'text', name: 'videoUrl', required: false },
        ],
        smartflow_name: '视频生成完整流程',
      },
      {
        id: 'generate_script',
        type: 'model',
        name: '生成视频脚本',
        model_type: 'text',
        model: 'gpt-5-nano',
        prompt: `为以下视频内容生成专业分镜脚本：

内容描述：{{input.content}}
时长：{{input.duration}}
比例：{{input.aspectRatio}}

请生成包含以下内容的脚本：
1. 开场（吸引注意力）
2. 主体内容（2-4个镜头）
3. 结尾（行动号召）

每个镜头包含：
- 画面描述（具体生动）
- 时长
- 运镜方式`,
        model_params: { temperature: 0.7, max_tokens: 1200 },
      },
      {
        id: 'generate_video',
        type: 'model',
        name: '生成视频',
        model_type: 'video',
        model: 'video-01',
        prompt: `基于以下脚本生成视频：

脚本：{{generate_script.output.text}}
时长：{{input.duration}}
比例：{{input.aspectRatio}}

请生成对应的视频内容。`,
        model_params: { duration: 30, aspect_ratio: '9:16' },
      },
      {
        id: 'end',
        type: 'end',
        name: '结束',
        output_mapping: {
          script: '{{generate_script.output.text}}',
          videoUrl: '{{generate_video.output.video_url}}',
        },
        validate_outputs: true,
      },
    ],
    edges: [
      { from: 'start', to: 'generate_script' },
      { from: 'generate_script', to: 'generate_video' },
      { from: 'generate_video', to: 'end' },
    ],
    settings: {
      timeout: 180,
      retry_count: 2,
      error_handling: 'retry',
    },
  },
};

/**
 * 语音合成工作流
 */
export const audioTTSFlow: Smartflow = {
  id: 'audio-tts-default',
  name: '语音合成',
  description: '将文本转换为自然语音',
  category: 'audio',
  tags: ['audio', 'tts', 'voice'],
  status: 'active',
  version: '1.0.0',
  is_public: true,
  schema: {
    version: '1.0.0',
    nodes: [
      {
        id: 'start',
        type: 'start',
        name: '开始',
        input: [
          { name: 'text', type: 'text', content: '' },
          { name: 'voice', type: 'text', content: 'female_warm' },
          { name: 'speed', type: 'text', content: '1.0' },
        ],
        expected_outputs: [
          { type: 'sound', name: 'audioUrl', required: true },
        ],
        smartflow_name: '语音合成',
      },
      {
        id: 'generate_tts',
        type: 'model',
        name: '生成语音',
        model_type: 'sound',
        model: 'speech-02',
        prompt: '{{input.text}}',
        model_params: {
          voice: 'female_warm',
          speed: 1.0,
          sound_type: 'tts',
        },
      },
      {
        id: 'end',
        type: 'end',
        name: '结束',
        output_mapping: {
          audioUrl: '{{generate_tts.output.audio_url}}',
        },
        validate_outputs: true,
      },
    ],
    edges: [
      { from: 'start', to: 'generate_tts' },
      { from: 'generate_tts', to: 'end' },
    ],
    settings: {
      timeout: 30,
      retry_count: 1,
      error_handling: 'continue',
    },
  },
};

/**
 * 音乐生成工作流
 */
export const audioMusicFlow: Smartflow = {
  id: 'audio-music-default',
  name: '音乐生成',
  description: '根据描述生成背景音乐或完整音乐',
  category: 'audio',
  tags: ['audio', 'music', 'generate'],
  status: 'active',
  version: '1.0.0',
  is_public: true,
  schema: {
    version: '1.0.0',
    nodes: [
      {
        id: 'start',
        type: 'start',
        name: '开始',
        input: [
          { name: 'description', type: 'text', content: '' },
          { name: 'duration', type: 'text', content: '30秒' },
          { name: 'genre', type: 'text', content: 'ambient' },
        ],
        expected_outputs: [
          { type: 'sound', name: 'musicUrl', required: true },
        ],
        smartflow_name: '音乐生成',
      },
      {
        id: 'generate_music',
        type: 'model',
        name: '生成音乐',
        model_type: 'sound',
        model: 'music-01',
        prompt: '{{input.description}}',
        model_params: {
          duration: 30,
          sound_type: 'music',
        },
      },
      {
        id: 'end',
        type: 'end',
        name: '结束',
        output_mapping: {
          musicUrl: '{{generate_music.output.audio_url}}',
        },
        validate_outputs: true,
      },
    ],
    edges: [
      { from: 'start', to: 'generate_music' },
      { from: 'generate_music', to: 'end' },
    ],
    settings: {
      timeout: 120,
      retry_count: 2,
      error_handling: 'retry',
    },
  },
};

/**
 * 智能搜索分析工作流
 */
export const smartSearchFlow: Smartflow = {
  id: 'smart-search-default',
  name: '智能搜索分析',
  description: '深度搜索并总结相关信息',
  category: 'tools',
  tags: ['search', 'research', 'analysis'],
  status: 'active',
  version: '1.0.0',
  is_public: true,
  schema: {
    version: '1.0.0',
    nodes: [
      {
        id: 'start',
        type: 'start',
        name: '开始',
        input: [
          { name: 'query', type: 'text', content: '' },
          { name: 'depth', type: 'text', content: 'standard' },
        ],
        expected_outputs: [
          { type: 'text', name: 'summary', required: true },
          { type: 'text', name: 'sources', required: true },
        ],
        smartflow_name: '智能搜索分析',
      },
      {
        id: 'deep_search',
        type: 'tools',
        name: '深度搜索',
        tool_type: 'deep_search',
        tool_params: {
          query: '{{input.query}}',
          depth: '{{input.depth}}',
          numResults: 10,
        },
      },
      {
        id: 'summarize',
        type: 'model',
        name: '总结分析',
        model_type: 'text',
        model: 'gpt-5-nano',
        prompt: `请对以下搜索结果进行总结分析：

搜索主题：{{input.query}}

搜索结果：
{{deep_search.output.results}}

请生成：
1. 核心发现（3-5个关键点）
2. 详细信息摘要（200字内）
3. 建议或结论

要求：简洁有条理，重点突出。`,
        model_params: { temperature: 0.6, max_tokens: 1000 },
      },
      {
        id: 'end',
        type: 'end',
        name: '结束',
        output_mapping: {
          summary: '{{summarize.output.text}}',
          sources: '{{deep_search.output.results}}',
        },
        validate_outputs: true,
      },
    ],
    edges: [
      { from: 'start', to: 'deep_search' },
      { from: 'deep_search', to: 'summarize' },
      { from: 'summarize', to: 'end' },
    ],
    settings: {
      timeout: 60,
      retry_count: 1,
      error_handling: 'continue',
    },
  },
};

/**
 * 代码助手工作流
 */
export const codeAssistantFlow: Smartflow = {
  id: 'code-assistant-default',
  name: '代码助手',
  description: '帮助编写、调试和优化代码',
  category: 'tools',
  tags: ['code', 'programming', 'assistant'],
  status: 'active',
  version: '1.0.0',
  is_public: true,
  schema: {
    version: '1.0.0',
    nodes: [
      {
        id: 'start',
        type: 'start',
        name: '开始',
        input: [
          { name: 'task', type: 'text', content: '' },
          { name: 'language', type: 'text', content: 'python' },
        ],
        expected_outputs: [
          { type: 'text', name: 'code', required: true },
          { type: 'text', name: 'explanation', required: true },
        ],
        smartflow_name: '代码助手',
      },
      {
        id: 'generate_code',
        type: 'model',
        name: '生成代码',
        model_type: 'text',
        model: 'gpt-5-nano',
        prompt: `请为以下任务生成代码：

任务：{{input.task}}
语言：{{input.language}}

要求：
1. 代码完整可运行
2. 包含必要的注释
3. 符合{{input.language}}最佳实践
4. 错误处理完善`,
        model_params: { temperature: 0.5, max_tokens: 1500 },
      },
      {
        id: 'execute_code',
        type: 'tools',
        name: '执行验证',
        tool_type: 'code_executor',
        tool_params: {
          language: '{{input.language}}',
          code: '{{generate_code.output.text}}',
          timeout: 5000,
        },
      },
      {
        id: 'explain_code',
        type: 'model',
        name: '代码解释',
        model_type: 'text',
        model: 'gpt-5-nano',
        prompt: `请解释以下代码的功能和工作原理：

语言：{{input.language}}

代码：
{{generate_code.output.text}}

执行结果：
{{execute_code.output.output}}

请简要说明：
1. 代码功能
2. 关键实现点
3. 如何使用`,
        model_params: { temperature: 0.5, max_tokens: 800 },
      },
      {
        id: 'end',
        type: 'end',
        name: '结束',
        output_mapping: {
          code: '{{generate_code.output.text}}',
          executionResult: '{{execute_code.output.output}}',
          explanation: '{{explain_code.output.text}}',
        },
        validate_outputs: true,
      },
    ],
    edges: [
      { from: 'start', to: 'generate_code' },
      { from: 'generate_code', to: 'execute_code' },
      { from: 'execute_code', to: 'explain_code' },
      { from: 'explain_code', to: 'end' },
    ],
    settings: {
      timeout: 30,
      retry_count: 1,
      error_handling: 'continue',
    },
  },
};

/** 反思环示例：对草稿多轮 critique + revise */
export const reflectionDraftFlow: Smartflow = {
  id: 'composite-reflection-draft',
  name: '反思环 · 文案打磨',
  description: 'Generate → Critique → Revise，输出 meta.passed 与终稿',
  category: 'agent',
  tags: ['reflection', 'composite', 'text'],
  status: 'active',
  version: '1.0.0',
  is_public: true,
  schema: {
    version: '2.0.0',
    nodes: [
      {
        id: 'start',
        type: 'start',
        name: '开始',
        input: [
          { name: 'task', type: 'text', content: 'Write a short product tagline.' },
          { name: 'artifact', type: 'text', content: '' },
        ],
        expected_outputs: [{ type: 'text', name: 'result', required: true }],
      },
      {
        id: 'reflect',
        type: 'reflection',
        name: '反思环',
        task: '{{input.task}}',
        artifact: '{{input.artifact}}',
        max_rounds: 3,
        pass_pattern: 'PASS',
        critic: { kind: 'text', taskKey: 'think', subtype: 'critique' },
        reviser: { kind: 'model', model: 'gpt-4o-mini' },
      },
      {
        id: 'end',
        type: 'end',
        name: '结束',
        output_mapping: { result: '{{reflect.output.result}}', passed: '{{reflect.output.meta.passed}}' },
      },
    ],
    edges: [
      { from: 'start', to: 'reflect' },
      { from: 'reflect', to: 'end' },
    ],
  },
};

/** Plan-and-Execute 示例 */
export const planExecuteFlow: Smartflow = {
  id: 'composite-plan-execute',
  name: '计划执行 · 多步摘要',
  description: 'Planner 拆解步骤并逐步执行，输出 summary',
  category: 'agent',
  tags: ['plan', 'composite'],
  status: 'active',
  version: '1.0.0',
  is_public: true,
  schema: {
    version: '2.0.0',
    nodes: [
      {
        id: 'start',
        type: 'start',
        name: '开始',
        input: [{ name: 'goal', type: 'text', content: 'Summarize benefits of solar energy for homeowners.' }],
      },
      {
        id: 'plan_exec',
        type: 'plan_execute',
        name: '计划执行',
        goal: '{{input.goal}}',
        max_steps: 4,
        planner: { kind: 'text', taskKey: 'plan', subtype: 'task-breakdown' },
        executor: { kind: 'model', model: 'gpt-4o-mini' },
        replan_on_failure: true,
      },
      {
        id: 'end',
        type: 'end',
        name: '结束',
        output_mapping: { summary: '{{plan_exec.output.result}}' },
      },
    ],
    edges: [
      { from: 'start', to: 'plan_exec' },
      { from: 'plan_exec', to: 'end' },
    ],
  },
};

/** 调研摘要示例 */
export const researchSummaryFlow: Smartflow = {
  id: 'composite-research-summary',
  name: '调研摘要',
  description: '生成搜索词 → deep_search → Markdown 摘要',
  category: 'agent',
  tags: ['research', 'composite'],
  status: 'active',
  version: '1.0.0',
  is_public: true,
  schema: {
    version: '2.0.0',
    nodes: [
      {
        id: 'start',
        type: 'start',
        name: '开始',
        input: [{ name: 'topic', type: 'text', content: 'AI image generation for e-commerce' }],
      },
      {
        id: 'research',
        type: 'research',
        name: '调研',
        topic: '{{input.topic}}',
        search_depth: 'standard',
        summarizer_model: 'gpt-4o-mini',
        query_generator: { kind: 'model', model: 'gpt-4o-mini' },
      },
      {
        id: 'end',
        type: 'end',
        name: '结束',
        output_mapping: { report: '{{research.output.result}}' },
      },
    ],
    edges: [
      { from: 'start', to: 'research' },
      { from: 'research', to: 'end' },
    ],
  },
};

/** @deprecated 已停用自动 seed，保留空数组避免旧 import 报错 */
export const PREDEFINED_EXAMPLE_FLOWS: Smartflow[] = [];