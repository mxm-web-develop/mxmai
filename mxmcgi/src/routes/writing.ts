/**
 * Writing 路由
 * 提供写作相关的 API 接口
 */

import { Router, Request, Response } from 'express';
import { taskExecutor } from '../core/task/task-executor';
import { startWritingTask } from '../core/writing/writing-task';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { containsSensitiveWords, checkObjectForSensitiveWords } from '../core/utils/sensitive-check';
import { sensitivesWords } from '../core/writing/sensitives_words';
import type {
  OutlineParams,
  WritingGenerateParams,
  RewritingParams,
  PolishingParams,
  SyncToTaskParams,
} from '../core/writing/type';
import { DeerAPIClient } from '../core/utils/deerapi-client';
import { getWritingFormOptionsForType } from '../core/writing/wtconfigs';

const router = Router();

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

    // 敏感词检查（使用系统预设的敏感词列表）
    if (sensitivesWords.length > 0 && containsSensitiveWords(params.prompt, sensitivesWords)) {
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
    // 统一使用 type: 'writing'，通过 metadata.type 区分具体类型
    const writingType = params.writing_type || 'outlines';
    const createResponse = await taskManager.createTask({
      type: 'writing', // 统一使用 writing 类型
      model: 'writing-outline', // 占位模型名
      provider: undefined,
      params: {
        taskType: 'outline',
        params: {
          ...params,
          writing_type: writingType, // 确保 writing_type 传递到任务参数中
        },
        userId,
        provider: req.query.provider as string | undefined,
      },
      userId,
      storeToMinio: false,
    });

    // 异步执行任务
    taskExecutor.executeTask({
      taskId: createResponse.taskId,
      modelName: 'writing-outline',
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

    // 敏感词检查（使用系统预设的敏感词列表）
    if (sensitivesWords.length > 0) {
      // 检查 prompt
      if (containsSensitiveWords(params.prompt, sensitivesWords)) {
        return res.status(400).json({
          success: false,
          error: '你提交的内容涉及敏感内容，请检查',
        });
      }
      // 检查 outlines 中的 content
      if (params.outlines && params.outlines.length > 0) {
        if (checkObjectForSensitiveWords(params.outlines, sensitivesWords)) {
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
    // 确保 metadata 中包含 writing_type_label（如果前端传递了）
    const taskMetadata = params.metadata || {};
    
    // outlines 类型特殊处理：不存储到 MinIO，返回 JSON 格式
    const isOutlinesType = writingType === 'outlines';
    const shouldStoreToMinio = isOutlinesType ? false : (params.storeToMinio !== false);
    
    const createResponse = await taskManager.createTask({
      type: 'writing',
      model: 'writing-generate',
      provider: undefined,
      params: {
        taskType: 'generate',
        params: {
          ...params,
          writing_type: writingType, // 确保 writing_type 传递到任务参数中
          metadata: {
            ...taskMetadata,
            writing_type: writingType, // 同时保存到 metadata
            writing_type_label: taskMetadata.writing_type_label, // 保存中文标签（如果有）
          },
        },
        userId,
        provider: req.query.provider as string | undefined,
      },
      userId,
      storeToMinio: shouldStoreToMinio,
    });

    // 异步执行任务
    taskExecutor.executeTask({
      taskId: createResponse.taskId,
      modelName: 'writing-generate',
      provider: undefined,
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
 * POST /api/v1/writing/rewriting
 * 改写文章（支持流式和异步任务两种模式）
 */
router.post('/rewriting', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
      });
    }

    const params = req.body as RewritingParams;

    // 验证必需参数
    if (!params.prompt) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: prompt',
      });
    }

    if (!params.previous_content && !params.previous_task) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: previous_content or previous_task',
      });
    }

    // 敏感词检查（使用系统预设的敏感词列表）
    if (sensitivesWords.length > 0) {
      // 检查 prompt
      if (containsSensitiveWords(params.prompt, sensitivesWords)) {
        return res.status(400).json({
          success: false,
          error: '你提交的内容涉及敏感内容，请检查',
        });
      }
      // 检查 previous_content
      if (params.previous_content && containsSensitiveWords(params.previous_content, sensitivesWords)) {
        return res.status(400).json({
          success: false,
          error: '你提交的内容涉及敏感内容，请检查',
        });
      }
    }

    const outputFormat = params.outputFormat || 'json';

    // 流式输出模式
    if (outputFormat === 'stream') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      try {
        const { rewriteWritingStream } = await import('../core/writing/writing-service');
        const stream = rewriteWritingStream(params, userId, req.query.provider as string | undefined);

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
    // 统一使用 type: 'writing'，通过 metadata.type 区分具体类型
    const writingType = params.writing_type || 'articles';
    const createResponse = await taskManager.createTask({
      type: 'writing',
      model: 'writing-rewrite',
      provider: undefined,
      params: {
        taskType: 'rewrite',
        params: {
          ...params,
          writing_type: writingType, // 确保 writing_type 传递到任务参数中
        },
        userId,
        provider: req.query.provider as string | undefined,
      },
      userId,
      storeToMinio: false,
    });

    // 异步执行任务
    taskExecutor.executeTask({
      taskId: createResponse.taskId,
      modelName: 'writing-rewrite',
      provider: undefined,
      params: {
        taskType: 'rewrite',
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
    console.error('[Writing Route] 改写文章失败:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/v1/writing/polishing
 * 润色文章（支持流式和异步任务两种模式）
 */
router.post('/polishing', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string | undefined;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-user-id header',
      });
    }

    const params = req.body as PolishingParams;

    // 验证必需参数
    if (!params.prompt) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: prompt',
      });
    }

    if (!params.previous_content && !params.previous_task) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: previous_content or previous_task',
      });
    }

    // 敏感词检查（使用系统预设的敏感词列表）
    if (sensitivesWords.length > 0) {
      // 检查 prompt
      if (containsSensitiveWords(params.prompt, sensitivesWords)) {
        return res.status(400).json({
          success: false,
          error: '你提交的内容涉及敏感内容，请检查',
        });
      }
      // 检查 previous_content
      if (params.previous_content && containsSensitiveWords(params.previous_content, sensitivesWords)) {
        return res.status(400).json({
          success: false,
          error: '你提交的内容涉及敏感内容，请检查',
        });
      }
    }

    const outputFormat = params.outputFormat || 'json';

    // 流式输出模式
    if (outputFormat === 'stream') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      try {
        const { polishWritingStream } = await import('../core/writing/writing-service');
        const stream = polishWritingStream(params, userId, req.query.provider as string | undefined);

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
    // 统一使用 type: 'writing'，通过 metadata.type 区分具体类型
    const writingType = params.writing_type || 'articles';
    const createResponse = await taskManager.createTask({
      type: 'writing',
      model: 'writing-polish',
      provider: undefined,
      params: {
        taskType: 'polish',
        params: {
          ...params,
          writing_type: writingType, // 确保 writing_type 传递到任务参数中
        },
        userId,
        provider: req.query.provider as string | undefined,
      },
      userId,
      storeToMinio: false,
    });

    // 异步执行任务
    taskExecutor.executeTask({
      taskId: createResponse.taskId,
      modelName: 'writing-polish',
      provider: undefined,
      params: {
        taskType: 'polish',
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
    console.error('[Writing Route] 润色文章失败:', error);
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

    // 敏感词检查（沿用写作模块的规则）
    if (sensitivesWords.length > 0 && containsSensitiveWords(prompt, sensitivesWords)) {
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
    const { writing_type, lang } = req.query;
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
    const formOptions = getWritingFormOptionsForType(writing_type as any, language);
    
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

