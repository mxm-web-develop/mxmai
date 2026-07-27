import { Router, Request, Response } from 'express';
import multer from 'multer';
import type { ProviderType } from '../models/providers';
import { taskExecutor } from '../task/task-executor';
import { runByModelKey } from '../models/run';
import { findEnabledModel, listEnabledModelKeysByScope } from '../models/provider-model-catalog';
import { getGeneratedBucket } from '../storage/generated-temp';
import {
  cloneMaxplanVoice,
  downloadAudioBufferFromUrl,
  generateCloneVoiceId,
  listMaxplanVoices,
  uploadMaxplanVoiceCloneFile,
  type MinimaxVoiceType,
} from '../core/audio/maxplan-voice-service';
import {
  listVoiceAssetsFromVirtualFolder,
  registerClonedVoiceAsset,
} from '../core/audio/voice-asset-registry';

const voiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// 模型列表与存在性：仅通过 DB 的 provider_models（纯动态）
const SUPPORTED_MODELS: string[] = listEnabledModelKeysByScope('audio');

function isAudioModelSupported(modelName: string): boolean {
  return findEnabledModel({ modelKey: modelName, scope: 'audio' }) !== null;
}

const router = Router();

// 获取所有可用的音频模型列表（来自 registry）
router.get('/models', (_req: Request, res: Response) => {
  const models = listEnabledModelKeysByScope('audio').map(modelName => ({ name: modelName }));
  res.json({ models });
});

const VALID_VOICE_TYPES = new Set<MinimaxVoiceType>([
  'system',
  'voice_cloning',
  'voice_generation',
  'all',
]);

/** MiniMax 音色列表（系统 / 克隆 / 全部） */
router.get('/voices', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
        message: 'User authentication required',
      });
    }

    const rawType = String(req.query.voice_type ?? req.query.type ?? 'system').trim() as MinimaxVoiceType;
    const voiceType: MinimaxVoiceType = VALID_VOICE_TYPES.has(rawType) ? rawType : 'system';
    const voices = await listMaxplanVoices(voiceType);

    return res.json({
      success: true,
      voice_type: voiceType,
      count: voices.length,
      voices,
    });
  } catch (error) {
    console.error('[Audio Route] list voices failed:', error);
    return res.status(500).json({
      success: false,
      error: 'List voices failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/** 从虚拟文件夹软链读取用户登记的克隆音色（metadata.asset_type=minimax_voice） */
router.get('/voices/from-folder/:folderId', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
        message: 'User authentication required',
      });
    }

    const folderId = String(req.params.folderId ?? '').trim();
    if (!folderId) {
      return res.status(400).json({
        success: false,
        error: 'Missing folderId',
        message: '请提供虚拟文件夹 ID',
      });
    }

    const voices = await listVoiceAssetsFromVirtualFolder(userId, folderId);
    return res.json({
      success: true,
      folder_id: folderId,
      count: voices.length,
      voices,
    });
  } catch (error) {
    console.error('[Audio Route] list folder voices failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('不存在') || message.includes('无权限') ? 404 : 500;
    return res.status(status).json({
      success: false,
      error: 'List folder voices failed',
      message,
    });
  }
});

