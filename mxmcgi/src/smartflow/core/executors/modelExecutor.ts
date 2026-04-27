/**
 * Model 节点执行器 - 调用 AI 模型生成内容
 */

import { SmartflowNode, ExecutionContext } from '../models/types';
import { BaseExecutor, ExecutorResult } from './base';
import { VariableResolver } from '../variables/resolver';
import { mxmCGIHttpClient } from '../../services/httpClient';

export class ModelExecutor extends BaseExecutor {
  async execute(node: SmartflowNode, context: ExecutionContext): Promise<ExecutorResult> {
    try {
      const { model_type, model, prompt, model_params: params = {} } = node;

      if (!model_type || !model || !prompt) {
        return this.createErrorResult('Model node requires model_type, model, and prompt');
      }

      // 解析 prompt 中的变量
      const resolvedPrompt = VariableResolver.resolve(prompt, context);

      let result: any;

      switch (model_type) {
        case 'text':
          result = await this.executeTextModel(model, resolvedPrompt, params, context);
          break;
        case 'image':
          result = await this.executeImageModel(model, resolvedPrompt, params, context);
          break;
        case 'embedding':
          result = await this.executeEmbeddingModel(model, resolvedPrompt, params, context);
          break;
        case 'video':
          result = await this.executeVideoModel(model, resolvedPrompt, params, context);
          break;
        case 'sound':
          result = await this.executeSoundModel(model, resolvedPrompt, params, context);
          break;
        default:
          return this.createErrorResult(`Unknown model type: ${model_type}`);
      }

      return this.createSuccessResult(result);
    } catch (error: any) {
      return this.createErrorResult(`Model executor error: ${error.message}`);
    }
  }

  private async executeTextModel(
    model: string, 
    prompt: string, 
    params: Record<string, any>,
    context: ExecutionContext
  ): Promise<any> {
    try {
      const response = await mxmCGIHttpClient.textGeneration(model, prompt, {
        temperature: params.temperature ?? 0.7,
        max_tokens: params.max_tokens ?? 2000,
        ...params,
      });

      return {
        text: response.data?.text || response.output || prompt,
        model,
        model_type: 'text',
        usage: response.data?.usage || {},
      };
    } catch (error: any) {
      // 如果调用失败，返回模拟结果（用于演示）
      console.warn(`[ModelExecutor] Text generation failed: ${error.message}, using mock result`);
      return {
        text: `[模拟输出] 基于提示词生成的内容：${prompt.substring(0, 100)}...`,
        model,
        model_type: 'text',
        _mock: true,
      };
    }
  }

  private async executeImageModel(
    model: string, 
    prompt: string, 
    params: Record<string, any>,
    context: ExecutionContext
  ): Promise<any> {
    try {
      const response = await mxmCGIHttpClient.imageGeneration(model, prompt, {
        aspect_ratio: params.aspect_ratio || '1:1',
        quality: params.quality || 'standard',
        ...params,
      });

      return {
        image_url: response.data?.image_url || response.data?.url || response.url,
        image_base64: response.data?.image_base64 || response.data?.base64,
        model,
        model_type: 'image',
        revised_prompt: response.data?.revised_prompt,
      };
    } catch (error: any) {
      console.warn(`[ModelExecutor] Image generation failed: ${error.message}`);
      return {
        image_url: null,
        model,
        model_type: 'image',
        error: error.message,
        _mock: true,
      };
    }
  }

  private async executeEmbeddingModel(
    model: string,
    input: string,
    params: Record<string, any>,
    context: ExecutionContext
  ): Promise<any> {
    try {
      const response = await mxmCGIHttpClient.embeddingGeneration(model, input, {
        dimensions: params.dimensions,
        ...params,
      });

      return {
        embedding: response.data?.embedding || response.embedding,
        model,
        model_type: 'embedding',
      };
    } catch (error: any) {
      console.warn(`[ModelExecutor] Embedding generation failed: ${error.message}`);
      return {
        embedding: null,
        model,
        model_type: 'embedding',
        error: error.message,
        _mock: true,
      };
    }
  }

  private async executeVideoModel(
    model: string,
    prompt: string,
    params: Record<string, any>,
    context: ExecutionContext
  ): Promise<any> {
    const userId = context.variables?.user_id as string || 'system';

    try {
      const response = await mxmCGIHttpClient.videoGenerate({
        prompt,
        model,
        duration: params.duration,
        aspect_ratio: params.aspect_ratio,
        ...params,
      }, userId);

      return {
        video_url: response.data?.video_url || response.video_url || response.url,
        video_base64: response.data?.video_base64 || response.video_base64,
        model,
        model_type: 'video',
        task_id: response.task_id || response.data?.taskId,
        revised_prompt: response.data?.revised_prompt,
      };
    } catch (error: any) {
      console.warn(`[ModelExecutor] Video generation failed: ${error.message}`);
      return {
        video_url: null,
        model,
        model_type: 'video',
        error: error.message,
        _mock: true,
      };
    }
  }

  private async executeSoundModel(
    model: string,
    prompt: string,
    params: Record<string, any>,
    context: ExecutionContext
  ): Promise<any> {
    const userId = context.variables?.user_id as string || 'system';

    // Determine sound type: tts for text-to-speech, music for music generation
    const soundType = params.sound_type || 'tts';

    try {
      if (soundType === 'music') {
        // Music generation
        const response = await mxmCGIHttpClient.audioMusic({
          prompt,
          model,
          duration: params.duration,
          ...params,
        }, userId);

        return {
          audio_url: response.data?.audio_url || response.audio_url || response.url,
          audio_base64: response.data?.audio_base64 || response.audio_base64,
          model,
          model_type: 'sound',
          sound_type: 'music',
          task_id: response.task_id || response.data?.taskId,
        };
      } else {
        // TTS (text-to-speech)
        const response = await mxmCGIHttpClient.audioTTS({
          text: prompt,
          voice: params.voice,
          speed: params.speed,
          model,
          ...params,
        }, userId);

        return {
          audio_url: response.data?.audio_url || response.audio_url || response.url,
          audio_base64: response.data?.audio_base64 || response.audio_base64,
          model,
          model_type: 'sound',
          sound_type: 'tts',
          task_id: response.task_id || response.data?.taskId,
        };
      }
    } catch (error: any) {
      console.warn(`[ModelExecutor] Sound generation failed: ${error.message}`);
      return {
        audio_url: null,
        model,
        model_type: 'sound',
        sound_type: soundType,
        error: error.message,
        _mock: true,
      };
    }
  }
}
