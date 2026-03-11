/**
 * Writing 路由
 * 提供写作相关的 API 接口，以及按模型名直接调 LLM 的 completion 接口（原 text 路由能力已并入）
 */

import { Router, Request, Response } from 'express';
import type { ProviderType } from '../models/providers';
import { taskExecutor } from '../task/task-executor';
import { startWritingTask } from '../core/writing/writing-task';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { containsSensitiveWords, checkObjectForSensitiveWords } from '../sensitive/check';
import { getSensitiveWordsForSlot } from '../prompts/sensitive-resolver';
import { getResolvedRouting } from '../models/providers';
import { BillingService } from '../statistics/billing-service';
import type {
  OutlineParams,
  WritingGenerateParams,
  SyncToTaskParams,
} from '../core/writing/type';
import { DeerAPIClient } from '../models/deerapi/client';
import { getWritingFormOptionsForType } from '../clientServer/writing';
import { getWritingBusinessKey, getWritingBusinessKeyFromParams } from '../core/writing/business-key';
import { listModels, getModelsByKey } from '../models/registry';
import { runByModelKey } from '../models/run';

const router = Router();

// ---------- 按模型名调 LLM（原 text 路由逻辑，统一到 writing） ----------
const WRITING_MODELS = listModels({ scope: 'writing' });
const WRITING_MODEL_KEYS: string[] = Array.from(new Set(WRITING_MODELS.map(d => d.modelKey)));

function isWritingModelSupported(modelName: string): boolean {
  return getModelsByKey('writing', modelName).length > 0;
}

/** 兼容 graph-service、character-service 等：由 registry 驱动 */
export const MODEL_MAP: Record<string, { generate: (params: any, provider?: ProviderType) => Promise<any> }> = (() => {
  const map: Record<string, { generate: (params: any, provider?: ProviderType) => Promise<any> }> = {};
  for (const modelKey of WRITING_MODEL_KEYS) {
    map[modelKey] = {
      generate: (params: any, provider?: ProviderType) =>
        runByModelKey('writing', modelKey, params, { providerOverride: provider }),
    };
  }
  return map;
})();

/** GET /writing/models - 可用写作/LLM 模型列表 */
router.get('/models', (_req: Request, res: Response) => {
  res.json({ models: WRITING_MODEL_KEYS.map(name => ({ name })) });
});

