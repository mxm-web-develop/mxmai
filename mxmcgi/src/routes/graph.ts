import { Router, Request, Response } from 'express';
import type { ProviderType } from '../core/providers/types';
import { taskExecutor } from '../core/task/task-executor';
import type { PhotographParams, DesignParams, PaintingParams } from '../core/graph/type';
import { getGraphTypeOptions } from '../core/graph/graphconfigs';
import { getFormOptions } from '../core/graph/graphconfigs/photograph/formOptions';

// 导入所有 graph 模型文件
import * as nanoBanana from '../core/graph/nano-banana';
import * as fluxFast from '../core/graph/flux-fast';
import * as flux2Flex from '../core/graph/flux-2-flex';
import * as flux2Pro from '../core/graph/flux-2-pro';
// import * as fluxKontextFast from '../core/graph/flux-kontext-fast'; // 已禁用：该模型是图片编辑模型，需要 input_image 参数，仅传 prompt 时生成内容与提示词无关
import * as seedream4 from '../core/graph/seedream-4';
import * as ideogramV2A from '../core/graph/ideogram-v2a';
import * as recraftCrispUpscale from '../core/graph/recraft-crisp-upscale';

// 统一从 suport-list.ts 读取所有 provider 的 graph 模型列表
// 约定：对外暴露的模型名 = suport-list.ts 中各 provider.graph 的 key
// 内部真实模型 ID（Replicate / Deer / PPIO 等）由各 provider 自己根据 suport-list 的 value 处理
const supportList = require('../core/utils/suport-list').default as any;

const GRAPH_MODELS_FROM_PROVIDERS = [
  ...(Object.keys(supportList.replicate?.graph || {})),
  ...(Object.keys(supportList.ppio?.graph || {})),
  ...(Object.keys(supportList.deer?.graph || {})),
];

// 去重后的模型列表
const SUPPORTED_MODELS: string[] = Array.from(new Set(GRAPH_MODELS_FROM_PROVIDERS));

// 模型映射（key 为我们对外暴露的模型名）
// 约定：这里的 key 必须与 `suport-list.ts` 中各 provider.graph 的 key 完全一致
// 每个模型文件内部使用 providerFactory.getProviderForModel() 自动选择支持的 provider
const MODEL_MAP: Record<string, {
  generate: (params: any, provider?: ProviderType) => Promise<any>;
}> = {
  'nano-banana': {
    generate: nanoBanana.generate,
  },
  'flux-fast': {
    generate: fluxFast.generate,
  },
  'flux-2-flex': {
    generate: flux2Flex.generate,
  },
  'flux-2-pro': {
    generate: flux2Pro.generate,
  },
  // 'flux-kontext-fast': {
  //   generate: fluxKontextFast.generate,
  // }, // 已禁用：该模型是图片编辑模型，需要 input_image 参数，仅传 prompt 时生成内容与提示词无关
  'seedream-4': {
    generate: seedream4.generate,
  },
  'ideogram-v2a': {
    generate: ideogramV2A.generate,
  },
  'recraft-crisp-upscale': {
    generate: recraftCrispUpscale.generate,
  },
};

const router = Router();

// 获取所有可用的图模型列表
router.get('/models', (_req: Request, res: Response) => {
  // 返回 MODEL_MAP 中的模型（确保都有对应的实现文件）
  const models = Object.keys(MODEL_MAP).map(modelName => ({
    name: modelName,
  }));
  res.json({ models });
});

/**
 * GET /api/v1/cgi/graph/getformOptions
 * 获取表单选项配置
 * Query params:
 *   - photograph: 获取摄影类型的表单选项
 *   - lang: 语言代码 'zh' | 'en' (默认 'zh')
 */
