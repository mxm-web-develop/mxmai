/**
 * GPT-5 Nano (使用 GPT-4o Mini 作为占位)
 * 
 * OpenAI 的快速文本生成模型
 */

import { providerFactory, GenerateParams, GenerateResult, ProviderType, StreamChunk } from '../providers';

export interface GPT5NanoParams extends GenerateParams {
  max_completion_tokens?: number; // 最大完成 token 数
  temperature?: number; // 温度参数 (0-2)
  top_p?: number; // 核采样 (0-1)
  frequency_penalty?: number; // 频率惩罚 (-2 到 2)
  presence_penalty?: number; // 存在惩罚 (-2 到 2)
  system_prompt?: string; // 系统提示词
  image_input?: string[]; // 输入图片数组
  outputFormat?: 'stream' | 'json'; // 输出格式
  enableCollection?: boolean; // 是否启用 collection 累积（默认 true），当为 false 时不会累积完整文本，节省内存
}

export interface GPT5NanoResult extends GenerateResult {
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
  params: GPT5NanoParams,
  provider?: ProviderType
): Promise<GPT5NanoResult> {
  const modelName = 'gpt-5-nano';
  
  try {
    const modelProvider = providerFactory.getProviderForModel(modelName, provider);
    
    const outputFormat = params.outputFormat || 'json';
    
    const generateParams: GenerateParams = {
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      outputFormat: outputFormat,
      enableCollection: params.enableCollection,
      parameters: {
        max_completion_tokens: params.max_completion_tokens,
        temperature: params.temperature,
        top_p: params.top_p,
        frequency_penalty: params.frequency_penalty,
        presence_penalty: params.presence_penalty,
        system_prompt: params.system_prompt,
        image_input: params.image_input,
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
    throw new Error(`GPT-5 Nano 生成失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 文本生成
 */
export async function textGeneration(
  prompt: string,
  options?: {
    max_completion_tokens?: number;
    temperature?: number;
    system_prompt?: string;
    outputFormat?: 'stream' | 'json';
    enableCollection?: boolean; // 是否启用 collection 累积（默认 true）
    provider?: ProviderType;
  }
): Promise<GPT5NanoResult> {
  return generate({
    prompt,
    max_completion_tokens: options?.max_completion_tokens,
    temperature: options?.temperature,
    system_prompt: options?.system_prompt,
    outputFormat: options?.outputFormat,
    enableCollection: options?.enableCollection,
  }, options?.provider);
}

/**
 * 多模态生成（文本 + 图片）
 */
export async function multimodalGeneration(
  prompt: string,
  images: string[],
  options?: {
    max_completion_tokens?: number;
    temperature?: number;
    provider?: ProviderType;
  }
): Promise<GPT5NanoResult> {
  return generate({
    prompt,
    image_input: images,
    max_completion_tokens: options?.max_completion_tokens,
    temperature: options?.temperature,
  }, options?.provider);
}
