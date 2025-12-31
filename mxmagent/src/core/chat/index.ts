/**
 * 对话应用
 * 支持传入对话ID、用户ID、smartflow_id
 */

import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { MXMCGIChatModel } from '../../utils/mxmcgi-llm';
import { runTestFlow, runTestFlowStream } from '../smartflow/testflow';
import { ChatFlowChunk, SmartflowChunk, StreamChunk } from '../../types/stream';
import { createConversation } from './createConversation';
import { readConversationDetailbyId } from './readConversationDetailbyId';
import { createConversationRepository } from '@mxmai/mxmdata';

export interface ChatOptions {
  conversationId: string;
  userId: string;
  smartflowId: string;
  userInput: string;
  modelName?: string;
}

export interface ChatResponse {
  conversationId: string;
  userId: string;
  smartflowId: string;
  response: string;
  messages: BaseMessage[];
}

/**
 * 对话应用类
 * 
 * 重要：每个 conversation 的记忆是独立的
 * - 每个 ChatApp 实例只管理一个 conversationId 的对话历史
 * - 不同 conversationId 之间不会共享记忆
 * - messages 数组只包含当前 conversation 的消息
 */
export class ChatApp {
  private conversationId: string;
  private userId: string;
  private smartflowId: string;
  private modelName: string;
  private messages: BaseMessage[] = []; // 当前 conversation 的消息历史（不与其他 conversation 共享）

  constructor(options: {
    conversationId: string;
    userId: string;
    smartflowId: string;
    modelName?: string;
  }) {
    this.conversationId = options.conversationId;
    this.userId = options.userId;
    this.smartflowId = options.smartflowId;
    this.modelName = options.modelName || 'gpt-5-nano';
  }

  /**
   * 加载历史对话
   * 注意：只加载当前 conversationId 的历史消息，不会加载其他 conversation 的消息
   */
  async loadHistory(): Promise<void> {
    try {
      const conversation = await readConversationDetailbyId({
        conversationId: this.conversationId, // 只查询当前 conversation
        userId: this.userId,
      });

      if (conversation && conversation.messages) {
        // 清空当前消息
        this.messages = [];

        // 从历史消息中恢复对话（仅当前 conversation 的消息）
        for (const msg of conversation.messages) {
          // 添加用户消息
          this.messages.push(new HumanMessage(msg.query.content));
          // 添加AI回复
          this.messages.push(new AIMessage(msg.reply.content));
        }

        console.log(`✅ 已加载 ${conversation.messages.length} 条历史消息（conversation: ${this.conversationId}）`);
      } else {
        console.log('ℹ️  未找到历史对话，将创建新对话');
      }
    } catch (error) {
      console.warn('⚠️  加载历史对话失败:', error);
      // 不抛出错误，允许继续创建新对话
    }
  }

