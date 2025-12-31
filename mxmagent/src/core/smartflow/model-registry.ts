/**
 * 模型注册表
 * 定义 mxmcgi 支持的模型列表，按类型分类
 */

import type { ModelType } from '@mxmai/mxmdata';

/**
 * 模型信息接口
 */
export interface ModelInfo {
  name: string;                    // 模型名称（用于配置）
  displayName: string;             // 显示名称
  description?: string;            // 模型描述
  modelType: ModelType;            // 模型类型
  supportedProviders?: string[];   // 支持的 provider（如 'replicate', 'ppio', 'deer'）
  defaultParams?: Record<string, any>;  // 默认参数
}

/**
 * 模型注册表
 * 基于 mxmcgi 实际支持的模型
 */
export const MODEL_REGISTRY: Record<string, ModelInfo> = {
  // ========== Text 模型 ==========
  'gpt-5-nano': {
    name: 'gpt-5-nano',
    displayName: 'GPT-5 Nano',
    description: '快速文本生成（使用 GPT-4o-mini 作为占位）',
    modelType: 'text',
    supportedProviders: ['deer'],
    defaultParams: {
      temperature: 0.7,
      max_tokens: 1000,
    },
  },
  'deepseek-r1': {
    name: 'deepseek-r1',
    displayName: 'DeepSeek R1',
    description: '大语言模型，支持推理',
    modelType: 'text',
    supportedProviders: ['deer'],
    defaultParams: {
      temperature: 0.7,
      max_tokens: 2000,
    },
  },
  'gemini-2.5-flash': {
    name: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    description: '快速多模态模型',
    modelType: 'text',
    supportedProviders: ['deer'],
    defaultParams: {
      temperature: 0.8,
      max_tokens: 1000,
    },
  },
  'claude-4.5-sonnet': {
    name: 'claude-4.5-sonnet',
    displayName: 'Claude 4.5 Sonnet',
    description: '对话模型',
    modelType: 'text',
    supportedProviders: ['deer'],
    defaultParams: {
      temperature: 0.7,
      max_tokens: 2000,
    },
  },
  'gemini-3-pro': {
    name: 'gemini-3-pro',
    displayName: 'Gemini 3 Pro',
    description: '高性能多模态模型',
    modelType: 'text',
    supportedProviders: ['deer'],
    defaultParams: {
      temperature: 0.7,
      max_tokens: 2000,
    },
  },
  
  // ========== Image 模型 ==========
  'nano-banana': {
    name: 'nano-banana',
    displayName: 'Nano Banana',
    description: '支持图片生成和编辑，多图理解',
    modelType: 'image',
    supportedProviders: ['replicate', 'ppio'],
    defaultParams: {
      aspect_ratio: '1:1',
      image_size: '1K',
    },
  },
  'flux-kontext-fast': {
    name: 'flux-kontext-fast',
    displayName: 'Flux Kontext Fast',
    description: '快速图片编辑',
    modelType: 'image',
    supportedProviders: ['replicate'],
    defaultParams: {
      aspect_ratio: '1:1',
    },
  },
  'flux-fast': {
    name: 'flux-fast',
    displayName: 'Flux Fast',
    description: '快速图片生成',
    modelType: 'image',
    supportedProviders: ['replicate'],
    defaultParams: {
      aspect_ratio: '1:1',
    },
  },
  'ideogram-v2a': {
    name: 'ideogram-v2a',
    displayName: 'Ideogram V2A',
    description: '擅长生成包含文字的图片',
    modelType: 'image',
    supportedProviders: ['replicate'],
    defaultParams: {
      aspect_ratio: '1:1',
    },
  },
  'recraft-crisp-upscale': {
    name: 'recraft-crisp-upscale',
    displayName: 'Recraft Crisp Upscale',
    description: '高质量图片放大',
    modelType: 'image',
    supportedProviders: ['replicate'],
    defaultParams: {},
  },
  'seedream-4': {
    name: 'seedream-4',
    displayName: 'Seedream 4',
    description: '统一的文本生成图片和图片编辑模型，支持高分辨率（最高 4K）、多参考图片、批量生成',
    modelType: 'image',
    supportedProviders: ['replicate'],
    defaultParams: {
      size: '2K',
      aspect_ratio: 'match_input_image',
    },
  },
  
  // ========== Video 模型 ==========
  // 待 mxmcgi 支持后添加
  
  // ========== Sound 模型 ==========
  // 待 mxmcgi 支持后添加
  
  // ========== Embedding 模型 ==========
  // 待 mxmcgi 支持后添加
};

/**
 * 按模型类型获取模型列表
 */
export function getModelsByType(modelType: ModelType): ModelInfo[] {
  return Object.values(MODEL_REGISTRY).filter(model => model.modelType === modelType);
}

/**
 * 获取模型信息
 */
export function getModelInfo(modelName: string): ModelInfo | undefined {
  return MODEL_REGISTRY[modelName];
}

/**
 * 验证模型是否存在
 */
export function validateModel(modelName: string, modelType?: ModelType): boolean {
  const model = MODEL_REGISTRY[modelName];
  if (!model) {
    return false;
  }
  if (modelType && model.modelType !== modelType) {
    return false;
  }
  return true;
}

/**
 * 获取模型类型对应的 API 端点
 */
export function getModelApiEndpoint(modelType: ModelType): string {
  const endpointMap: Record<ModelType, string> = {
    text: '/api/v1/cgi/text',
    image: '/api/v1/cgi/graph',
    video: '/api/v1/cgi/video',      // 待实现
    sound: '/api/v1/cgi/sound',      // 待实现
    embedding: '/api/v1/cgi/embedding',  // 待实现
  };
  return endpointMap[modelType];
}

/**
 * 获取所有可用的模型类型
 */
export function getAvailableModelTypes(): ModelType[] {
  const types = new Set<ModelType>();
  Object.values(MODEL_REGISTRY).forEach(model => {
    types.add(model.modelType);
  });
  return Array.from(types);
}
