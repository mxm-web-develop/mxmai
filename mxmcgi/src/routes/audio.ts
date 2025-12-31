import { Router, Request, Response } from 'express';
import type { ProviderType } from '../core/providers/types';
import { taskExecutor } from '../core/task/task-executor';

// 导入所有 audio 模型文件
import * as minimaxVoiceCloning from '../core/audio/minimax-voice-cloning';
import * as minimaxSpeech02Turbo from '../core/audio/minimax-speech-02-turbo';
import * as minimaxSpeech02HdAsync from '../core/audio/minimax-speech-02-hd-async';
import * as minimaxSpeech26HdAsync from '../core/audio/minimax-speech-2.6-hd-async';
import * as minimaxSpeech25HdAsync from '../core/audio/minimax-speech-2.5-hd-async';
import * as minimaxSpeech25TurboAsync from '../core/audio/minimax-speech-2.5-turbo-async';
import * as minimaxSpeech26Hd from '../core/audio/minimax-speech-2.6-hd';
import * as minimaxSpeech25Turbo from '../core/audio/minimax-speech-2.5-turbo';
import * as minimaxSpeech25Hd from '../core/audio/minimax-speech-2.5-hd';

// 统一从 suport-list.ts 读取所有 provider 的 audio 模型列表
// 约定：对外暴露的模型名 = suport-list.ts 中各 provider.audio 的 key
// 内部真实模型 ID（PPIO 等）由各 provider 自己根据 suport-list 的 value 处理
const supportList = require('../core/utils/suport-list').default as any;

const AUDIO_MODELS_FROM_PROVIDERS = [
  ...(Object.keys(supportList.replicate?.audio || {})),
  ...(Object.keys(supportList.ppio?.audio || {})),
  ...(Object.keys(supportList.deer?.audio || {})),
];

// 去重后的模型列表
const SUPPORTED_MODELS: string[] = Array.from(new Set(AUDIO_MODELS_FROM_PROVIDERS));

// 同步模型列表（直接返回结果，不创建任务）
const SYNC_MODELS: string[] = [
  'minimax-speech-02-turbo', // 同步语音合成
  'minimax-speech-2.6-hd', // 同步语音合成
  'minimax-speech-2.5-turbo', // 同步语音合成
  'minimax-speech-2.5-hd', // 同步语音合成
];

// 模型映射（key 为我们对外暴露的模型名）
// 约定：这里的 key 必须与 `suport-list.ts` 中各 provider.audio 的 key 完全一致
// 每个模型文件内部使用 providerFactory.getProviderForModel() 自动选择支持的 provider
const MODEL_MAP: Record<string, {
  generate: (params: any, provider?: ProviderType) => Promise<any>;
}> = {
  'minimax-voice-cloning': {
    generate: minimaxVoiceCloning.generate,
  },
  'minimax-speech-02-turbo': {
    generate: minimaxSpeech02Turbo.generate,
  },
  'minimax-speech-02-hd-async': {
    generate: minimaxSpeech02HdAsync.generate,
  },
  'minimax-speech-2.6-hd-async': {
    generate: minimaxSpeech26HdAsync.generate,
  },
  'minimax-speech-2.5-hd-async': {
    generate: minimaxSpeech25HdAsync.generate,
  },
  'minimax-speech-2.5-turbo-async': {
    generate: minimaxSpeech25TurboAsync.generate,
  },
  'minimax-speech-2.6-hd': {
    generate: minimaxSpeech26Hd.generate,
  },
  'minimax-speech-2.5-turbo': {
    generate: minimaxSpeech25Turbo.generate,
  },
  'minimax-speech-2.5-hd': {
    generate: minimaxSpeech25Hd.generate,
  },
};

const router = Router();

// 获取所有可用的音频模型列表
router.get('/models', (_req: Request, res: Response) => {
  // 返回 MODEL_MAP 中的模型（确保都有对应的实现文件）
  const models = Object.keys(MODEL_MAP).map(modelName => ({
    name: modelName,
  }));
  res.json({ models });
});

