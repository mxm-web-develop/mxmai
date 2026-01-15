/**
 * Replicate Provider
 * 
 * 默认 provider，支持 Replicate 平台上的各种模型
 */

import Replicate from 'replicate';
import { ModelProvider, GenerateParams, GenerateResult, ProviderType, StreamChunk, StreamStatus, ProgressEvent, ProgressStatus } from './types';
import { ModelMapping, getModelName } from '../utils/suport-list';

export class ReplicateProvider implements ModelProvider {
  readonly provider: ProviderType = 'replicate';
  readonly name = 'Replicate';
  
  private replicate: Replicate;
  
  // 支持的模型映射（从 suport-list.ts 导入）
  private readonly modelMap: Record<string, ModelMapping> = (() => {
    const supportList = require('../utils/suport-list').default;
    return {
      ...(supportList.replicate?.graph || {}),
      ...(supportList.replicate?.text || {}),
    };
  })();
  
  /**
   * 获取模型的实际名称（从 ModelMapping 中提取）
   */
  private getModelName(modelName: string): `${string}/${string}` {
    const mapping = this.modelMap[modelName];
    if (!mapping) {
      throw new Error(`Replicate provider 不支持模型: ${modelName}`);
    }
    const name = getModelName(mapping);
    // 确保返回格式为 `${string}/${string}`
    if (!name.includes('/')) {
      throw new Error(`Replicate 模型名称格式错误: ${name}，应为 "owner/model" 格式`);
    }
    return name as `${string}/${string}`;
  }

  constructor(apiKey?: string) {
    const token = apiKey || process.env.REPLICATE_API_TOKEN;
    
    if (!token) {
      throw new Error('REPLICATE_API_TOKEN 环境变量必须设置，或通过 apiKey 参数提供');
    }

    this.replicate = new Replicate({
      auth: token,
    });
  }

  supportsModel(modelName: string): boolean {
    return modelName in this.modelMap;
  }

  /**
   * 从 StreamChunk 流创建字符串流（兼容旧版本）
   */
  private async *createStringStreamFromChunkStream(
    chunkStream: AsyncIterable<StreamChunk>
  ): AsyncIterable<string> {
    for await (const chunkData of chunkStream) {
      if (chunkData.chunk) {
        yield chunkData.chunk;
      }
    }
  }

