/**
 * Model 节点执行器 - 调用 AI 模型生成内容
 */

import { SmartflowNode, ExecutionContext } from '../models/types';
import { BaseExecutor, ExecutorResult } from './base';
import { VariableResolver } from '../variables/resolver';
import { mxmCGIHttpClient } from '../../services/httpClient';
import { resolveSmartflowParams } from './resolve-smartflow-params';
import { buildModelVisionParams } from './build-model-vision-params';

export class ModelExecutor extends BaseExecutor {
  async execute(node: SmartflowNode, context: ExecutionContext): Promise<ExecutorResult> {
    try {
      const { model_type, model, prompt, model_params: rawParams = {} } = node;
      const params = resolveSmartflowParams(rawParams, context) as Record<string, unknown>;

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
    const userId = (context.variables?.user_id as string) || 'system';
    const vision = buildModelVisionParams(params, context);
    try {
      const response = await mxmCGIHttpClient.writingCompletion(
        model,
        {
          prompt,
          temperature: params.temperature ?? 0.7,
          max_tokens: params.max_tokens ?? 2000,
          ...params,
          ...vision,
        },
        userId
      );

      const inner = (response as any)?.result ?? response;
      const text =
        (typeof inner === 'string' ? inner : null) ??
        inner?.text ??
        inner?.data?.text ??
        (response as any)?.data?.text ??
        prompt;

      return {
        text,
        model,
        model_type: 'text',
        usage: inner?.usage ?? (response as any)?.usage ?? {},
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
    const userId = (context.variables?.user_id as string) || 'system';
    try {
      const taskKey = (params.graph_task_key as string) || (params.task_key as string) || 'photograph';
      const subtype =
        (typeof params.subtype === 'string' && params.subtype) ||
        (typeof params.type === 'string' && params.type) ||
        null;
      const runParams: Record<string, any> = {
        prompt,
        aspect_ratio: params.aspect_ratio || '1:1',
        quality: params.quality || 'standard',
        ...params,
      };
      if (model) {
        runParams.logicalModel = model;
      }

      const response = await mxmCGIHttpClient.runTask('graph', taskKey, runParams, userId, { subtype });

      return {
        image_url: response.data?.image_url || response.image_url,
        image_base64: response.data?.image_base64,
        model,
        model_type: 'image',
        task_id: response.taskId ?? response.data?.taskId,
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
    const userId = (context.variables?.user_id as string) || 'system';
    try {
      const response = await mxmCGIHttpClient.writingCompletion(
        model,
        {
          prompt: input,
          outputFormat: 'json',
          dimensions: params.dimensions,
          ...params,
        },
        userId
      );

      const inner = (response as any)?.result ?? response;
      const embedding =
        inner?.embedding ??
        inner?.data?.embedding ??
        (Array.isArray(inner) ? inner : null);

      return {
        embedding,
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
    const userId = (context.variables?.user_id as string) || 'system';

    try {
      const taskKey = String(params.taskKey || params.videoTaskKey || 'short');
      const subtype = params.subtype ?? params.videoSubtype ?? null;
      const response = await mxmCGIHttpClient.runTask(
        'video',
        taskKey,
        {
          prompt,
          duration: params.duration,
          seconds: params.seconds,
          ratio: params.ratio ?? params.aspect_ratio,
          resolution: params.resolution,
          reference_images: params.reference_images,
          input_reference: params.input_reference,
          ...params,
        },
        userId,
        { subtype },
      );

      const taskId = response?.taskId || response?.data?.taskId;
      const mediaUrls =
        response?.syncResult?.mediaUrls ||
        response?.data?.syncResult?.mediaUrls ||
        response?.mediaUrls;
      const videoUrl = Array.isArray(mediaUrls) && mediaUrls.length > 0 ? mediaUrls[0] : undefined;

      return {
        video_url: videoUrl,
        model,
        model_type: 'video',
        task_id: taskId,
        mediaUrls,
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
