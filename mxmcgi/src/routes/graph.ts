import { Router, Request, Response } from 'express';
import type { ProviderType } from '../models/providers';
import { taskExecutor } from '../task/task-executor';
import type { PhotographParams, DesignParams, PaintingParams } from '../core/graph/type';
import { getGraphTypeOptions, getFormOptionsForType } from '../clientServer/graph';
import { getResolvedRouting } from '../models/providers';
import { resolveGraphModel } from '../core/graph/graph-model-routing';
import { BillingService } from '../statistics/billing-service';
import { findEnabledModel, listEnabledModelKeysByScope } from '../models/provider-model-catalog';

// 模型列表与存在性检查：仅通过 DB 的 provider_models（纯动态）
const SUPPORTED_MODELS: string[] = listEnabledModelKeysByScope('graph');

function isGraphModelSupported(modelName: string): boolean {
  return findEnabledModel({ modelKey: modelName, scope: 'graph' }) !== null;
}

const router = Router();

// 获取所有可用的图模型列表（来自 registry）
router.get('/models', (_req: Request, res: Response) => {
  const models = listEnabledModelKeysByScope('graph').map(modelName => ({ name: modelName }));
  res.json({ models });
});

/**
 * GET /api/v1/cgi/graph/getformOptions
 * 获取表单选项配置
 * Query params:
 *   - photograph: 获取摄影类型的表单选项（可选，需要配合 type 参数）
 *   - design: 获取设计类型的表单选项（可选，需要配合 type 参数）
 *   - painting: 获取绘画类型的表单选项（可选，需要配合 type 参数）
 *   - type: 子类型（如 portrait, landscape, 3d, illustration 等）
 *   - lang: 语言代码 'zh' | 'en' (默认 'zh')
 */
router.get('/getformOptions', (req: Request, res: Response) => {
  try {
    const { photograph, design, painting, type, lang } = req.query;
    const language = (lang as 'zh' | 'en') || 'zh';

    // 验证语言参数
    if (language !== 'zh' && language !== 'en') {
      return res.status(400).json({
        success: false,
        error: 'Invalid language parameter',
        message: 'lang must be "zh" or "en"',
      });
    }

    // 检查参数是否存在
    const hasPhotograph = 'photograph' in req.query;
    const hasDesign = 'design' in req.query;
    const hasPainting = 'painting' in req.query;

    // 确定 graphType
    let graphType: 'photograph' | 'design' | 'painting' | null = null;
    if (hasPhotograph) {
      graphType = 'photograph';
    } else if (hasDesign) {
      graphType = 'design';
    } else if (hasPainting) {
      graphType = 'painting';
    }

    // 如果没有指定 graphType，返回错误
    if (!graphType) {
      return res.status(400).json({
        success: false,
        error: 'Missing type parameter',
        message: 'Please specify one of: photograph, design, painting',
      });
    }

    // 如果没有指定 type，默认使用第一个子类型
    let subType = type as string;
    if (!subType) {
      const typeOptions = getGraphTypeOptions(graphType);
      if (typeOptions.length > 0) {
        subType = typeOptions[0].value;
      } else {
        return res.status(400).json({
          success: false,
          error: 'Missing type parameter',
          message: `Please specify a type for ${graphType}`,
        });
      }
    }

    // 获取表单选项
    const formOptions = getFormOptionsForType(graphType, subType, language);
    
    if (!formOptions) {
      return res.status(404).json({
        success: false,
        error: 'Form options not found',
        message: `Form options for ${graphType}/${subType} are not available`,
      });
    }

    return res.json({
      success: true,
      data: {
        graphType,
        type: subType,
        language,
        options: formOptions,
      },
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

    // 余额预检：根据业务维度解析实际模型，估算 1 张图的费用
    const resolvedPhotograph = await resolveGraphModel('photograph', params.type, req.query.provider as ProviderType | undefined);
    const rProvider = resolvedPhotograph.provider;
    const rModel = resolvedPhotograph.modelName;
    const balanceCheck = await BillingService.checkBalance({
      userId, provider: rProvider, modelKey: rModel, scope: 'graph', estimatedImageCount: 1,
    });
    if (!balanceCheck.allowed) {
      return res.status(402).json({
        success: false, code: 'INSUFFICIENT_BALANCE',
        message: `余额不足，本次预计消耗约 ${balanceCheck.estimatedTokens} MXM-TOKEN，当前余额 ${balanceCheck.currentBalance}`,
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

    // 余额预检：根据业务维度解析实际模型
    const resolvedDesign = await resolveGraphModel('design', params.type, req.query.provider as ProviderType | undefined);
    const rProviderD = resolvedDesign.provider;
    const rModelD = resolvedDesign.modelName;
    const balanceCheckD = await BillingService.checkBalance({
      userId, provider: rProviderD, modelKey: rModelD, scope: 'graph', estimatedImageCount: 1,
    });
    if (!balanceCheckD.allowed) {
      return res.status(402).json({
        success: false, code: 'INSUFFICIENT_BALANCE',
        message: `余额不足，本次预计消耗约 ${balanceCheckD.estimatedTokens} MXM-TOKEN，当前余额 ${balanceCheckD.currentBalance}`,
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

    // 余额预检：根据业务维度解析实际模型
    const resolvedPainting = await resolveGraphModel('painting', params.type, req.query.provider as ProviderType | undefined);
    const rProviderP = resolvedPainting.provider;
    const rModelP = resolvedPainting.modelName;
    const balanceCheckP = await BillingService.checkBalance({
      userId, provider: rProviderP, modelKey: rModelP, scope: 'graph', estimatedImageCount: 1,
    });
    if (!balanceCheckP.allowed) {
      return res.status(402).json({
        success: false, code: 'INSUFFICIENT_BALANCE',
        message: `余额不足，本次预计消耗约 ${balanceCheckP.estimatedTokens} MXM-TOKEN，当前余额 ${balanceCheckP.currentBalance}`,
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
    
    // 检查模型是否在 registry 中注册（单轨）
    if (!isGraphModelSupported(modelName)) {
      return res.status(404).json({
        success: false,
        error: 'Model not found',
        message: `Model "${modelName}" is not available. Available models: ${SUPPORTED_MODELS.join(', ')}`,
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
    const { providerFactory } = require('../models/providers');
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