// 生成音频（异步任务）
// 说明：
// - 所有 audio 请求统一走异步任务系统（cgi-task）进行追踪
// - 如果底层 provider（如 PPIO）本身是异步 job + 轮询，我们通过进度流写入 task
// - 如果底层 provider 是同步接口，则由 TaskExecutor 直接将结果写入 task
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

    // 调试日志：记录接收到的请求体
    console.log(`[Audio Route] 接收到的请求体:`, {
      hasBody: !!req.body,
      bodyType: typeof req.body,
      bodyKeys: req.body ? Object.keys(req.body) : [],
      text: req.body?.text,
      prompt: req.body?.prompt,
      contentType: req.headers['content-type'],
      method: req.method,
    });

    // 验证必需参数（根据模型类型不同，必需参数也不同）
    if (modelName === 'minimax-voice-cloning') {
      // 音色复刻需要 audio_url
      if (!params.audio_url && !params.audioUrl) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameter',
          message: 'audio_url is required for voice cloning',
        });
      }
    } else {
      // 语音合成需要 text/prompt
      if (!params.text && !params.prompt) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameter',
          message: 'text or prompt is required',
        });
      }
    }

    // 获取存储配置
    // 用户只需要传 storeToMinio: true，系统自动生成存储路径
    const storeToMinio = req.body.storeToMinio !== undefined 
      ? req.body.storeToMinio 
      : (req.query.storeToMinio === 'true');
    
    // 自动生成存储配置（路径格式：{userId}/audio/{timestamp}-{randomId}.{ext}）
    const storageConfig = {
      bucket: process.env.CGI_STORAGE_BUCKET || 'user-media',
      pathTemplate: '{userId}/audio/{timestamp}-{randomId}.{ext}',
    };
    
    // 如果用户明确提供了 storageConfig，则使用用户的配置（覆盖默认值）
    if (req.body.storageConfig) {
      Object.assign(storageConfig, req.body.storageConfig);
    }

    // 调试日志：记录接收到的参数和 provider 选择
    const { providerFactory } = require('../core/providers');
    const defaultProvider = providerFactory.getDefaultProvider();
    console.log(`[Audio Route] 模型: ${modelName}, 指定 provider: ${provider || '(未指定，将使用默认: ' + defaultProvider + ')'}, 默认 provider: ${defaultProvider}`);

    // 判断是否为同步模型
    const isSyncModel = SYNC_MODELS.includes(modelName);

    // 1) 同步模型 + 不需要 MinIO：直接调用并返回（保持原有快速体验）
    if (isSyncModel && !storeToMinio) {
      console.log(`[Audio Route] 同步模型（不存储），直接返回结果`);
      
      try {
        const modelHandler = MODEL_MAP[modelName];
        const result = await modelHandler.generate(
          {
            prompt: params.text || params.prompt,
            voice_setting: params.voice_setting,
            audio_setting: params.audio_setting,
            pronunciation_dict: params.pronunciation_dict,
            timbre_weights: params.timbre_weights,
            stream: params.stream,
            stream_options: params.stream_options,
            language_boost: params.language_boost,
            output_format: params.output_format || 'url',
            voice_modify: params.voice_modify,
            provider: provider as ProviderType | undefined,
          },
          provider as ProviderType | undefined,
        );

        return res.json({
          success: true,
          model: modelName,
          data: {
            mediaUrls: result.mediaUrls || [],
            metadata: result.metadata || {},
          },
        });
      } catch (error) {
        console.error(`[Audio Route] 同步模型生成失败:`, error);
        return res.status(500).json({
          success: false,
          error: 'Generation failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 2) 其他情况（异步模型，或者同步模型但需要存储到 MinIO）：统一走任务系统
    console.log(
      `[Audio Route] 使用任务系统执行（模型: ${modelName}, isSyncModel: ${isSyncModel}, storeToMinio: ${storeToMinio})`,
    );
    
    const taskManager = taskExecutor.getTaskManager();
    const createResponse = await taskManager.createTask({
      type: 'audio',
      model: modelName,
      provider: provider as ProviderType | undefined,
      params,
      userId,
      storeToMinio,
      storageConfig,
    });

    taskExecutor
      .executeTask({
        taskId: createResponse.taskId,
        modelName,
        provider: provider as ProviderType | undefined,
        params,
        userId,
        storeToMinio,
        storageConfig,
      })
      .catch((error) => {
        console.error(`[Audio Route] 任务执行失败 (taskId: ${createResponse.taskId}):`, error);
      });

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
    console.error(`[Audio Route] Error creating task for model ${req.params.modelName}:`, error);
    res.status(500).json({
      success: false,
      error: 'Task creation failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
