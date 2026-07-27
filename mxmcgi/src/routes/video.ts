import { Router, Request, Response } from 'express';
import { getVideoFormOptionsResolved } from '../core/video/video-form-options';
import { generate as videoGenerate, type VideoGenerateBody } from '../core/video/video-service';
import { listEnabledModelKeysByScope } from '../models/provider-model-catalog';

const router = Router();

// 获取所有可用的视频模型列表（来自 registry）
router.get('/models', (_req: Request, res: Response) => {
  const models = listEnabledModelKeysByScope('video').map(modelName => ({ name: modelName }));
  res.json({ models });
});

// 业务层：chunk_seconds 选项来自 Task V2 formSchema（taskKey/subtype/scriptType）
router.get('/getformOptions', async (req: Request, res: Response) => {
  try {
    const lang = (req.query.lang as string) === 'en' ? 'en' : 'zh';
    const taskKey = (req.query.taskKey as string) || undefined;
    const subtype = (req.query.subtype as string) || undefined;
    const scriptType = (req.query.scriptType as string) || undefined;
    const options = await getVideoFormOptionsResolved(lang, { taskKey, subtype, scriptType });
    res.json({ success: true, data: options });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: 'Bad request', message });
  }
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
    const provider = (req.query.provider as string) || body.provider || undefined;
    const taskKey = (body.taskKey as string) || (req.query.taskKey as string) || undefined;
    const subtype = (body.subtype as string) || (req.query.subtype as string) || undefined;
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
    const result = await videoGenerate(body as VideoGenerateBody, { userId, provider, taskKey, subtype });
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

// 直调物理模型已下线（与 graph 旧 HTTP 一致）；请用 Task V2 或兼容层 /video/generate
router.post('/:modelName', (req: Request, res: Response) => {
  const { modelName } = req.params;
  return res.status(410).json({
    success: false,
    error: 'Gone',
    message:
      `POST /video/${modelName} 已废弃。请使用 POST /api/v2/tasks/run（scope=video, taskKey/subtype 由 Admin 配置），` +
      '或移动端兼容 POST /video/generate。',
    migration: {
      taskV2: 'POST /api/v2/tasks/run',
      compat: 'POST /video/generate',
      formConfig: 'GET /api/v2/tasks/form-config?scope=video',
    },
  });
});

export default router;
