/**
 * DeerAPI LangChain LLM 适配器
 * 使 DeerAPI 可以像 OpenAI LLM 一样在 LangChain 中使用
 */

import { BaseChatModel, BaseChatModelCallOptions } from '@langchain/core/language_models/chat_models';
import { BaseMessage, AIMessage, HumanMessage, SystemMessage, AIMessageChunk } from '@langchain/core/messages';
import { ChatGeneration, ChatResult, ChatGenerationChunk } from '@langchain/core/outputs';
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { DeerAPIClient, DeerAPIChatMessage } from './deerapi-client';

export interface DeerAPILLMParams {
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  baseUrl: string;
  apiKey: string;
}

/**
 * DeerAPI LangChain LLM 适配器
 */
export class DeerAPIChatModel extends BaseChatModel<BaseChatModelCallOptions> {
  private client: DeerAPIClient;
  private modelName: string;
  private temperature: number;
  private maxTokens?: number;

  constructor(params: DeerAPILLMParams) {
    super({});
    this.client = new DeerAPIClient({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
    });
    this.modelName = params.modelName || 'gpt-4o-mini';
    this.temperature = params.temperature ?? 0.7;
    this.maxTokens = params.maxTokens;
  }

  /**
   * 从环境变量创建实例
   */
  static fromEnv(modelName?: string): DeerAPIChatModel {
    const baseUrl = process.env.DEERAPI_BASE_URL;
    const apiKey = process.env.DEERAPI_API_KEY;

    if (!baseUrl || !apiKey) {
      throw new Error('DEERAPI_BASE_URL 和 DEERAPI_API_KEY 环境变量必须设置');
    }

    return new DeerAPIChatModel({
      baseUrl,
      apiKey,
      modelName,
    });
  }

  /**
   * 将 LangChain 消息转换为 DeerAPI 消息格式
   */
  private convertMessages(messages: BaseMessage[]): DeerAPIChatMessage[] {
    return messages.map((msg) => {
      if (msg instanceof SystemMessage) {
        return { role: 'system', content: msg.content as string };
      } else if (msg instanceof HumanMessage) {
        return { role: 'user', content: msg.content as string };
      } else if (msg instanceof AIMessage) {
        return { role: 'assistant', content: msg.content as string };
      } else {
        // 默认作为用户消息
        return { role: 'user', content: String(msg.content) };
      }
    });
  }

  /**
   * 调用 LLM
   */
  async _generate(
    messages: BaseMessage[],
    options?: BaseChatModelCallOptions,
    runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    const deerMessages = this.convertMessages(messages);

    const response = await this.client.chat({
      model: this.modelName,
      messages: deerMessages,
      temperature: options?.temperature ?? this.temperature,
      max_tokens: options?.max_tokens ?? this.maxTokens,
    });

    const message = response.choices[0]?.message;
    if (!message) {
      throw new Error('DeerAPI 返回空响应');
    }

    const aiMessage = new AIMessage(message.content);

    const generation: ChatGeneration = {
      message: aiMessage,
      text: message.content,
    };

    return {
      generations: [generation],
      llmOutput: {
        tokenUsage: {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        },
      },
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
    const deerMessages = this.convertMessages(messages);

    for await (const chunk of this.client.chatStream({
      model: this.modelName,
      messages: deerMessages,
      temperature: options?.temperature ?? this.temperature,
      max_tokens: options?.max_tokens ?? this.maxTokens,
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
    return 'deerapi';
  }

  /**
   * 模型标识符
   */
  _modelType(): string {
    return this.modelName;
  }
}

