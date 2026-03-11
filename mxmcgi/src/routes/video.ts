import { Router, Request, Response } from 'express';
import type { ProviderType } from '../models/providers';
import { taskExecutor } from '../task/task-executor';
import { processReferenceImage } from '../clientServer/graph/utils/image-processor';
import { getVideoFormOptions } from '../clientServer/video/formOptions';
import { generate as videoGenerate } from '../core/video/video-service';
import { listModels, getModelsByKey } from '../models/registry';

// 模型列表与存在性：仅通过 registry（单轨）
const VIDEO_MODELS = listModels({ scope: 'video' });
const SUPPORTED_MODELS: string[] = Array.from(new Set(VIDEO_MODELS.map(d => d.modelKey)));

function isVideoModelSupported(modelName: string): boolean {
  return getModelsByKey('video', modelName).length > 0;
}

const router = Router();

// 获取所有可用的视频模型列表（来自 registry）
router.get('/models', (_req: Request, res: Response) => {
  const models = SUPPORTED_MODELS.map(modelName => ({ name: modelName }));
  res.json({ models });
});

// 业务层：chunk_seconds 表单选项（按 mode：sora-2 => 4/8/12，sora-2-deer => 10/15）
router.get('/getformOptions', (req: Request, res: Response) => {
  const lang = (req.query.lang as string) === 'en' ? 'en' : 'zh';
  const modeParam = req.query.mode as string | undefined;
  const mode = modeParam === 'sora-2-deer' ? 'sora-2-deer' : 'sora-2';
  const options = getVideoFormOptions(lang, mode);
  res.json({ success: true, data: options });
});

// 业务层：统一生成入口（需在 /:modelName 之前注册）
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
        message: 'User authentication required',
      });
    }
    const body = req.body as Record<string, any>;
    const provider = (req.query.provider as string) || undefined;
    // 调试：打印入参（便于排查“参数传的是什么”）
    const chunks = body.chunks;
    console.log('[Video Route] POST /video/generate 入参:', {
      keys: Object.keys(body),
      hasChunks: Array.isArray(chunks),
      chunkCount: Array.isArray(chunks) ? chunks.length : 0,
      scriptType: body.scriptType,
      label: body.label,
      storeToMinio: body.storeToMinio,
      ...(Array.isArray(chunks) && chunks.length > 0
        ? {
            firstChunkKeys: Object.keys(chunks[0] || {}),
            firstChunkPromptLength: (chunks[0]?.prompt ?? '').length,
            firstChunkSeconds: chunks[0]?.chunk_seconds,
            firstChunkHasRef: !!(chunks[0]?.reference_image_url ?? chunks[0]?.input_reference),
          }
        : {}),
    });
    const result = await videoGenerate(body, { userId, provider });
    return res.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Video Route] POST /video/generate error:', message);
    return res.status(400).json({
      success: false,
      error: 'Bad request',
      message,
    });
  }
});

// 生成视频（异步任务）
// 说明：
// - 所有 video 请求统一走异步任务系统（cgi-task）进行追踪
// - 如果底层 provider（如 DeerAPI）本身是异步 job + 轮询，我们通过进度流写入 task
router.post('/:modelName', async (req: Request, res: Response) => {
  try {
    const { modelName } = req.params;
    const provider = req.query.provider as string | undefined;
    
    // 检查模型是否在 registry 中注册（单轨）
    if (!isVideoModelSupported(modelName)) {
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
    const { providerFactory } = require('../models/providers');
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
