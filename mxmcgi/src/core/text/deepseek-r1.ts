/**
 * DeepSeek R1
 * 
 * 大语言模型，支持推理和文本生成
 */

import { providerFactory, GenerateParams, GenerateResult, ProviderType, StreamChunk } from '../providers';

export interface DeepSeekR1Params extends GenerateParams {
  max_tokens?: number; // 最大输出 token 数，默认 20480
  temperature?: number; // 温度参数，默认 0.1
  presence_penalty?: number; // 存在惩罚，默认 0
  frequency_penalty?: number; // 频率惩罚，默认 0
  top_p?: number; // 核采样参数，默认 1
  system_prompt?: string; // 系统提示词
  outputFormat?: 'stream' | 'json'; // 输出格式
  enableCollection?: boolean; // 是否启用 collection 累积（默认 true），当为 false 时不会累积完整文本，节省内存
}

export interface DeepSeekR1Result extends GenerateResult {
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
  params: DeepSeekR1Params,
  provider?: ProviderType
): Promise<DeepSeekR1Result> {
  const modelName = 'deepseek-r1';
  
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
        presence_penalty: params.presence_penalty,
        frequency_penalty: params.frequency_penalty,
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
      // 如果是数组，连接所有元素
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
    throw new Error(`DeepSeek R1 生成失败: ${error instanceof Error ? error.message : String(error)}`);
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
    system_prompt?: string;
    outputFormat?: 'stream' | 'json';
    enableCollection?: boolean; // 是否启用 collection 累积（默认 true）
    provider?: ProviderType;
  }
): Promise<DeepSeekR1Result> {
  return generate({
    prompt,
    max_tokens: options?.max_tokens,
    temperature: options?.temperature,
    system_prompt: options?.system_prompt,
    outputFormat: options?.outputFormat,
    enableCollection: options?.enableCollection,
  }, options?.provider);
}
