/**
 * PPIO Provider
 * 
 * 支持 PPIO 平台上的模型（目前主要支持 Gemini 相关模型）
 */

import { ModelProvider, GenerateParams, GenerateResult, ProviderType } from './types';
import { PPIOClient } from '../utils/ppio-client';
import { ModelMapping, getModelName } from '../utils/suport-list';

export class PPIOProvider implements ModelProvider {
  readonly provider: ProviderType = 'ppio';
  readonly name = 'PPIO';
  
  private client: PPIOClient;
  
  // PPIO 支持的模型映射（从 suport-list.ts 导入）
  private readonly modelMap: Record<string, ModelMapping> = (() => {
    const supportList = require('../utils/suport-list').default;
    return {
      ...(supportList.ppio?.graph || {}),
      ...(supportList.ppio?.text || {}),
      ...(supportList.ppio?.audio || {}),
    };
  })();
  
  /**
   * 获取模型的实际名称（从 ModelMapping 中提取）
   */
  private getModelName(modelName: string): string {
    const mapping = this.modelMap[modelName];
    if (!mapping) {
      return modelName; // 如果找不到映射，返回原名称
    }
    return getModelName(mapping);
  }
  
  // PPIO 支持的模型列表（从 modelMap 的键中提取）
  private readonly supportedModels: string[] = (() => {
    const supportList = require('../utils/suport-list').default;
    const modelMap = {
      ...(supportList.ppio?.graph || {}),
      ...(supportList.ppio?.text || {}),
      ...(supportList.ppio?.audio || {}),
    };
    return Object.keys(modelMap);
  })();

  constructor(apiKey?: string, baseUrl?: string) {
    const key = apiKey || process.env.PPIO_API_KEY;
    
    if (!key) {
      throw new Error('PPIO_API_KEY 环境变量必须设置，或通过 apiKey 参数提供');
    }

    const finalBaseUrl = baseUrl || process.env.PPIO_BASE_URL;
    
    // 调试日志
    if (process.env.DEBUG_PPIO) {
      console.log(`[PPIO Provider] 初始化:`, {
        hasApiKey: !!key,
        apiKeyLength: key?.length || 0,
        baseUrl: finalBaseUrl || 'https://api.ppinfra.com (默认)',
      });
    }

    // 直接使用传入的 key，而不是再次调用 fromEnv()
    this.client = new PPIOClient({ 
      apiKey: key,
      baseUrl: finalBaseUrl,
    });
  }

  supportsModel(modelName: string): boolean {
    return this.supportedModels.includes(modelName);
  }