  /**
   * 发送消息（非流式）
   */
  /**
   * 发送消息（非流式）
   * 注意：消息只添加到当前 conversation 的 messages 数组，不会影响其他 conversation
   */
  async sendMessage(userInput: string): Promise<ChatResponse> {
    // 添加用户消息（只添加到当前 conversation 的消息历史）
    const userMessage = new HumanMessage(userInput);
    this.messages.push(userMessage);

    // 生成 queryId
    const queryId = `query-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 根据 smartflowId 选择处理方式
    let aiResponse: string;
    let flowChain: any[] = [];

    if (this.smartflowId === 'testflow') {
      // 使用测试工作流
      aiResponse = await runTestFlow(userInput);
      // TODO: 从工作流中提取 flow_chain
    } else {
      // 使用普通对话
      // 注意：llm.invoke 只接收当前 conversation 的 messages，不会包含其他 conversation 的消息
      const llm = MXMCGIChatModel.fromEnv(this.modelName);
      const response = await llm.invoke(this.messages); // 只传入当前 conversation 的消息
      aiResponse = typeof response.content === 'string' ? response.content : String(response.content);
    }

    // 添加AI回复
    const aiMessage = new AIMessage(aiResponse);
    this.messages.push(aiMessage);

    // 存储到数据库（只保存到当前 conversation，不会影响其他 conversation）
    try {
      const repository = createConversationRepository();
      
      // 检查对话是否存在（只查询当前 conversationId）
      let conversation = await repository.findById(this.conversationId, this.userId);
      
      if (!conversation) {
        // 如果不存在，创建新对话（新的 conversationId，独立的记忆空间）
        conversation = await createConversation({
          userId: this.userId,
          smartflowId: this.smartflowId,
        });
        this.conversationId = conversation.id;
      }

        // 添加消息到对话
        const now = new Date().toISOString();
        await repository.addMessage(this.conversationId, this.userId, {
          query: {
            content: userInput,
            type: 'text',
            queryId,
            gmtCreate: now,
          },
          reply: {
            content: aiResponse,
            type: 'markdown',
            flow_chain: flowChain.length > 0 ? flowChain : undefined,
            gmtCreate: now,
          },
        });
    } catch (error) {
      console.error('Failed to save conversation:', error);
      // 不抛出错误，允许对话继续
    }

    return {
      conversationId: this.conversationId,
      userId: this.userId,
      smartflowId: this.smartflowId,
      response: aiResponse,
      messages: [...this.messages],
    };
  }

  /**
   * 发送消息（流式）
   * 返回统一的 StreamChunk 格式
   */
  async *sendMessageStream(
    userInput: string
  ): AsyncGenerator<StreamChunk, void, unknown> {
    // 添加用户消息
    const userMessage = new HumanMessage(userInput);
    this.messages.push(userMessage);

    // 生成 queryId
    const queryId = `query-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 根据 smartflowId 选择处理方式
    if (this.smartflowId === 'testflow') {
      // 使用测试工作流（流式）- 返回 SmartflowChunk
      const chunks: SmartflowChunk[] = [];
      let finalFlowChain: any[] = [];
      let finalContent = '';

      for await (const chunk of runTestFlowStream(userInput, this.conversationId)) {
        chunks.push(chunk);
        
        // 如果 chunk 包含 flow_chain，保存它
        if ((chunk as any).flow_chain) {
          finalFlowChain = (chunk as any).flow_chain;
        }
        
        // 收集最终内容
        if (chunk.node_name === 'content_output' && chunk.node_state === 'completed') {
          finalContent = chunk.reply.content;
        }
        
        yield chunk;
      }

      // 流式完成后，存储到数据库
      try {
        const repository = createConversationRepository();
        
        // 检查对话是否存在
        let conversation = await repository.findById(this.conversationId, this.userId);
        
        if (!conversation) {
          // 如果不存在，创建新对话
          conversation = await createConversation({
            userId: this.userId,
            smartflowId: this.smartflowId,
          });
          this.conversationId = conversation.id;
        }

        // 添加消息到对话（包含 flow_chain）
        const now = new Date().toISOString();
        await repository.addMessage(this.conversationId, this.userId, {
          query: {
            content: userInput,
            type: 'text',
            queryId,
            gmtCreate: now,
          },
          reply: {
            content: finalContent,
            type: 'markdown',
            flow_chain: finalFlowChain.length > 0 ? finalFlowChain : undefined,
            gmtCreate: now,
          },
        });
      } catch (error) {
        console.error('Failed to save conversation:', error);
        // 不抛出错误，允许对话继续
      }
    } else {
      // 使用普通对话（流式）- 返回 ChatFlowChunk
      const llm = MXMCGIChatModel.fromEnv(this.modelName);
      let accumulatedContent = '';

      // 发送开始状态
      yield {
        conversationId: this.conversationId,
        queryId,
        lastDate: Date.now(),
        status: 1, // processing
        node_name: 'content_output',
        reply: {
          content: '',
          type: 'markdown',
        },
        espTime: null,
        tokens: 0,
      };

      // 流式获取内容
      for await (const chunk of llm._streamResponseChunks(this.messages)) {
        const content = typeof chunk.text === 'string' ? chunk.text : String(chunk.text || '');
        accumulatedContent += content;

        yield {
          conversationId: this.conversationId,
          queryId,
          lastDate: Date.now(),
          status: 1, // processing
          node_name: 'content_output',
          reply: {
            content: accumulatedContent,
            type: 'markdown',
          },
          espTime: null,
          tokens: 0,
        };
      }

      // 发送完成状态
      yield {
        conversationId: this.conversationId,
        queryId,
        lastDate: Date.now(),
        status: 2, // completed
        node_name: 'content_output',
        reply: {
          content: accumulatedContent,
          type: 'markdown',
        },
        espTime: null,
        tokens: 0,
      };

      // 流式完成后，存储到数据库
      try {
        const repository = createConversationRepository();
        
        // 检查对话是否存在
        let conversation = await repository.findById(this.conversationId, this.userId);
        
        if (!conversation) {
          // 如果不存在，创建新对话
          conversation = await createConversation({
            userId: this.userId,
            smartflowId: this.smartflowId,
          });
          this.conversationId = conversation.id;
        }

        // 添加消息到对话
        const now = new Date().toISOString();
        await repository.addMessage(this.conversationId, this.userId, {
          query: {
            content: userInput,
            type: 'text',
            queryId,
            gmtCreate: now,
          },
          reply: {
            content: accumulatedContent,
            type: 'markdown',
            gmtCreate: now,
          },
        });
      } catch (error) {
        console.error('Failed to save conversation:', error);
        // 不抛出错误，允许对话继续
      }
    }

    // 注意：流式模式下，消息历史需要单独管理
    // 这里简化处理，实际应该收集完整响应后再添加到 messages
  }

  /**
   * 获取对话历史
   */
  getMessages(): BaseMessage[] {
    return [...this.messages];
  }

  /**
   * 清空对话历史
   */
  clearMessages(): void {
    this.messages = [];
  }

  /**
   * 获取对话信息
   */
  getInfo() {
    return {
      conversationId: this.conversationId,
      userId: this.userId,
      smartflowId: this.smartflowId,
      modelName: this.modelName,
      messageCount: this.messages.length,
    };
  }
}

/**
 * 创建对话应用实例
 */
export function createChatApp(options: ChatOptions): ChatApp {
  return new ChatApp({
    conversationId: options.conversationId,
    userId: options.userId,
    smartflowId: options.smartflowId,
    modelName: options.modelName,
  });
}

/**
 * 快速发送消息（便捷方法）
 */
export async function sendChatMessage(
  options: ChatOptions
): Promise<ChatResponse> {
  const app = createChatApp(options);
  return app.sendMessage(options.userInput);
}

/**
 * 快速发送消息（流式，便捷方法）
 */
export async function* sendChatMessageStream(
  options: ChatOptions
): AsyncGenerator<StreamChunk, void, unknown> {
  const app = createChatApp(options);
  for await (const chunk of app.sendMessageStream(options.userInput)) {
    yield chunk;
  }
}
