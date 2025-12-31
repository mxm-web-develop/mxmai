/**
 * 任务类型配置
 * 
 * 定义系统支持的所有任务类型及其配置
 */

/**
 * 任务类型枚举
 */
export enum TaskType {
  // 图像生成
  IMAGE_GENERATION = 'image_generation',
  IMAGE_PORTRAIT = 'image_portrait',
  IMAGE_FASHION = 'image_fashion',
  IMAGE_LANDSCAPE = 'image_landscape',
  IMAGE_PRODUCT = 'image_product',
  
  // 音乐生成
  MUSIC_GENERATION = 'music_generation',
  MUSIC_VOCAL = 'music_vocal',
  MUSIC_INSTRUMENTAL = 'music_instrumental',
  MUSIC_BGM = 'music_bgm',
  
  // 视频生成（未来）
  VIDEO_GENERATION = 'video_generation',
  
  // 文本生成（未来）
  TEXT_GENERATION = 'text_generation',
}

/**
 * 任务类型配置接口
 */
export interface TaskTypeConfig {
  taskType: string;
  name: string;
  description: string;
  // 支持的模型类型
  supportedModels: {
    baseModels: string[];      // 主力模型列表
    loraModels?: boolean;        // 是否支持 LoRA
    plugins?: string[];         // 支持的插件/扩展
  };
  // 任务特定参数
  taskSpecificParams?: Record<string, any>;
  // 提示词模板格式
  promptTemplateFormat: 'image' | 'music' | 'video' | 'text';
  // 默认参数
  defaultParams?: Record<string, any>;
}

/**
 * 任务类型配置映射
 */
export const TASK_TYPE_CONFIGS: Record<string, TaskTypeConfig> = {
  // ========== 图像生成 ==========
  [TaskType.IMAGE_GENERATION]: {
    taskType: TaskType.IMAGE_GENERATION,
    name: '图像生成',
    description: '使用 AI 生成图像',
    supportedModels: {
      baseModels: ['flux-1.1-pro', 'stable-diffusion-xl', 'flux-dev'],
      loraModels: true,
      plugins: ['controlnet', 'ip-adapter']
    },
    promptTemplateFormat: 'image',
    defaultParams: {
      width: 1024,
      height: 1024,
      steps: 28,
      guidance_scale: 3.5
    }
  },
  
  [TaskType.IMAGE_PORTRAIT]: {
    taskType: TaskType.IMAGE_PORTRAIT,
    name: '人像生成',
    description: '生成人像摄影图像',
    supportedModels: {
      baseModels: ['flux-1.1-pro', 'stable-diffusion-xl'],
      loraModels: true,
      plugins: ['controlnet', 'ip-adapter']
    },
    promptTemplateFormat: 'image',
    defaultParams: {
      width: 1024,
      height: 1024,
      steps: 28,
      guidance_scale: 3.5
    }
  },
  
  [TaskType.IMAGE_FASHION]: {
    taskType: TaskType.IMAGE_FASHION,
    name: '时尚摄影',
    description: '生成时尚摄影图像',
    supportedModels: {
      baseModels: ['flux-1.1-pro', 'stable-diffusion-xl'],
      loraModels: true,
      plugins: ['controlnet']
    },
    promptTemplateFormat: 'image',
    defaultParams: {
      width: 1024,
      height: 1024,
      steps: 28,
      guidance_scale: 3.5
    }
  },
  
  [TaskType.IMAGE_LANDSCAPE]: {
    taskType: TaskType.IMAGE_LANDSCAPE,
    name: '风景生成',
    description: '生成风景摄影图像',
    supportedModels: {
      baseModels: ['flux-1.1-pro', 'stable-diffusion-xl'],
      loraModels: true,
      plugins: []
    },
    promptTemplateFormat: 'image',
    defaultParams: {
      width: 1024,
      height: 1024,
      steps: 28,
      guidance_scale: 3.5
    }
  },
  
  // ========== 音乐生成 ==========
  [TaskType.MUSIC_GENERATION]: {
    taskType: TaskType.MUSIC_GENERATION,
    name: '音乐生成',
    description: '使用 AI 生成音乐',
    supportedModels: {
      baseModels: ['suno-v3', 'suno-v3.5'],
      loraModels: false,
      plugins: []
    },
    promptTemplateFormat: 'music',
    defaultParams: {
      duration: 120,
      instrumental: false,
      custom_mode: false
    }
  },
  
  [TaskType.MUSIC_VOCAL]: {
    taskType: TaskType.MUSIC_VOCAL,
    name: '人声音乐',
    description: '生成带人声的音乐',
    supportedModels: {
      baseModels: ['suno-v3', 'suno-v3.5'],
      loraModels: false,
      plugins: []
    },
    promptTemplateFormat: 'music',
    defaultParams: {
      duration: 120,
      instrumental: false,
      custom_mode: false
    }
  },
  
  [TaskType.MUSIC_INSTRUMENTAL]: {
    taskType: TaskType.MUSIC_INSTRUMENTAL,
    name: '纯音乐',
    description: '生成纯器乐音乐',
    supportedModels: {
      baseModels: ['suno-v3', 'suno-v3.5'],
      loraModels: false,
      plugins: []
    },
    promptTemplateFormat: 'music',
    defaultParams: {
      duration: 120,
      instrumental: true,
      custom_mode: false
    }
  },
  
  [TaskType.MUSIC_BGM]: {
    taskType: TaskType.MUSIC_BGM,
    name: '背景音乐',
    description: '生成背景音乐',
    supportedModels: {
      baseModels: ['suno-v3', 'suno-v3.5'],
      loraModels: false,
      plugins: []
    },
    promptTemplateFormat: 'music',
    defaultParams: {
      duration: 60,
      instrumental: true,
      custom_mode: false
    }
  },
};

/**
 * 获取任务类型配置
 */
export function getTaskTypeConfig(taskType: string): TaskTypeConfig | undefined {
  return TASK_TYPE_CONFIGS[taskType];
}

/**
 * 检查任务类型是否支持 LoRA
 */
export function supportsLoRA(taskType: string): boolean {
  const config = getTaskTypeConfig(taskType);
  return config?.supportedModels.loraModels ?? false;
}

/**
 * 获取任务类型支持的主力模型列表
 */
export function getSupportedBaseModels(taskType: string): string[] {
  const config = getTaskTypeConfig(taskType);
  return config?.supportedModels.baseModels ?? [];
}

/**
 * 验证任务类型是否有效
 */
export function isValidTaskType(taskType: string): boolean {
  return taskType in TASK_TYPE_CONFIGS;
}

/**
 * 获取所有支持的任务类型
 */
export function getAllTaskTypes(): string[] {
  return Object.keys(TASK_TYPE_CONFIGS);
}

/**
 * 根据任务类型获取提示词模板格式
 */
export function getPromptTemplateFormat(taskType: string): 'image' | 'music' | 'video' | 'text' {
  const config = getTaskTypeConfig(taskType);
  return config?.promptTemplateFormat ?? 'image';
}
