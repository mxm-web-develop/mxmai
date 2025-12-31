/**
 * Qwen3 30B A3B
 *
 * 大语言模型，支持文本生成（DeerAPI：`qwen3-30b-a3b`）。
 */

import { providerFactory, GenerateParams, GenerateResult, ProviderType, StreamChunk } from '../providers';

export interface Qwen330BParams extends GenerateParams {
  max_tokens?: number; // 最大输出 token 数
  temperature?: number; // 温度参数
  top_p?: number; // 核采样参数
  system_prompt?: string; // 系统提示词
  outputFormat?: 'stream' | 'json'; // 输出格式
  enableCollection?: boolean; // 是否启用 collection 累积（默认 true），当为 false 时不会累积完整文本，节省内存
}

export interface Qwen330BResult extends GenerateResult {
  text?: string; // JSON 模式下的完整文本
  stream?: AsyncIterable<StreamChunk>; // 流式模式下的异步迭代器（新格式，包含 status 和 collection）
  streamString?: AsyncIterable<string>; // 流式模式下的字符串迭代器（兼容旧版本）
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/**
 * 生成文本
 */
export async function generate(
  params: Qwen330BParams,
  provider?: ProviderType
): Promise<Qwen330BResult> {
  // 使用统一逻辑模型名 `qwen3-30b`，与 suport-list.ts 保持一致
  const modelName = 'qwen3-30b';

  try {
    const modelProvider = providerFactory.getProviderForModel(modelName, provider);

    const outputFormat = params.outputFormat || 'json';

    const generateParams: GenerateParams = {
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      outputFormat: outputFormat,
      enableCollection: params.enableCollection,
      parameters: {
        max_tokens: params.max_tokens,
        temperature: params.temperature,
        top_p: params.top_p,
        system_prompt: params.system_prompt,
        ...params.parameters,
      },
    };

    const result = await modelProvider.generate(modelName, generateParams);

    // 如果是流式输出，直接返回流（包含 status 和 collection）
    if (outputFormat === 'stream' && result.stream) {
      return {
        ...result,
        stream: result.stream,
        streamString: result.streamString, // 兼容旧版本
        usage: result.metadata?.usage,
      };
    }

    // JSON 模式：处理数组格式的输出，将所有片段连接起来
    let text = '';
    if (result.metadata?.text) {
      text = result.metadata.text;
    } else if (Array.isArray(result.mediaUrls) && result.mediaUrls.length > 0) {
      text = result.mediaUrls.join('');
    } else if (result.mediaUrls && result.mediaUrls.length > 0) {
      text = result.mediaUrls[0];
    }

    return {
      ...result,
      text: text,
      usage: result.metadata?.usage,
    };
  } catch (error) {
    throw new Error(`Qwen3 30B A3B 生成失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 文本生成
 */
export async function textGeneration(
  prompt: string,
  options?: {
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    system_prompt?: string;
    outputFormat?: 'stream' | 'json';
    enableCollection?: boolean; // 是否启用 collection 累积（默认 true）
    provider?: ProviderType;
  }
): Promise<Qwen330BResult> {
  return generate({
    prompt,
    max_tokens: options?.max_tokens,
    temperature: options?.temperature,
    top_p: options?.top_p,
    system_prompt: options?.system_prompt,
    outputFormat: options?.outputFormat,
    enableCollection: options?.enableCollection,
  }, options?.provider);
}
