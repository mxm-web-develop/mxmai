/**
 * PPIO Provider（迁移版）
 *
 * 从 `src/core/providers/ppio.provider.ts` 迁移到 `src/models/ppio/provider.ts`，
 * 保持原有行为，只调整 import 路径以归档到 models 层。
 */

import { ModelProvider, GenerateParams, GenerateResult, ProviderType } from '../providers';
import { PPIOClient } from './client';
import { isModelEnabled } from '../provider-model-catalog';
import { requireUpstreamPhysicalId } from '../physical-model-id';

export class PPIOProvider implements ModelProvider {
  readonly provider: ProviderType = 'ppio';
  readonly name = 'PPIO';
  
  private client: PPIOClient;
  
  private getModelName(modelName: string): string {
    return requireUpstreamPhysicalId('ppio', modelName);
  }

  constructor(apiKey?: string, baseUrl?: string) {
    const key = apiKey || process.env.PPIO_API_KEY;
    
    if (!key) {
      throw new Error('PPIO_API_KEY 环境变量必须设置，或通过 apiKey 参数提供');
    }

    const finalBaseUrl = baseUrl || process.env.PPIO_BASE_URL;
    
    if (process.env.DEBUG_PPIO) {
      console.log(`[PPIO Provider] 初始化:`, {
        hasApiKey: !!key,
        apiKeyLength: key?.length || 0,
        baseUrl: finalBaseUrl || 'https://api.ppinfra.com (默认)',
      });
    }

    this.client = new PPIOClient({ 
      apiKey: key,
      baseUrl: finalBaseUrl,
    });
  }

  supportsModel(modelName: string): boolean {
    return isModelEnabled('ppio', modelName);
  }

