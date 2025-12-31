import { Router, Request, Response } from 'express';
import type { ProviderType } from '../core/providers/types';
import { taskExecutor } from '../core/task/task-executor';
import { processReferenceImage } from '../core/utils/image-processor';

// 导入所有 video 模型文件
import * as sora2 from '../core/video/sora-2';
import * as sora2Pro from '../core/video/sora-2-pro';
import * as sora2All from '../core/video/sora-2-all';
import * as sora2ProAll from '../core/video/sora-2-pro-all';
import * as runway from '../core/video/runway';

// 统一从 suport-list.ts 读取所有 provider 的 video 模型列表
// 约定：对外暴露的模型名 = suport-list.ts 中各 provider.video 的 key
// 内部真实模型 ID（DeerAPI 等）由各 provider 自己根据 suport-list 的 value 处理
const supportList = require('../core/utils/suport-list').default as any;

const VIDEO_MODELS_FROM_PROVIDERS = [
  ...(Object.keys(supportList.deer?.video || {})),
];

// 去重后的模型列表
const SUPPORTED_MODELS: string[] = Array.from(new Set(VIDEO_MODELS_FROM_PROVIDERS));

// 模型映射（key 为我们对外暴露的模型名）
// 约定：这里的 key 必须与 `suport-list.ts` 中各 provider.video 的 key 完全一致
// 每个模型文件内部使用 providerFactory.getProviderForModel() 自动选择支持的 provider
const MODEL_MAP: Record<
  string,
  {
    generate: (params: any, provider?: ProviderType) => Promise<any>;
  }
> = {
  'sora-2': {
    generate: sora2.generate,
  },
  'sora-2-pro': {
    generate: sora2Pro.generate,
  },
  // 逆向异步 Sora（自研接口）
  'sora-2-all': {
    generate: sora2All.generate,
  },
  'sora-2-pro-all': {
    generate: sora2ProAll.generate,
  },
  // Runway 统一视频生成接口（自动选择：图片转视频/文本转视频/视频转视频）
  'runway': {
    generate: runway.generate,
  },
};

const router = Router();

// 获取所有可用的视频模型列表
router.get('/models', (_req: Request, res: Response) => {
  // 返回 MODEL_MAP 中的模型（确保都有对应的实现文件）
  const models = Object.keys(MODEL_MAP).map(modelName => ({
    name: modelName,
  }));
  res.json({ models });
});