router.get('/getformOptions', (req: Request, res: Response) => {
  try {
    const { photograph, design, painting, lang } = req.query;
    const language = (lang as 'zh' | 'en') || 'zh';

    // 验证语言参数
    if (language !== 'zh' && language !== 'en') {
      return res.status(400).json({
        success: false,
        error: 'Invalid language parameter',
        message: 'lang must be "zh" or "en"',
      });
    }

    // 检查参数是否存在（?photograph 会被解析为 photograph: '' 或 undefined，都视为存在）
    // 使用 in 操作符检查 query 对象中是否有该键
    const hasPhotograph = 'photograph' in req.query;
    const hasDesign = 'design' in req.query;
    const hasPainting = 'painting' in req.query;

    // 如果指定了 photograph，返回摄影类型的表单选项
    if (hasPhotograph) {
      const formOptions = getFormOptions(language);
      return res.json({
        success: true,
        data: {
          graphType: 'photograph',
          language,
          options: formOptions,
        },
      });
    }

    // 如果指定了 design，返回设计类型的表单选项（待实现）
    if (hasDesign) {
      return res.status(501).json({
        success: false,
        error: 'Not implemented',
        message: 'Design form options are not yet implemented',
      });
    }

    // 如果指定了 painting，返回绘画类型的表单选项（待实现）
    if (hasPainting) {
      return res.status(501).json({
        success: false,
        error: 'Not implemented',
        message: 'Painting form options are not yet implemented',
      });
    }

    // 如果没有指定类型，返回错误
    return res.status(400).json({
      success: false,
      error: 'Missing type parameter',
      message: 'Please specify one of: photograph, design, painting',
    });
  } catch (error) {
    console.error('[Graph Route] 获取表单选项失败:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get form options',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/v1/cgi/graph/photograph
 * 摄影接口
 * 注意：必须在动态路由 /:modelName 之前定义，避免被误匹配
 */
router.post('/photograph', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
        message: 'User authentication required',
      });
    }

    const params = req.body as PhotographParams;

    // 验证必需参数
    if (!params.type || !params.prompt) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters',
        message: 'type and prompt are required',
      });
    }

    // 验证type是否在支持的列表中
    const typeOptions = getGraphTypeOptions('photograph');
    const validTypes = typeOptions.map(opt => opt.value);
    if (!validTypes.includes(params.type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid type',
        message: `Type "${params.type}" is not supported. Valid types: ${validTypes.join(', ')}`,
      });
    }

    // 获取存储配置（默认启用MinIO存储）
    const storeToMinio = req.body.storeToMinio !== undefined 
      ? req.body.storeToMinio 
      : (req.query.storeToMinio !== undefined ? req.query.storeToMinio === 'true' : true); // 默认true
    
    const storageConfig = {
      bucket: process.env.CGI_STORAGE_BUCKET || 'user-media',
      pathTemplate: '{userId}/graph/photograph/{timestamp}-{randomId}.{ext}',
    };
    
    if (req.body.storageConfig) {
      Object.assign(storageConfig, req.body.storageConfig);
    }

    // 创建异步任务
    const taskManager = taskExecutor.getTaskManager();
    const createResponse = await taskManager.createTask({
      type: 'graph',
      model: 'graph-photograph',
      provider: req.query.provider as ProviderType | undefined,
      params: {
        taskType: 'generate',
        graphType: 'photograph',
        ...params,
      },
      userId,
      storeToMinio,
      storageConfig,
    });

    // 异步执行任务
    taskExecutor.executeTask({
      taskId: createResponse.taskId,
      modelName: 'graph-photograph',
      provider: req.query.provider as ProviderType | undefined,
      params: {
        taskType: 'generate',
        graphType: 'photograph',
        ...params,
      },
      userId,
      storeToMinio,
      storageConfig,
    }).catch((error) => {
      console.error(`[Graph Route] 任务执行失败 (taskId: ${createResponse.taskId}):`, error);
    });

    return res.json({
      success: true,
      data: {
        taskId: createResponse.taskId,
        status: createResponse.status,
        createdAt: createResponse.createdAt,
      },
    });
  } catch (error) {
    console.error('[Graph Route] 摄影接口失败:', error);
    return res.status(500).json({
      success: false,
      error: 'Task creation failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/v1/cgi/graph/design
 * 设计接口
 * 注意：必须在动态路由 /:modelName 之前定义，避免被误匹配
 */
router.post('/design', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
        message: 'User authentication required',
      });
    }

    const params = req.body as DesignParams;

    // 验证必需参数
    if (!params.type || !params.prompt) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters',
        message: 'type and prompt are required',
      });
    }

    // 验证type是否在支持的列表中
    const typeOptions = getGraphTypeOptions('design');
    const validTypes = typeOptions.map(opt => opt.value);
    if (!validTypes.includes(params.type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid type',
        message: `Type "${params.type}" is not supported. Valid types: ${validTypes.join(', ')}`,
      });
    }

    // 获取存储配置（默认启用MinIO存储）
    const storeToMinio = req.body.storeToMinio !== undefined 
      ? req.body.storeToMinio 
      : (req.query.storeToMinio !== undefined ? req.query.storeToMinio === 'true' : true); // 默认true
    
    const storageConfig = {
      bucket: process.env.CGI_STORAGE_BUCKET || 'user-media',
      pathTemplate: '{userId}/graph/design/{timestamp}-{randomId}.{ext}',
    };
    
    if (req.body.storageConfig) {
      Object.assign(storageConfig, req.body.storageConfig);
    }

    // 创建异步任务
    const taskManager = taskExecutor.getTaskManager();
    const createResponse = await taskManager.createTask({
      type: 'graph',
      model: 'graph-design',
      provider: req.query.provider as ProviderType | undefined,
      params: {
        taskType: 'generate',
        graphType: 'design',
        ...params,
      },
      userId,
      storeToMinio,
      storageConfig,
    });

    // 异步执行任务
    taskExecutor.executeTask({
      taskId: createResponse.taskId,
      modelName: 'graph-design',
      provider: req.query.provider as ProviderType | undefined,
      params: {
        taskType: 'generate',
        graphType: 'design',
        ...params,
      },
      userId,
      storeToMinio,
      storageConfig,
    }).catch((error) => {
      console.error(`[Graph Route] 任务执行失败 (taskId: ${createResponse.taskId}):`, error);
    });

    return res.json({
      success: true,
      data: {
        taskId: createResponse.taskId,
        status: createResponse.status,
        createdAt: createResponse.createdAt,
      },
    });
  } catch (error) {
    console.error('[Graph Route] 设计接口失败:', error);
    return res.status(500).json({
      success: false,
      error: 'Task creation failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/v1/cgi/graph/painting
 * 绘画接口
 * 注意：必须在动态路由 /:modelName 之前定义，避免被误匹配
 */
router.post('/painting', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
        message: 'User authentication required',
      });
    }

    const params = req.body as PaintingParams;

    // 验证必需参数
    if (!params.type || !params.prompt) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters',
        message: 'type and prompt are required',
      });
    }

    // 验证type是否在支持的列表中
    const typeOptions = getGraphTypeOptions('painting');
    const validTypes = typeOptions.map(opt => opt.value);
    if (!validTypes.includes(params.type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid type',
        message: `Type "${params.type}" is not supported. Valid types: ${validTypes.join(', ')}`,
      });
    }

    // 获取存储配置（默认启用MinIO存储）
    const storeToMinio = req.body.storeToMinio !== undefined 
      ? req.body.storeToMinio 
      : (req.query.storeToMinio !== undefined ? req.query.storeToMinio === 'true' : true); // 默认true
    
    const storageConfig = {
      bucket: process.env.CGI_STORAGE_BUCKET || 'user-media',
      pathTemplate: '{userId}/graph/painting/{timestamp}-{randomId}.{ext}',
    };
    
    if (req.body.storageConfig) {
      Object.assign(storageConfig, req.body.storageConfig);
    }

    // 创建异步任务
    const taskManager = taskExecutor.getTaskManager();
    const createResponse = await taskManager.createTask({
      type: 'graph',
      model: 'graph-painting',
      provider: req.query.provider as ProviderType | undefined,
      params: {
        taskType: 'generate',
        graphType: 'painting',
        ...params,
      },
      userId,
      storeToMinio,
      storageConfig,
    });

    // 异步执行任务
    taskExecutor.executeTask({
      taskId: createResponse.taskId,
      modelName: 'graph-painting',
      provider: req.query.provider as ProviderType | undefined,
      params: {
        taskType: 'generate',
        graphType: 'painting',
        ...params,
      },
      userId,
      storeToMinio,
      storageConfig,
    }).catch((error) => {
      console.error(`[Graph Route] 任务执行失败 (taskId: ${createResponse.taskId}):`, error);
    });

    return res.json({
      success: true,
      data: {
        taskId: createResponse.taskId,
        status: createResponse.status,
        createdAt: createResponse.createdAt,
      },
    });
  } catch (error) {
    console.error('[Graph Route] 绘画接口失败:', error);
    return res.status(500).json({
      success: false,
      error: 'Task creation failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// 生成图片（异步任务）
// 说明：
// - 所有 graph 请求统一走异步任务系统（cgi-task）进行追踪
// - 如果底层 provider（如 Replicate）本身是异步 job + 轮询，我们通过进度流写入 task
// - 如果底层 provider（如 DeerAPI）是同步接口，则由 TaskExecutor 直接将结果写入 task
// 注意：这个动态路由必须放在具体业务接口之后，避免误匹配
router.post('/:modelName', async (req: Request, res: Response) => {
  try {
    const { modelName } = req.params;
    const provider = req.query.provider as string | undefined;
    
    // 检查模型是否存在（优先检查 MODEL_MAP，确保有对应的实现文件）
    if (!MODEL_MAP[modelName]) {
      return res.status(404).json({
        success: false,
        error: 'Model not found',
        message: `Model "${modelName}" is not available. Available models: ${Object.keys(MODEL_MAP).join(', ')}`,
      });
    }

    // 获取用户 ID（从请求头，Gateway 会转发）
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
        message: 'User authentication required',
      });
    }

    const params = req.body;

    // 验证必需参数
    if (!params.prompt) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter',
        message: 'prompt is required',
      });
    }

    // 获取存储配置
    // 用户只需要传 storeToMinio: true，系统自动生成存储路径
    const storeToMinio = req.body.storeToMinio !== undefined 
      ? req.body.storeToMinio 
      : (req.query.storeToMinio === 'true');
    
    // 自动生成存储配置（路径格式：{userId}/graph/{timestamp}-{randomId}.{ext}）
    const storageConfig = {
      bucket: process.env.CGI_STORAGE_BUCKET || 'user-media',
      pathTemplate: '{userId}/graph/{timestamp}-{randomId}.{ext}',
    };
    
    // 如果用户明确提供了 storageConfig，则使用用户的配置（覆盖默认值）
    if (req.body.storageConfig) {
      Object.assign(storageConfig, req.body.storageConfig);
    }

    // 调试日志：记录接收到的参数和 provider 选择
    const { providerFactory } = require('../core/providers');
    const defaultProvider = providerFactory.getDefaultProvider();
    console.log(`[Graph Route] 模型: ${modelName}, 指定 provider: ${provider || '(未指定，将使用默认: ' + defaultProvider + ')'}, 默认 provider: ${defaultProvider}`);

    const imageParams = ['image', 'images', 'image_input', 'image_urls', 'image_base64s', 'input_image'];
    const receivedImageParams = Object.keys(params).filter(k => imageParams.includes(k));
    if (receivedImageParams.length > 0) {
      console.log(`[graph route] 接收到图片参数 (${modelName}):`, {
        params: receivedImageParams,
        image_urls_count: params.image_urls ? (Array.isArray(params.image_urls) ? params.image_urls.length : 1) : 0,
      });
    }

    // 创建异步任务
    const taskManager = taskExecutor.getTaskManager();
    const createResponse = await taskManager.createTask({
      type: 'image',
      model: modelName,
      provider: provider as ProviderType | undefined,
      params,
      userId,
      storeToMinio,
      storageConfig,
    });

    // 异步执行任务（不阻塞响应）
    // 注意：实际的 provider 选择会在模型文件的 generate() 函数中通过 providerFactory.getProviderForModel() 自动完成
    // 如果默认 provider 不支持该模型，会自动选择支持的 provider
    taskExecutor.executeTask({
      taskId: createResponse.taskId,
      modelName,
      provider: provider as ProviderType | undefined,
      params,
      userId,
      storeToMinio,
      storageConfig,
    }).catch((error) => {
      console.error(`[Graph Route] 任务执行失败 (taskId: ${createResponse.taskId}):`, error);
    });

    // 返回任务 ID
    return res.json({
      success: true,
      model: modelName,
      data: {
        taskId: createResponse.taskId,
        status: createResponse.status,
        createdAt: createResponse.createdAt,
      },
    });
  } catch (error) {
    console.error(`[Graph Route] Error creating task for model ${req.params.modelName}:`, error);
    res.status(500).json({
      success: false,
      error: 'Task creation failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