  async generate(modelName: string, params: GenerateParams): Promise<GenerateResult> {
    if (!this.supportsModel(modelName)) {
      throw new Error(`PPIO provider 不支持模型: ${modelName}`);
    }

    try {
      // 根据模型类型调用不同的方法
      if (modelName === 'nano-banana') {
        // 检查是否有图片输入（图生图/编辑模式）
        const hasImageInput = 
          params.parameters?.image ||
          (params.parameters?.image_urls && params.parameters.image_urls.length > 0) ||
          (params.parameters?.image_base64s && params.parameters.image_base64s.length > 0);

        if (hasImageInput) {
          // 图片编辑模式
          const imageUrls = params.parameters?.image_urls;
          const imageBase64s = params.parameters?.image_base64s;
          
          // 如果提供了单张图片（image），转换为数组
          let finalImageUrls: string[] | undefined;
          let finalImageBase64s: string[] | undefined;
          
          if (params.parameters?.image) {
            // 判断是 URL 还是 Base64
            const imageValue = params.parameters.image;
            if (imageValue.startsWith('http://') || imageValue.startsWith('https://') || imageValue.startsWith('data:')) {
              // URL 或 data URI
              if (imageValue.startsWith('data:')) {
                // data URI，提取 base64 部分
                const base64Part = imageValue.includes(',') ? imageValue.split(',')[1] : imageValue;
                finalImageBase64s = [base64Part];
              } else {
                finalImageUrls = [imageValue];
              }
            } else {
              // 假设是 base64
              finalImageBase64s = [imageValue];
            }
          } else {
            finalImageUrls = imageUrls;
            finalImageBase64s = imageBase64s;
          }

          const response = await this.client.editImage({
            prompt: params.prompt,
            image_urls: finalImageUrls,
            image_base64s: finalImageBase64s,
            aspect_ratio: params.parameters?.aspect_ratio || params.parameters?.aspectratio,
            size: params.parameters?.size || '1K',
          });

          return {
            mediaUrls: response.image_urls,
            metadata: {
              model: modelName,
              provider: this.provider,
            },
          };
        } else {
          // 文生图模式
        const response = await this.client.textToImage({
          prompt: params.prompt,
          aspectratio: params.parameters?.aspectratio || params.parameters?.aspect_ratio,
          size: params.parameters?.size || '1K',
        });

        return {
          mediaUrls: response.image_urls,
          metadata: {
            model: modelName,
            provider: this.provider,
          },
        };
        }
      }

      // 音频模型处理
      if (modelName === 'minimax-speech-02-turbo') {
        // 同步语音合成，直接返回音频 URL
        // text 可能从 prompt 或原始 text 字段传入（Gateway 通过 body.text 传）
        const text = params.prompt || (params as any).text;
        if (!text) {
          throw new Error('text 参数是必需的（minimax-speech-02-turbo）');
        }

        // 确保 voice_setting 中有 voice_id 或 timbre_weights（PPIO API 要求）
        const voiceSetting = params.parameters?.voice_setting || {};
        const timbreWeights = params.parameters?.timbre_weights;
        
        if (!voiceSetting.voice_id && !timbreWeights) {
          voiceSetting.voice_id = 'female-shaonv'; // 默认使用少女音色
          console.log(
            `[PPIO Provider] 未提供 voice_id 或 timbre_weights，使用默认音色: female-shaonv`,
          );
        }

        if (process.env.DEBUG_PPIO) {
          console.log('[PPIO Provider] 调用 speech02Turbo:', {
            textLength: text.length,
            hasVoiceSetting: !!voiceSetting,
            hasAudioSetting: !!params.parameters?.audio_setting,
          });
        }

        const response = await this.client.speech02Turbo({
          text,
          voice_setting: voiceSetting,
          audio_setting: params.parameters?.audio_setting,
          pronunciation_dict: params.parameters?.pronunciation_dict,
          timbre_weights: timbreWeights,
          stream: params.parameters?.stream,
          stream_options: params.parameters?.stream_options,
          language_boost: params.parameters?.language_boost,
          output_format: params.parameters?.output_format || 'url', // 默认返回 URL 格式
          voice_modify: params.parameters?.voice_modify,
        });

        // 同步返回，直接提取音频 URL
        const mediaUrls: string[] = [];
        if (response.audio) {
          // 如果是 URL 格式，直接使用；如果是 hex 格式，需要特殊处理（这里先支持 URL）
          if (response.audio.startsWith('http://') || response.audio.startsWith('https://')) {
            mediaUrls.push(response.audio);
          } else {
            // hex 格式，暂时不支持，需要客户端处理
            console.warn(`[PPIO Provider] 收到 hex 格式音频，当前仅支持 URL 格式`);
          }
        }

        return {
          mediaUrls,
          metadata: {
            model: modelName,
            provider: this.provider,
            status: response.status, // 流式输出时的状态
          },
        };
      }

      if (modelName === 'minimax-speech-2.6-hd') {
        // 提取 text 参数（兼容 prompt 和 text）
        const text = params.prompt || (params as any).text;
        if (!text) {
          throw new Error('text 参数是必需的（minimax-speech-2.6-hd）');
        }

        // 确保 voice_setting 中有 voice_id（PPIO API 要求）
        const voiceSetting = params.parameters?.voice_setting || {};
        if (!voiceSetting.voice_id) {
          voiceSetting.voice_id = 'female-shaonv';
        }

        const response = await this.client.speech26Hd({
          text,
          voice_setting: voiceSetting,
          audio_setting: params.parameters?.audio_setting,
          pronunciation_dict: params.parameters?.pronunciation_dict,
          timbre_weights: params.parameters?.timbre_weights,
          stream: params.parameters?.stream,
          stream_options: params.parameters?.stream_options,
          language_boost: params.parameters?.language_boost,
          output_format: params.parameters?.output_format || 'url',
          voice_modify: params.parameters?.voice_modify,
        });

        const mediaUrls: string[] = [];
        if (response.audio) {
          if (response.audio.startsWith('http://') || response.audio.startsWith('https://')) {
            mediaUrls.push(response.audio);
          } else {
            console.warn(`[PPIO Provider] 收到 hex 格式音频，当前仅支持 URL 格式`);
          }
        }

        return {
          mediaUrls,
          metadata: {
            model: modelName,
            provider: this.provider,
            status: response.status,
          },
        };
      }

      if (modelName === 'minimax-speech-2.5-turbo') {
        // 提取 text 参数（兼容 prompt 和 text）
        const text = params.prompt || (params as any).text;
        if (!text) {
          throw new Error('text 参数是必需的（minimax-speech-2.5-turbo）');
        }

        // 确保 voice_setting 中有 voice_id（PPIO API 要求）
        const voiceSetting = params.parameters?.voice_setting || {};
        if (!voiceSetting.voice_id) {
          voiceSetting.voice_id = 'female-shaonv';
        }

        const response = await this.client.speech25Turbo({
          text,
          voice_setting: voiceSetting,
          audio_setting: params.parameters?.audio_setting,
          pronunciation_dict: params.parameters?.pronunciation_dict,
          timbre_weights: params.parameters?.timbre_weights,
          stream: params.parameters?.stream,
          stream_options: params.parameters?.stream_options,
          language_boost: params.parameters?.language_boost,
          output_format: params.parameters?.output_format || 'url',
          voice_modify: params.parameters?.voice_modify,
        });

        const mediaUrls: string[] = [];
        if (response.audio) {
          if (response.audio.startsWith('http://') || response.audio.startsWith('https://')) {
            mediaUrls.push(response.audio);
          } else {
            console.warn(`[PPIO Provider] 收到 hex 格式音频，当前仅支持 URL 格式`);
          }
        }

        return {
          mediaUrls,
          metadata: {
            model: modelName,
            provider: this.provider,
            status: response.status,
          },
        };
      }

      if (modelName === 'minimax-speech-2.5-hd') {
        // 提取 text 参数（兼容 prompt 和 text）
        const text = params.prompt || (params as any).text;
        if (!text) {
          throw new Error('text 参数是必需的（minimax-speech-2.5-hd）');
        }

        // 确保 voice_setting 中有 voice_id（PPIO API 要求）
        const voiceSetting = params.parameters?.voice_setting || {};
        if (!voiceSetting.voice_id) {
          voiceSetting.voice_id = 'female-shaonv';
        }

        const response = await this.client.speech25Hd({
          text,
          voice_setting: voiceSetting,
          audio_setting: params.parameters?.audio_setting,
          pronunciation_dict: params.parameters?.pronunciation_dict,
          timbre_weights: params.parameters?.timbre_weights,
          stream: params.parameters?.stream,
          stream_options: params.parameters?.stream_options,
          language_boost: params.parameters?.language_boost,
          output_format: params.parameters?.output_format || 'url',
          voice_modify: params.parameters?.voice_modify,
        });

        const mediaUrls: string[] = [];
        if (response.audio) {
          if (response.audio.startsWith('http://') || response.audio.startsWith('https://')) {
            mediaUrls.push(response.audio);
          } else {
            console.warn(`[PPIO Provider] 收到 hex 格式音频，当前仅支持 URL 格式`);
          }
        }

        return {
          mediaUrls,
          metadata: {
            model: modelName,
            provider: this.provider,
            status: response.status,
          },
        };
      }

      if (modelName === 'minimax-voice-cloning') {
        const response = await this.client.voiceCloning({
          audio_url: params.parameters?.audio_url || params.parameters?.audioUrl || params.prompt, // 兼容不同参数名
          text: params.parameters?.text,
          model: params.parameters?.model,
          clone_prompt: params.parameters?.clone_prompt,
          accuracy: params.parameters?.accuracy,
          need_noise_reduction: params.parameters?.need_noise_reduction,
          need_volume_normalization: params.parameters?.need_volume_normalization,
        });

        // voice cloning 返回 voice_id 和可选的 demo_audio_url
        const mediaUrls: string[] = [];
        if (response.demo_audio_url) {
          mediaUrls.push(response.demo_audio_url);
        }

        return {
          mediaUrls,
          metadata: {
            model: modelName,
            provider: this.provider,
            voice_id: response.voice_id,
          },
        };
      }

      if (modelName === 'minimax-speech-02-hd-async') {
        // 调试日志
        console.log(`[PPIO Provider] 调用 speech02HdAsync:`, {
          textLength: params.prompt?.length || 0,
          hasVoiceSetting: !!params.parameters?.voice_setting,
          hasAudioSetting: !!params.parameters?.audio_setting,
        });

        // 确保 voice_setting 中有 voice_id（PPIO API 要求）
        const voiceSetting = params.parameters?.voice_setting || {};
        if (!voiceSetting.voice_id) {
          voiceSetting.voice_id = 'female-shaonv'; // 默认使用少女音色
          console.log(`[PPIO Provider] 未提供 voice_id，使用默认音色: female-shaonv`);
        }

        const response = await this.client.speech02HdAsync({
          text: params.prompt,
          voice_setting: voiceSetting,
          audio_setting: params.parameters?.audio_setting,
          pronunciation_dict: params.parameters?.pronunciation_dict,
          language_boost: params.parameters?.language_boost,
          voice_modify: params.parameters?.voice_modify,
        });

        // 异步任务，返回 task_id，需要通过轮询获取结果
        return {
          mediaUrls: [],
          metadata: {
            model: modelName,
            provider: this.provider,
            task_id: response.task_id,
          },
          // 创建进度流用于轮询任务结果
          progress: this.createTaskProgressStream(response.task_id),
        };
      }

      if (modelName === 'minimax-speech-2.5-hd-async') {
        // 调试日志
        console.log(`[PPIO Provider] 调用 speech25HdAsync:`, {
          textLength: params.prompt?.length || 0,
          hasVoiceSetting: !!params.parameters?.voice_setting,
          hasAudioSetting: !!params.parameters?.audio_setting,
        });

        // 确保 voice_setting 中有 voice_id（PPIO API 要求）
        const voiceSetting = params.parameters?.voice_setting || {};
        if (!voiceSetting.voice_id) {
          voiceSetting.voice_id = 'female-shaonv'; // 默认使用少女音色
          console.log(`[PPIO Provider] 未提供 voice_id，使用默认音色: female-shaonv`);
        }

        const response = await this.client.speech25HdAsync({
          text: params.prompt,
          voice_setting: voiceSetting,
          audio_setting: params.parameters?.audio_setting,
          pronunciation_dict: params.parameters?.pronunciation_dict,
          language_boost: params.parameters?.language_boost,
          voice_modify: params.parameters?.voice_modify,
        });

        // 异步任务，返回 task_id，需要通过轮询获取结果
        // 这里返回一个进度流，用于轮询任务状态
        return {
          mediaUrls: [],
          metadata: {
            model: modelName,
            provider: this.provider,
            task_id: response.task_id,
          },
          // 创建进度流用于轮询任务结果
          progress: this.createTaskProgressStream(response.task_id),
        };
      }

      if (modelName === 'minimax-speech-2.6-hd-async') {
        // 调试日志
        console.log(`[PPIO Provider] 调用 speech26HdAsync:`, {
          textLength: params.prompt?.length || 0,
          hasVoiceSetting: !!params.parameters?.voice_setting,
          hasAudioSetting: !!params.parameters?.audio_setting,
        });

        // 确保 voice_setting 中有 voice_id（PPIO API 要求）
        const voiceSetting = params.parameters?.voice_setting || {};
        if (!voiceSetting.voice_id) {
          voiceSetting.voice_id = 'female-shaonv'; // 默认使用少女音色
          console.log(`[PPIO Provider] 未提供 voice_id，使用默认音色: female-shaonv`);
        }

        const response = await this.client.speech26HdAsync({
          text: params.prompt,
          voice_setting: voiceSetting,
          audio_setting: params.parameters?.audio_setting,
          pronunciation_dict: params.parameters?.pronunciation_dict,
          language_boost: params.parameters?.language_boost,
          voice_modify: params.parameters?.voice_modify,
        });

        // 异步任务，返回 task_id，需要通过轮询获取结果
        return {
          mediaUrls: [],
          metadata: {
            model: modelName,
            provider: this.provider,
            task_id: response.task_id,
          },
          // 创建进度流用于轮询任务结果
          progress: this.createTaskProgressStream(response.task_id),
        };
      }

      if (modelName === 'minimax-speech-2.5-turbo-async') {
        // 确保 voice_setting 中有 voice_id（PPIO API 要求）
        const voiceSetting = params.parameters?.voice_setting || {};
        if (!voiceSetting.voice_id) {
          voiceSetting.voice_id = 'female-shaonv'; // 默认使用少女音色
          console.log(`[PPIO Provider] 未提供 voice_id，使用默认音色: female-shaonv`);
        }

        const response = await this.client.speech25TurboAsync({
          text: params.prompt,
          voice_setting: voiceSetting,
          audio_setting: params.parameters?.audio_setting,
          pronunciation_dict: params.parameters?.pronunciation_dict,
          language_boost: params.parameters?.language_boost,
          voice_modify: params.parameters?.voice_modify,
        });

        // 异步任务，返回 task_id，需要通过轮询获取结果
        return {
          mediaUrls: [],
          metadata: {
            model: modelName,
            provider: this.provider,
            task_id: response.task_id,
          },
          // 创建进度流用于轮询任务结果
          progress: this.createTaskProgressStream(response.task_id),
        };
      }

      throw new Error(`PPIO provider 未实现模型: ${modelName}`);
    } catch (error) {
      throw new Error(`PPIO 生成失败 (${modelName}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 创建任务进度流（用于轮询异步任务结果）
   * 根据 PPIO 文档：https://ppio.com/docs/models/reference-get-async-task-result
   */
  private async *createTaskProgressStream(taskId: string): AsyncIterable<any> {
    const maxAttempts = 120; // 最多轮询 120 次（4 分钟，因为语音合成可能需要较长时间）
    const pollInterval = 5000; // 每 2 秒轮询一次
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const result = await this.client.getTaskResult(taskId);
        const taskStatus = result.task?.status;
        
        // 根据 PPIO 文档的状态值判断
        if (taskStatus === 'TASK_STATUS_SUCCEED') {
          // 任务成功完成
          const audioUrls: string[] = [];
          
          // 提取音频 URL
          if (result.audios && result.audios.length > 0) {
            for (const audio of result.audios) {
              if (audio.audio_url) {
                audioUrls.push(audio.audio_url);
              }
            }
          }
          
          yield {
            status: 'succeeded' as const,
            progress: 100,
            output: audioUrls, // 直接返回音频 URL 数组（可能为空，但格式正确）
            logs: audioUrls.length > 0 
              ? [`任务已完成，生成 ${audioUrls.length} 个音频文件`]
              : ['任务已完成，但未找到音频文件'],
          };
          return;
        } else if (taskStatus === 'TASK_STATUS_FAILED') {
          // 任务失败
          const errorMessage = result.task?.reason || '任务执行失败';
          yield {
            status: 'failed' as const,
            error: errorMessage,
            logs: [`任务失败: ${errorMessage}`],
          };
          return;
        } else if (taskStatus === 'TASK_STATUS_QUEUED' || taskStatus === 'TASK_STATUS_PROCESSING') {
          // 任务进行中
          // 使用 PPIO 返回的进度百分比，如果没有则使用估算值
          const progressPercent = result.task?.progress_percent;
          const estimatedProgress = progressPercent !== undefined 
            ? progressPercent 
            : Math.min(10 + (attempts * 2), 90); // 10% 到 90% 之间
          
          const statusText = taskStatus === 'TASK_STATUS_QUEUED' ? '排队中' : '处理中';
          const logs: string[] = [`任务${statusText}...`];
          
          if (result.task?.eta) {
            logs.push(`预计完成时间: ${result.task.eta} 秒`);
          }
          
          yield {
            status: 'processing' as const,
            progress: estimatedProgress,
            logs,
          };
        } else {
          // 未知状态，继续等待
          yield {
            status: 'processing' as const,
            progress: Math.min(10 + (attempts * 2), 90),
            logs: [`任务状态: ${taskStatus || 'unknown'}`],
          };
        }
      } catch (error) {
        console.error(`[PPIO Provider] 查询任务结果失败 (taskId: ${taskId}):`, error);
        yield {
          status: 'failed' as const,
          error: error instanceof Error ? error.message : String(error),
        };
        return;
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // 超时
    yield {
      status: 'failed' as const,
      error: '任务轮询超时（超过 4 分钟）',
    };
  }
}
