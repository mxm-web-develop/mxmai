/**
 * Model 节点执行器
 * 根据 model_type 调用对应的 mxmcgi API
 */

import type { SmartflowNode } from '@mxmai/mxmdata';
import type { ExecutionContext, NodeExecutionResult } from './types';
import { VariableResolver } from './variable-resolver';
import { getModelInfo, validateModel } from '../model-registry';
import {
  callTextGeneration,
  callImageGeneration,
  callVideoGeneration,
  callSoundGeneration,
  callEmbeddingGeneration,
} from '../http-client';

export class ModelExecutor {
  
  /**
   * 执行 model 节点
   */
  static async execute(
    node: SmartflowNode,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    try {
      // 验证必需字段
      if (!node.model_type) {
        return {
          success: false,
          error: 'Model 节点缺少必需字段: model_type',
        };
      }
      
      if (!node.model) {
        return {
          success: false,
          error: 'Model 节点缺少必需字段: model',
        };
      }
      
      if (!node.prompt) {
        return {
          success: false,
          error: 'Model 节点缺少必需字段: prompt',
        };
      }
      
      // 验证模型是否存在
      if (!validateModel(node.model, node.model_type)) {
        return {
          success: false,
          error: `模型 "${node.model}" 不存在或不支持类型 "${node.model_type}"`,
        };
      }
      
      // 获取模型信息
      const modelInfo = getModelInfo(node.model);
      if (!modelInfo) {
        return {
          success: false,
          error: `无法获取模型信息: ${node.model}`,
        };
      }
      
      // 解析 prompt 中的变量
      const resolvedPrompt = VariableResolver.resolve(node.prompt, context);
      
      // 合并参数（默认参数 + 节点参数）
      const params: Record<string, any> = {
        ...(modelInfo.defaultParams as Record<string, any>),
        ...(node.params as Record<string, any>),
        prompt: resolvedPrompt,
      };
      
      // 对于图片/视频/文本生成节点，从 context 中提取图片输入
      // 支持通过变量引用传递图片（如 {{input.image}}）
      // 某些文本模型（如gpt-5-nano）也支持图片输入
      if (node.model_type === 'image' || node.model_type === 'video' || node.model_type === 'text') {
        // 检查参数中是否有图片相关的变量引用
        const imageInputParams = ['image', 'images', 'image_input', 'image_urls', 'image_base64s', 'input_image'];
        
        // 先处理 params 中明确指定的图片参数
        // 注意：需要先清除 params 中可能存在的未解析的图片参数（字符串形式的变量引用）
        let hasExplicitImageParam = false;
        for (const paramKey of imageInputParams) {
          // 清除可能存在的未解析的图片参数
          if (params[paramKey] && typeof params[paramKey] === 'string' && params[paramKey].includes('{{')) {
            delete params[paramKey];
          }
          
          if (node.params && node.params[paramKey]) {
            const paramValue = node.params[paramKey];
            // 如果是字符串且包含变量引用，解析变量
            if (typeof paramValue === 'string' && paramValue.includes('{{')) {
              const resolvedValue = VariableResolver.resolve(paramValue, context);
              // 检查解析后的值是否有效（不是 undefined、null 或空数组）
              if (resolvedValue !== undefined && resolvedValue !== null && 
                  !(Array.isArray(resolvedValue) && resolvedValue.length === 0)) {
                params[paramKey] = resolvedValue;
                hasExplicitImageParam = true;
                // 调试日志：记录图片参数解析结果
                console.log(`[ModelExecutor] 解析图片参数 ${paramKey}:`, {
                  original: paramValue,
                  resolved: Array.isArray(resolvedValue) ? `数组(${resolvedValue.length}项)` : typeof resolvedValue,
                  value: Array.isArray(resolvedValue) ? resolvedValue.slice(0, 2) : (typeof resolvedValue === 'string' && resolvedValue.length > 100 ? resolvedValue.substring(0, 100) + '...' : resolvedValue)
                });
              } else {
                console.warn(`[ModelExecutor] 图片参数 ${paramKey} 解析后无效:`, {
                  original: paramValue,
                  resolved: resolvedValue,
                  type: typeof resolvedValue,
                  isArray: Array.isArray(resolvedValue),
                  length: Array.isArray(resolvedValue) ? resolvedValue.length : 'N/A'
                });
                // 确保清除无效的参数
                delete params[paramKey];
              }
            } else {
              // 检查非变量值是否有效
              if (paramValue !== undefined && paramValue !== null && 
                  !(Array.isArray(paramValue) && paramValue.length === 0)) {
                params[paramKey] = paramValue;
                hasExplicitImageParam = true;
              } else {
                // 清除无效的参数
                delete params[paramKey];
              }
            }
          }
        }
        
        // 如果没有在params中明确指定有效的图片参数，尝试从input中自动提取图片
        // 但只有在节点明确需要图片时才自动提取（比如在prompt中引用了图片变量，或者是图片/视频生成节点）
        const promptText = node.prompt || '';
        const hasImageReference = promptText.includes('{{input.') && (
          promptText.includes('image') || 
          promptText.includes('reference_images') ||
          promptText.includes('reference_image')
        );
        
        // 只有以下情况才自动提取图片：
        // 1. 图片/视频生成节点（总是需要图片）
        // 2. 文本节点但在prompt中引用了图片变量
        const shouldAutoExtractImages = (node.model_type === 'image' || node.model_type === 'video') || 
          (node.model_type === 'text' && hasImageReference);
        
        // 只有在没有明确指定图片参数时才自动提取
        if (shouldAutoExtractImages && !hasExplicitImageParam && 
            !params.image && !params.images && !params.image_input && !params.image_urls && !params.image_base64s && !params.input_image) {
          const imageInputs = context.input_types?.image || [];
          const fileInputs = context.input_types?.file || [];
          
          // 优先使用image类型输入，其次使用file类型输入
          const availableImages = imageInputs.length > 0 ? imageInputs : fileInputs;
          
          if (availableImages.length > 0) {
            // 提取图片内容，处理content可能是数组的情况
            const extractImageContent = (item: any): string | string[] => {
              if (typeof item === 'string') {
                return item;
              }
              if (typeof item === 'object' && item !== null && 'content' in item) {
                // content可能是字符串或数组
                return item.content;
              }
              return item;
            };
            
            // 根据模型类型选择参数格式
            // seedream-4 使用 image_input（数组）
            // nano-banana 使用 image（单张）或 image_urls/image_base64s（多张）
            if (node.model === 'seedream-4') {
              // seedream-4 支持多张图片
              const imageContents: string[] = [];
              for (const item of availableImages) {
                const content = extractImageContent(item);
                if (Array.isArray(content)) {
                  imageContents.push(...content);
                } else {
                  imageContents.push(content);
                }
              }
              params.image_input = imageContents;
            } else if (node.model === 'nano-banana' || node.model === 'flux-kontext-fast') {
              // nano-banana 和 flux-kontext-fast 支持单张或多张
              const imageContents: string[] = [];
              for (const item of availableImages) {
                const content = extractImageContent(item);
                if (Array.isArray(content)) {
                  imageContents.push(...content);
                } else {
                  imageContents.push(content);
                }
              }
              
              if (imageContents.length === 1) {
                const imageContent = imageContents[0];
                // 判断是base64还是URL
                const isBase64 = typeof imageContent === 'string' && (
                  imageContent.startsWith('data:image') || 
                  imageContent.startsWith('data:') ||
                  (imageContent.length > 500 && !imageContent.startsWith('http://') && !imageContent.startsWith('https://'))
                );
                if (isBase64) {
                  params.image_base64s = [imageContent];
                } else {
                  params.image = imageContent;
                }
              } else {
                // 多张图片
                const firstImage = imageContents[0];
                const isBase64 = typeof firstImage === 'string' && (
                  firstImage.startsWith('data:image') || 
                  firstImage.startsWith('data:') ||
                  (firstImage.length > 500 && !firstImage.startsWith('http://') && !firstImage.startsWith('https://'))
                );
                if (isBase64) {
                  params.image_base64s = imageContents;
                } else {
                  params.image_urls = imageContents;
                }
              }
            } else if (node.model_type === 'text') {
              // 文本模型根据模型类型选择参数格式
              // gemini-3-pro 使用 images（数组）
              // 其他文本模型使用 image_input（数组）
              const imageContents: string[] = [];
              for (const item of availableImages) {
                const content = extractImageContent(item);
                if (Array.isArray(content)) {
                  imageContents.push(...content);
                } else {
                  imageContents.push(content);
                }
              }
              
              if (node.model === 'gemini-3-pro' || node.model === 'gemini-2.5-flash') {
                params.images = imageContents;
              } else {
                params.image_input = imageContents;
              }
            } else {
              // 其他模型，默认使用 image_input
              const imageContents: string[] = [];
              for (const item of availableImages) {
                const content = extractImageContent(item);
                if (Array.isArray(content)) {
                  imageContents.push(...content);
                } else {
                  imageContents.push(content);
                }
              }
              params.image_input = imageContents;
            }
          }
        }
      }
      
      // 根据模型类型调用对应的 API（通过 Gateway）
      // 从 context 中获取用户 token
      const userToken = context.token;
      
      // 调试日志：记录最终传递给API的参数
      if (node.model_type === 'image' || node.model_type === 'video') {
        const imageParams = ['image', 'images', 'image_input', 'image_urls', 'image_base64s', 'input_image'];
        const imageParamsInParams = Object.keys(params).filter(k => imageParams.includes(k));
        console.log(`[ModelExecutor] 准备调用图片生成API (${node.model}):`, {
          hasImageParams: imageParamsInParams.length > 0,
          imageParams: imageParamsInParams,
          image_urls: params.image_urls ? (Array.isArray(params.image_urls) ? `数组(${params.image_urls.length}项)` : typeof params.image_urls) : 'undefined',
          image_urls_preview: params.image_urls ? (Array.isArray(params.image_urls) ? params.image_urls.slice(0, 2) : [params.image_urls]) : []
        });
      }
      
      let result: any;
      
      switch (node.model_type) {
        case 'text':
          result = await callTextGeneration(
            node.model,
            resolvedPrompt,
            params,
            userToken
          );
          break;
          
        case 'image':
          result = await callImageGeneration(
            node.model,
            resolvedPrompt,
            params,
            userToken
          );
          break;
          
        case 'video':
          result = await callVideoGeneration(
            node.model,
            resolvedPrompt,
            params,
            userToken
          );
          break;
          
        case 'sound':
          result = await callSoundGeneration(
            node.model,
            resolvedPrompt,
            params,
            userToken
          );
          break;
          
        case 'embedding':
          result = await callEmbeddingGeneration(
            node.model,
            resolvedPrompt,
            params,
            userToken
          );
          break;
          
        default:
          return {
            success: false,
            error: `不支持的模型类型: ${node.model_type}`,
          };
      }
      
      // 格式化输出（根据模型类型）
      const formattedOutput = this.formatOutput(node.model_type, result);
      
      // 对于图片生成，检查是否生成了图片
      if (node.model_type === 'image') {
        // 支持字符串格式或数组格式
        if (typeof formattedOutput === 'string') {
          // 字符串格式，检查是否为空
          if (!formattedOutput || formattedOutput.trim().length === 0) {
            return {
              success: false,
              error: '图片生成失败：未生成任何图片。可能是模型返回了空结果，或者生成过程中出现了问题。',
            };
          }
        } else if (formattedOutput && typeof formattedOutput === 'object') {
          // 对象格式，检查 image_urls 或 mediaUrls
          const imageUrls = formattedOutput.image_urls || formattedOutput.mediaUrls || [];
          if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
            return {
              success: false,
              error: '图片生成失败：未生成任何图片。可能是模型返回了空结果，或者生成过程中出现了问题。',
            };
          }
        } else {
          return {
            success: false,
            error: '图片生成失败：未生成任何图片。可能是模型返回了空结果，或者生成过程中出现了问题。',
          };
        }
      }
      
      return {
        success: true,
        output: formattedOutput,
        metadata: {
          model: node.model,
          model_type: node.model_type,
          tokens: result.result?.tokens || result.tokens || 0,
        },
      };
    } catch (error) {
      // 处理敏感内容错误，提供更友好的错误信息
      let errorMessage = error instanceof Error ? error.message : String(error);
      
      // 对于图片和视频生成节点，检查是否是超时、排队或网络相关的错误
      // 如果是，不应该标记为失败，因为任务可能还在replicate的队列中处理
      const isImageOrVideo = node.model_type === 'image' || node.model_type === 'video';
      
      // 检查是否是超时、排队或网络错误
      const isTimeoutOrQueueError = 
        errorMessage.includes('timeout') ||
        errorMessage.includes('Timeout') ||
        errorMessage.includes('超时') ||
        errorMessage.includes('queued') ||
        errorMessage.includes('processing') ||
        errorMessage.includes('排队') ||
        errorMessage.includes('处理中');
      
      // 对于图片/视频生成，网络错误（fetch failed）也可能是任务已提交但响应超时
      // 这种情况下任务可能还在replicate队列中处理，不应该立即标记为失败
      const isNetworkError = 
        errorMessage.includes('fetch failed') ||
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('网络') ||
        errorMessage.includes('连接') ||
        errorMessage.includes('AbortError');
      
      if (isImageOrVideo && (isTimeoutOrQueueError || isNetworkError)) {
        // 对于图片/视频生成，如果是超时、排队或网络错误，标记为处理中，不标记为失败
        // 这样task不会立即失败，可以继续等待或由用户查询状态
        // 因为任务可能已经提交到replicate队列，正在后台处理
        return {
          success: false,
          error: `任务正在处理中，可能需要较长时间。错误信息：${errorMessage}。如果任务已提交到replicate队列，请稍后查询状态。`,
          isProcessing: true, // 标记为处理中，不是真正的失败
        };
      }
      
      if (errorMessage.includes('flagged as sensitive') || 
          errorMessage.includes('sensitive content') ||
          errorMessage.includes('E005')) {
        errorMessage = '生成内容被标记为敏感内容，请尝试修改输入内容后重试。如果问题持续，请联系支持团队。';
      }
      
      return {
        success: false,
        error: errorMessage,
        isProcessing: false, // 真正的失败
      };
    }
  }
  
  /**
   * 格式化输出（根据模型类型）
   */
  private static formatOutput(modelType: string, result: any): any {
    // Gateway 返回的格式：{ success: true, data: { result: { ... } } }
    const actualResult = result.data?.result || result.result || result;
    
    switch (modelType) {
      case 'text':
        return {
          text: actualResult.text || '',
          response: actualResult.text || '',
        };
        
      case 'image':
        // 支持多种格式：
        // 1. 字符串 URL：直接返回字符串
        // 2. 数组格式：返回对象格式 { image_urls: [...], mediaUrls: [...] }
        // 3. 对象格式：返回对象格式
        if (typeof actualResult === 'string') {
          // 单个 URL 字符串，直接返回字符串
          return actualResult;
        } else if (Array.isArray(actualResult)) {
          // URL 数组
          return {
            image_urls: actualResult,
            mediaUrls: actualResult,
          };
        } else if (actualResult && typeof actualResult === 'object') {
          // 对象格式
          const imageUrls = actualResult.image_urls || actualResult.mediaUrls || [];
          return {
            image_urls: imageUrls,
            mediaUrls: imageUrls,
          };
        } else {
          // 默认返回空数组格式
          return {
            image_urls: [],
            mediaUrls: [],
          };
        }
        
      case 'video':
        return {
          video_urls: actualResult.video_urls || actualResult.mediaUrls || [],
        };
        
      case 'sound':
        return {
          audio_urls: actualResult.audio_urls || actualResult.mediaUrls || [],
        };
        
      case 'embedding':
        return {
          embedding: actualResult.embedding || [],
        };
        
      default:
        return actualResult;
    }
  }
}