/** POST /writing/completion/:modelName - 按模型名直接生成（原 POST /text/:modelName） */
router.post('/completion/:modelName', async (req: Request, res: Response) => {
  try {
    const { modelName } = req.params;
    const provider = req.query.provider as string | undefined;
    if (!isWritingModelSupported(modelName)) {
      return res.status(404).json({
        error: 'Model not found',
        message: `Model "${modelName}" is not available. Available models: ${WRITING_MODEL_KEYS.join(', ')}`,
      });
    }
    const params = req.body;
    if (!params.prompt) {
      return res.status(400).json({
        error: 'Missing required parameter',
        message: 'prompt is required',
      });
    }
    if (params.sensitives && Array.isArray(params.sensitives) && params.sensitives.length > 0) {
      if (containsSensitiveWords(params.prompt, params.sensitives)) {
        return res.status(400).json({
          error: 'Sensitive content detected',
          message: '你提交的内容涉及敏感内容，请检查',
        });
      }
    }
    const outputFormat = params.outputFormat || 'json';
    if (outputFormat === 'stream') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      const result = await runByModelKey('writing', modelName, params, { providerOverride: provider as ProviderType });
      const r = result as { stream?: AsyncIterable<any>; streamString?: AsyncIterable<string> };
      if (r.stream) {
        for await (const chunk of r.stream) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
      } else if (r.streamString) {
        for await (const chunk of r.streamString) {
          res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
        }
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      const result = await runByModelKey('writing', modelName, params, { providerOverride: provider as ProviderType });
      res.json({ success: true, model: modelName, result });
    }
  } catch (error) {
    console.error(`[Writing Route] completion/${req.params.modelName} failed:`, error);
    res.status(500).json({
      error: 'Generation failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// ---------- 写作业务接口 ----------

/**
 * POST /api/v1/writing/outline
 * 生成写作大纲（支持流式和异步任务两种模式）
 */
router.post('/outline', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
      });
    }

    const params = req.body as OutlineParams;

    // 验证必需参数
    if (!params.uid || !params.prompt) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: uid, prompt',
      });
    }

    // 敏感词检查（失败不阻塞，仅打日志）
    let outlineSensitiveWords: string[] = [];
    try {
      outlineSensitiveWords = await getSensitiveWordsForSlot(
        'writing',
        (params as any).writing_type || 'outlines',
        (params as any).outline_type ?? null
      );
    } catch (e) {
      console.warn('[Writing Route] getSensitiveWordsForSlot failed, skip check:', e instanceof Error ? e.message : e);
    }
    if (outlineSensitiveWords.length > 0 && containsSensitiveWords(params.prompt, outlineSensitiveWords)) {
      return res.status(400).json({
        success: false,
        error: '你提交的内容涉及敏感内容，请检查',
      });
    }

    const outputFormat = params.outputFormat || 'json';

    // 流式输出模式
    if (outputFormat === 'stream') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // 禁用 nginx 缓冲

      try {
        const { generateOutlineStream } = await import('../core/writing/writing-service');
        const stream = generateOutlineStream(
          {
            uid: params.uid,
            prompt: params.prompt,
            maxDepth: params.maxDepth,
            expectedNodes: params.expectedNodes,
            total_textcount: params.total_textcount,
            applyto: params.applyto,
            knowledgeBase: params.knowledgeBase,
            cast_character_count: params.cast_character_count,
            cast_character_ids: params.cast_character_ids,
            language: (params as any).language,
          },
          userId,
          req.query.provider as string | undefined
        );

        for await (const chunk of stream) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }

        res.write('data: [DONE]\n\n');
        res.end();
      } catch (error) {
        res.write(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n\n`);
        res.end();
      }
      return;
    }

    // 异步任务模式（默认）
    const taskManager = taskExecutor.getTaskManager();
    const writingType = params.writing_type || 'outlines';
    const businessKey = getWritingBusinessKeyFromParams(
      { writing_type: writingType, applyto: params.applyto },
      'outline'
    );

    // 余额预检：用当前任务实际使用的 businessKey 对应路由
    let balanceCheckW: { allowed: boolean; estimatedTokens: number; currentBalance: number };
    try {
      const { provider: rwProvider, model: rwModel } = getResolvedRouting(businessKey);
      const estTokens = Math.ceil(Number(params.total_textcount || 1000) * 1.5);
      balanceCheckW = await BillingService.checkBalance({
        userId, provider: rwProvider, modelKey: rwModel, scope: 'writing',
        estimatedOutputTokens: estTokens, estimatedInputTokens: 500,
      });
    } catch (e) {
      console.error('[Writing Route] outline balance check failed:', e);
      return res.status(503).json({
        success: false,
        error: '服务暂时不可用，请稍后重试',
      });
    }
    if (!balanceCheckW.allowed) {
      return res.status(402).json({
        success: false, code: 'INSUFFICIENT_BALANCE',
        message: `余额不足，本次预计消耗约 ${balanceCheckW.estimatedTokens} MXM-TOKEN，当前余额 ${balanceCheckW.currentBalance}`,
      });
    }

    const createResponse = await taskManager.createTask({
      type: 'writing',
      model: businessKey,
      provider: req.query.provider as string | undefined,
      params: {
        taskType: 'outline',
        params: {
          ...params,
          writing_type: writingType,
        },
        userId,
        provider: req.query.provider as string | undefined,
      },
      userId,
      storeToMinio: false,
    });

    taskExecutor.executeTask({
      taskId: createResponse.taskId,
      modelName: businessKey,
      provider: undefined,
      params: {
        taskType: 'outline',
        params: {
          ...params,
          writing_type: writingType,
        },
        userId,
        provider: req.query.provider as string | undefined,
      },
      userId,
      storeToMinio: false,
    }).catch((error) => {
      console.error(`[Writing Route] 任务执行失败 (taskId: ${createResponse.taskId}):`, error);
    });

    return res.json({
      success: true,
      data: {
        taskId: createResponse.taskId,
        status: createResponse.status,
      },
    });
  } catch (error) {
    console.error('[Writing Route] 生成大纲失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/v1/writing/generate
 * 生成文章（支持流式和异步任务两种模式）
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
      });
    }

    const params = req.body as WritingGenerateParams;

    // 验证必需参数
    if (!params.prompt) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: prompt',
      });
    }

    // 敏感词检查（优先 DB 绑定，无则回退代码默认列表）
    const generateSensitiveWords = await getSensitiveWordsForSlot(
      'writing',
      params.writing_type || 'articles',
      params.outline_type ?? null
    );
    if (generateSensitiveWords.length > 0) {
      if (containsSensitiveWords(params.prompt, generateSensitiveWords)) {
        return res.status(400).json({
          success: false,
          error: '你提交的内容涉及敏感内容，请检查',
        });
      }
      if (params.outlines && params.outlines.length > 0) {
        if (checkObjectForSensitiveWords(params.outlines, generateSensitiveWords)) {
          return res.status(400).json({
            success: false,
            error: '你提交的内容涉及敏感内容，请检查',
          });
        }
      }
    }

    // 决定输出模式：
    // 1. 如果明确指定 outputFormat === 'stream'，使用流式模式
    // 2. 如果 storeToMinio === false，自动使用流式模式（不存储到 MinIO 时使用流式输出）
    // 3. 否则使用异步任务模式
    const shouldUseStream = params.outputFormat === 'stream' || params.storeToMinio === false;
    const outputFormat = params.outputFormat || (params.storeToMinio === false ? 'stream' : 'json');

    // 流式输出模式
    if (shouldUseStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // 禁用 nginx 缓冲
      // 确保立即发送数据，不缓冲
      res.setHeader('Transfer-Encoding', 'chunked');
      // 立即发送初始响应，让客户端知道连接已建立
      res.write(':\n\n');

      try {
        const { generateWritingStream } = await import('../core/writing/writing-service');
        const stream = generateWritingStream(params, userId, req.query.provider as string | undefined);

        for await (const chunk of stream) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          // 立即刷新缓冲区，确保数据立即发送
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
        }

        res.write('data: [DONE]\n\n');
        res.end();
      } catch (error) {
        res.write(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n\n`);
        res.end();
      }
      return;
    }

    // 异步任务模式（默认）
    const taskManager = taskExecutor.getTaskManager();
    // 统一使用 type: 'writing'，通过 metadata.type 区分具体类型
    const writingType = params.writing_type || 'articles';
    const businessKey = getWritingBusinessKey(writingType);
    const taskMetadata = params.metadata || {};

    const isOutlinesType = writingType === 'outlines';
    const shouldStoreToMinio = isOutlinesType ? false : (params.storeToMinio !== false);

    // 余额预检
    const routingKey = isOutlinesType ? 'writing-outlines' : `writing-${writingType}`;
    const { provider: rgProvider, model: rgModel } = getResolvedRouting(routingKey);
    const estOutputTokens = Math.ceil(Number((params as any).expected_textcount || (params as any).total_textcount || 1500) * 1.5);
    const balanceCheckG = await BillingService.checkBalance({
      userId, provider: rgProvider, modelKey: rgModel, scope: 'writing',
      estimatedOutputTokens: estOutputTokens, estimatedInputTokens: 1000,
    });
    if (!balanceCheckG.allowed) {
      return res.status(402).json({
        success: false, code: 'INSUFFICIENT_BALANCE',
        message: `余额不足，本次预计消耗约 ${balanceCheckG.estimatedTokens} MXM-TOKEN，当前余额 ${balanceCheckG.currentBalance}`,
      });
    }

    const createResponse = await taskManager.createTask({
      type: 'writing',
      model: businessKey,
      provider: req.query.provider as string | undefined,
      params: {
        taskType: 'generate',
        params: {
          ...params,
          writing_type: writingType,
          metadata: {
            ...taskMetadata,
            writing_type: writingType,
            writing_type_label: taskMetadata.writing_type_label,
          },
        },
        userId,
        provider: req.query.provider as string | undefined,
      },
      userId,
      storeToMinio: shouldStoreToMinio,
    });

    taskExecutor.executeTask({
      taskId: createResponse.taskId,
      modelName: businessKey,
      provider: req.query.provider as string | undefined,
      params: {
        taskType: 'generate',
        params: {
          ...params,
          writing_type: writingType,
        },
        userId,
        provider: req.query.provider as string | undefined,
      },
      userId,
      storeToMinio: shouldStoreToMinio,
    }).catch((error) => {
      console.error(`[Writing Route] 任务执行失败 (taskId: ${createResponse.taskId}):`, error);
    });

    return res.json({
      success: true,
      data: {
        taskId: createResponse.taskId,
        status: createResponse.status,
      },
    });
  } catch (error) {
    console.error('[Writing Route] 生成文章失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/v1/writing/suno/lyrics
 * 使用 DeerAPI 的 Suno 接口创建歌词生成任务，并在本地写作任务系统中登记一条写作任务
 *
 * 设计目标：
 * - 这是一个「写作类型」任务（type = 'writing'），可以在写作任务列表中看到
 * - 与普通写作任务通过 metadata.type 区分开（metadata.type = 'suno_lyrics'）
 * - 目前只负责将任务提交到 DeerAPI，并记录 DeerAPI 的 taskId，不主动轮询结果
 */
router.post('/suno/lyrics', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
      });
    }

    const { prompt } = req.body as { prompt?: string };

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid field: prompt',
      });
    }

    // 敏感词检查（优先 DB 绑定，slot 为 writing/lyrics）
    const sunoSensitiveWords = await getSensitiveWordsForSlot('writing', 'lyrics', null);
    if (sunoSensitiveWords.length > 0 && containsSensitiveWords(prompt, sunoSensitiveWords)) {
      return res.status(400).json({
        success: false,
        error: '你提交的内容涉及敏感内容，请检查',
      });
    }

    const notifyHook =
      process.env.DEERAPI_SUNO_NOTIFY_HOOK ||
      process.env.SUNO_LYRICS_NOTIFY_HOOK ||
      '';

    if (!notifyHook) {
      console.error(
        '[Writing Route] Suno 歌词任务提交失败：未配置 DEERAPI_SUNO_NOTIFY_HOOK 或 SUNO_LYRICS_NOTIFY_HOOK',
      );
      return res.status(500).json({
        success: false,
        error:
          'Suno 歌词回调地址未配置（需要设置 DEERAPI_SUNO_NOTIFY_HOOK 或 SUNO_LYRICS_NOTIFY_HOOK）',
      });
    }

    // 1. 调用 DeerAPI 提交歌词任务
    const deerClient = DeerAPIClient.fromEnv();
    const submitResult = await deerClient.submitSunoLyrics({
      prompt,
      notifyHook,
    });

    const deerTaskId = submitResult.taskId;

    // 2. 在本地任务系统中注册一条写作任务（type = writing）
    const taskManager = taskExecutor.getTaskManager();
    const createResponse = await taskManager.createTask({
      type: 'writing',
      model: 'suno-lyrics',
      provider: 'deerapi',
      params: {
        taskType: 'generate',
        params: {
          prompt,
          source: 'suno-lyrics',
          deerTaskId,
        },
        userId,
      },
      userId,
      storeToMinio: false,
    });

    // 3. 直接将任务标记为 completed，并在 metadata 中记录 Suno 任务信息
    await taskManager.setTaskResult(createResponse.taskId, {
      mediaUrls: [],
      metadata: {
        type: 'suno-lyrics', // 统一使用 writing_type 格式，用于与普通写作任务区分
        source: 'suno-lyrics',
        deerTaskId,
        prompt,
      },
    });

    await taskManager.updateTaskStatus(createResponse.taskId, 'completed', {
      progress: 100,
      completedAt: new Date(),
      logs: [
        'Suno 歌词任务已提交到 DeerAPI',
        `Deer task id: ${deerTaskId}`,
      ],
    });

    return res.json({
      success: true,
      data: {
        taskId: createResponse.taskId,
        status: createResponse.status,
        deerTaskId,
      },
    });
  } catch (error) {
    console.error('[Writing Route] 提交 Suno 歌词任务失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/v1/writing/sync-to-task
 * 将 stream 生成的文本同步到任务系统
 * 用户在接收完 stream 后，调用此接口将拼接的文本保存为任务，方便后续追踪
 */
router.post('/sync-to-task', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
      });
    }

    const params = req.body as SyncToTaskParams;

    // 验证必需参数
    if (!params.text || params.text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: text',
      });
    }

    // 注意：sync-to-task 接口不检查生成内容的敏感词
    // 原因：
    // 1. prompt 在创建任务时已经检查过敏感词
    // 2. 生成的内容是 AI 产生的，不应该因为 AI 生成的内容而阻止保存
    // 3. 用户已经看到了生成的内容，阻止保存没有意义
    // 如果需要对生成内容进行审核，应该在生成过程中进行，而不是在保存时

    // 调用同步函数
    const { syncToTask } = await import('../core/writing/writing-service');
    const result = await syncToTask(params, userId);

    return res.json({
      success: true,
      data: {
        taskId: result.taskId,
        storageInfo: result.storageInfo,
        metadata: result.metadata,
        message: '文本已成功同步到任务系统',
      },
    });
  } catch (error) {
    console.error('[Writing Route] 同步到任务失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/v1/writing/document
 * 读取 MinIO 文档
 */
router.get('/document', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
      });
    }

    const { bucket, key } = req.query;

    if (!bucket || !key) {
      return res.status(400).json({
        success: false,
        error: 'Missing required query parameters: bucket, key',
      });
    }

    const storageRepo = RepositoryFactory.createStorageRepository();

    // 检查文件是否存在
    const exists = await storageRepo.fileExists(bucket as string, key as string);
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: 'Document not found',
      });
    }

    // 获取文件元数据
    const metadata = await storageRepo.getFileMetadata(bucket as string, key as string);

    // 权限校验：只能读取自己的文档（通过 key 路径判断）
    if (!(key as string).startsWith(`${userId}/`)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: You can only access your own documents',
      });
    }

    // 下载文件
    const fileBuffer = await storageRepo.downloadFile(bucket as string, key as string);
    const content = fileBuffer.toString('utf-8');

    // 判断格式
    const format = (key as string).endsWith('.md') || (key as string).endsWith('.markdown')
      ? 'markdown'
      : (key as string).endsWith('.txt')
      ? 'txt'
      : 'text';

    return res.json({
      success: true,
      data: {
        content,
        format,
        metadata: {
          contentType: metadata?.contentType || 'text/plain',
          size: fileBuffer.length,
          lastModified: metadata?.lastModified?.toISOString(),
        },
      },
    });
  } catch (error) {
    console.error('[Writing Route] 读取文档失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/v1/writing/getformOptions
 * 获取写作类型的表单选项配置
 * Query params:
 *   - writing_type: 写作类型（如 articles, outlines, lyrics 等）
 *   - lang: 语言代码 'zh' | 'en' (默认 'zh')
 */
router.get('/getformOptions', (req: Request, res: Response) => {
  try {
    const { writing_type, lang, outline_type } = req.query;
    const language = (lang as 'zh' | 'en') || 'zh';

    // 验证语言参数
    if (language !== 'zh' && language !== 'en') {
      return res.status(400).json({
        success: false,
        error: 'Invalid language parameter',
        message: 'lang must be "zh" or "en"',
      });
    }

    // 如果没有指定 writing_type，返回错误
    if (!writing_type) {
      return res.status(400).json({
        success: false,
        error: 'Missing writing_type parameter',
        message: 'Please specify writing_type (e.g., articles, outlines, lyrics)',
      });
    }

    // 获取表单选项
    const formOptions = getWritingFormOptionsForType(
      writing_type as any,
      language,
      outline_type as any
    );
    
    if (!formOptions) {
      return res.status(404).json({
        success: false,
        error: 'Form options not found',
        message: `Form options for writing_type "${writing_type}" are not available`,
      });
    }

    return res.json({
      success: true,
      data: {
        writingType: writing_type,
        language,
        options: formOptions,
      },
    });
  } catch (error) {
    console.error('[Writing Route] 获取表单选项失败:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get form options',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;

