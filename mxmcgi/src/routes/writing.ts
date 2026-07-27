/**
 * Writing 路由
 * 提供写作相关的 API 接口，以及按模型名直接调 LLM 的 completion 接口（原 text 路由能力已并入）
 */

import { Router, Request, Response } from 'express';
import type { ProviderType } from '../models/providers';
import { taskExecutor } from '../task/task-executor';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { containsSensitiveWords } from '../sensitive/check';
import { getSensitiveWordsForSlot } from '../prompts/sensitive-resolver';
import type { SyncToTaskParams } from '../core/writing/type';
import { DeerAPIClient } from '../models/deerapi/client';
import { runByModelKey } from '../models/run';
import { findEnabledModel, listEnabledModelKeysByScope } from '../models/provider-model-catalog';

const router = Router();

// ---------- 按模型名调 LLM（原 text 路由逻辑，统一到 writing） ----------
const WRITING_MODEL_KEYS: string[] = listEnabledModelKeysByScope('writing');

function isWritingModelSupported(modelName: string): boolean {
  return findEnabledModel({ modelKey: modelName, scope: 'writing' }) !== null;
}

/** 兼容 graph-service、character-service 等：纯动态（按需直接调用 runByModelKey） */
export const MODEL_MAP: Record<
  string,
  { generate: (params: any, provider?: ProviderType) => Promise<any> }
> = new Proxy(
  {},
  {
    get: (_target, prop) => {
      const modelKey = String(prop);
      return {
        generate: (params: any, provider?: ProviderType) =>
          runByModelKey('writing', modelKey, params, { providerOverride: provider }),
      };
    },
  }
);

/** GET /writing/models - 可用写作/LLM 模型列表 */
router.get('/models', (_req: Request, res: Response) => {
  const keys = listEnabledModelKeysByScope('writing');
  res.json({ models: keys.map(name => ({ name })) });
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
          lastModified:
            metadata?.lastModified instanceof Date
              ? metadata.lastModified.toISOString()
              : typeof metadata?.lastModified === 'string'
                ? metadata.lastModified
                : undefined,
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


export default router;

