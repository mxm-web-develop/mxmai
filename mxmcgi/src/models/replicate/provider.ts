/**
 * Replicate Provider（迁移版）
 *
 * 从 `src/core/providers/replicate.provider.ts` 迁移到 `src/models/replicate/provider.ts`，
 * 保持原有行为，只调整 import 路径以归档到 models 层。
 */

import Replicate from 'replicate';
import {
  ModelProvider,
  GenerateParams,
  GenerateResult,
  ProviderType,
  StreamChunk,
  StreamStatus,
  ProgressEvent,
  ProgressStatus,
} from '../../core/providers/types';
import { getFirstProviderKey } from '../../core/providers/provider-keys';
import { ModelMapping, getModelName } from '../suport-list';

export class ReplicateProvider implements ModelProvider {
  readonly provider: ProviderType = 'replicate';
  readonly name = 'Replicate';

  private replicate: Replicate | null = null;
  private replicatePromise: Promise<Replicate> | null = null;
  
  // 支持的模型映射（从 suport-list.ts 导入）
  private readonly modelMap: Record<string, ModelMapping> = (() => {
    const supportList = require('../suport-list').default;
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

  constructor(private readonly injectToken?: string) {}

  private async ensureReplicate(): Promise<Replicate> {
    if (this.replicate) return this.replicate;
    if (this.replicatePromise) return this.replicatePromise;
    this.replicatePromise = (async () => {
      const token = this.injectToken ?? (await getFirstProviderKey('replicate')) ?? process.env.REPLICATE_API_TOKEN;
      if (!token) {
        throw new Error('REPLICATE_API_TOKEN / REPLICATE_API_TOKENS 未设置，或在 Admin 中配置 provider=replicate 的 Key');
      }
      this.replicate = new Replicate({ auth: token });
      return this.replicate;
    })();
    return this.replicatePromise;
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
    const progressStream = (async function* (self: ReplicateProvider): AsyncIterable<ProgressEvent> {
      // 创建预测（带重试机制处理 429 错误）
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
          const errorStatus = createError?.response?.status || createError?.status;
          if (errorStatus === 429) {
            let retryAfter: string | number = '3';
            const headers = createError?.response?.headers;
            if (headers) {
              if (headers instanceof Map) {
                retryAfter = headers.get('retry-after') || headers.get('ratelimit-reset') || '3';
              } else if (typeof headers === 'object') {
                retryAfter = headers['retry-after'] || headers['ratelimit-reset'] || '3';
              }
            }
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
              console.error(`[ERROR] Failed to create prediction after ${maxRetries} retries due to rate limiting`);
              yield {
                status: 'failed' as ProgressStatus,
                error: `速率限制：请求被限制，请稍后重试或增加账户余额`,
              };
              throw createError;
            }
          } else {
            throw createError;
          }
        }
      }
      
      yield {
        status: 'starting',
        progress: 10,
      };

      while (true) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const updated = await replicateAny.predictions.get(prediction.id);
        
        const status = updated.status as ProgressStatus;
        const output = updated.output;
        const error = updated.error;
        
        if (process.env.DEBUG_REPLICATE || status === 'succeeded') {
          console.log(`[DEBUG] Progress stream: status=${status}, output type=${typeof output}, output=`, output);
        }
        
        let logs: string[] = [];
        if (updated.logs) {
          if (Array.isArray(updated.logs)) {
            logs = (updated.logs as any[]).filter((log: any): log is string => typeof log === 'string');
          } else if (typeof updated.logs === 'string') {
            logs = [updated.logs];
          }
        }

        let progress: number | undefined;
        if (status === 'starting') {
          progress = 10;
        } else if (status === 'processing') {
          progress = 50;
        } else if (status === 'succeeded') {
          progress = 100;
          finalOutput = output;
          predictionResolved = true;
          
          if (output === null || output === undefined || 
              (Array.isArray(output) && output.length === 0) ||
              (typeof output === 'object' && Object.keys(output).length === 0 && !Array.isArray(output))) {
            console.warn(`[WARN] Prediction succeeded but output is empty. This might indicate content was filtered by Replicate's safety checks.`);
          }
        } else if (status === 'failed' || status === 'canceled') {
          progress = 0;
          predictionResolved = true;
          
          if (error) {
            console.error(`[ERROR] Prediction ${status}:`, error);
          }
        }

        const event: ProgressEvent = {
          status,
          progress,
          logs: logs.length > 0 ? logs : undefined,
          output: output || undefined,
          error: error || undefined,
        };

        yield event;

        if (status === 'succeeded' || status === 'failed' || status === 'canceled') {
          break;
        }
      }
    })(this);

    const outputPromise = (async () => {
      let waitForPredictionId = 0;
      while (!predictionId && waitForPredictionId < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitForPredictionId++;
      }
      
      if (!predictionId) {
        console.warn(`[WARN] outputPromise: predictionId not set after ${waitForPredictionId * 100}ms, using run() as fallback`);
        try {
          const runResult: any = await this.replicate!.run(replicateModel, { input });
          if (Array.isArray(runResult) && runResult.length > 0) {
            const firstItem = runResult[0];
            if (firstItem && typeof firstItem === 'object' && 
                'locked' in firstItem && 'state' in firstItem && 
                (firstItem as any).constructor?.name === 'ReadableStream') {
              console.log(`[DEBUG] run() returned ReadableStream array, waiting for stream to complete...`);
              const replicateAnyLocal = this.replicate as any;
              try {
                const prediction = await replicateAnyLocal.predictions.create({
                  version: replicateModel,
                  input,
                });
                const newPredictionId = prediction.id;
                console.log(`[DEBUG] Created new prediction ${newPredictionId} for fallback`);
                let attempts = 0;
                const maxAttempts = 300;
                while (attempts < maxAttempts) {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  const updatedPrediction = await replicateAnyLocal.predictions.get(newPredictionId);
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
              }
            }
          }
          
          if (runResult && typeof runResult === 'object' && !Array.isArray(runResult)) {
            console.log(`[DEBUG] run() result keys:`, Object.keys(runResult));
            if ('url' in runResult && typeof runResult.url === 'function') {
              console.log(`[DEBUG] run() result has url() method, calling it...`);
              try {
                const url = await runResult.url();
                console.log(`[DEBUG] url() returned:`, url, `type:`, typeof url);
                if (url instanceof URL) {
                  return url.href;
                } else if (typeof url === 'string') {
                  return url;
                } else {
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
      if (predictionId) {
        let maxAttempts = 3000;
        let attempts = 0;
        while (attempts < maxAttempts) {
          if (finalOutput !== null) {
            console.log(`[DEBUG] outputPromise: finalOutput set during polling`);
            return finalOutput;
          }
          const prediction = await replicateAny.predictions.get(predictionId);
          const status = prediction.status;
          if (status === 'succeeded') {
            const output = prediction.output;
            const error = prediction.error;
            console.log(`[DEBUG] outputPromise: prediction succeeded, output type:`, typeof output);
            console.log(`[DEBUG] outputPromise: output value:`, output);
            console.log(`[DEBUG] outputPromise: output is array:`, Array.isArray(output));
            if (output && typeof output === 'object' && !Array.isArray(output)) {
              console.log(`[DEBUG] outputPromise: output keys:`, Object.keys(output));
            }
            if (error) {
              console.warn(`[WARN] outputPromise: prediction succeeded but has error field:`, error);
            }
            if (!output || (typeof output === 'object' && Object.keys(output).length === 0 && !Array.isArray(output))) {
              console.warn(`[WARN] outputPromise: output is empty, continuing to wait...`);
              await new Promise(resolve => setTimeout(resolve, 1000));
              attempts++;
              continue;
            }
            if (Array.isArray(output) && output.length === 0) {
              console.warn(`[WARN] outputPromise: prediction succeeded but output is empty array. Error field:`, error);
              if (error) {
                throw new Error(`Prediction succeeded but returned empty output: ${error}`);
              }
            }
            return output;
          } else if (status === 'failed' || status === 'canceled') {
            throw new Error(`Prediction ${status}: ${prediction.error || 'Unknown error'}`);
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;
        }
        throw new Error('Prediction timeout: exceeded maximum wait time');
      }

      return await this.replicate!.run(replicateModel, { input });
    })();

    return { progressStream, outputPromise };
  }

  /**
   * 从 Replicate 的事件流创建文本流（带状态和收集）
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
        if (event && typeof event === 'object') {
          if (event.event === 'output') {
            if (!hasStarted) {
              status = 'streaming';
              hasStarted = true;
            }
            const data = event.data;
            let chunks: string[] = [];
            if (typeof data === 'string') {
              chunks = [data];
            } else if (Array.isArray(data)) {
              chunks = data
                .filter(item => typeof item === 'string')
                .map(item => item as string);
            } else if (data !== null && data !== undefined) {
              chunks = [String(data)];
            }
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
            status = 'completed';
            yield {
              chunk: '',
              status,
              collection: enableCollection ? collection : '',
            };
            break;
          } else if (event.event === 'error') {
            status = 'error';
            throw new Error(`Replicate stream error: ${event.data || 'Unknown error'}`);
          } else if (event.event === 'start') {
            status = 'streaming';
            hasStarted = true;
          }
        } else if (typeof event === 'string') {
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

      if (status === 'streaming') {
        status = 'completed';
        yield {
          chunk: '',
          status,
          collection: enableCollection ? collection : '',
        };
      }
    } catch (error) {
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
   */
  private async *createStreamFromOutput(output: any, enableCollection: boolean = true): AsyncIterable<StreamChunk> {
    let status: StreamStatus = 'streaming';
    let collection = '';

    if (Array.isArray(output)) {
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
      if (enableCollection) {
        collection = output;
      }
      yield {
        chunk: output,
        status,
        collection: enableCollection ? collection : '',
      };
    } else {
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
    await this.ensureReplicate();

    const replicateModel = this.getModelName(modelName);
    const outputFormat = params.outputFormat || 'json';
    
    if (process.env.DEBUG_REPLICATE) {
      console.log(`[DEBUG] Model mapping: ${modelName} -> ${replicateModel}`);
    }
    
    const isNanoBananaStyle = modelName === 'nano-banana' || modelName === 'nano-banana-pro';
    const isImageModel = isNanoBananaStyle ||
                        modelName === 'ideogram-v2a' || 
                        modelName === 'recraft-crisp-upscale' || 
                        modelName === 'flux-fast' ||
                        modelName === 'seedream-4';
    
    try {
      const input: Record<string, any> = {
        prompt: params.prompt,
      };

      if (params.negativePrompt) {
        input.negative_prompt = params.negativePrompt;
      }

      if (params.parameters) {
        Object.assign(input, params.parameters);
      }

      if (isNanoBananaStyle && input.image_size) {
        delete input.image_size;
        console.warn('⚠️  Replicate 的 nano-banana-pro 不支持 image_size 参数，已移除');
      }

      if (isNanoBananaStyle && input.image_urls) {
        input.image_input = input.image_urls;
        delete input.image_urls;
        console.log(`[ReplicateProvider] nano-banana 将 image_urls 转换为 image_input:`, {
          count: Array.isArray(input.image_input) ? input.image_input.length : 0,
          preview: Array.isArray(input.image_input) ? input.image_input.slice(0, 2) : []
        });
      }
      
      if (isNanoBananaStyle && input.image_base64s) {
        input.image_input = input.image_base64s;
        delete input.image_base64s;
        console.log(`[ReplicateProvider] nano-banana 将 image_base64s 转换为 image_input:`, {
          count: Array.isArray(input.image_input) ? input.image_input.length : 0,
          preview: Array.isArray(input.image_input) ? (input.image_input[0]?.startsWith('data:') ? 'Base64数据' : 'URL') : []
        });
      }
      
      if (isNanoBananaStyle && input.image && !input.image_input) {
        input.image_input = [input.image];
        delete input.image;
        console.log(`[ReplicateProvider] nano-banana 系列将 image 转换为 image_input:`, {
          count: 1,
          preview: Array.isArray(input.image_input) ? (input.image_input[0]?.startsWith('data:') ? 'Base64数据' : 'URL') : []
        });
      }

      if (modelName === 'recraft-crisp-upscale' && input.input_image && !input.prompt) {
        // OK
      }

      if (modelName === 'gemini-2.5-flash' && input.system_prompt) {
        input.system_instruction = input.system_prompt;
        delete input.system_prompt;
      }
      
      if (modelName === 'gemini-2.5-flash' && input.max_tokens) {
        input.max_output_tokens = input.max_tokens;
        delete input.max_tokens;
      }

      if (isNanoBananaStyle) {
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

      let output: any;
      const enableCollection = params.enableCollection !== false;
      
      if (outputFormat === 'stream') {
        try {
          const replicateAny = this.replicate as any;
          if (typeof replicateAny.stream === 'function') {
            const stream = replicateAny.stream(replicateModel, { input });
            const streamWithStatus = this.createTextStreamFromReplicateStream(stream, enableCollection);
            const streamString = this.createStringStreamFromChunkStream(streamWithStatus);
            return {
              mediaUrls: [],
              metadata: {
                model: modelName,
                provider: this.provider,
                outputFormat: 'stream',
                enableCollection,
              },
              stream: streamWithStatus,
              streamString,
            };
          } else {
            const result = await this.replicate!.run(replicateModel, { input });
            const streamWithStatus = this.createStreamFromOutput(result, enableCollection);
            const streamString = this.createStringStreamFromChunkStream(streamWithStatus);
            return {
              mediaUrls: [],
              metadata: {
                model: modelName,
                provider: this.provider,
                outputFormat: 'stream',
                enableCollection,
              },
              stream: streamWithStatus,
              streamString,
            };
          }
        } catch (streamError) {
          console.warn('⚠️  Replicate stream() 失败，使用 run() 模拟流式输出:', streamError);
          const result = await this.replicate!.run(replicateModel, { input });
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
            streamString,
          };
        }
      } else {
        if (isImageModel && params.enableProgress !== false) {
          const { progressStream, outputPromise } = this.createProgressStreamWithOutput(replicateModel, input);
          output = await Promise.race([
            outputPromise,
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Output promise timeout after 10 minutes')), 600000)
            )
          ]).catch(async (error) => {
            console.warn(`[WARN] outputPromise failed or timeout:`, error);
            console.warn(`[WARN] Trying run() as final fallback...`);
            try {
              if (isNanoBananaStyle) {
                console.log(`[ReplicateProvider] nano-banana 使用 run() fallback，参数:`, {
                  prompt: input.prompt?.substring(0, 100),
                  image_input: input.image_input ? (Array.isArray(input.image_input) ? `数组(${input.image_input.length}项)` : typeof input.image_input) : 'undefined',
                  image_input_preview: input.image_input && Array.isArray(input.image_input) ? input.image_input.slice(0, 2) : [],
                  allKeys: Object.keys(input)
                });
              }
              const runResult: any = await this.replicate!.run(replicateModel, { input });
              if (runResult && typeof runResult[Symbol.asyncIterator] === 'function') {
                console.log(`[DEBUG] run() returned async iterator, iterating...`);
                const results: any[] = [];
                for await (const item of runResult) {
                  results.push(item);
                }
                console.log(`[DEBUG] Iterated ${results.length} items from async iterator`);
                return results.length > 0 ? results : runResult;
              }
              if (runResult && typeof runResult === 'object' && !Array.isArray(runResult)) {
                console.log(`[DEBUG] run() result keys:`, Object.keys(runResult));
                if ('url' in runResult && typeof runResult.url === 'function') {
                  console.log(`[DEBUG] run() result has url() method, calling it...`);
                  try {
                    const url = await runResult.url();
                    console.log(`[DEBUG] url() returned:`, url, `type:`, typeof url, `is URL instance:`, url instanceof URL);
                    if (url instanceof URL) {
                      return url.href;
                    } else if (typeof url === 'string') {
                      return url;
                    } else {
                      return String(url);
                    }
                  } catch (e) {
                    console.warn(`[WARN] Failed to call url() method:`, e);
                  }
                }
              }
              return runResult;
            } catch (runError) {
              console.error(`[ERROR] run() fallback also failed:`, runError);
              let errorMessage = runError instanceof Error ? runError.message : String(runError);
              if (errorMessage.includes('E9243') || errorMessage.includes('Director: unexpected error')) {
                const imageInputInfo = input.image_input 
                  ? (Array.isArray(input.image_input) 
                      ? `提供了 ${input.image_input.length} 张参考图片` 
                      : '提供了参考图片')
                  : '未提供参考图片';
                errorMessage = `Replicate 服务端错误 (E9243): 可能是参考图片 URL 无法访问、图片格式不支持，或 Replicate 服务暂时不可用。${imageInputInfo}。请检查图片 URL 是否可公开访问，或稍后重试。`;
              }
              throw new Error(`Replicate 生成失败 (${modelName} -> ${replicateModel}): ${errorMessage}`);
            }
          });
          
          const outputAny: any = output;
          console.log(`[DEBUG] Model: ${modelName}, Output type:`, typeof outputAny);
          console.log(`[DEBUG] Is array:`, Array.isArray(outputAny));
          if (outputAny && typeof outputAny === 'object' && !Array.isArray(outputAny)) {
            console.log(`[DEBUG] Object keys:`, Object.keys(outputAny));
            try {
              const outputStr = JSON.stringify(outputAny, null, 2);
              console.log(`[DEBUG] Output type: object, length: ${outputStr.length} chars`);
            } catch {
              console.log(`[DEBUG] Output type: object, length: ${String(outputAny).length} chars`);
            }
          } else if (Array.isArray(outputAny)) {
            console.log(`[DEBUG] Array length:`, outputAny.length);
            if (outputAny.length > 0) {
              console.log(`[DEBUG] First element:`, outputAny[0], `type:`, typeof outputAny[0]);
            }
          } else {
            console.log(`[DEBUG] Output value:`, outputAny);
          }
          
          let mediaUrls: string[] = [];
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
                mediaUrls = outputAny.items.map((item: any, index: number) => {
                  if (typeof item === 'string' && item.length > 0) {
                    const isBase64 = item.startsWith('data:');
                    console.log(`[DEBUG] seedream-4 item[${index}] is string (${isBase64 ? 'Base64' : 'URL'})`);
                    return item;
                  } else if (item && typeof item === 'object') {
                    console.log(`[DEBUG] seedream-4 item[${index}] is object, keys:`, Object.keys(item));
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
          } else if (isNanoBananaStyle && outputAny) {
            if (typeof outputAny === 'string' && outputAny.length > 0) {
              mediaUrls = [outputAny];
            } else if (outputAny instanceof URL) {
              mediaUrls = [outputAny.href];
              console.log(`[DEBUG] Extracted URL from URL object:`, outputAny.href);
            } else if (Array.isArray(outputAny)) {
              mediaUrls = outputAny.map((url: any) => {
                if (url instanceof URL) return url.href;
                if (typeof url === 'string') return url;
                return String(url);
              }).filter((url: string) => url.length > 0);
            } else if (typeof outputAny === 'object' && !Array.isArray(outputAny)) {
              if ('url' in outputAny && typeof (outputAny as any).url === 'function') {
                try {
                  console.log(`[DEBUG] Calling url() method on nano-banana output...`);
                  const url = await (outputAny as any).url();
                  console.log(`[DEBUG] url() returned:`, url, `type:`, typeof url, `is URL instance:`, url instanceof URL);
                  let urlString: string | undefined;
                  if (url instanceof URL) {
                    urlString = url.href;
                    console.log(`[DEBUG] Extracted href from URL object:`, urlString);
                  } else if (typeof url === 'string' && url.length > 0) {
                    urlString = url;
                  } else if (Array.isArray(url)) {
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
          
          return {
            mediaUrls,
            metadata: {
              model: modelName,
              provider: this.provider,
              outputFormat: 'json',
            },
            progress: progressStream,
          };
        } else {
          output = await this.replicate!.run(replicateModel, { input });
        }
      }
      
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
          console.log(`[DEBUG] Output length: ${outputStr.length} chars, type: ${typeof output}`);
        } catch (e) {
          console.log(`[DEBUG] Output type: ${typeof output}, length: ${String(output).length} chars`);
        }
      }

      let finalOutput: any = output;
      if (output && typeof output[Symbol.asyncIterator] === 'function') {
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
              const chunkText = (chunk as any).text || (chunk as any).content || (chunk as any).delta || String(chunk);
              if (typeof chunkText === 'string') {
                chunks.push(chunkText);
              } else if (Array.isArray(chunkText)) {
                chunks.push(...chunkText.filter((item): item is string => typeof item === 'string'));
              }
            }
          }
          finalOutput = chunks.join('');
          if (shouldDebug) {
            console.log(`[DEBUG] 流式输出处理完成，共 ${chunks.length} 个片段，总长度: ${finalOutput.length}`);
          }
        } catch (streamError) {
          console.warn(`⚠️  流式输出处理失败，尝试直接使用输出:`, streamError);
          finalOutput = output;
        }
      } else if (shouldDebug) {
        console.log(`[DEBUG] 非流式输出，直接使用`);
      }

      const isTextModel = modelName.startsWith('deepseek') || 
                         modelName.startsWith('gemini') || 
                         modelName.startsWith('claude') || 
                         modelName.startsWith('gpt') ||
                         modelName.includes('gemini-3-pro');

      let mediaUrls: string[] = [];
      let text: string | undefined;
      let usage: any;

      if (isTextModel) {
        if (typeof finalOutput === 'string') {
          const outputStr: string = finalOutput;
          let processedText: string = outputStr.trim();
          if (processedText.startsWith('{') || processedText.startsWith('[')) {
            try {
              const parsed = JSON.parse(processedText);
              if (typeof parsed === 'object' && parsed !== null) {
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
              }
            } catch {
              processedText = outputStr;
            }
          }
          text = processedText;
          mediaUrls = [processedText];
        } else if (Array.isArray(finalOutput)) {
          const textArray = finalOutput.filter((item): item is string => typeof item === 'string');
          text = textArray.join('');
          mediaUrls = textArray;
        } else if (finalOutput && typeof finalOutput === 'object') {
          const outputObj = finalOutput as any;
          if (outputObj.text) {
            text = outputObj.text;
          } else if (outputObj.content) {
            text = outputObj.content;
          } else if (outputObj.message) {
            text = typeof outputObj.message === 'string' 
              ? outputObj.message 
              : outputObj.message.content || outputObj.message.text;
          } else if (outputObj.choices && Array.isArray(outputObj.choices) && outputObj.choices.length > 0) {
            const firstChoice = outputObj.choices[0];
            if (firstChoice.message) {
              text = firstChoice.message.content || firstChoice.message.text;
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
            text = typeof outputObj.output === 'string' ? outputObj.output : outputObj.output.text || outputObj.output.content;
          } else {
            text = String(finalOutput);
          }
          
          if (outputObj.usage) {
            usage = outputObj.usage;
          } else if (typeof outputObj.input_tokens === 'number' || typeof outputObj.output_tokens === 'number') {
            usage = {
              prompt_tokens: outputObj.input_tokens as number | undefined,
              completion_tokens: outputObj.output_tokens as number | undefined,
              total_tokens: ((outputObj.input_tokens as number) || 0) + ((outputObj.output_tokens as number) || 0),
            };
          }
          
          if (!text || text.trim().length === 0) {
            console.warn(`⚠️  文本模型 "${modelName}" 返回空内容`);
            console.warn(`原始输出类型:`, typeof finalOutput);
            console.warn(`是否为数组:`, Array.isArray(finalOutput));
            if (Array.isArray(finalOutput) && finalOutput.length > 0) {
              console.warn(`数组长度:`, finalOutput.length);
              console.warn(`第一个元素:`, finalOutput[0], `类型:`, typeof finalOutput[0]);
            }
            try {
              const outputStr = JSON.stringify(finalOutput, null, 2);
              console.warn(`原始输出长度: ${outputStr.length} 字符, 类型: ${typeof finalOutput}`);
            } catch (e) {
              console.warn(`原始输出类型: ${typeof finalOutput}, 长度: ${String(finalOutput).length} 字符`);
            }
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
        let outputAny: any = finalOutput;
        console.log(`[DEBUG] Processing output for image model "${modelName}" (non-progress mode):`);
        console.log(`[DEBUG] - Output type:`, typeof outputAny);
        console.log(`[DEBUG] - Is array:`, Array.isArray(outputAny));
        console.log(`[DEBUG] - Is URL instance:`, outputAny instanceof URL);
        if (outputAny instanceof URL) {
          console.log(`[DEBUG] Output is URL object, extracting href:`, outputAny.href);
          finalOutput = outputAny.href;
          outputAny = finalOutput;
        }
        if (outputAny && typeof outputAny === 'object' && !Array.isArray(outputAny) && !(outputAny instanceof URL)) {
          console.log(`[DEBUG] - Object keys:`, Object.keys(outputAny));
          try {
            const outputStr = JSON.stringify(outputAny, null, 2);
            console.log(`[DEBUG] - Full output length: ${outputStr.length} chars, type: ${typeof outputAny}`);
          } catch (e) {
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
        const outputAnyFinal: any = finalOutput;
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
              mediaUrls = outputAnyFinal.items.map((item: any, index: number) => {
                if (typeof item === 'string' && item.length > 0) {
                  const isBase64 = item.startsWith('data:');
                  console.log(`[DEBUG] seedream-4 (non-progress) item[${index}] is string (${isBase64 ? 'Base64' : 'URL'})`);
                  return item;
                } else if (item && typeof item === 'object') {
                  console.log(`[DEBUG] seedream-4 (non-progress) item[${index}] is object, keys:`, Object.keys(item));
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
        } else if (isNanoBananaStyle && outputAnyFinal) {
          if (typeof outputAny === 'string' && outputAny.length > 0) {
            mediaUrls = [outputAny];
          } else if (Array.isArray(outputAny)) {
            mediaUrls = outputAny.filter((url: any): url is string => typeof url === 'string' && url.length > 0);
          } else if (typeof outputAny === 'object' && !Array.isArray(outputAny)) {
            if ('url' in outputAny && typeof (outputAny as any).url === 'function') {
              try {
                console.log(`[DEBUG] Found url() method in nano-banana output (non-progress), calling it...`);
                const url = await (outputAny as any).url();
                console.log(`[DEBUG] url() method returned:`, url, `type:`, typeof url, `is URL instance:`, url instanceof URL);
                let urlString: string | undefined;
                if (url instanceof URL) {
                  urlString = url.href;
                  console.log(`[DEBUG] Extracted href from URL object:`, urlString);
                } else if (typeof url === 'string' && url.length > 0) {
                  urlString = url;
                } else if (Array.isArray(url)) {
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
          mediaUrls = Array.isArray(outputAny) 
            ? outputAny.filter((url: any): url is string => typeof url === 'string' && url.length > 0)
            : typeof outputAny === 'string' && outputAny.length > 0 
              ? [outputAny] 
              : [];
        }
        
        if (mediaUrls.length === 0) {
          console.warn(`[WARN] Image model "${modelName}" returned empty mediaUrls, trying fallback extraction...`);
          const fallbackUrls: string[] = [];
          const findUrls = (obj: any, depth: number = 0, path: string = ''): void => {
            if (depth > 5) return;
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
            mediaUrls = [...new Set(fallbackUrls)];
            console.log(`[DEBUG] Fallback extraction found ${mediaUrls.length} URLs`);
          } else {
            console.warn(`[WARN] Image model "${modelName}" returned empty mediaUrls. Output was:`, outputAny);
            if (outputAny === null || outputAny === undefined || 
                (Array.isArray(outputAny) && outputAny.length === 0) ||
                (typeof outputAny === 'object' && Object.keys(outputAny).length === 0)) {
              console.warn(`[WARN] Replicate returned empty/null output for image model "${modelName}". This might indicate the content was filtered by Replicate's safety checks.`);
            }
          }
        } else {
          console.log(`[DEBUG] Successfully extracted ${mediaUrls.length} media URLs`);
        }

        const result: GenerateResult = {
          mediaUrls,
          metadata: {
            model: modelName,
            provider: this.provider,
            text,
            usage,
          },
        };
        return result;
      }

      const result: GenerateResult = {
        mediaUrls,
        metadata: {
          model: modelName,
          provider: this.provider,
          text,
          usage,
        },
      };
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('flagged as sensitive') || 
          errorMessage.includes('E005') ||
          errorMessage.includes('sensitive content')) {
        throw new Error(`Replicate 生成失败 (${modelName} -> ${replicateModel}): ${errorMessage}. 这是 Replicate 平台的安全检查，不是我们的代码检查。`);
      }
      throw new Error(`Replicate 生成失败 (${modelName} -> ${replicateModel}): ${errorMessage}`);
    }
  }
}

