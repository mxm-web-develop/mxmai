import { Router, Request, Response } from 'express';
import type { ProviderType } from '../core/providers/types';
import { taskExecutor } from '../core/task/task-executor';

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

// 生成图片（异步任务）
// 说明：
// - 所有 graph 请求统一走异步任务系统（cgi-task）进行追踪
// - 如果底层 provider（如 Replicate）本身是异步 job + 轮询，我们通过进度流写入 task
// - 如果底层 provider（如 DeerAPI）是同步接口，则由 TaskExecutor 直接将结果写入 task
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
