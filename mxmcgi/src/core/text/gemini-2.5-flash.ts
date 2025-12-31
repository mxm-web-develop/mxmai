/**
 * Gemini 2.5 Flash
 * 
 * Google 的混合"思考"AI模型，优化了速度和成本效率
 * 参考: https://replicate.com/google/gemini-2.5-flash
 */

import { providerFactory, GenerateParams, GenerateResult, ProviderType, StreamChunk } from '../providers';

export interface Gemini25FlashParams extends GenerateParams {
  temperature?: number; // 温度参数，默认 1，最大 2
  top_p?: number; // 核采样，默认 0.95，最大 1
  max_output_tokens?: number; // 最大输出 token 数，默认 65535，最大 65535
  system_instruction?: string; // 系统指令（注意：不是 system_prompt）
  thinking_budget?: number; // 思考预算（0 禁用思考，更高的值允许更多推理）
  image?: string; // 输入图片（base64 或 URL）
  images?: string[]; // 多张输入图片
  outputFormat?: 'stream' | 'json'; // 输出格式
  enableCollection?: boolean; // 是否启用 collection 累积（默认 true），当为 false 时不会累积完整文本，节省内存
}

export interface Gemini25FlashResult extends GenerateResult {
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
  params: Gemini25FlashParams,
  provider?: ProviderType
): Promise<Gemini25FlashResult> {
  // 关键：这里的逻辑模型名与 suport-list.ts / 路由保持一致
  const modelName = 'gemini-2-5-flash';
  
  try {
    const modelProvider = providerFactory.getProviderForModel(modelName, provider);
    
    const outputFormat = params.outputFormat || 'json';
    
    const generateParams: GenerateParams = {
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      outputFormat: outputFormat,
      enableCollection: params.enableCollection,
      parameters: {
        temperature: params.temperature,
        top_p: params.top_p,
        max_output_tokens: params.max_output_tokens,
        system_instruction: params.system_instruction,
        thinking_budget: params.thinking_budget,
        image: params.image,
        images: params.images,
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
    throw new Error(`Gemini 2.5 Flash 生成失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 文本生成
 */
export async function textGeneration(
  prompt: string,
  options?: {
    temperature?: number;
    max_output_tokens?: number;
    system_instruction?: string;
    thinking_budget?: number;
    outputFormat?: 'stream' | 'json';
    enableCollection?: boolean; // 是否启用 collection 累积（默认 true）
    provider?: ProviderType;
  }
): Promise<Gemini25FlashResult> {
  return generate({
    prompt,
    temperature: options?.temperature,
    max_output_tokens: options?.max_output_tokens,
    system_instruction: options?.system_instruction,
    thinking_budget: options?.thinking_budget,
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
    temperature?: number;
    max_output_tokens?: number;
    thinking_budget?: number;
    provider?: ProviderType;
  }
): Promise<Gemini25FlashResult> {
  return generate({
    prompt,
    image,
    temperature: options?.temperature,
    max_output_tokens: options?.max_output_tokens,
    thinking_budget: options?.thinking_budget,
  }, options?.provider);
}

/**
 * 多图理解生成
 */
export async function multiImageGeneration(
  prompt: string,
  images: string[],
  options?: {
    temperature?: number;
    max_output_tokens?: number;
    thinking_budget?: number;
    provider?: ProviderType;
  }
): Promise<Gemini25FlashResult> {
  return generate({
    prompt,
    images,
    temperature: options?.temperature,
    max_output_tokens: options?.max_output_tokens,
    thinking_budget: options?.thinking_budget,
  }, options?.provider);
}
