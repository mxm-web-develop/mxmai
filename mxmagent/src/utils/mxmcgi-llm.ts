/**
 * mxmcgi LangChain LLM 适配器
 * 使 mxmcgi 接口可以像 LangChain LLM 一样使用
 */

import {
  BaseChatModel,
  BaseChatModelCallOptions,
} from '@langchain/core/language_models/chat_models';
import {
  BaseMessage,
  AIMessage,
  HumanMessage,
  SystemMessage,
  AIMessageChunk,
} from '@langchain/core/messages';
import {
  ChatGeneration,
  ChatResult,
  ChatGenerationChunk,
} from '@langchain/core/outputs';
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { MXMCGIClient } from './mxmcgi-client';

export interface MXMCGILLMParams {
  modelName?: string;
  gatewayUrl?: string;
  apiKey?: string;
}

/**
 * mxmcgi LangChain LLM 适配器
 */
export class MXMCGIChatModel extends BaseChatModel<BaseChatModelCallOptions> {
  private client: MXMCGIClient;
  private modelName: string;

  constructor(params: MXMCGILLMParams) {
    super({});
    this.modelName = params.modelName || 'gpt-5-nano';
    this.client = params.gatewayUrl
      ? new MXMCGIClient({ gatewayUrl: params.gatewayUrl, apiKey: params.apiKey })
      : MXMCGIClient.fromEnv();
  }

  /**
   * 从环境变量创建实例
   */
  static fromEnv(modelName?: string): MXMCGIChatModel {
    return new MXMCGIChatModel({ modelName });
  }

  /**
   * 将 LangChain 消息转换为提示词
   */
  private convertMessagesToPrompt(messages: BaseMessage[]): string {
    const parts: string[] = [];

    for (const msg of messages) {
      if (msg instanceof SystemMessage) {
        parts.push(`系统: ${msg.content}`);
      } else if (msg instanceof HumanMessage) {
        parts.push(`用户: ${msg.content}`);
      } else if (msg instanceof AIMessage) {
        parts.push(`助手: ${msg.content}`);
      } else {
        parts.push(String(msg.content));
      }
    }

    return parts.join('\n\n');
  }

  /**
   * 调用 LLM
   */
  async _generate(
    messages: BaseMessage[],
    options?: BaseChatModelCallOptions,
    runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    const prompt = this.convertMessagesToPrompt(messages);

    const response = await this.client.generateText(this.modelName, {
      prompt,
      outputFormat: 'json',
    });

    if (!response.success || !response.result.text) {
      throw new Error('mxmcgi 返回空响应');
    }

    const aiMessage = new AIMessage(response.result.text);

    const generation: ChatGeneration = {
      message: aiMessage,
      text: response.result.text,
    };

    return {
      generations: [generation],
    };
  }

  /**
   * 流式调用 LLM
   */
  async *_streamResponseChunks(
    messages: BaseMessage[],
    options?: BaseChatModelCallOptions,
    runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk, void, unknown> {
    const prompt = this.convertMessagesToPrompt(messages);

    for await (const chunk of this.client.generateTextStream(this.modelName, {
      prompt,
      outputFormat: 'stream',
    })) {
      const messageChunk = new AIMessageChunk(chunk);

      const generationChunk = new ChatGenerationChunk({
        message: messageChunk,
        text: chunk,
      });

      yield generationChunk;

      await runManager?.handleLLMNewToken(chunk);
    }
  }

  /**
   * 模型名称
   */
  _llmType(): string {
    return 'mxmcgi';
  }

  /**
   * 模型标识符
   */
  _modelType(): string {
    return this.modelName;
  }
}
