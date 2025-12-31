/**
 * Claude 4.5 Sonnet
 * 
 * Anthropic 的对话模型
 */

import { providerFactory, GenerateParams, GenerateResult, ProviderType, StreamChunk } from '../providers';

export interface Claude45SonnetParams extends GenerateParams {
  max_tokens?: number; // 最大输出 token 数，默认 8192，最大 8192
  max_image_resolution?: number; // 最大图片分辨率（百万像素），默认 0.5，最大 2
  system_prompt?: string; // 系统提示词
  image?: string; // 输入图片（base64 或 URL）
  temperature?: number; // 温度参数
  outputFormat?: 'stream' | 'json'; // 输出格式
  enableCollection?: boolean; // 是否启用 collection 累积（默认 true），当为 false 时不会累积完整文本，节省内存
}

export interface Claude45SonnetResult extends GenerateResult {
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
  params: Claude45SonnetParams,
  provider?: ProviderType
): Promise<Claude45SonnetResult> {
  const modelName = 'claude-4.5-sonnet';
  
  try {
    console.log(`[claude-4.5-sonnet] generate 被调用，指定 provider: ${provider || '(未指定)'}`);
    const modelProvider = providerFactory.getProviderForModel(modelName, provider);
    console.log(`[claude-4.5-sonnet] 选择的 provider: ${modelProvider.provider}, 名称: ${modelProvider.name}`);
    
    const outputFormat = params.outputFormat || 'json';
    
    const generateParams: GenerateParams = {
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      outputFormat: outputFormat,
      enableCollection: params.enableCollection,
      parameters: {
        max_tokens: params.max_tokens,
        max_image_resolution: params.max_image_resolution,
        system_prompt: params.system_prompt,
        image: params.image,
        temperature: params.temperature,
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
    throw new Error(`Claude 4.5 Sonnet 生成失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 文本生成
 */
export async function textGeneration(
  prompt: string,
  options?: {
    max_tokens?: number;
    system_prompt?: string;
    temperature?: number;
    outputFormat?: 'stream' | 'json';
    enableCollection?: boolean; // 是否启用 collection 累积（默认 true）
    provider?: ProviderType;
  }
): Promise<Claude45SonnetResult> {
  return generate({
    prompt,
    max_tokens: options?.max_tokens,
    system_prompt: options?.system_prompt,
    temperature: options?.temperature,
    outputFormat: options?.outputFormat,
    enableCollection: options?.enableCollection,
  }, options?.provider);
}

/**
 * 多模态生成（文本 + 图片）
 */
export async function multimodalGeneration(
  prompt: string,
  image: string,
  options?: {
    max_tokens?: number;
    max_image_resolution?: number;
    provider?: ProviderType;
  }
): Promise<Claude45SonnetResult> {
  return generate({
    prompt,
    image,
    max_tokens: options?.max_tokens,
    max_image_resolution: options?.max_image_resolution,
  }, options?.provider);
}