// 生成视频（异步任务）
// 说明：
// - 所有 video 请求统一走异步任务系统（cgi-task）进行追踪
// - 如果底层 provider（如 DeerAPI）本身是异步 job + 轮询，我们通过进度流写入 task
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
    // Runway 接口的 prompt 验证更灵活：video-to-video 时 prompt 可选
    if (modelName !== 'runway' && !params.prompt) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter',
        message: 'prompt is required',
      });
    }
    
    // Runway 接口：至少需要 promptImage 或 videoUri 之一
    // 注意：根据 DeerAPI 文档，Runway 主要支持图片转视频和视频转视频
    if (modelName === 'runway') {
      if (!params.promptImage && !params.videoUri) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameter',
          message: '必须提供以下参数之一：promptImage（图片转视频）或 videoUri（视频转视频）',
        });
      }
    }

    // 获取存储配置
    // 用户只需要传 storeToMinio: true，系统自动生成存储路径
    const storeToMinio = req.body.storeToMinio !== undefined 
      ? req.body.storeToMinio 
      : (req.query.storeToMinio === 'true');

    // 调试日志：记录接收到的参数
    console.log(`[Video Route] 接收到的参数:`);
    console.log(`   model: ${modelName}`);
    if (params.prompt) {
      console.log(`   prompt: ${params.prompt?.substring(0, 50)}...`);
    }
    if (modelName !== 'runway') {
      // Sora 模型特有参数
      console.log(`   seconds: ${params.seconds} (类型: ${typeof params.seconds})`);
      console.log(`   size: ${params.size}`);
      
      // 处理 input_reference 日志（避免嵌套模板字符串问题）
      let inputRefLog = '未提供';
      if (params.input_reference) {
        if (typeof params.input_reference === 'string') {
          const sizeKB = (params.input_reference.length / 1024).toFixed(2);
          inputRefLog = `已提供 (${sizeKB} KB base64)`;
        } else {
          inputRefLog = '已提供 (Buffer/File)';
        }
      }
      console.log(`   input_reference: ${inputRefLog}`);
      
      // 确保 seconds 是字符串类型（如果提供）
      if (params.seconds !== undefined) {
        params.seconds = String(params.seconds);
      }

      // 处理参考图片：如果提供了 input_reference 和 size，检查并调整图片尺寸
      if (params.input_reference && params.size) {
        try {
          console.log(`[Video Route] 处理参考图片，目标分辨率: ${params.size}`);
          const processedImage = await processReferenceImage(
            params.input_reference,
            params.size
          );

          if (processedImage.resized) {
            console.log(
              `[Video Route] 参考图片已调整: ${processedImage.originalSize} → ${processedImage.targetSize}, ` +
              `大小: ${processedImage.originalSizeKB.toFixed(2)} KB → ${processedImage.finalSizeKB.toFixed(2)} KB`
            );
          } else if (processedImage.compressed) {
            console.log(
              `[Video Route] 参考图片已压缩: ${processedImage.originalSizeKB.toFixed(2)} KB → ${processedImage.finalSizeKB.toFixed(2)} KB`
            );
          }

          // 使用处理后的图片替换原图片
          params.input_reference = processedImage.base64;
        } catch (error) {
          console.error(`[Video Route] 处理参考图片失败:`, error);
          // 处理失败时继续使用原图，但记录警告
          console.warn(
            `[Video Route] 警告: 参考图片处理失败，将使用原图。如果图片尺寸与视频分辨率不匹配，参考图可能不会生效。`
          );
        }
      }
    } else {
      // Runway 模型特有参数
      if (params.promptImage) {
        const sizeKB = typeof params.promptImage === 'string' 
          ? (params.promptImage.length / 1024).toFixed(2) 
          : 'unknown';
        console.log(`   promptImage: 已提供 (${sizeKB} KB)`);
      }
      if (params.videoUri) {
        console.log(`   videoUri: ${params.videoUri}`);
      }
      console.log(`   ratio: ${params.ratio || '未指定'}`);
      console.log(`   duration: ${params.duration || '未指定'}`);
    }
    console.log(`   storeToMinio: ${storeToMinio}`);
    
    // 自动生成存储配置（路径格式：{userId}/video/{timestamp}-{randomId}.{ext}）
    const storageConfig = {
      bucket: process.env.CGI_STORAGE_BUCKET || 'user-media',
      pathTemplate: '{userId}/video/{timestamp}-{randomId}.{ext}',
    };
    
    // 如果用户明确提供了 storageConfig，则使用用户的配置（覆盖默认值）
    if (req.body.storageConfig) {
      Object.assign(storageConfig, req.body.storageConfig);
    }

    // 调试日志：记录接收到的参数和 provider 选择
    const { providerFactory } = require('../core/providers');
    const defaultProvider = providerFactory.getDefaultProvider();
    console.log(`[Video Route] 模型: ${modelName}, 指定 provider: ${provider || '(未指定，将使用默认: ' + defaultProvider + ')'}, 默认 provider: ${defaultProvider}`);

    // 创建异步任务
    const taskManager = taskExecutor.getTaskManager();
    const createResponse = await taskManager.createTask({
      type: 'video',
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
      console.error(`[Video Route] 任务执行失败 (taskId: ${createResponse.taskId}):`, error);
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
    console.error(`[Video Route] Error creating task for model ${req.params.modelName}:`, error);
    res.status(500).json({
      success: false,
      error: 'Task creation failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