/** MiniMax 音色快速克隆（上传 mp3/m4a/wav 或 audio_url） */
router.post('/voice-clone', voiceUpload.single('file'), async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
        message: 'User authentication required',
      });
    }

    const body = req.body as Record<string, unknown>;
    const voiceName = typeof body.voice_name === 'string' ? body.voice_name.trim() : '';
    const previewText =
      typeof body.preview_text === 'string' && body.preview_text.trim()
        ? body.preview_text.trim()
        : '你好，这是我的专属克隆音色，欢迎使用智能口播。';
    const model =
      typeof body.model === 'string' && body.model.trim() ? body.model.trim() : 'speech-2.8-hd';
    const customVoiceId =
      typeof body.voice_id === 'string' && body.voice_id.trim() ? body.voice_id.trim() : undefined;
    const virtualFolderId =
      (typeof body.virtual_folder_id === 'string' && body.virtual_folder_id.trim()) ||
      (typeof body.folder_id === 'string' && body.folder_id.trim()) ||
      undefined;

    let buffer: Buffer;
    let filename: string;
    let mimeType: string | undefined;

    const multerFile = (req as Request & {
      file?: { buffer: Buffer; originalname: string; mimetype: string };
    }).file;
    if (multerFile?.buffer) {
      buffer = multerFile.buffer;
      filename = multerFile.originalname || 'voice-clone.mp3';
      mimeType = multerFile.mimetype;
    } else {
      const audioUrl =
        (typeof body.audio_url === 'string' && body.audio_url.trim()) ||
        (typeof body.audioUrl === 'string' && body.audioUrl.trim()) ||
        '';
      if (!audioUrl) {
        return res.status(400).json({
          success: false,
          error: 'Missing audio',
          message: '请上传 file（mp3/m4a/wav）或提供 audio_url',
        });
      }
      const downloaded = await downloadAudioBufferFromUrl(audioUrl);
      buffer = downloaded.buffer;
      filename = downloaded.filename;
      mimeType = downloaded.mimeType;
    }

    const fileId = await uploadMaxplanVoiceCloneFile(buffer, filename, mimeType);
    const voiceId = customVoiceId ?? generateCloneVoiceId(userId, voiceName || 'Clone');
    const result = await cloneMaxplanVoice({
      fileId,
      voiceId,
      previewText,
      model,
    });

    const label = voiceName || result.voice_id;
    let storageObjectId: string | undefined;
    let linkedFolderId: string | undefined;
    try {
      const registered = await registerClonedVoiceAsset({
        userId,
        virtualFolderId,
        voiceId: result.voice_id,
        label,
        model,
        demoAudio: result.demo_audio,
        sourceBuffer: buffer,
        sourceFilename: filename,
        sourceMimeType: mimeType,
      });
      storageObjectId = registered.storageObjectId;
      linkedFolderId = registered.virtualFolderId;
    } catch (regErr) {
      console.error('[Audio Route] register cloned voice asset failed:', regErr);
    }

    return res.json({
      success: true,
      data: {
        voice_id: result.voice_id,
        label,
        demo_audio: result.demo_audio,
        mode: 'clone',
        input_sensitive_type: result.input_sensitive_type,
        storage_object_id: storageObjectId,
        virtual_folder_id: linkedFolderId,
      },
    });
  } catch (error) {
    console.error('[Audio Route] voice clone failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Voice clone failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
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
    
    // 检查模型是否在 registry 中注册（单轨）
    if (!isAudioModelSupported(modelName)) {
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
      bucket: getGeneratedBucket(),
      pathTemplate: '{userId}/audio/{timestamp}-{randomId}.{ext}',
    };
    
    // 如果用户明确提供了 storageConfig，则使用用户的配置（覆盖默认值）
    if (req.body.storageConfig) {
      Object.assign(storageConfig, req.body.storageConfig);
    }

    // 调试日志：记录接收到的参数和 provider 选择
    const { providerFactory } = require('../models/providers');
    const defaultProvider = providerFactory.getDefaultProvider();
    console.log(`[Audio Route] 模型: ${modelName}, 指定 provider: ${provider || '(未指定，将使用默认: ' + defaultProvider + ')'}, 默认 provider: ${defaultProvider}`);

    // 纯动态：是否走同步流式由请求决定（不再写死模型列表）
    const useSyncStream =
      !storeToMinio &&
      (params.stream === true ||
        (req.query.stream as string | undefined) === 'true' ||
        (req.query.sync as string | undefined) === 'true');

    // 1) 同步流式 + 不需要 MinIO：直接返回流数据
    if (useSyncStream) {
      console.log(`[Audio Route] 同步流式（不存储），直接返回流数据`);
      
      try {
        // 设置 SSE 响应头
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // 禁用 nginx 缓冲

        const result = await runByModelKey(
          'audio',
          modelName,
          {
            prompt: params.text || params.prompt,
            voice_setting: params.voice_setting,
            audio_setting: params.audio_setting,
            pronunciation_dict: params.pronunciation_dict,
            timbre_weights: params.timbre_weights,
            stream: true,
            stream_options: params.stream_options,
            language_boost: params.language_boost,
            output_format: params.output_format || 'url',
            voice_modify: params.voice_modify,
          },
          { providerOverride: provider as ProviderType },
        );

        // 如果有流数据，流式返回
        if (result.stream) {
          for await (const chunk of result.stream) {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            // 立即刷新缓冲区
            if (typeof (res as any).flush === 'function') {
              (res as any).flush();
            }
          }
          res.write('data: [DONE]\n\n');
          res.end();
        } else if (result.mediaUrls && result.mediaUrls.length > 0) {
          // 如果没有流，但有 URL，返回完整结果
          res.write(`data: ${JSON.stringify({
            status: 'completed',
            mediaUrls: result.mediaUrls,
            metadata: result.metadata,
          })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        } else {
          throw new Error('未返回音频数据');
        }
      } catch (error) {
        console.error(`[Audio Route] 同步模型生成失败:`, error);
        res.write(`data: ${JSON.stringify({
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        })}\n\n`);
        res.end();
      }
      return; // 确保不继续执行后续代码
    }

    // 2) 其他情况：统一走任务系统
    console.log(
      `[Audio Route] 使用任务系统执行（模型: ${modelName}, storeToMinio: ${storeToMinio})`,
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