  /**
   * 创建进度监控流并执行生成任务（用于图片生成等需要等待的任务）
   * 使用 Replicate predictions API 来手动轮询状态
   */
  private createProgressStreamWithOutput(
    replicateModel: `${string}/${string}`,
    input: Record<string, any>
  ): { progressStream: AsyncIterable<ProgressEvent>; outputPromise: Promise<any> } {
    const replicateAny = this.replicate as any;
    let predictionId: string | null = null;
    let finalOutput: any = null;
    let predictionResolved = false;

    // 创建进度流（使用轮询方式）
    const progressStream = (async function* (): AsyncIterable<ProgressEvent> {
      // 创建预测（带重试机制处理 429 错误）
      // 调试：确认 replicateModel 的值
      if (process.env.DEBUG_REPLICATE) {
        console.log(`[DEBUG] createProgressStreamWithOutput: using version=${replicateModel}`);
      }
      let prediction: any;
      let retryCount = 0;
      const maxRetries = 5;
      
      while (retryCount < maxRetries) {
        try {
          prediction = await replicateAny.predictions.create({
            version: replicateModel,
            input,
          });
          
          predictionId = prediction.id;
          break; // 成功创建，退出重试循环
        } catch (createError: any) {
          // 如果是 429 错误，等待后重试
          // Replicate SDK 的错误对象结构：createError.response.status 和 createError.response.headers
          const errorStatus = createError?.response?.status || createError?.status;
          if (errorStatus === 429) {
            // 尝试从响应头获取 retry-after，或者从错误信息中解析
            let retryAfter: string | number = '3';
            const headers = createError?.response?.headers;
            if (headers) {
              // Headers 可能是 Map 或普通对象
              if (headers instanceof Map) {
                retryAfter = headers.get('retry-after') || headers.get('ratelimit-reset') || '3';
              } else if (typeof headers === 'object') {
                retryAfter = headers['retry-after'] || headers['ratelimit-reset'] || '3';
              }
            }
            
            // 如果错误信息中包含 retry_after，也尝试解析
            if (typeof createError?.message === 'string' && createError.message.includes('retry_after')) {
              const match = createError.message.match(/retry_after["\']?\s*:\s*(\d+)/);
              if (match) {
                retryAfter = match[1];
              }
            }
            
            const waitTime = parseInt(String(retryAfter), 10) * 1000 || 3000;
            
            retryCount++;
            if (retryCount < maxRetries) {
              console.warn(`[WARN] Rate limit hit (429), waiting ${waitTime}ms before retry ${retryCount}/${maxRetries}...`);
              yield {
                status: 'processing' as ProgressStatus,
                progress: 5,
                logs: [`等待速率限制重置 (${waitTime}ms)...`],
              };
              await new Promise(resolve => setTimeout(resolve, waitTime));
              continue;
            } else {
              // 重试次数用完，抛出错误
              console.error(`[ERROR] Failed to create prediction after ${maxRetries} retries due to rate limiting`);
              yield {
                status: 'failed' as ProgressStatus,
                error: `速率限制：请求被限制，请稍后重试或增加账户余额`,
              };
              throw createError;
            }
          } else {
            // 其他错误，直接抛出
            throw createError;
          }
        }
      }
      
      // 发送初始状态
      yield {
        status: 'starting',
        progress: 10,
      };

      // 轮询预测状态直到完成
      while (true) {
        // 等待一段时间后再次检查（避免过于频繁的请求）
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 获取最新状态
        const updated = await replicateAny.predictions.get(prediction.id);
        
        const status = updated.status as ProgressStatus;
        const output = updated.output;
        const error = updated.error;
        
        // 调试：打印状态和输出
        if (process.env.DEBUG_REPLICATE || status === 'succeeded') {
          console.log(`[DEBUG] Progress stream: status=${status}, output type=${typeof output}, output=`, output);
        }
        
        // 处理 logs：可能是数组、字符串或 null
        let logs: string[] = [];
        if (updated.logs) {
          if (Array.isArray(updated.logs)) {
            logs = (updated.logs as any[]).filter((log: any): log is string => typeof log === 'string');
          } else if (typeof updated.logs === 'string') {
            logs = [updated.logs];
          }
        }

        // 计算进度（基于状态）
        let progress: number | undefined;
        if (status === 'starting') {
          progress = 10;
        } else if (status === 'processing') {
          progress = 50;
        } else if (status === 'succeeded') {
          progress = 100;
          finalOutput = output;
          predictionResolved = true;
          
          // 检查输出是否为空（可能是被安全策略拦截）
          if (output === null || output === undefined || 
              (Array.isArray(output) && output.length === 0) ||
              (typeof output === 'object' && Object.keys(output).length === 0 && !Array.isArray(output))) {
            console.warn(`[WARN] Prediction succeeded but output is empty. This might indicate content was filtered by Replicate's safety checks.`);
            // 注意：这里不抛出错误，因为状态是 succeeded，让后续代码处理空输出
          }
        } else if (status === 'failed' || status === 'canceled') {
          progress = 0;
          predictionResolved = true;
          
          // 记录失败原因
          if (error) {
            console.error(`[ERROR] Prediction ${status}:`, error);
          }
        }

        // 发送进度事件
        const event: ProgressEvent = {
          status,
          progress,
          logs: logs.length > 0 ? logs : undefined,
          output: output || undefined,
          error: error || undefined,
        };

        yield event;

        // 如果完成或失败，结束流
        if (status === 'succeeded' || status === 'failed' || status === 'canceled') {
          break;
        }
      }
    })();

    // 创建输出 Promise（等待预测完成）
    const outputPromise = (async () => {
      // 等待 predictionId 被设置（进度流会设置它）
      // 增加等待时间，因为创建 prediction 可能需要一些时间
      let waitForPredictionId = 0;
      while (!predictionId && waitForPredictionId < 50) { // 增加到 5 秒
        await new Promise(resolve => setTimeout(resolve, 100));
        waitForPredictionId++;
      }
      
        if (!predictionId) {
        console.warn(`[WARN] outputPromise: predictionId not set after ${waitForPredictionId * 100}ms, using run() as fallback`);
        
        // 对于图片生成模型，run() 可能返回流，我们需要等待它完成
        // 使用 replicate 的 wait() 方法或直接等待 run() 完成
        try {
          const runResult: any = await this.replicate.run(replicateModel, { input });
          
          // 调试：打印 run() 的返回结果
          console.log(`[DEBUG] run() fallback result type:`, typeof runResult);
          console.log(`[DEBUG] run() fallback result:`, runResult);
          
          // 处理 ReadableStream：如果返回的是流数组，需要等待流完成
          if (Array.isArray(runResult) && runResult.length > 0) {
            const firstItem = runResult[0];
            // 检查是否是 ReadableStream
            if (firstItem && typeof firstItem === 'object' && 
                'locked' in firstItem && 'state' in firstItem && 
                (firstItem as any).constructor?.name === 'ReadableStream') {
              console.log(`[DEBUG] run() returned ReadableStream array, waiting for stream to complete...`);
              
              // 对于图片生成，流可能包含的是图片 URL 或数据
              // 我们需要等待流完成，然后从 prediction 中获取结果
              // 但如果没有 predictionId，我们需要另一种方式
              
              // 尝试：创建一个新的 prediction 并等待它完成
              const replicateAny = this.replicate as any;
              try {
                // 创建 prediction
                const prediction = await replicateAny.predictions.create({
                  version: replicateModel,
                  input,
                });
                
                const newPredictionId = prediction.id;
                console.log(`[DEBUG] Created new prediction ${newPredictionId} for fallback`);
                
                // 等待 prediction 完成
                let attempts = 0;
                const maxAttempts = 300; // 最多等待 5 分钟
                
                while (attempts < maxAttempts) {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  const updatedPrediction = await replicateAny.predictions.get(newPredictionId);
                  
                  if (updatedPrediction.status === 'succeeded') {
                    console.log(`[DEBUG] Fallback prediction succeeded, output:`, updatedPrediction.output);
                    return updatedPrediction.output;
                  } else if (updatedPrediction.status === 'failed' || updatedPrediction.status === 'canceled') {
                    throw new Error(`Prediction ${updatedPrediction.status}: ${updatedPrediction.error || 'Unknown error'}`);
                  }
                  
                  attempts++;
                }
                
                throw new Error('Prediction timeout');
              } catch (predError) {
                console.error(`[ERROR] Failed to create/wait for prediction:`, predError);
                // 继续尝试其他方式
              }
            }
          }
          
          // 如果 runResult 是对象，检查是否有特殊方法
          if (runResult && typeof runResult === 'object' && !Array.isArray(runResult)) {
            console.log(`[DEBUG] run() result keys:`, Object.keys(runResult));
            // 检查是否有特殊方法（如 url()）
            if ('url' in runResult && typeof runResult.url === 'function') {
              console.log(`[DEBUG] run() result has url() method, calling it...`);
              try {
                const url = await runResult.url();
                console.log(`[DEBUG] url() returned:`, url, `type:`, typeof url);
                // url() 可能返回 URL 对象或字符串
                if (url instanceof URL) {
                  return url.href; // 提取 URL 字符串
                } else if (typeof url === 'string') {
                  return url;
                } else {
                  // 尝试转换为字符串
                  return String(url);
                }
              } catch (e) {
                console.warn(`[WARN] Failed to call url() method:`, e);
              }
            }
          }
          
          return runResult;
        } catch (runError) {
          console.error(`[ERROR] run() fallback failed:`, runError);
          throw runError;
        }
      }
      
      console.log(`[DEBUG] outputPromise: waiting for prediction ${predictionId} to complete...`);

      // 等待进度流完成（通过轮询直到状态为 succeeded 或 failed）
      if (predictionId) {
        let maxAttempts = 3000; // 最多等待 5 分钟（300 * 1秒）
        let attempts = 0;
        
        while (attempts < maxAttempts) {
          // 如果进度流已经设置了 finalOutput，直接返回
          if (finalOutput !== null) {
            console.log(`[DEBUG] outputPromise: finalOutput set during polling`);
            return finalOutput;
          }
          
          const prediction = await replicateAny.predictions.get(predictionId);
          const status = prediction.status;
          
          if (status === 'succeeded') {
            const output = prediction.output;
            const error = prediction.error;
            
            // 调试：打印输出
            console.log(`[DEBUG] outputPromise: prediction succeeded, output type:`, typeof output);
            console.log(`[DEBUG] outputPromise: output value:`, output);
            console.log(`[DEBUG] outputPromise: output is array:`, Array.isArray(output));
            if (output && typeof output === 'object' && !Array.isArray(output)) {
              console.log(`[DEBUG] outputPromise: output keys:`, Object.keys(output));
            }
            if (error) {
              console.warn(`[WARN] outputPromise: prediction succeeded but has error field:`, error);
            }
            
            // 如果 output 是空对象或 undefined，继续等待或抛出错误
            if (!output || (typeof output === 'object' && Object.keys(output).length === 0 && !Array.isArray(output))) {
              console.warn(`[WARN] outputPromise: output is empty, continuing to wait...`);
              // 继续等待，可能输出还没准备好
              await new Promise(resolve => setTimeout(resolve, 1000));
              attempts++;
              continue;
            }
            
            // 检查是否是空数组（对于图片模型，空数组表示生成失败）
            if (Array.isArray(output) && output.length === 0) {
              console.warn(`[WARN] outputPromise: prediction succeeded but output is empty array. Error field:`, error);
              // 如果有 error 字段，抛出错误
              if (error) {
                throw new Error(`Prediction succeeded but returned empty output: ${error}`);
              }
              // 否则返回空数组，让后续代码处理
            }
            
            return output;
          } else if (status === 'failed' || status === 'canceled') {
            throw new Error(`Prediction ${status}: ${prediction.error || 'Unknown error'}`);
          }
          
          // 等待 1 秒后重试
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;
        }
        
        throw new Error('Prediction timeout: exceeded maximum wait time');
      }

      // 如果都没有，使用 run 方法作为回退
      return await this.replicate.run(replicateModel, { input });
    })();

    return { progressStream, outputPromise };
  }

  /**
   * 从 Replicate 的事件流创建文本流（带状态和收集）
   * Replicate stream() 返回的事件格式：{ event: 'output', data: '...' }
   * 或者直接是字符串/数组（取决于模型）
   */
  private async *createTextStreamFromReplicateStream(
    stream: AsyncIterable<any>,
    enableCollection: boolean = true
  ): AsyncIterable<StreamChunk> {
    let status: StreamStatus = 'pending';
    let collection = '';
    let hasStarted = false;

    try {
      for await (const event of stream) {
        // 处理不同的事件格式
        if (event && typeof event === 'object') {
          // 标准事件格式：{ event: 'output', data: '...' }
          if (event.event === 'output') {
            if (!hasStarted) {
              status = 'streaming';
              hasStarted = true;
            }
            
            // output 事件包含生成的文本数据
            const data = event.data;
            let chunks: string[] = [];
            
            if (typeof data === 'string') {
              chunks = [data];
            } else if (Array.isArray(data)) {
              // 如果是数组，提取所有字符串
              chunks = data
                .filter(item => typeof item === 'string')
                .map(item => item as string);
            } else if (data !== null && data !== undefined) {
              // 其他类型转换为字符串
              chunks = [String(data)];
            }

            // 为每个 chunk 生成输出
            for (const chunk of chunks) {
              if (enableCollection) {
                collection += chunk;
              }
              yield {
                chunk,
                status,
                collection: enableCollection ? collection : '',
              };
            }
          } else if (event.event === 'done') {
            // done 事件表示流结束
            status = 'completed';
            yield {
              chunk: '',
              status,
              collection: enableCollection ? collection : '',
            };
            break;
          } else if (event.event === 'error') {
            // error 事件，抛出错误
            status = 'error';
            throw new Error(`Replicate stream error: ${event.data || 'Unknown error'}`);
          } else if (event.event === 'start') {
            // start 事件，更新状态
            status = 'streaming';
            hasStarted = true;
          }
          // 忽略其他事件类型（如 'logs' 等）
        } else if (typeof event === 'string') {
          // 如果事件本身就是字符串，直接输出（某些模型可能直接返回字符串）
          if (!hasStarted) {
            status = 'streaming';
            hasStarted = true;
          }
          if (enableCollection) {
            collection += event;
          }
          yield {
            chunk: event,
            status,
            collection: enableCollection ? collection : '',
          };
        } else if (Array.isArray(event)) {
          // 如果事件是数组，逐个输出
          if (!hasStarted) {
            status = 'streaming';
            hasStarted = true;
          }
          for (const item of event) {
            const chunk = typeof item === 'string' ? item : String(item);
            if (enableCollection) {
              collection += chunk;
            }
            yield {
              chunk,
              status,
              collection: enableCollection ? collection : '',
            };
          }
        }
      }

      // 如果循环正常结束，更新状态为 completed
      if (status === 'streaming') {
        status = 'completed';
        yield {
          chunk: '',
          status,
          collection: enableCollection ? collection : '',
        };
      }
    } catch (error) {
      // 发生错误时，更新状态并抛出
      status = 'error';
      yield {
        chunk: '',
        status,
        collection: enableCollection ? collection : '',
      };
      throw error;
    }
  }

  /**
   * 从输出创建流式迭代器（处理各种格式，带状态和收集）
   * 用于在 stream() 方法不可用时的回退方案
   */
  private async *createStreamFromOutput(output: any, enableCollection: boolean = true): AsyncIterable<StreamChunk> {
    let status: StreamStatus = 'streaming';
    let collection = '';

    if (Array.isArray(output)) {
      // 数组格式：逐个输出元素（模拟流式效果）
      for (const item of output) {
        let chunk = '';
        if (typeof item === 'string') {
          chunk = item;
        } else if (item && typeof item === 'object') {
          chunk = (item as any).text || (item as any).content || String(item);
        } else {
          chunk = String(item);
        }

        if (chunk) {
          if (enableCollection) {
            collection += chunk;
          }
          yield {
            chunk,
            status,
            collection: enableCollection ? collection : '',
          };
        }
      }
    } else if (typeof output === 'string') {
      // 字符串格式：直接输出（不拆分，因为已经是完整字符串）
      if (enableCollection) {
        collection = output;
      }
      yield {
        chunk: output,
        status,
        collection: enableCollection ? collection : '',
      };
    } else {
      // 其他格式：转换为字符串后输出
      const chunk = String(output);
      if (enableCollection) {
        collection = chunk;
      }
      yield {
        chunk,
        status,
        collection: enableCollection ? collection : '',
      };
    }

    // 完成后更新状态
    status = 'completed';
    yield {
      chunk: '',
      status,
      collection: enableCollection ? collection : '',
    };
  }

  async generate(modelName: string, params: GenerateParams): Promise<GenerateResult> {
    console.log(`[ReplicateProvider] generate 被调用: modelName=${modelName}`);
    if (!this.supportsModel(modelName)) {
      throw new Error(`Replicate provider 不支持模型: ${modelName}`);
    }

    const replicateModel = this.getModelName(modelName);
    const outputFormat = params.outputFormat || 'json'; // 默认返回 JSON
    
    // 调试：打印模型映射信息
    if (process.env.DEBUG_REPLICATE) {
      console.log(`[DEBUG] Model mapping: ${modelName} -> ${replicateModel}`);
    }
    
    // 判断是否是图片模型
    const isImageModel = modelName === 'nano-banana' || 
                        // modelName === 'flux-kontext-fast' || // 已禁用：该模型是图片编辑模型，需要 input_image 参数
                        modelName === 'ideogram-v2a' || 
                        modelName === 'recraft-crisp-upscale' || 
                        modelName === 'flux-fast' ||
                        modelName === 'seedream-4';
    
    try {
      // 构建 Replicate 输入参数
      const input: Record<string, any> = {
        prompt: params.prompt,
      };

      // 添加可选参数
      if (params.negativePrompt) {
        input.negative_prompt = params.negativePrompt;
      }

      // 合并其他参数
      if (params.parameters) {
        Object.assign(input, params.parameters);
      }

      // 特殊处理：nano-banana 模型不支持 image_size 参数，需要移除
      if (modelName === 'nano-banana' && input.image_size) {
        delete input.image_size;
        // Replicate 的 nano-banana-pro 不支持 image_size，只支持 aspect_ratio
        console.warn('⚠️  Replicate 的 nano-banana-pro 不支持 image_size 参数，已移除');
      }

      // 特殊处理：nano-banana 模型使用 image_input 而不是 image_urls
      if (modelName === 'nano-banana' && input.image_urls) {
        // Replicate 的 nano-banana-pro 期望 image_input 参数（数组），而不是 image_urls
        input.image_input = input.image_urls;
        delete input.image_urls;
        console.log(`[ReplicateProvider] nano-banana 将 image_urls 转换为 image_input:`, {
          count: Array.isArray(input.image_input) ? input.image_input.length : 0,
          preview: Array.isArray(input.image_input) ? input.image_input.slice(0, 2) : []
        });
      }
      
      // 特殊处理：nano-banana 模型使用 image_input 而不是 image_base64s
      if (modelName === 'nano-banana' && input.image_base64s) {
        // Replicate 的 nano-banana-pro 期望 image_input 参数（数组），而不是 image_base64s
        input.image_input = input.image_base64s;
        delete input.image_base64s;
        console.log(`[ReplicateProvider] nano-banana 将 image_base64s 转换为 image_input:`, {
          count: Array.isArray(input.image_input) ? input.image_input.length : 0,
          preview: Array.isArray(input.image_input) ? (input.image_input[0]?.startsWith('data:') ? 'Base64数据' : 'URL') : []
        });
      }
      
      // 特殊处理：nano-banana 模型使用 image_input 而不是 image（单图）
      if (modelName === 'nano-banana' && input.image && !input.image_input) {
        // 如果只有单张图片，也转换为 image_input 数组
        input.image_input = [input.image];
        delete input.image;
        console.log(`[ReplicateProvider] nano-banana 将 image 转换为 image_input:`, {
          count: 1,
          preview: Array.isArray(input.image_input) ? (input.image_input[0]?.startsWith('data:') ? 'Base64数据' : 'URL') : []
        });
      }

      // 特殊处理：recraft-crisp-upscale 只需要 image 参数，不需要 prompt
      if (modelName === 'recraft-crisp-upscale' && input.input_image && !input.prompt) {
        // 如果只有 input_image 没有 prompt，这是正常的（放大模式）
        // 保持原样，不修改
      } else if (modelName === 'recraft-crisp-upscale' && input.input_image && input.prompt) {
        // 如果有 prompt 和 input_image，可能需要移除 prompt（取决于模型要求）
        // 暂时保留，让模型决定
      }

      // 特殊处理：Gemini 2.5 Flash 使用 system_instruction 而不是 system_prompt
      if (modelName === 'gemini-2.5-flash' && input.system_prompt) {
        input.system_instruction = input.system_prompt;
        delete input.system_prompt;
      }
      
      // 特殊处理：Gemini 2.5 Flash 使用 max_output_tokens 而不是 max_tokens
      if (modelName === 'gemini-2.5-flash' && input.max_tokens) {
        input.max_output_tokens = input.max_tokens;
        delete input.max_tokens;
      }

      // 调试日志：记录传递给 Replicate 的参数（特别是图片参数）
      if (modelName === 'nano-banana') {
        const imageParams = ['image', 'image_urls', 'image_base64s', 'image_input'];
        const foundImageParams = Object.keys(input).filter(k => imageParams.includes(k));
        console.log(`[ReplicateProvider] nano-banana 传递给 Replicate 的参数:`, {
          prompt: input.prompt?.substring(0, 100),
          imageParams: foundImageParams,
          image_input: input.image_input ? (Array.isArray(input.image_input) ? `数组(${input.image_input.length}项)` : typeof input.image_input) : 'undefined',
          image_input_preview: input.image_input && Array.isArray(input.image_input) ? input.image_input.slice(0, 2) : [],
          allKeys: Object.keys(input)
        });
      }

      // 调用 Replicate API
      let output: any;
      
      // 获取 enableCollection 参数（默认 true）
      const enableCollection = params.enableCollection !== false;
      
      if (outputFormat === 'stream') {
        // 流式模式：使用 Replicate 的 stream() 方法
        // Replicate SDK 的 stream() 方法返回 AsyncGenerator<ServerSentEvent>
        try {
          // 检查 replicate 对象是否有 stream 方法
          const replicateAny = this.replicate as any;
          if (typeof replicateAny.stream === 'function') {
            // 使用 stream() 方法获取真正的流式输出
            // stream() 直接返回 AsyncGenerator，不需要 await
            const stream = replicateAny.stream(replicateModel, { input });
            
            // 将 Replicate 的事件流转换为文本流（带状态和收集）
            const streamWithStatus = this.createTextStreamFromReplicateStream(stream, enableCollection);
            
            // 同时提供兼容的字符串流
            const streamString = this.createStringStreamFromChunkStream(streamWithStatus);
            
            return {
              mediaUrls: [],
              metadata: {
                model: modelName, // 使用原始模型名称（如 claude-4.5-sonnet），而不是 replicateModel（内部映射）
                provider: this.provider,
                outputFormat: 'stream',
                enableCollection,
              },
              stream: streamWithStatus,
              streamString, // 兼容旧版本
            };
          } else {
            // 如果 stream() 方法不存在，使用 run() 并转换为流式输出
            // 注意：这不是真正的实时流式，而是模拟流式输出
            const result = await this.replicate.run(replicateModel, { input });
            
            const streamWithStatus = this.createStreamFromOutput(result, enableCollection);
            const streamString = this.createStringStreamFromChunkStream(streamWithStatus);
            
            return {
              mediaUrls: [],
              metadata: {
                model: modelName, // 使用原始模型名称（如 claude-4.5-sonnet），而不是 replicateModel（内部映射）
                provider: this.provider,
                outputFormat: 'stream',
                enableCollection,
              },
              stream: streamWithStatus,
              streamString, // 兼容旧版本
            };
          }
        } catch (streamError) {
          // 如果 stream() 失败，回退到 run() 并转换为流式输出
          console.warn('⚠️  Replicate stream() 失败，使用 run() 模拟流式输出:', streamError);
          const result = await this.replicate.run(replicateModel, { input });
          
          const streamWithStatus = this.createStreamFromOutput(result, enableCollection);
          const streamString = this.createStringStreamFromChunkStream(streamWithStatus);
          
          return {
            mediaUrls: [],
            metadata: {
              model: replicateModel,
              provider: this.provider,
              outputFormat: 'stream',
              enableCollection,
            },
            stream: streamWithStatus,
            streamString, // 兼容旧版本
          };
        }
      } else {
        // JSON 模式：等待完整结果
        // 如果是图片模型且启用进度监控，使用进度流
        if (isImageModel && params.enableProgress !== false) {
          // 创建进度流并执行生成任务
          const { progressStream, outputPromise } = this.createProgressStreamWithOutput(replicateModel, input);
          
          // 等待输出完成（但进度流已经在运行）
          // 增加超时时间，因为图片生成可能需要较长时间
          output = await Promise.race([
            outputPromise,
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Output promise timeout after 10 minutes')), 600000)
            )
          ]).catch(async (error) => {
            // 如果超时或失败，尝试使用 run() 作为最后的回退
            console.warn(`[WARN] outputPromise failed or timeout:`, error);
            console.warn(`[WARN] Trying run() as final fallback...`);
            
            try {
              // 调试日志：记录传递给 run() 的参数
              if (modelName === 'nano-banana') {
                console.log(`[ReplicateProvider] nano-banana 使用 run() fallback，参数:`, {
                  prompt: input.prompt?.substring(0, 100),
                  image_input: input.image_input ? (Array.isArray(input.image_input) ? `数组(${input.image_input.length}项)` : typeof input.image_input) : 'undefined',
                  image_input_preview: input.image_input && Array.isArray(input.image_input) ? input.image_input.slice(0, 2) : [],
                  allKeys: Object.keys(input)
                });
              }
              
              const runResult: any = await this.replicate.run(replicateModel, { input });
              
              // 如果 run() 返回流，我们需要等待它完成
              // 对于图片生成，run() 可能返回 AsyncIterator，我们需要迭代它
              if (runResult && typeof runResult[Symbol.asyncIterator] === 'function') {
                console.log(`[DEBUG] run() returned async iterator, iterating...`);
                const results: any[] = [];
                for await (const item of runResult) {
                  results.push(item);
                }
                console.log(`[DEBUG] Iterated ${results.length} items from async iterator`);
                return results.length > 0 ? results : runResult;
              }
              
              return runResult;
            } catch (runError) {
              console.error(`[ERROR] run() fallback also failed:`, runError);
              
              // 提供更详细的错误信息
              let errorMessage = runError instanceof Error ? runError.message : String(runError);
              
              // 检查是否是 Replicate 的特定错误
              if (errorMessage.includes('E9243') || errorMessage.includes('Director: unexpected error')) {
                // E9243 通常是 Replicate 服务端错误，可能是图片 URL 无法访问或格式问题
                const imageInputInfo = input.image_input 
                  ? (Array.isArray(input.image_input) 
                      ? `提供了 ${input.image_input.length} 张参考图片` 
                      : '提供了参考图片')
                  : '未提供参考图片';
                
                errorMessage = `Replicate 服务端错误 (E9243): 可能是参考图片 URL 无法访问、图片格式不支持，或 Replicate 服务暂时不可用。${imageInputInfo}。请检查图片 URL 是否可公开访问，或稍后重试。`;
              }
              
              // 抛出详细错误
              throw new Error(`Replicate 生成失败 (${modelName} -> ${replicateModel}): ${errorMessage}`);
            }
          });
          
          // 处理输出
          const outputAny: any = output;
          
          // 调试：打印输出格式
          console.log(`[DEBUG] Model: ${modelName}, Output type:`, typeof outputAny);
          console.log(`[DEBUG] Is array:`, Array.isArray(outputAny));
          if (outputAny && typeof outputAny === 'object' && !Array.isArray(outputAny)) {
            console.log(`[DEBUG] Object keys:`, Object.keys(outputAny));
            try {
              // 避免打印 Base64 数据，只显示输出类型和结构
              const outputType = typeof outputAny;
              const outputInfo = Array.isArray(outputAny) 
                ? `array[${outputAny.length}]` 
                : outputType === 'object' 
                  ? `object with keys: ${Object.keys(outputAny).join(', ')}` 
                  : outputType;
              console.log(`[DEBUG] Output type: ${outputInfo}`);
            } catch (e) {
              // 避免打印 Base64 数据
              console.log(`[DEBUG] Output type: ${typeof outputAny}, length: ${String(outputAny).length} chars`);
            }
          }
          
          // 特殊处理：Seedream 4 返回 { items: [...] } 格式
          let mediaUrls: string[] = [];
          
          // 详细调试：打印完整的输出结构
          console.log(`[DEBUG] Processing output for image model "${modelName}":`);
          console.log(`[DEBUG] - Output type:`, typeof outputAny);
          console.log(`[DEBUG] - Is array:`, Array.isArray(outputAny));
          if (outputAny && typeof outputAny === 'object' && !Array.isArray(outputAny)) {
            console.log(`[DEBUG] - Object keys:`, Object.keys(outputAny));
            // 尝试打印完整对象（限制长度）
            try {
              const outputStr = JSON.stringify(outputAny, null, 2);
              // 避免打印 Base64 数据，只显示输出类型和长度
              console.log(`[DEBUG] - Full output length: ${outputStr.length} chars, type: ${typeof outputAny}`);
            } catch (e) {
              // 避免打印 Base64 数据
              console.log(`[DEBUG] - Output type: ${typeof outputAny}, length: ${String(outputAny).length} chars`);
            }
          } else if (Array.isArray(outputAny)) {
            console.log(`[DEBUG] - Array length:`, outputAny.length);
            if (outputAny.length > 0) {
              console.log(`[DEBUG] - First element:`, outputAny[0], `type:`, typeof outputAny[0]);
            }
          } else {
            console.log(`[DEBUG] - Output value:`, outputAny);
          }
          
          if (modelName === 'seedream-4' && outputAny && typeof outputAny === 'object' && !Array.isArray(outputAny)) {
            console.log(`[DEBUG] seedream-4 output structure:`, {
              hasItems: 'items' in outputAny,
              itemsType: outputAny.items ? typeof outputAny.items : 'none',
              itemsIsArray: Array.isArray(outputAny.items),
              itemsLength: Array.isArray(outputAny.items) ? outputAny.items.length : 0,
              allKeys: Object.keys(outputAny),
            });
            
            if (outputAny.items) {
              if (Array.isArray(outputAny.items)) {
                console.log(`[DEBUG] seedream-4 items array length:`, outputAny.items.length);
                if (outputAny.items.length > 0) {
                  console.log(`[DEBUG] seedream-4 first item:`, outputAny.items[0], `type:`, typeof outputAny.items[0]);
                }
                
                // items 可能是字符串数组，也可能是对象数组
                mediaUrls = outputAny.items.map((item: any, index: number) => {
                  if (typeof item === 'string' && item.length > 0) {
                    const isBase64 = item.startsWith('data:');
                    console.log(`[DEBUG] seedream-4 item[${index}] is string (${isBase64 ? 'Base64' : 'URL'})`);
                    return item;
                  } else if (item && typeof item === 'object') {
                    console.log(`[DEBUG] seedream-4 item[${index}] is object, keys:`, Object.keys(item));
                    // 可能是 { url: "..." } 或 { image_url: "..." } 格式
                    if (item.url && typeof item.url === 'string') {
                      const isBase64 = item.url.startsWith('data:');
                      console.log(`[DEBUG] seedream-4 item[${index}] has url (${isBase64 ? 'Base64' : 'URL'})`);
                      return item.url;
                    } else if (item.image_url && typeof item.image_url === 'string') {
                      const isBase64 = item.image_url.startsWith('data:');
                      console.log(`[DEBUG] seedream-4 item[${index}] has image_url (${isBase64 ? 'Base64' : 'URL'})`);
                      return item.image_url;
                    } else if (item.image && typeof item.image === 'string') {
                      const isBase64 = item.image.startsWith('data:');
                      console.log(`[DEBUG] seedream-4 item[${index}] has image (${isBase64 ? 'Base64' : 'URL'})`);
                      return item.image;
                    }
                    // 尝试查找任何以 http 开头的字符串属性
                    for (const key in item) {
                      if (typeof item[key] === 'string' && (item[key].startsWith('http://') || item[key].startsWith('https://'))) {
                        console.log(`[DEBUG] seedream-4 item[${index}] found URL in key "${key}"`);
                        return item[key];
                      }
                    }
                    console.warn(`[WARN] seedream-4 item[${index}] could not extract URL from object`);
                  }
                  return null;
                }).filter((url: string | null): url is string => url !== null && url.length > 0);
                console.log(`[DEBUG] seedream-4 extracted ${mediaUrls.length} URLs from items array`);
              } else {
                console.warn(`[WARN] seedream-4 items is not an array:`, typeof outputAny.items);
                mediaUrls = [];
              }
            } else {
              // 如果没有 items，尝试其他可能的字段
              console.log(`[DEBUG] seedream-4 no items field, checking other fields...`);
              if (outputAny.image_urls && Array.isArray(outputAny.image_urls)) {
                mediaUrls = outputAny.image_urls.filter((url: any): url is string => typeof url === 'string' && url.length > 0);
                console.log(`[DEBUG] seedream-4 found image_urls:`, mediaUrls.length);
              } else if (outputAny.mediaUrls && Array.isArray(outputAny.mediaUrls)) {
                mediaUrls = outputAny.mediaUrls.filter((url: any): url is string => typeof url === 'string' && url.length > 0);
                console.log(`[DEBUG] seedream-4 found mediaUrls:`, mediaUrls.length);
              } else {
                console.warn(`[WARN] seedream-4 no items, image_urls, or mediaUrls found`);
                mediaUrls = [];
              }
            }
        } else if (modelName === 'nano-banana' && outputAny) {
          // nano-banana 特殊处理：可能返回字符串 URL 或数组
          if (typeof outputAny === 'string' && outputAny.length > 0) {
            // 单个 URL 字符串
            mediaUrls = [outputAny];
          } else if (outputAny instanceof URL) {
            // 如果是 URL 对象，提取 href
            mediaUrls = [outputAny.href];
            console.log(`[DEBUG] Extracted URL from URL object:`, outputAny.href);
          } else if (Array.isArray(outputAny)) {
            // URL 数组（可能包含 URL 对象）
            mediaUrls = outputAny.map((url: any) => {
              if (url instanceof URL) return url.href;
              if (typeof url === 'string') return url;
              return String(url);
            }).filter((url: string) => url.length > 0);
          } else if (typeof outputAny === 'object' && !Array.isArray(outputAny)) {
              // 可能是对象格式，尝试多种可能的字段
              // 首先检查是否有 url() 方法（Replicate SDK 可能返回的对象）
              if ('url' in outputAny && typeof (outputAny as any).url === 'function') {
                try {
                  console.log(`[DEBUG] Calling url() method on nano-banana output...`);
                  const url = await (outputAny as any).url();
                  console.log(`[DEBUG] url() returned:`, url, `type:`, typeof url, `is URL instance:`, url instanceof URL);
                  
                  // 处理 URL 对象或字符串
                  let urlString: string | undefined;
                  if (url instanceof URL) {
                    urlString = url.href;
                    console.log(`[DEBUG] Extracted href from URL object:`, urlString);
                  } else if (typeof url === 'string' && url.length > 0) {
                    urlString = url;
                  } else if (Array.isArray(url)) {
                    // url() 可能返回数组
                    const urlStrings = url.map((u: any) => {
                      if (u instanceof URL) return u.href;
                      if (typeof u === 'string') return u;
                      return String(u);
                    }).filter((u: string) => u.length > 0);
                    if (urlStrings.length > 0) {
                      mediaUrls = urlStrings;
                      console.log(`[DEBUG] Extracted ${urlStrings.length} URLs from array`);
                    }
                  }
                  
                  if (urlString && urlString.length > 0) {
                    mediaUrls = [urlString];
                    console.log(`[DEBUG] Successfully extracted URL:`, urlString);
                  } else {
                    console.warn(`[WARN] url() method returned but could not extract URL string`);
                  }
                } catch (e) {
                  console.warn(`[WARN] Failed to call url() method:`, e);
                }
              }
              
              // 如果还没有找到 URL，尝试其他字段
              if (mediaUrls.length === 0) {
                const output = outputAny as any;
                if (output.url && typeof output.url === 'string') {
                  mediaUrls = [output.url];
                } else if (output.image_url) {
                  mediaUrls = typeof output.image_url === 'string' ? [output.image_url] : [];
                } else if (output.image) {
                  mediaUrls = typeof output.image === 'string' ? [output.image] : [];
                } else if (output.urls && Array.isArray(output.urls)) {
                  mediaUrls = output.urls.filter((url: any): url is string => typeof url === 'string' && url.length > 0);
                } else if (output.images && Array.isArray(output.images)) {
                  mediaUrls = output.images.filter((url: any): url is string => typeof url === 'string' && url.length > 0);
                } else {
                  // 尝试查找所有字符串值（可能是 URL），但排除函数
                  const allValues = Object.values(outputAny);
                  const urlValues = allValues.filter((v: any) => 
                    typeof v === 'string' && 
                    (v.startsWith('http') || v.startsWith('https'))
                  );
                  if (urlValues.length > 0) {
                    mediaUrls = urlValues as string[];
                  }
                }
              }
            }
          } else {
            // 通用处理
            mediaUrls = Array.isArray(outputAny) 
              ? outputAny.filter((url: any): url is string => typeof url === 'string' && url.length > 0)
              : typeof outputAny === 'string' && outputAny.length > 0 
                ? [outputAny] 
                : [];
          }
          
          console.log(`[DEBUG] Extracted mediaUrls count:`, mediaUrls.length);
          if (mediaUrls.length > 0) {
            const isBase64 = mediaUrls[0].startsWith('data:');
            console.log(`[DEBUG] First media: ${isBase64 ? 'Base64数据' : 'URL'}`);
          } else {
            console.warn(`[WARN] No mediaUrls extracted from output. Output was:`, outputAny);
          }
          
          // 返回包含进度流的结果（注意：进度流可能已经完成，但调用者仍可以遍历它）
          return {
            mediaUrls,
            metadata: {
              model: modelName, // 使用原始模型名称（如 claude-4.5-sonnet），而不是 replicateModel（内部映射）
              provider: this.provider,
              outputFormat: 'json',
            },
            progress: progressStream,
          };
        } else {
          output = await this.replicate.run(replicateModel, { input });
        }
      }
      
      // 调试：打印输出类型和内容（仅用于调试）
      // 对于 Claude 模型，总是打印调试信息以便排查问题
      const shouldDebug = process.env.DEBUG_REPLICATE || modelName.includes('claude');
      if (shouldDebug) {
        console.log(`[DEBUG] Model: ${modelName}, Output type:`, typeof output);
        console.log(`[DEBUG] Is iterable:`, output && typeof output[Symbol.asyncIterator] === 'function');
        console.log(`[DEBUG] Is array:`, Array.isArray(output));
        if (output && typeof output === 'object' && !Array.isArray(output)) {
          console.log(`[DEBUG] Object keys:`, Object.keys(output));
        }
        try {
          const outputStr = JSON.stringify(output, null, 2);
          // 避免打印 Base64 数据，只显示输出类型和长度
          console.log(`[DEBUG] Output length: ${outputStr.length} chars, type: ${typeof output}`);
        } catch (e) {
          // 避免打印 Base64 数据
          console.log(`[DEBUG] Output type: ${typeof output}, length: ${String(output).length} chars`);
        }
      }

      // 处理流式输出：如果返回的是异步迭代器，需要遍历收集所有片段
      let finalOutput: any = output;
      if (output && typeof output[Symbol.asyncIterator] === 'function') {
        // 这是一个异步迭代器（流式输出）
        const chunks: string[] = [];
        try {
          if (shouldDebug) {
            console.log(`[DEBUG] 开始处理流式输出...`);
          }
          for await (const chunk of output) {
            if (shouldDebug) {
              console.log(`[DEBUG] 收到块:`, typeof chunk, chunk);
            }
            if (typeof chunk === 'string') {
              chunks.push(chunk);
            } else if (chunk && typeof chunk === 'object') {
              // 某些模型可能返回对象格式的块
              const chunkText = (chunk as any).text || (chunk as any).content || (chunk as any).delta || String(chunk);
              if (typeof chunkText === 'string') {
                chunks.push(chunkText);
              } else if (Array.isArray(chunkText)) {
                chunks.push(...chunkText.filter((item): item is string => typeof item === 'string'));
              }
            }
          }
          // 将所有片段连接成完整文本
          finalOutput = chunks.join('');
          if (shouldDebug) {
            console.log(`[DEBUG] 流式输出处理完成，共 ${chunks.length} 个片段，总长度: ${finalOutput.length}`);
          }
        } catch (streamError) {
          console.warn(`⚠️  流式输出处理失败，尝试直接使用输出:`, streamError);
          // 如果流式处理失败，尝试直接使用输出
          finalOutput = output;
        }
      } else if (shouldDebug) {
        console.log(`[DEBUG] 非流式输出，直接使用`);
      }

      // 判断是文本模型还是图片模型
      const isTextModel = modelName.startsWith('deepseek') || 
                         modelName.startsWith('gemini') || 
                         modelName.startsWith('claude') || 
                         modelName.startsWith('gpt') ||
                         modelName.includes('gemini-3-pro');

      let mediaUrls: string[] = [];
      let text: string | undefined;
      let usage: any;

      if (isTextModel) {
        // 文本模型：输出可能是字符串、数组或对象格式
        // 使用处理后的 finalOutput（如果是流式输出，已经是连接后的字符串）
        if (typeof finalOutput === 'string') {
          // 处理字符串：可能是纯文本或 JSON 字符串
          const outputStr: string = finalOutput;
          let processedText: string = outputStr.trim();
          // 如果看起来像 JSON 字符串，尝试解析
          if (processedText.startsWith('{') || processedText.startsWith('[')) {
            try {
              const parsed = JSON.parse(processedText);
              if (typeof parsed === 'object' && parsed !== null) {
                // 递归处理解析后的对象
                const tempOutput = parsed as any;
                if (typeof tempOutput.text === 'string') {
                  processedText = tempOutput.text;
                } else if (typeof tempOutput.content === 'string') {
                  processedText = tempOutput.content;
                } else if (typeof tempOutput.message?.content === 'string') {
                  processedText = tempOutput.message.content;
                } else if (typeof tempOutput.choices?.[0]?.message?.content === 'string') {
                  processedText = tempOutput.choices[0].message.content;
                }
                // 如果解析后没有找到文本，使用原始字符串
              }
            } catch {
              // 解析失败，使用原始字符串
              processedText = output;
            }
          }
          text = processedText;
          mediaUrls = [processedText];
        } else if (Array.isArray(finalOutput)) {
          // Gemini 2.5 Flash 返回字符串数组，每个字符串是文本片段
          // 需要连接所有片段
          const textArray = finalOutput.filter((item): item is string => typeof item === 'string');
          text = textArray.join('');
          mediaUrls = textArray;
        } else if (finalOutput && typeof finalOutput === 'object') {
          // 处理对象格式：可能是 Replicate 包装的格式或 Claude/Gemini 的原始格式
          const outputObj = finalOutput as any;
          
          // 尝试多种可能的字段路径
          if (outputObj.text) {
            text = outputObj.text;
          } else if (outputObj.content) {
            text = outputObj.content;
          } else if (outputObj.message) {
            // Claude 格式: { message: { content: "..." } }
            text = typeof outputObj.message === 'string' 
              ? outputObj.message 
              : outputObj.message.content || outputObj.message.text;
          } else if (outputObj.choices && Array.isArray(outputObj.choices) && outputObj.choices.length > 0) {
            // Claude API 格式: { choices: [{ message: { content: "..." } }] }
            const firstChoice = outputObj.choices[0];
            if (firstChoice.message) {
              text = firstChoice.message.content || firstChoice.message.text;
              // 如果 content 是数组（某些格式），需要提取文本
              if (Array.isArray(text)) {
                text = text.map((item: any) => {
                  if (typeof item === 'string') return item;
                  if (item && typeof item === 'object' && item.text) return item.text;
                  if (item && typeof item === 'object' && item.content) return item.content;
                  return String(item);
                }).join('');
              }
            } else if (firstChoice.text) {
              text = firstChoice.text;
            } else if (typeof firstChoice === 'string') {
              text = firstChoice;
            } else if (firstChoice.content) {
              text = firstChoice.content;
            }
          } else if (outputObj.output) {
            // 某些 Replicate 模型可能包装在 output 字段中
            text = typeof outputObj.output === 'string' ? outputObj.output : outputObj.output.text || outputObj.output.content;
          } else {
            // 最后尝试转换为字符串
            text = String(finalOutput);
          }
          
          // 提取 usage 信息
          if (outputObj.usage) {
            usage = outputObj.usage;
          } else if (typeof outputObj.input_tokens === 'number' || typeof outputObj.output_tokens === 'number') {
            usage = {
              prompt_tokens: outputObj.input_tokens as number | undefined,
              completion_tokens: outputObj.output_tokens as number | undefined,
              total_tokens: ((outputObj.input_tokens as number) || 0) + ((outputObj.output_tokens as number) || 0),
            };
          }
          
          // 确保 text 不为空
          if (!text || text.trim().length === 0) {
            // 如果还是空的，打印警告并尝试其他方式
            console.warn(`⚠️  文本模型 "${modelName}" 返回空内容`);
            console.warn(`原始输出类型:`, typeof finalOutput);
            console.warn(`是否为数组:`, Array.isArray(finalOutput));
            if (Array.isArray(finalOutput) && finalOutput.length > 0) {
              console.warn(`数组长度:`, finalOutput.length);
              console.warn(`第一个元素:`, finalOutput[0], `类型:`, typeof finalOutput[0]);
            }
            try {
              const outputStr = JSON.stringify(finalOutput, null, 2);
              // 避免打印 Base64 数据
              console.warn(`原始输出长度: ${outputStr.length} 字符, 类型: ${typeof finalOutput}`);
            } catch (e) {
              // 避免打印 Base64 数据
              console.warn(`原始输出类型: ${typeof finalOutput}, 长度: ${String(finalOutput).length} 字符`);
            }
            // 最后尝试：如果是数组，尝试连接
            if (Array.isArray(finalOutput)) {
              text = finalOutput.map(item => String(item)).join('');
            } else {
              text = String(finalOutput);
            }
          }
          
          mediaUrls = text ? [text] : [];
        } else {
          text = String(finalOutput || '');
          mediaUrls = [text];
        }
      } else {
        // 图片模型：输出是 URL 或 URL 数组
        let outputAny: any = finalOutput;
        
        // 详细调试：打印完整的输出结构
        console.log(`[DEBUG] Processing output for image model "${modelName}" (non-progress mode):`);
        console.log(`[DEBUG] - Output type:`, typeof outputAny);
        console.log(`[DEBUG] - Is array:`, Array.isArray(outputAny));
        console.log(`[DEBUG] - Is URL instance:`, outputAny instanceof URL);
        
        // 如果 outputAny 本身就是 URL 对象，直接提取 href
        if (outputAny instanceof URL) {
          console.log(`[DEBUG] Output is URL object, extracting href:`, outputAny.href);
          finalOutput = outputAny.href;
          outputAny = finalOutput; // 更新 outputAny 为字符串，后续处理会使用它
        }
        
        if (outputAny && typeof outputAny === 'object' && !Array.isArray(outputAny) && !(outputAny instanceof URL)) {
          console.log(`[DEBUG] - Object keys:`, Object.keys(outputAny));
          try {
            const outputStr = JSON.stringify(outputAny, null, 2);
            // 避免打印 Base64 数据，只显示输出类型和长度
            console.log(`[DEBUG] - Full output length: ${outputStr.length} chars, type: ${typeof outputAny}`);
          } catch (e) {
            // 避免打印 Base64 数据
            console.log(`[DEBUG] - Output type: ${typeof outputAny}, length: ${String(outputAny).length} chars`);
          }
        } else if (Array.isArray(outputAny)) {
          console.log(`[DEBUG] - Array length:`, outputAny.length);
          if (outputAny.length > 0) {
            console.log(`[DEBUG] - First element:`, outputAny[0], `type:`, typeof outputAny[0], `is URL:`, outputAny[0] instanceof URL);
          }
        } else {
          console.log(`[DEBUG] - Output value:`, outputAny);
        }
        
        // 重新赋值 outputAny（如果 finalOutput 被更新）
        const outputAnyFinal: any = finalOutput;
        
        // 特殊处理：Seedream 4 返回 { items: [...] } 格式
        if (modelName === 'seedream-4' && outputAnyFinal && typeof outputAnyFinal === 'object' && !Array.isArray(outputAnyFinal)) {
          console.log(`[DEBUG] seedream-4 (non-progress) output structure:`, {
            hasItems: 'items' in outputAnyFinal,
            itemsType: outputAnyFinal.items ? typeof outputAnyFinal.items : 'none',
            itemsIsArray: Array.isArray(outputAnyFinal.items),
            itemsLength: Array.isArray(outputAnyFinal.items) ? outputAnyFinal.items.length : 0,
            allKeys: Object.keys(outputAnyFinal),
          });
          
          if (outputAnyFinal.items) {
            if (Array.isArray(outputAnyFinal.items)) {
              console.log(`[DEBUG] seedream-4 (non-progress) items array length:`, outputAnyFinal.items.length);
              if (outputAnyFinal.items.length > 0) {
                console.log(`[DEBUG] seedream-4 (non-progress) first item:`, outputAnyFinal.items[0], `type:`, typeof outputAnyFinal.items[0]);
              }
              
              // items 可能是字符串数组，也可能是对象数组
              mediaUrls = outputAnyFinal.items.map((item: any, index: number) => {
                if (typeof item === 'string' && item.length > 0) {
                  const isBase64 = item.startsWith('data:');
                  console.log(`[DEBUG] seedream-4 (non-progress) item[${index}] is string (${isBase64 ? 'Base64' : 'URL'})`);
                  return item;
                } else if (item && typeof item === 'object') {
                  console.log(`[DEBUG] seedream-4 (non-progress) item[${index}] is object, keys:`, Object.keys(item));
                  // 可能是 { url: "..." } 或 { image_url: "..." } 格式
                  if (item.url && typeof item.url === 'string') {
                    const isBase64 = item.url.startsWith('data:');
                    console.log(`[DEBUG] seedream-4 (non-progress) item[${index}] has url (${isBase64 ? 'Base64' : 'URL'})`);
                    return item.url;
                  } else if (item.image_url && typeof item.image_url === 'string') {
                    const isBase64 = item.image_url.startsWith('data:');
                    console.log(`[DEBUG] seedream-4 (non-progress) item[${index}] has image_url (${isBase64 ? 'Base64' : 'URL'})`);
                    return item.image_url;
                  } else if (item.image && typeof item.image === 'string') {
                    const isBase64 = item.image.startsWith('data:');
                    console.log(`[DEBUG] seedream-4 (non-progress) item[${index}] has image (${isBase64 ? 'Base64' : 'URL'})`);
                    return item.image;
                  }
                  // 尝试查找任何以 http 开头的字符串属性
                  for (const key in item) {
                    if (typeof item[key] === 'string' && (item[key].startsWith('http://') || item[key].startsWith('https://'))) {
                      console.log(`[DEBUG] seedream-4 (non-progress) item[${index}] found URL in key "${key}"`);
                      return item[key];
                    }
                  }
                  console.warn(`[WARN] seedream-4 (non-progress) item[${index}] could not extract URL from object`);
                }
                return null;
              }).filter((url: string | null): url is string => url !== null && url.length > 0);
              console.log(`[DEBUG] seedream-4 (non-progress) extracted ${mediaUrls.length} URLs from items array`);
            } else {
              console.warn(`[WARN] seedream-4 (non-progress) items is not an array:`, typeof outputAnyFinal.items);
              mediaUrls = [];
            }
          } else {
            // 如果没有 items，尝试其他可能的字段
            console.log(`[DEBUG] seedream-4 (non-progress) no items field, checking other fields...`);
            if (outputAnyFinal.image_urls && Array.isArray(outputAnyFinal.image_urls)) {
              mediaUrls = outputAnyFinal.image_urls.filter((url: any): url is string => typeof url === 'string' && url.length > 0);
              console.log(`[DEBUG] seedream-4 (non-progress) found image_urls:`, mediaUrls.length);
            } else if (outputAnyFinal.mediaUrls && Array.isArray(outputAnyFinal.mediaUrls)) {
              mediaUrls = outputAnyFinal.mediaUrls.filter((url: any): url is string => typeof url === 'string' && url.length > 0);
              console.log(`[DEBUG] seedream-4 (non-progress) found mediaUrls:`, mediaUrls.length);
            } else {
              console.warn(`[WARN] seedream-4 (non-progress) no items, image_urls, or mediaUrls found`);
              mediaUrls = [];
            }
          }
        } else if (modelName === 'nano-banana' && outputAnyFinal) {
          // nano-banana 特殊处理：可能返回字符串 URL 或数组
          if (typeof outputAny === 'string' && outputAny.length > 0) {
            // 单个 URL 字符串
            mediaUrls = [outputAny];
          } else if (Array.isArray(outputAny)) {
            // URL 数组
            mediaUrls = outputAny.filter((url: any): url is string => typeof url === 'string' && url.length > 0);
          } else if (typeof outputAny === 'object' && !Array.isArray(outputAny)) {
            // 可能是对象格式，尝试多种可能的字段
            // 首先检查是否有 url() 方法（Replicate SDK 可能返回的对象）
            // 使用 'in' 操作符检查属性是否存在（即使不可枚举）
            if ('url' in outputAny && typeof (outputAny as any).url === 'function') {
              try {
                console.log(`[DEBUG] Found url() method in nano-banana output (non-progress), calling it...`);
                const url = await (outputAny as any).url();
                console.log(`[DEBUG] url() method returned:`, url, `type:`, typeof url, `is URL instance:`, url instanceof URL);
                
                // 处理 URL 对象或字符串
                let urlString: string | undefined;
                if (url instanceof URL) {
                  urlString = url.href;
                  console.log(`[DEBUG] Extracted href from URL object:`, urlString);
                } else if (typeof url === 'string' && url.length > 0) {
                  urlString = url;
                } else if (Array.isArray(url)) {
                  // url() 可能返回数组
                  const urlStrings = url.map((u: any) => {
                    if (u instanceof URL) return u.href;
                    if (typeof u === 'string') return u;
                    return String(u);
                  }).filter((u: string) => u.length > 0);
                  if (urlStrings.length > 0) {
                    mediaUrls = urlStrings;
                    console.log(`[DEBUG] Extracted ${urlStrings.length} URLs from array`);
                  }
                }
                
                if (urlString && urlString.length > 0) {
                  mediaUrls = [urlString];
                  console.log(`[DEBUG] Successfully extracted URL:`, urlString);
                } else {
                  console.warn(`[WARN] url() method returned but could not extract URL string`);
                }
              } catch (e) {
                console.warn(`[WARN] Failed to call url() method on nano-banana output:`, e);
              }
            }
            
            // 如果还没有找到 URL，尝试其他字段
            if (mediaUrls.length === 0) {
              if (outputAny.url && typeof outputAny.url === 'string') {
                mediaUrls = [outputAny.url];
              } else if (outputAny.image_url) {
                mediaUrls = typeof outputAny.image_url === 'string' ? [outputAny.image_url] : [];
              } else if (outputAny.image) {
                mediaUrls = typeof outputAny.image === 'string' ? [outputAny.image] : [];
              } else if (outputAny.urls && Array.isArray(outputAny.urls)) {
                mediaUrls = outputAny.urls.filter((url: any): url is string => typeof url === 'string' && url.length > 0);
              } else if (outputAny.images && Array.isArray(outputAny.images)) {
                mediaUrls = outputAny.images.filter((url: any): url is string => typeof url === 'string' && url.length > 0);
              } else {
                // 尝试查找所有字符串值（可能是 URL），但排除函数
                const allValues = Object.values(outputAny);
                const urlValues = allValues.filter((v: any) => 
                  typeof v === 'string' && 
                  (v.startsWith('http') || v.startsWith('https'))
                );
                if (urlValues.length > 0) {
                  mediaUrls = urlValues as string[];
                }
              }
            }
          }
        } else {
          // 通用处理
          mediaUrls = Array.isArray(outputAny) 
            ? outputAny.filter((url: any): url is string => typeof url === 'string' && url.length > 0)
            : typeof outputAny === 'string' && outputAny.length > 0 
              ? [outputAny] 
              : [];
        }
        
        // 如果 mediaUrls 为空，尝试最后的兜底逻辑
        if (mediaUrls.length === 0) {
          console.warn(`[WARN] Image model "${modelName}" returned empty mediaUrls, trying fallback extraction...`);
          
          // 最后的兜底：尝试从原始输出中提取任何可能的 URL
          const fallbackUrls: string[] = [];
          
          // 递归查找所有 URL
          const findUrls = (obj: any, depth: number = 0, path: string = ''): void => {
            if (depth > 5) return; // 限制递归深度
            
            if (typeof obj === 'string' && (obj.startsWith('http://') || obj.startsWith('https://'))) {
              fallbackUrls.push(obj);
              console.log(`[DEBUG] Found URL in fallback at path "${path}":`, obj);
            } else if (Array.isArray(obj)) {
              obj.forEach((item: any, index: number) => {
                findUrls(item, depth + 1, `${path}[${index}]`);
              });
            } else if (obj && typeof obj === 'object') {
              Object.entries(obj).forEach(([key, value]: [string, any]) => {
                findUrls(value, depth + 1, path ? `${path}.${key}` : key);
              });
            }
          };
          
          findUrls(finalOutput);
          
          if (fallbackUrls.length > 0) {
            mediaUrls = [...new Set(fallbackUrls)]; // 去重
            console.log(`[DEBUG] Fallback extraction found ${mediaUrls.length} URLs`);
          } else {
            console.warn(`[WARN] Image model "${modelName}" returned empty mediaUrls. Output was:`, outputAny);
            // 检查是否是 Replicate 返回了空结果（可能是被安全策略拦截但没有抛出错误）
            if (outputAny === null || outputAny === undefined || 
                (Array.isArray(outputAny) && outputAny.length === 0) ||
                (typeof outputAny === 'object' && Object.keys(outputAny).length === 0)) {
              console.warn(`[WARN] Replicate returned empty/null output for image model "${modelName}". This might indicate the content was filtered by Replicate's safety checks.`);
            }
          }
        } else {
          console.log(`[DEBUG] Successfully extracted ${mediaUrls.length} media URLs`);
        }
      }

      const result: GenerateResult = {
        mediaUrls,
        metadata: {
          model: modelName, // 使用原始模型名称（如 claude-4.5-sonnet），而不是 replicateModel（内部映射）
          provider: this.provider,
          text,
          usage,
        },
      };

      // 如果是图片模型且启用了进度监控，确保 progress 流被包含
      // （如果之前已经创建了进度流，它会在返回结果中）
      return result;
    } catch (error) {
      // 在错误信息中包含实际使用的模型标识符，以便调试
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // 检查是否是 Replicate 的敏感内容错误
      if (errorMessage.includes('flagged as sensitive') || 
          errorMessage.includes('E005') ||
          errorMessage.includes('sensitive content')) {
        // 保留原始错误信息，但添加说明这是来自 Replicate 平台的安全检查
        throw new Error(`Replicate 生成失败 (${modelName} -> ${replicateModel}): ${errorMessage}. 这是 Replicate 平台的安全检查，不是我们的代码检查。`);
      }
      
      throw new Error(`Replicate 生成失败 (${modelName} -> ${replicateModel}): ${errorMessage}`);
    }
  }
}
