/**
 * 模型列表 API 路由 基于mxmcgi的模型支持列表更新
 * 提供支持的模型节点列表，包括类型、参数等信息
 */

import { Router, Request, Response } from 'express';
import { MODEL_REGISTRY, getModelsByType, getModelInfo } from '../core/smartflow/model-registry';
import type { ModelType } from '@mxmai/mxmdata';

const router = Router();

/**
 * 模型参数定义（基于 mxmcgi 的实际实现）
 */
const MODEL_PARAMS: Record<string, {
  parameters: Array<{
    name: string;
    type: string;
    description: string;
    required: boolean;
    default?: any;
    enum?: any[];
    range?: { min: number; max: number };
  }>;
}> = {
  // Text 模型参数
  'gpt-5-nano': {
    parameters: [
      {
        name: 'max_completion_tokens',
        type: 'number',
        description: '最大完成 token 数',
        required: false,
      },
      {
        name: 'temperature',
        type: 'number',
        description: '温度参数 (0-2)',
        required: false,
        default: 0.7,
        range: { min: 0, max: 2 },
      },
      {
        name: 'top_p',
        type: 'number',
        description: '核采样 (0-1)',
        required: false,
        range: { min: 0, max: 1 },
      },
      {
        name: 'frequency_penalty',
        type: 'number',
        description: '频率惩罚 (-2 到 2)',
        required: false,
        range: { min: -2, max: 2 },
      },
      {
        name: 'presence_penalty',
        type: 'number',
        description: '存在惩罚 (-2 到 2)',
        required: false,
        range: { min: -2, max: 2 },
      },
      {
        name: 'system_prompt',
        type: 'string',
        description: '系统提示词',
        required: false,
      },
      {
        name: 'image_input',
        type: 'array',
        description: '输入图片数组（多模态）',
        required: false,
      },
    ],
  },
  'deepseek-r1': {
    parameters: [
      {
        name: 'max_tokens',
        type: 'number',
        description: '最大输出 token 数',
        required: false,
        default: 20480,
      },
      {
        name: 'temperature',
        type: 'number',
        description: '温度参数',
        required: false,
        default: 0.1,
        range: { min: 0, max: 2 },
      },
      {
        name: 'presence_penalty',
        type: 'number',
        description: '存在惩罚',
        required: false,
        default: 0,
        range: { min: -2, max: 2 },
      },
      {
        name: 'frequency_penalty',
        type: 'number',
        description: '频率惩罚',
        required: false,
        default: 0,
        range: { min: -2, max: 2 },
      },
      {
        name: 'top_p',
        type: 'number',
        description: '核采样参数',
        required: false,
        default: 1,
        range: { min: 0, max: 1 },
      },
      {
        name: 'system_prompt',
        type: 'string',
        description: '系统提示词',
        required: false,
      },
    ],
  },
  'gemini-2.5-flash': {
    parameters: [
      {
        name: 'temperature',
        type: 'number',
        description: '温度参数',
        required: false,
        default: 0.8,
        range: { min: 0, max: 2 },
      },
      {
        name: 'max_tokens',
        type: 'number',
        description: '最大输出 token 数',
        required: false,
        default: 1000,
      },
      {
        name: 'top_p',
        type: 'number',
        description: '核采样参数',
        required: false,
        range: { min: 0, max: 1 },
      },
      {
        name: 'system_prompt',
        type: 'string',
        description: '系统提示词',
        required: false,
      },
    ],
  },
  'claude-4.5-sonnet': {
    parameters: [
      {
        name: 'temperature',
        type: 'number',
        description: '温度参数',
        required: false,
        default: 0.7,
        range: { min: 0, max: 2 },
      },
      {
        name: 'max_tokens',
        type: 'number',
        description: '最大输出 token 数',
        required: false,
        default: 2000,
      },
      {
        name: 'system_prompt',
        type: 'string',
        description: '系统提示词',
        required: false,
      },
    ],
  },
  'gemini-3-pro': {
    parameters: [
      {
        name: 'temperature',
        type: 'number',
        description: '温度参数',
        required: false,
        default: 0.7,
        range: { min: 0, max: 2 },
      },
      {
        name: 'max_tokens',
        type: 'number',
        description: '最大输出 token 数',
        required: false,
        default: 2000,
      },
      {
        name: 'top_p',
        type: 'number',
        description: '核采样参数',
        required: false,
        range: { min: 0, max: 1 },
      },
      {
        name: 'system_prompt',
        type: 'string',
        description: '系统提示词',
        required: false,
      },
    ],
  },
  
  // Image 模型参数
  'nano-banana': {
    parameters: [
      {
        name: 'aspect_ratio',
        type: 'string',
        description: '宽高比',
        required: false,
        default: '1:1',
        enum: ['1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
      },
      {
        name: 'image_size',
        type: 'string',
        description: '图片尺寸',
        required: false,
        default: '1K',
        enum: ['1K', '2K', '4K'],
      },
      {
        name: 'image',
        type: 'string',
        description: '图片 URL 或 base64（用于编辑）',
        required: false,
      },
      {
        name: 'image_urls',
        type: 'array',
        description: '多图 URL 列表（用于多图理解）',
        required: false,
      },
      {
        name: 'image_base64s',
        type: 'array',
        description: '多图 base64 列表（用于多图理解）',
        required: false,
      },
      {
        name: 'enableProgress',
        type: 'boolean',
        description: '是否启用进度监控（默认 true）',
        required: false,
        default: true,
      },
    ],
  },
  'flux-fast': {
    parameters: [
      {
        name: 'aspect_ratio',
        type: 'string',
        description: '宽高比',
        required: false,
        default: '1:1',
        enum: ['1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
      },
      {
        name: 'num_outputs',
        type: 'number',
        description: '输出图片数量',
        required: false,
      },
      {
        name: 'output_format',
        type: 'string',
        description: '输出格式',
        required: false,
        enum: ['png', 'jpg', 'webp'],
      },
      {
        name: 'safety_tolerance',
        type: 'number',
        description: '安全容忍度',
        required: false,
      },
    ],
  },
  'flux-kontext-fast': {
    parameters: [
      {
        name: 'aspect_ratio',
        type: 'string',
        description: '宽高比',
        required: false,
        default: '1:1',
        enum: ['1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
      },
      {
        name: 'input_image',
        type: 'string',
        description: '输入图片 URL 或 base64（用于编辑）',
        required: false,
      },
      {
        name: 'num_outputs',
        type: 'number',
        description: '生成图片数量',
        required: false,
      },
      {
        name: 'output_format',
        type: 'string',
        description: '输出格式',
        required: false,
        enum: ['png', 'jpg', 'webp'],
      },
      {
        name: 'safety_tolerance',
        type: 'number',
        description: '安全过滤级别',
        required: false,
      },
    ],
  },
  'ideogram-v2a': {
    parameters: [
      {
        name: 'aspect_ratio',
        type: 'string',
        description: '宽高比',
        required: false,
        default: '1:1',
        enum: ['1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
      },
      {
        name: 'resolution',
        type: 'string',
        description: '分辨率（Auto 或其他）',
        required: false,
        default: 'Auto',
      },
      {
        name: 'turbo',
        type: 'boolean',
        description: '是否使用快速模式',
        required: false,
        default: false,
      },
      {
        name: 'magic_prompt_option',
        type: 'string',
        description: 'Magic Prompt 选项',
        required: false,
        enum: ['AUTO', 'ON', 'OFF'],
      },
      {
        name: 'seed',
        type: 'number',
        description: '随机种子 (0-2147483647)',
        required: false,
        range: { min: 0, max: 2147483647 },
      },
      {
        name: 'style_type',
        type: 'string',
        description: '风格类型',
        required: false,
        enum: ['None', 'Auto', 'General', 'Realistic', 'Design', 'Render 3D', 'Anime'],
      },
      {
        name: 'num_images',
        type: 'number',
        description: '生成图片数量 (1-8)',
        required: false,
        range: { min: 1, max: 8 },
      },
      {
        name: 'negative_prompt',
        type: 'string',
        description: '负面提示词',
        required: false,
      },
    ],
  },
  'recraft-crisp-upscale': {
    parameters: [
      {
        name: 'image_size',
        type: 'string',
        description: '图片尺寸',
        required: false,
        enum: ['square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'],
      },
      {
        name: 'style',
        type: 'string',
        description: '风格类型',
        required: false,
        enum: ['realistic_image', 'digital_illustration', 'vector_illustration', 'realistic_image/b_and_w', 'digital_illustration/pixel_art', 'vector_illustration/line_art'],
      },
      {
        name: 'colors',
        type: 'array',
        description: '颜色约束数组',
        required: false,
      },
      {
        name: 'num_images',
        type: 'number',
        description: '生成图片数量',
        required: false,
      },
      {
        name: 'input_image',
        type: 'string',
        description: '输入图片 URL 或 base64（用于编辑或放大）',
        required: false,
      },
    ],
  },
  'seedream-4': {
    parameters: [
      {
        name: 'size',
        type: 'string',
        description: '图片尺寸',
        required: false,
        enum: ['1K', '2K', '4K', 'custom'],
      },
      {
        name: 'aspect_ratio',
        type: 'string',
        description: '宽高比（默认 match_input_image）',
        required: false,
        default: 'match_input_image',
      },
      {
        name: 'width',
        type: 'number',
        description: '自定义宽度（1024-4096），当 size=custom 时使用',
        required: false,
        range: { min: 1024, max: 4096 },
      },
      {
        name: 'height',
        type: 'number',
        description: '自定义高度（1024-4096），当 size=custom 时使用',
        required: false,
        range: { min: 1024, max: 4096 },
      },
      {
        name: 'image_input',
        type: 'array',
        description: '输入图片数组（1-10张），用于图片编辑或多参考生成',
        required: false,
      },
      {
        name: 'sequential_image_generation',
        type: 'string',
        description: '是否启用序列图片生成',
        required: false,
        enum: ['disabled', 'auto'],
      },
      {
        name: 'max_images',
        type: 'number',
        description: '最大生成图片数（1-15），当 sequential_image_generation=auto 时使用',
        required: false,
        range: { min: 1, max: 15 },
      },
      {
        name: 'negative_prompt',
        type: 'string',
        description: '负面提示词',
        required: false,
      },
    ],
  },
};

/**
 * GET /api/v1/models
 * 获取所有支持的模型列表
 * Query params:
 *   - type: 模型类型（可选，如 text, image, video, sound, embedding）
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    
    let models;
    if (type) {
      // 按类型筛选
      models = getModelsByType(type as ModelType);
    } else {
      // 返回所有模型
      models = Object.values(MODEL_REGISTRY);
    }
    
    // 构建响应数据，包含参数信息
    const modelsWithParams = models.map(model => {
      const params = MODEL_PARAMS[model.name] || { parameters: [] };
      
      return {
        name: model.name,
        display_name: model.displayName,
        description: model.description,
        type: model.modelType,
        supported_providers: model.supportedProviders || [],
        default_params: model.defaultParams || {},
        parameters: params.parameters,
      };
    });
    
    return res.json({
      success: true,
      data: modelsWithParams,
      count: modelsWithParams.length,
    });
  } catch (error) {
    console.error('Error getting models:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/v1/models/:name
 * 获取单个模型的详细信息
 */
router.get('/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    
    const modelInfo = getModelInfo(name);
    
    if (!modelInfo) {
      return res.status(404).json({
        success: false,
        error: 'Model not found',
      });
    }
    
    const params = MODEL_PARAMS[name] || { parameters: [] };
    
    return res.json({
      success: true,
      data: {
        name: modelInfo.name,
        display_name: modelInfo.displayName,
        description: modelInfo.description,
        type: modelInfo.modelType,
        supported_providers: modelInfo.supportedProviders || [],
        default_params: modelInfo.defaultParams || {},
        parameters: params.parameters,
      },
    });
  } catch (error) {
    console.error('Error getting model:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/v1/models/types
 * 获取所有支持的模型类型列表
 */
router.get('/types/list', async (req: Request, res: Response) => {
  try {
    const types = ['text', 'image', 'video', 'sound', 'embedding'] as ModelType[];
    
    const typesWithModels = types.map(type => {
      const models = getModelsByType(type);
      return {
        type,
        count: models.length,
        models: models.map(m => ({
          name: m.name,
          display_name: m.displayName,
        })),
      };
    });
    
    return res.json({
      success: true,
      data: typesWithModels,
    });
  } catch (error) {
    console.error('Error getting model types:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
