import { Router, Request, Response } from 'express';
import type { ProviderType } from '../core/providers/types';
import * as claude45Sonnet from '../core/text/claude-4.5-sonnet';
import * as deepseekR1 from '../core/text/deepseek-r1';
import * as gemini25Flash from '../core/text/gemini-2.5-flash';
import * as gemini3Pro from '../core/text/gemini-3-pro';
import * as gpt5Nano from '../core/text/gpt-5-nano';
import * as gpt52 from '../core/text/gpt-5-2';
import * as qwen3235BA22B from '../core/text/qwen3-235b-a22b';
import * as qwen330B from '../core/text/qwen3-30b';

const router = Router();

// 模型映射（key 为我们对外暴露的模型名）
// 约定：这里的 key 必须与 `suport-list.ts` 中各 provider.text 的 key 完全一致
const MODEL_MAP: Record<string, {
  generate: (params: any, provider?: ProviderType) => Promise<any>;
}> = {
  'claude-4.5-sonnet': {
    generate: claude45Sonnet.generate,
  },
  'deepseek-r1': {
    generate: deepseekR1.generate,
  },
  // 注意：对外模型名为 `gemini-2-5-flash`（与 suport-list.ts 一致）
  'gemini-2-5-flash': {
    generate: gemini25Flash.generate,
  },
  'gemini-3-pro': {
    generate: gemini3Pro.generate,
  },
  // GPT-5 系列：
  // - gpt-5-nano 作为向后兼容的旧名
  // - gpt-5-2 为新名，单独文件，modelName = 'gpt-5-2'
  'gpt-5-nano': {
    generate: gpt5Nano.generate,
  },
  'gpt-5-2': {
    generate: gpt52.generate,
  },
  // Qwen3：对外名称为 qwen3-235b / qwen3-30b
  'qwen3-235b': {
    generate: qwen3235BA22B.generate,
  },
  'qwen3-30b': {
    generate: qwen330B.generate,
  },
};

// 获取所有可用的模型列表
router.get('/models', (_req: Request, res: Response) => {
  const models = Object.keys(MODEL_MAP).map(modelName => ({
    name: modelName,
    // 可以根据需要添加更多模型信息
  }));
  res.json({ models });
});

// 生成文本
router.post('/:modelName', async (req: Request, res: Response) => {
  try {
    const { modelName } = req.params;
    const provider = req.query.provider as string | undefined;
    
    // 检查模型是否存在
    if (!MODEL_MAP[modelName]) {
      return res.status(404).json({
        error: 'Model not found',
        message: `Model "${modelName}" is not available. Available models: ${Object.keys(MODEL_MAP).join(', ')}`,
      });
    }

    // 调试日志：显示使用的 provider
    const { providerFactory } = require('../core/providers');
    const defaultProvider = providerFactory.getDefaultProvider();
    console.log(`[Text Route] 模型: ${modelName}, 指定 provider: ${provider || '(未指定，将使用默认: ' + defaultProvider + ')'}, 默认 provider: ${defaultProvider}`);

    const model = MODEL_MAP[modelName];
    const params = req.body;

    // 验证必需参数
    if (!params.prompt) {
      return res.status(400).json({
        error: 'Missing required parameter',
        message: 'prompt is required',
      });
    }

    const outputFormat = params.outputFormat || 'json';
    
    if (outputFormat === 'stream') {
      // 流式输出
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const result = await model.generate(params, provider as ProviderType | undefined);
      
      if (result.stream) {
        for await (const chunk of result.stream) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
      } else if (result.streamString) {
        for await (const chunk of result.streamString) {
          res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
        }
      }
      
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      // JSON 输出
      const result = await model.generate(params, provider as ProviderType | undefined);
      res.json({
        success: true,
        model: modelName,
        result,
      });
    }
  } catch (error) {
    console.error(`[Text Route] Error generating text with model ${req.params.modelName}:`, error);
    res.status(500).json({
      error: 'Generation failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
