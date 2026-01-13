/**
 * LLM 服务
 * 提供大语言模型调用功能
 */

import { BaseChatModel, BaseChatModelCallOptions } from '@langchain/core/language_models/chat_models';
import { BaseMessage, AIMessage, HumanMessage, SystemMessage, AIMessageChunk } from '@langchain/core/messages';
import { ChatGeneration, ChatResult, ChatGenerationChunk } from '@langchain/core/outputs';
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';

export interface LLMServiceConfig {
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  baseUrl: string;
  apiKey: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * LLM 服务接口
 */
export interface ILLMService {
  /**
   * 调用 LLM
   */
  invoke(prompt: string): Promise<{ content: string }>;
}

/**
 * DeerAPI LLM 服务实现
 */
export class DeerAPILLMService extends BaseChatModel<BaseChatModelCallOptions> implements ILLMService {
  private baseUrl: string;
  private apiKey: string;
  private modelName: string;
  private temperature: number;
  private maxTokens?: number;

  constructor(config: LLMServiceConfig) {
    super({});
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.modelName = config.modelName || 'gpt-4o-mini';
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens;
  }

  /**
   * 从环境变量创建实例
   */
  static fromEnv(modelName?: string): DeerAPILLMService {
    const baseUrl = process.env.DEERAPI_BASE_URL;
    const apiKey = process.env.DEERAPI_API_KEY;

    if (!baseUrl || !apiKey) {
      throw new Error('DEERAPI_BASE_URL 和 DEERAPI_API_KEY 环境变量必须设置');
    }

    return new DeerAPILLMService({
      baseUrl,
      apiKey,
      modelName,
    });
  }

  /**
   * 调用 LLM（简化接口）
   */
  async invoke(prompt: string): Promise<{ content: string }> {
    const messages: BaseMessage[] = [new HumanMessage(prompt)];
    const result = await this._generate(messages);
    return {
      content: result.generations[0]?.message.content || ''
    };
  }

  /**
   * 将 LangChain 消息转换为 API 消息格式
   */
  private convertMessages(messages: BaseMessage[]): ChatMessage[] {
    return messages.map((msg) => {
      if (msg instanceof SystemMessage) {
        return { role: 'system', content: msg.content as string };
      } else if (msg instanceof HumanMessage) {
        return { role: 'user', content: msg.content as string };
      } else if (msg instanceof AIMessage) {
        return { role: 'assistant', content: msg.content as string };
      } else {
        return { role: 'user', content: String(msg.content) };
      }
    });
  }

  /**
   * 调用 LLM（LangChain 接口）
   */
  async _generate(
    messages: BaseMessage[],
    options?: BaseChatModelCallOptions,
    runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    const apiMessages = this.convertMessages(messages);

    const response = await this.chat({
      model: this.modelName,
      messages: apiMessages,
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
    const apiMessages = this.convertMessages(messages);

    for await (const chunk of this.chatStream({
      model: this.modelName,
      messages: apiMessages,
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
   * 调用聊天 API
   */
  private async chat(request: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
  }): Promise<{
    choices: Array<{ message: { content: string } }>;
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  }> {
    const url = `${this.baseUrl}/v1/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.max_tokens,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeerAPI 请求失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * 流式调用聊天 API
   */
  private async *chatStream(request: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
  }): AsyncGenerator<string, void, unknown> {
    const url = `${this.baseUrl}/v1/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.max_tokens,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeerAPI 流式请求失败: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法读取响应流');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
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