  async generate(modelName: string, params: GenerateParams): Promise<GenerateResult> {
    if (!this.supportsModel(modelName)) {
      throw new Error(`PPIO provider 不支持模型: ${modelName}`);
    }

    try {
      if (modelName === 'nano-banana' || modelName === 'nano-banana-pro') {
        const hasImageInput = 
          params.parameters?.image ||
          (params.parameters?.image_urls && params.parameters.image_urls.length > 0) ||
          (params.parameters?.image_base64s && params.parameters.image_base64s.length > 0);

        if (hasImageInput) {
          const imageUrls = params.parameters?.image_urls;
          const imageBase64s = params.parameters?.image_base64s;
          
          let finalImageUrls: string[] | undefined;
          let finalImageBase64s: string[] | undefined;
          
          if (params.parameters?.image) {
            const imageValue = params.parameters.image;
            if (imageValue.startsWith('http://') || imageValue.startsWith('https://') || imageValue.startsWith('data:')) {
              if (imageValue.startsWith('data:')) {
                const base64Part = imageValue.includes(',') ? imageValue.split(',')[1] : imageValue;
                finalImageBase64s = [base64Part];
              } else {
                finalImageUrls = [imageValue];
              }
            } else {
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

      if (modelName === 'minimax-speech-02-turbo') {
        const text = params.prompt || (params as any).text;
        if (!text) {
          throw new Error('text 参数是必需的（minimax-speech-02-turbo）');
        }

        const voiceSetting = params.parameters?.voice_setting || {};
        const timbreWeights = params.parameters?.timbre_weights;
        
        if (!voiceSetting.voice_id && !timbreWeights) {
          voiceSetting.voice_id = 'female-shaonv';
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

      if (modelName === 'minimax-speech-2.6-hd') {
        const text = params.prompt || (params as any).text;
        if (!text) {
          throw new Error('text 参数是必需的（minimax-speech-2.6-hd）');
        }

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
        const text = params.prompt || (params as any).text;
        if (!text) {
          throw new Error('text 参数是必需的（minimax-speech-2.5-turbo）');
        }

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
        const text = params.prompt || (params as any).text;
        if (!text) {
          throw new Error('text 参数是必需的（minimax-speech-2.5-hd）');
        }

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
          audio_url: params.parameters?.audio_url || params.parameters?.audioUrl || params.prompt,
          text: params.parameters?.text,
          model: params.parameters?.model,
          clone_prompt: params.parameters?.clone_prompt,
          accuracy: params.parameters?.accuracy,
          need_noise_reduction: params.parameters?.need_noise_reduction,
          need_volume_normalization: params.parameters?.need_volume_normalization,
        });

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
        console.log(`[PPIO Provider] 调用 speech02HdAsync:`, {
          textLength: params.prompt?.length || 0,
          hasVoiceSetting: !!params.parameters?.voice_setting,
          hasAudioSetting: !!params.parameters?.audio_setting,
        });

        const voiceSetting = params.parameters?.voice_setting || {};
        if (!voiceSetting.voice_id) {
          voiceSetting.voice_id = 'female-shaonv';
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

        return {
          mediaUrls: [],
          metadata: {
            model: modelName,
            provider: this.provider,
            task_id: response.task_id,
          },
          progress: this.createTaskProgressStream(response.task_id),
        };
      }

      if (modelName === 'minimax-speech-2.5-hd-async') {
        console.log(`[PPIO Provider] 调用 speech25HdAsync:`, {
          textLength: params.prompt?.length || 0,
          hasVoiceSetting: !!params.parameters?.voice_setting,
          hasAudioSetting: !!params.parameters?.audio_setting,
        });

        const voiceSetting = params.parameters?.voice_setting || {};
        if (!voiceSetting.voice_id) {
          voiceSetting.voice_id = 'female-shaonv';
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

        return {
          mediaUrls: [],
          metadata: {
            model: modelName,
            provider: this.provider,
            task_id: response.task_id,
          },
          progress: this.createTaskProgressStream(response.task_id),
        };
      }

      if (modelName === 'minimax-speech-2.6-hd-async') {
        console.log(`[PPIO Provider] 调用 speech26HdAsync:`, {
          textLength: params.prompt?.length || 0,
          hasVoiceSetting: !!params.parameters?.voice_setting,
          hasAudioSetting: !!params.parameters?.audio_setting,
        });

        const voiceSetting = params.parameters?.voice_setting || {};
        if (!voiceSetting.voice_id) {
          voiceSetting.voice_id = 'female-shaonv';
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

        return {
          mediaUrls: [],
          metadata: {
            model: modelName,
            provider: this.provider,
            task_id: response.task_id,
          },
          progress: this.createTaskProgressStream(response.task_id),
        };
      }

      if (modelName === 'minimax-speech-2.5-turbo-async') {
        const voiceSetting = params.parameters?.voice_setting || {};
        if (!voiceSetting.voice_id) {
          voiceSetting.voice_id = 'female-shaonv';
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

        return {
          mediaUrls: [],
          metadata: {
            model: modelName,
            provider: this.provider,
            task_id: response.task_id,
          },
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
   */
  private async *createTaskProgressStream(taskId: string): AsyncIterable<any> {
    const maxAttempts = 120;
    const pollInterval = 5000;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const result = await this.client.getTaskResult(taskId);
        const taskStatus = result.task?.status;
        
        if (taskStatus === 'TASK_STATUS_SUCCEED') {
          const audioUrls: string[] = [];
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
            output: audioUrls,
            logs: audioUrls.length > 0 
              ? [`任务已完成，生成 ${audioUrls.length} 个音频文件`]
              : ['任务已完成，但未找到音频文件'],
          };
          return;
        } else if (taskStatus === 'TASK_STATUS_FAILED') {
          const errorMessage = result.task?.reason || '任务执行失败';
          yield {
            status: 'failed' as const,
            error: errorMessage,
            logs: [`任务失败: ${errorMessage}`],
          };
          return;
        } else if (taskStatus === 'TASK_STATUS_QUEUED' || taskStatus === 'TASK_STATUS_PROCESSING') {
          const progressPercent = result.task?.progress_percent;
          const estimatedProgress = progressPercent !== undefined 
            ? progressPercent 
            : Math.min(10 + (attempts * 2), 90);
          
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

    yield {
      status: 'failed' as const,
      error: '任务轮询超时（超过 4 分钟）',
    };
  }
}

